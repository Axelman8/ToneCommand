"""Exact FW33 Amp names/ordinals only, not model-selection authority.

Import and lookup perform no MIDI, editor, account or network operation.
This is a bundled historical MK2 observation, not live discovery or a
claim that a connected chassis/build accepts model writes.
"""
import hashlib
from importlib.resources import files
import json

FIRMWARE = '33.00-beta.20261006'
MODEL_BYTE = 0x10
SELECTOR_PID = 0
COUNT = 336
SOURCE_CACHE_SHA256 = 'fb5b87c1ec635b8ccfcf3ed9f78aaec570598f3ba8573b5d61a32d4a24a1e56d'
MODELS_SHA256 = 'afa8d0e7b5f99f47a0de7041630ac18351b938a4557ba4e7bd96f4e77f95b78c'


def _unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate Axe-Fx III catalog key')
        result[key] = value
    return result


def _nonfinite(value):
    raise ValueError('Non-finite value in Axe-Fx III catalog')


def roster(firmware):
    """A fresh ordinal/name mapping, empty for any unrecognized profile.

    The explicit profile key is a metadata lookup, not device identification.
    Raw version 97.00 or a generic 33.00 label cannot select this catalog.
    A malformed/missing resource fails visibly, never a shortened roster.
    """
    if type(firmware) is not str or firmware != FIRMWARE:
        return {}
    text = files('devices.axefx3').joinpath('data', 'fw33_amp_models.json').read_text(encoding='utf-8')
    if len(text) > 32768:
        raise ValueError('Axe-Fx III Amp catalog is too large')
    data = json.loads(text, object_pairs_hook=_unique, parse_constant=_nonfinite)
    keys = {'firmware', 'model_byte', 'selector_pid', 'source', 'cache_sha256', 'models'}
    if (not isinstance(data, dict) or set(data) != keys
            or data['firmware'] != FIRMWARE
            or type(data['model_byte']) is not int or data['model_byte'] != MODEL_BYTE
            or type(data['selector_pid']) is not int or data['selector_pid'] != SELECTOR_PID
            or data['cache_sha256'] != SOURCE_CACHE_SHA256
            or not isinstance(data['source'], str) or not 1 <= len(data['source']) <= 300
            or any(not 32 <= ord(c) <= 126 for c in data['source'])):
        raise ValueError('Axe-Fx III Amp catalog metadata differs from its source')
    names = data['models']
    if (not isinstance(names, dict) or set(names) != {str(i) for i in range(COUNT)}
            or any(type(n) is not str or not 1 <= len(n) <= 120 or n.strip() != n
                   or any(not 32 <= ord(c) <= 126 for c in n) for n in names.values())
            or len(set(names.values())) != COUNT):
        raise ValueError('Incomplete or invalid Axe-Fx III Amp roster')
    digest = hashlib.sha256(json.dumps(names, sort_keys=True, separators=(',', ':'),
                                      ensure_ascii=True).encode('ascii')).hexdigest()
    if digest != MODELS_SHA256:
        raise ValueError('Axe-Fx III Amp names or ordinals changed; verification required')
    return {i: names[str(i)] for i in range(COUNT)}


def ordinal(firmware, name):
    """Resolve an exact label. No fuzzy match or fallback to another device."""
    if type(name) is str:
        for number, label in roster(firmware).items():
            if label == name:
                return number
    raise ValueError('Amp name is not in this exact Axe-Fx III firmware catalog')


def report(firmware):
    """Describe facts without suggesting this enables a selector or a planner."""
    names = roster(firmware)
    return dict(firmware=firmware, model_byte=MODEL_BYTE, selector_pid=SELECTOR_PID,
                count=len(names), models=[dict(ordinal=i, name=n) for i, n in names.items()],
                source='Bundled exact-FW33 editor definition names and ordinals; historical MK2 evidence',
                source_cache_sha256=SOURCE_CACHE_SHA256 if names else None,
                models_sha256=MODELS_SHA256 if names else None,
                live_list_fetched=False, generic_setter_enabled=False,
                hardware_verified_in_this_slice=False)
