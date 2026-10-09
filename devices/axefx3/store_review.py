"""Separate, expiring confirmation for a measured same-slot FW33 Store."""
import secrets
import time

from fm9.device import get_store_slots
from . import fw33_profile, tone_review, route_guard
from .controller_review import digest


class Stores:
    def __init__(self):
        self.pending=None

    def prepare(self,dev,expected_preset):
        self.pending=None
        if getattr(dev.reg,'hardware_variant',None) != 'mk2':
            raise ValueError('FW33 Store requires the declared measured MK2 profile')
        if type(expected_preset) is not int or expected_preset not in get_store_slots():
            raise ValueError('Store target must be in the existing preset allowlist')
        state=tone_review.snapshot(dev)
        if state['firmware'] != fw33_profile.KEY or state['preset'][0] != expected_preset:
            raise ValueError('Store requires the exact FW33 current target')
        if tuple(route_guard.serial_route(state['grid'],state['blocks'],dev.reg)) != fw33_profile.NAM_ROUTE:
            raise ValueError('Store requires the complete measured NAM route')
        before=dev.slot_name(expected_preset)
        if before is None or before.number != expected_preset:
            raise ValueError('Stored destination cannot be read')
        token=secrets.token_urlsafe(32)
        self.pending=dict(token=token,device=dev,stamp=digest(state),before=before,
                          preset=expected_preset,expires=time.monotonic()+600)
        return dict(token=token,preset=expected_preset,name=state['preset'][1],
                    replaces=before.name,permanent=True,readonly=True,expires_in=600)

    def send(self,dev,token,external_audio_muted,confirm_permanent_write):
        if external_audio_muted is not True or confirm_permanent_write is not True:
            raise PermissionError('Confirm external mute and permanent preset storage separately')
        pending=self.pending
        self.pending=None
        if (not pending or pending['device'] is not dev or not isinstance(token,str)
                or not token.isascii() or not secrets.compare_digest(token,pending['token'])
                or time.monotonic() >= pending['expires']):
            raise ValueError('Store review expired, replaced or already used')
        with dev._lock:
            if digest(tone_review.snapshot(dev)) != pending['stamp'] or dev.slot_name(pending['preset']) != pending['before']:
                raise ValueError('Preset, NAM memory or stored target changed; nothing stored')
            with dev.edit_session(external_audio_muted=True,expected_preset=pending['preset']):
                slot,name=dev.store_preset(pending['preset'])
            return dict(ok=True,stored=True,preset=slot,name=name,reloaded=False,audio_verified=False)
