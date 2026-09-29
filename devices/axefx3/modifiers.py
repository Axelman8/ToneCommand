"""Modifier inspection and existing Wah source reassignment only.

The old from-scratch fallback omitted unknown transfer-curve fields. That is
not evidence of a working expression pedal. Never synthesize such a curve.
"""
import time

from fm9.device import SetResult
from . import protocol, audio_safety

SOURCE_NAMES = {0: "NONE", 10: "Pedal 1", 11: "Pedal 2", 12: "External 1", 13: "External 2"}
FIELDS = (1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14)


def slot_eid(slot):
    if type(slot) is not int or slot not in range(1, 33):
        raise ValueError("Modifier slot must be an integer 1..32")
    return slot + 2


def curve_usable(words):
    return (isinstance(words, list) and len(words) >= 15
            and all(type(w) is int and 0 <= w <= 65534 for w in words)
            and words[1] != words[2] and len({words[3], words[4], words[5]}) > 1)


def inspect(dev):
    """Read all slots without changing scenes/channels or asking a model GET."""
    entries = []
    for slot in range(1, 33):
        words = dev.read_modifier(slot)
        if not isinstance(words, list) or len(words) < 15 or any(type(w) is not int or not 0 <= w <= 65534 for w in words):
            raise ValueError(f"Modifier slot {slot} unreadable; do not execute a build")
        source, eid, pid = words[0], words[8], words[9]
        family = dev.reg.family_of_effect_id(eid)
        spec = None
        if family:
            try:
                spec = dev.reg.spec(family[0], pid, family[1])
            except (ValueError, KeyError):
                pass
        active = source != 0
        assessed = bool(spec is not None and not audio_safety.modifier_error(spec))
        entries.append({"slot": slot, "source": source,
                        "source_name": SOURCE_NAMES.get(source, f"Source {source}"),
                        "effect_id": eid, "param_id": pid, "active": active,
                        "empty": source == eid == pid == 0,
                        "parameter": spec.name if spec else None,
                        "curve_structurally_usable": curve_usable(words),
                        "assessed_target": assessed,
                        "physical_pedal_verified": False, "words": words})
    return entries


def preflight(dev):
    entries = inspect(dev)
    for item in entries:
        if item["active"] and (not item["assessed_target"] or not item["curve_structurally_usable"]):
            raise ValueError(f"Modifier {item['slot']} has an unassessed target/curve; build refused")
    return entries


def source_frame(slot, source):
    if type(source) is not int or source not in (12, 13):
        raise ValueError("Only captured External 1/2 source reassignment is enabled")
    return protocol.param_frame(slot_eid(slot), 0, source, opcode=9)


def assign_existing(dev, slot, target_effect_id, target_param_id, source_ordinal):
    frame = source_frame(slot, source_ordinal)
    entries = preflight(dev)
    entry = entries[slot - 1]
    if (type(target_effect_id) is not int or target_effect_id not in range(94, 98)
            or type(target_param_id) is not int or target_param_id != 5):
        raise ValueError("Only an existing Wah Control binding can be reassigned")
    before = entry["words"]
    if (not entry["active"] or (before[8], before[9]) != (target_effect_id, target_param_id)
            or not entry["curve_structurally_usable"]):
        return SetResult(False, "No existing usable Wah binding. A device-built curve must be captured and tested; "
                         "no partial default curve was written.", before[0], None)
    if any(e["active"] and e["slot"] != slot and (e["effect_id"], e["param_id"]) == (target_effect_id, target_param_id)
           for e in entries):
        return SetResult(False, "Duplicate controllers own Wah Control; nothing written", before[0], None)
    if before[0] == source_ordinal:
        return SetResult(True, "Source already matches; physical mapping/sweep unverified", before[0], before[0])
    dev._write(frame)
    for _ in range(4):
        time.sleep(.15)
        after = dev.read_modifier(slot)
        if not after or len(after) != len(before):
            continue
        if after[1:] != before[1:]:
            return SetResult(False, "Modifier curve/target changed unexpectedly; stopped", before[0], after[0])
        if after[0] == source_ordinal:
            return SetResult(True, "Source independently verified; curve unchanged. Physical mapping/sweep unverified.",
                             before[0], after[0])
    return SetResult(False, "Source write not verified; stop the build", before[0], None)
