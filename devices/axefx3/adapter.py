"""Independent read-only adapter, not an FM9 with its model byte changed."""
from __future__ import annotations

import threading
import time

import mido

from fm9 import protocol as shared
from fm9.adapter import Capabilities, ReadPath
from fm9.device import FM9NotFound, ReadOnly
from fm9.registry import Registry as SharedRegistry
from fm9.safety import sysex_guard
from . import protocol

READ_ONLY = ("Axe-Fx III support is read-only in this review slice. "
             "Read preset/scene names and block status here; use the unit or "
             "Axe-Edit to change them. Preset writes, NAM and controllers "
             "are separate contributions tracked in #270.")


class ReadOnlyRegistry(SharedRegistry):
    """Shared block names only. Never load FM9 parameters, models or cabs."""

    def __init__(self):
        self.model_byte = protocol.MODEL
        self.params, self.ranges = {}, {}
        self.amp_roster, self.drive_roster, self.reverb_roster = {}, {}, {}
        self.amp_models, self.drive_models = {}, {}
        self.cab_rosters, self.cab_bank_names, self.cab_models = {}, {}, {}
        self.dynacabs = {}

    def spec(self, family, param_id, instance=1):
        raise ReadOnly(READ_ONLY)


class ReadOnlyOutput:
    """Final output boundary also protects direct calls to outp.send()."""

    guard = sysex_guard("Axe-Fx III read-only", protocol.FUNCTIONS)

    def __init__(self, port):
        self._port = port

    def send(self, message):
        if message.type != "sysex":
            raise ReadOnly(READ_ONLY)
        frame = [0xF0, *message.data, 0xF7]
        self.guard.check(frame[5] if len(frame) > 5 else -1)
        if not protocol.allowed(frame):
            raise ReadOnly(READ_ONLY)
        self._port.send(message)

    def close(self):
        self._port.close()


class AxeFxIII:
    """Basic replies from a real III; injected ports are for offline tests."""

    def __init__(self, ports=None):
        if ports is None:
            from fm9 import midi_transport
            ports = midi_transport.open_ports("axe-fx")
        self.inp, outp = ports
        self.outp = ReadOnlyOutput(outp)
        self._lock = threading.RLock()
        self._closed = False
        ready = False
        try:
            if not self.firmware_label() or self.current_preset() is None:
                raise FM9NotFound("Axe-Fx III did not answer valid product 0x10 reads")
            ready = True
        finally:
            if not ready:
                self.close()

    def capabilities(self):
        return Capabilities(read_path=ReadPath.DEVICE,
                            reads_slot_names=True, has_scenes=True)

    def close(self):
        if not self._closed:
            self._closed = True
            try:
                self.inp.close()
            finally:
                self.outp.close()

    def _send(self, frame):
        # Validate before mido can normalize, reject, or strip an argument.
        if not protocol.allowed(frame):
            raise ReadOnly(READ_ONLY)
        self.outp.send(mido.Message("sysex", data=frame[1:-1]))

    def _request(self, function, payload, parser, timeout=0.6):
        with self._lock:
            if self._closed:
                raise FM9NotFound("Axe-Fx III connection is closed")
            for _ in self.inp.iter_pending():
                pass
            self._send(protocol.envelope(function, payload))
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                for message in self.inp.iter_pending():
                    if message.type == "sysex":
                        data = list(message.data)
                        if protocol.valid_reply(data) and data[4] == function:
                            value = parser(data)
                            if value is not None:
                                return value
                time.sleep(0.005)
        return None

    def firmware_label(self):
        got = self._request(8, [], lambda d: d[5:7] if len(d) >= 8 else None)
        return f"{got[0]}.{got[1]:02d}" if got else ""

    def current_preset(self):
        def parse(data):
            got = shared.parse_patch_name(data) if len(data) == 40 else None
            return got if got and got[0] in range(512) else None
        return self._request(0x0D, [127, 127], parse)

    def current_scene(self):
        return self._request(0x0C, [127], lambda d: d[5] + 1
                             if len(d) == 7 and d[5] < 8 else None)

    def scene_name(self, scene=None):
        if scene is not None and (type(scene) is not int or scene not in range(1, 9)):
            raise ValueError("Scene must be 1..8")
        def parse(data):
            got = shared.parse_scene_name(data) if len(data) == 39 else None
            return got if got and got[0] in range(1, 9) and (
                scene is None or got[0] == scene) else None
        return self._request(0x0E, [127 if scene is None else scene - 1], parse)

    def status_dump(self):
        def parse(data):
            if (len(data) - 6) % 3:
                return None
            blocks = shared.parse_status_dump(data)
            if any(b.channel not in range(4) or b.channels_supported > 4
                   or b.channel >= max(1, b.channels_supported) for b in blocks):
                return None
            if len({b.effect_id for b in blocks}) != len(blocks):
                return None
            return blocks
        return self._request(0x13, [], parse)

    def slot_name(self, preset):
        if type(preset) is not int or preset not in range(512):
            raise ValueError("Preset name reads are limited to wire slots 0..511")
        def parse(data):
            got = shared.parse_patch_name_full(data) if len(data) == 40 else None
            return got if got and got.number == preset else None
        return self._request(0x0D, list(shared.encode14(preset)), parse)

    def scan_slots(self, start=0, end=511):
        if (type(start) is not int or type(end) is not int
                or not 0 <= start <= end < 512):
            raise ValueError("Invalid preset name range")
        return (got for n in range(start, end + 1)
                if (got := self.slot_name(n)) is not None)

    def is_slot_empty(self, preset):
        got = self.slot_name(preset)
        return got.empty if got else None

    def bulk_read(self, effect_id, timeout=1.5):
        """No send: parameter maps and editor transfers are out of scope."""
        return None

    def get_param_display(self, spec):
        raise ReadOnly(READ_ONLY)

    def select_preset(self, preset):
        raise ReadOnly(READ_ONLY)

    def set_scene(self, scene_1based):
        raise ReadOnly(READ_ONLY)

    def set_bypass(self, effect_id, bypassed):
        raise ReadOnly(READ_ONLY)

    def set_channel(self, effect_id, channel_0based):
        raise ReadOnly(READ_ONLY)

    def set_param_display(self, spec, display_value):
        raise ReadOnly(READ_ONLY)

    def set_param_ordinal(self, spec, ordinal):
        raise ReadOnly(READ_ONLY)

    def set_params_batch(self, items):
        raise ReadOnly(READ_ONLY)

    def store_preset(self, slot):
        raise ReadOnly(READ_ONLY)


