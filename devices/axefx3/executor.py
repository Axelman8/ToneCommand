"""Reviewed-plan execution seam for the new server integration.

No LLM call, implicit flash store, automatic rollback, preset reload or global
pedal mapping. A failed readback stops the remaining actions. Physical muting
is an explicit prerequisite, not something this module can measure or enforce.
"""
from __future__ import annotations

import re
import math
from dataclasses import dataclass

from fm9.device import SetResult
from . import audio_safety, cab_selection, models, modifiers, pedal_control, protocol, route_guard, insertion


KINDS = {"add_block", "set_param", "set_type", "set_cab", "set_scene", "set_channel",
         "set_bypass", "rename_preset", "rename_scene", "bind_pedal", "bind_controller"}


def integer(value, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value != int(value) or not low <= value <= high:
        raise ValueError(f"Expected an integer {low}..{high}")
    return int(value)


def preset_name(name):
    name = re.sub(r"^(?:(?:AI-|FM9AI-)\s*)+", "", str(name).strip(), flags=re.I)
    if not name or any(ord(c) < 32 or ord(c) > 126 for c in name):
        raise ValueError("Preset name must contain printable ASCII characters")
    return ("AI-" + name)[:32]


@dataclass
class Resolved:
    action: dict
    family: str | None = None
    effect_id: int | None = None
    spec: object = None
    value: object = None


def resolve(reg, action):
    if not isinstance(action, dict) or action.get("kind") not in KINDS:
        raise ValueError("Unsupported action; uploads, stores and global writes are not enabled")
    a = dict(action)
    kind = a["kind"]
    result = Resolved(a)
    if kind == "rename_preset":
        result.value = preset_name(a.get("type_name") or "")
    elif kind in ("set_scene", "rename_scene"):
        result.value = integer(a.get("value"), 1, 8)
        if kind == "rename_scene":
            name = a.get("type_name")
            if not isinstance(name, str) or not name.strip() or len(name) > 32 or any(ord(c) < 32 or ord(c) > 126 for c in name):
                raise ValueError("Scene name must contain 1..32 printable ASCII characters")
    else:
        instance = integer(a.get("instance", 1), 1, 4)
        family, eid = reg.resolve_block(a.get("block", ""), instance)
        result.family, result.effect_id = family, eid
        if kind == "bind_controller":
            source = {"External 1":12, "External 2":13}.get(a.get("source"))
            mode = a.get("auto_engage")
            pedal_control.validate(eid, source, mode)
            if set(a) - {"kind","block","instance","source","auto_engage","reason"}:
                raise ValueError("Controller binding may not change arbitrary parameters or ranges")
            result.value = (source, mode)
            return result
        if kind in ("set_param", "bind_pedal"):
            base = reg.find_param(family, a.get("param") or "")
            if base is None:
                raise ValueError("No verified parameter for this device/firmware")
            result.spec = reg.spec(family, base.param_id, instance)
        error = audio_safety.action_error(a, family=family, spec=result.spec)
        if error:
            raise ValueError(error)
        if kind == "set_param":
            protocol.set_parameter(reg, result.spec, a.get("value"))
            result.value = a["value"]
        elif kind == "set_type":
            models.target(reg, family, eid, a.get("type_name"))
            result.value = a["type_name"]
        elif kind == "set_cab":
            if family != "CABINET":
                raise ValueError("Cab selection requires a Cab block")
            bank, ordinal = integer(a.get("bank", 0), 0, 2), integer(a.get("value"), 0, 1023)
            if bank == 2 and ordinal >= 512 and not reg.cab_catalog.user2_enabled:
                raise ValueError('User2 is NAM storage, not an available cab bank on this profile.')
            side = str(a.get("cab_side") or "left").lower()
            if side not in ("left", "right", "both"):
                raise ValueError("Cab side must be LEFT, RIGHT or BOTH")
            cab_selection.frame(eid, 0, bank)
            result.value = (bank, ordinal, side)
        elif kind == "set_channel":
            result.value = integer(a.get("value"), 0, 3)
        elif kind == "set_bypass":
            if type(a.get("bypassed")) is not bool:
                raise ValueError("Bypass requires true/false")
            result.value = a["bypassed"]
        elif kind == "bind_pedal":
            if family != "WAH" or result.spec.param_id != 5:
                raise ValueError("Only an existing Wah Control binding is supported at this stage")
            source = a.get("source", "External 1")
            result.value = {"External 1": 12, "External 2": 13}.get(source)
            if result.value is None:
                raise ValueError("Choose External 1 or External 2 explicitly")
            if a.get("value") is not None:
                raise ValueError("Modifier range changes need device-built curve evidence; existing range is preserved")
    return result


def prepare(dev, actions, required_route, expected_preset):
    """All validation is read-only, including before an empty-grid build."""
    if type(expected_preset) is not int or expected_preset not in range(512):
        raise ValueError("Explicit target preset in 0..511 required")
    if not isinstance(actions, list) or not actions or len(actions) > 512:
        raise ValueError("Plan must contain 1..512 explicit actions")
    resolved = [resolve(dev.reg, a) for a in actions]
    if dev.firmware_label() != "32.06" or dev.reg.firmware != "32.06":
        raise ValueError("Firmware does not match the verified profile")
    preset = dev.current_preset()
    if not preset or preset[0] != expected_preset:
        raise ValueError("Target preset changed or could not be read")
    expected, actual = route_guard.planned_route(dev, dev.reg, required_route, actions)
    if actual and actual != expected:
        insertion.plan(dev, required_route, actions)
    for item in resolved:
        if item.effect_id is not None and item.effect_id not in expected:
            raise ValueError("Action targets a block outside the reviewed route")
    # Preflight every future explicitly selected extra-effect channel using
    # passive bulk data. Do not discover an unsupported mode halfway through.
    from . import tone_controls
    channels,extra_bulk,new_models={},{},set()
    additions={i.effect_id for i in resolved if i.action['kind']=='add_block'}
    scene_changed=False
    for item in resolved:
        kind=item.action['kind']
        if kind=='set_scene':channels.clear();scene_changed=True
        if item.family not in tone_controls.LAYOUTS:continue
        if kind=='set_channel':channels[item.effect_id]=item.value
        if kind=='set_type' and item.effect_id not in actual:
            if item.effect_id not in channels:raise ValueError('New effect model needs an explicit channel')
            new_models.add((item.effect_id,channels[item.effect_id]))
        if kind=='set_param':
            if item.effect_id not in actual:
                if (item.family not in ('FUZZ','COMP') or item.effect_id not in additions
                        or item.effect_id not in channels
                        or (item.effect_id,channels[item.effect_id]) not in new_models):
                    raise ValueError('New Drive/Compressor writes require ADD, explicit channel and captured model first')
                continue
            if item.effect_id not in channels:
                if scene_changed:raise ValueError('Extra-effect channel must be explicit after scene selection')
                channels[item.effect_id]=dev.get_channel(item.effect_id)
            if item.effect_id not in extra_bulk:extra_bulk[item.effect_id]=dev.bulk_read(item.effect_id)
            error=tone_controls.profile_error(item.spec,extra_bulk[item.effect_id],channels[item.effect_id])
            if error:raise ValueError(error)
    native = [i for i in resolved if i.action['kind'] == 'bind_controller']
    slots = pedal_control.entries(dev) if native else modifiers.preflight(dev)
    if any(s.get('effect_id') in (additions-set(actual)) & {118,46} for s in slots):
        raise ValueError('Absent block already has a modifier record; no automatic recreation')
    if native:
        if len({i.effect_id for i in native}) != len(native):
            raise ValueError('Duplicate controller binding in this plan')
        needed = 0
        for item in native:
            matches = [s for s in slots if (s['effect_id'],s['param_id']) ==
                       (item.effect_id,pedal_control.TARGETS[item.effect_id])]
            if item.effect_id in actual:
                pedal_control.preflight(dev,item.effect_id,*item.value)
            elif matches:
                raise ValueError('Absent block already has a modifier record; no automatic recreation')
            needed += not matches
        if needed > sum(s['source'] == s['effect_id'] == 0 for s in slots):
            raise ValueError('Insufficient native modifier slots; nothing sent')
    for item in resolved:
        if item.action["kind"] == "bind_pedal":
            candidates = [s for s in slots if s["active"] and s["effect_id"] == item.effect_id and s["param_id"] == 5]
            if len(candidates) != 1 or not candidates[0]["curve_structurally_usable"]:
                raise ValueError("A device-built, working Wah curve is needed before building this plan; no changes sent")
            item.action["modifier_slot"] = candidates[0]["slot"]
    # A model reset followed only by engage would leave the quiet staging level
    # as the final tone. Require an explicit final level in the same channel.
    channels = {}
    for index, item in enumerate(resolved):
        kind, eid = item.action["kind"], item.effect_id
        if kind == "set_scene":
            channels.clear()
        elif kind == "set_channel":
            channels[eid] = item.value
        elif kind == "set_type":
            if eid not in channels:
                raise ValueError("Model choice requires an explicit preceding channel selection")
            level_pid = models.LAYOUTS[item.family][3]
            final_level = False
            for later in resolved[index + 1:]:
                lk = later.action["kind"]
                if lk == "set_scene" or (later.effect_id == eid and lk in ("set_channel", "set_type", "set_bypass")):
                    break
                if later.effect_id == eid and lk == "set_param" and later.spec.param_id == level_pid:
                    final_level = True
            if not final_level:
                raise ValueError("Model reset requires an explicit final level before engaging or leaving the channel")
    return resolved, expected, actual


def execute(dev, actions, required_route, *, expected_preset, external_audio_muted):
    if external_audio_muted is not True:
        raise PermissionError("Confirm external audio remains muted throughout the build")
    with dev._lock:
        resolved, expected, actual = prepare(dev, actions, required_route, expected_preset)
        results = []
        with dev.edit_session(external_audio_muted=True, expected_preset=expected_preset):
            if actual != expected:
                try:
                    built = dev.build_route(required_route, actions)
                except (OSError, RuntimeError, ValueError, KeyError) as exc:
                    built = SetResult(False, f"Route construction stopped: {exc}", None, None)
                if not built.ok:
                    return {"ok": False, "results": [], "detail": built.detail, "phase": "build_route",
                            "skipped": len(actions), "stored": False, "physical_volume_verified": False,
                            "recovery": "Partial routing may remain in the edit buffer. Keep external audio muted; no automatic rollback."}
            for item in resolved:
                a, eid, kind = item.action, item.effect_id, item.action["kind"]
                try:
                    if kind == "add_block":
                        result = SetResult(True, "Present in the verified required route", None, eid)
                    elif kind == "set_param": result = dev.set_param_display(item.spec, item.value)
                    elif kind == "set_type": result = dev.set_model(item.family, eid, item.value)
                    elif kind == "set_cab": result = dev.set_cab(eid, *item.value)
                    elif kind == "bind_pedal":
                        result = dev.assign_existing_modifier(a["modifier_slot"], eid, 5, item.value)
                    elif kind == "bind_controller":
                        result = dev.bind_pedal_control(eid, *item.value)
                    else:
                        if kind == "set_scene": actual_value = dev.set_scene(item.value)
                        elif kind == "set_channel": actual_value = dev.set_channel(eid, item.value)
                        elif kind == "set_bypass": actual_value = dev.set_bypass(eid, item.value)
                        elif kind == "rename_preset":
                            got = dev.rename_preset(item.value)
                            actual_value = got[1] if got else None
                        elif kind == "rename_scene":
                            got = dev.rename_scene(item.value, a["type_name"])
                            actual_value = got[1] if got and got[0] == item.value else None
                        wanted = a["type_name"] if kind == "rename_scene" else item.value
                        ok = actual_value is not None and actual_value == wanted
                        result = SetResult(ok, "Independent readback matched" if ok else "Readback mismatch; stopped", None, actual_value)
                except (OSError, RuntimeError, ValueError, KeyError) as exc:
                    result = SetResult(False, f"Execution stopped: {exc}", None, None)
                results.append({"action": a, "ok": result.ok, "detail": result.detail,
                                "before": result.display_before, "after": result.display_after})
                if not result.ok:
                    break
            ok = len(results) == len(actions) and all(r["ok"] for r in results)
            if ok:
                try:
                    route_guard.check_route(dev, dev.reg, required_route, complete=True)
                except (OSError, RuntimeError, ValueError, KeyError) as exc:
                    ok = False
                    results.append({"ok": False, "detail": str(exc), "phase": "final_route"})
        return {"ok": ok, "results": results, "skipped": max(0, len(actions) - len(results)),
                "stored": False, "physical_volume_verified": False,
                "recovery": "No automatic rollback; partial edit-buffer changes may remain. Nothing stored."}