def snapshot(adapter, gig_mode=False):
    """Status only, without reading FM9 parameter maps or inferring grid order."""
    from fm9.registry import EFFECT_ID_BASE
    before = adapter.current_preset()
    active = adapter.current_scene()
    if before is None or active is None:
        raise FM9NotFound("Axe-Fx III stopped answering")
    blocks = adapter.status_dump()
    if blocks is None:
        raise FM9NotFound("Axe-Fx III block status did not answer")
    scenes = []
    for number in range(1, 9):
        got = adapter.scene_name(number)
        scenes.append({"number": number, "name": got[1] if got else None})
    firmware = adapter.firmware_label()
    if (before != adapter.current_preset() or active != adapter.current_scene()
            or not firmware):
        raise FM9NotFound("Axe-Fx III changed preset or scene during the read; refresh")
    rows = []
    for block in blocks:
        family, instance = "UNKNOWN", 1
        for name, (base, count) in EFFECT_ID_BASE.items():
            if name != "GLOBAL" and base <= block.effect_id < base + count:
                family, instance = name, block.effect_id - base + 1
                break
        # Unknown IDs, including new firmware blocks, stay visible by number.
        label = f"{family} {instance}" if family != "UNKNOWN" else f"Block {block.effect_id}"
        rows.append(dict(family=family, instance=instance, label=label,
                         effect_id=block.effect_id, bypassed=block.bypassed,
                         channel="ABCD"[block.channel], channel_index=block.channel,
                         channels=block.channels_supported))
    return dict(connected=True, read_only=True, navigation_read_only=True,
                read_only_reason=READ_ONLY, firmware=firmware,
                preset=dict(number=before[0], editor=before[0] + 1, name=before[1]),
                scene=dict(number=active, name=scenes[active - 1]["name"]),
                scenes=scenes, blocks=rows, values={}, params={}, mods=[],
                cab_sel=None, gig_mode=gig_mode)
