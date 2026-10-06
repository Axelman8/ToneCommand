"""Bounded, non-destructive grid construction from the historical AFX3 path.

No preset loading, block clearing, shunt replacement or implicit flattening.
Existing exact routes can be reused. An incompatible existing grid is refused.
"""
import time
from functools import lru_cache

from fm9 import protocol as shared
from fm9.device import SetResult
from . import protocol, route_guard
from . import audio_safety


def reframe(frame):
    return protocol.envelope(frame[5], frame[6:-2])


def fixture_remove_frame(col):
    """Captured Axe-Edit DELETE 01 33, only two owner-approved test cells.

    This is not public block deletion, shunt replacement or an AI action.
    The adapter additionally requires preset323, an exact scoped permit and
    a live Drive1/Compressor1 at the addressed cell. No Store.
    """
    if type(col) is not int or col not in (2,3):
        raise ValueError('Only developer test columns2/3')
    payload = shared.build_select_grid_cell(3,col)[6:-2]
    payload[0] = 0x33
    return protocol.envelope(1,payload)


def fixture_left_frame():
    # Exact 01 36 leftward drag captured during Chorus fixture restoration.
    # It has no executor action and requires a second fixture-only permit.
    return protocol.envelope(1,[0x36,0,0,0,0,0,0,0,0,0,0,0,0,0,0])


def valid_write(frame, reg):
    payload = frame[6:-2]
    sub = payload[:2]
    if sub == [0x30, 0] and len(payload) == 15:
        pos = sum(v << (7*i) for i, v in enumerate(payload[6:11]))
        col, row = divmod(pos, 6)
        return (row in range(1, 5) and col in range(14)
                and frame == reframe(shared.build_select_grid_cell(row + 1, col + 1)))
    if sub == [0x32, 0] and len(payload) == 15:
        eid = shared.decode14(*payload[2:4])
        family = reg.family_of_effect_id(eid)
        pos = shared.decode14(*payload[6:8])
        col, row = divmod(pos, 6)
        return (family is not None and eid < 128 and family[0] not in audio_safety.BLOCKED_LOOP_FAMILIES
                and row in range(1, 5) and col in range(14)
                and frame == reframe(shared.build_set_grid_cell(row + 1, col + 1, eid)))
    if sub == [0x35, 0]:
        return tuple(frame) in _cable_frames()
    return False


@lru_cache(maxsize=1)
def _cable_frames():
    return frozenset(tuple(reframe(shared.build_set_grid_routing(r, c, d)))
                     for r in range(2, 6) for c in range(1, 14) for d in range(2, 6))


def snapshot(cells):
    if cells is None:
        raise ValueError("Grid unreadable")
    result = {}
    for c in cells:
        pos = (c.row + 1, c.col + 1)
        if pos in result or not 1 <= pos[0] <= 6 or not 1 <= pos[1] <= 14:
            raise ValueError("Malformed or duplicate grid cell")
        result[pos] = (c.effect_id, c.is_shunt, c.cable_in_mask)
    return result


def place(dev, position, effect_id):
    row, col = position
    if type(row) is not int or type(col) is not int or row not in range(2, 6) or col not in range(1, 15):
        raise ValueError("Unverified grid position")
    family = dev.reg.family_of_effect_id(effect_id)
    if not family or effect_id >= 128 or family[0] in audio_safety.BLOCKED_LOOP_FAMILIES:
        raise ValueError("Unverified block or ambiguous grid alias")
    before = snapshot(dev.read_grid())
    if before.get((row, col), ())[:2] == (effect_id, False):
        return SetResult(True, "Block already present", None, effect_id)
    if (row, col) in before or any(v[0] == effect_id for v in before.values()):
        raise PermissionError("Will not overwrite or move an existing block")
    dev._write(reframe(shared.build_select_grid_cell(row, col)))
    time.sleep(.05)
    dev._write(reframe(shared.build_set_grid_cell(row, col, effect_id)))
    for _ in range(4):
        time.sleep(.15)
        after = snapshot(dev.read_grid())
        held = {k: v for k, v in after.items() if k != (row, col)}
        if held != before:
            return SetResult(False, "Another grid cell changed; stopped", before, after)
        if after.get((row, col), ())[:2] == (effect_id, False):
            return SetResult(True, "Placement independently verified", None, effect_id)
    return SetResult(False, "Placement did not verify", None, None)


def connect(dev, src_row, src_col, dest_row):
    if (any(type(v) is not int for v in (src_row, src_col, dest_row))
            or src_row not in range(2, 6) or dest_row not in range(2, 6)
            or src_col not in range(1, 14)):
        raise ValueError("Unverified cable position")
    before = snapshot(dev.read_grid())
    source, dest = (src_row, src_col), (dest_row, src_col + 1)
    if source not in before or dest not in before:
        raise ValueError("Cable endpoint is empty")
    wanted_mask = 1 << src_row
    if before[dest][2] == wanted_mask:
        return SetResult(True, "Cable already present", wanted_mask, wanted_mask)
    if before[dest][2] != 0:
        raise PermissionError("Will not replace an existing or parallel cable")
    dev._write(reframe(shared.build_set_grid_routing(src_row, src_col, dest_row)))
    wanted = dict(before)
    wanted[dest] = (*before[dest][:2], wanted_mask)
    for _ in range(4):
        time.sleep(.15)
        after = snapshot(dev.read_grid())
        if after == wanted:
            return SetResult(True, "Cable independently verified", 0, wanted_mask)
        if any(k != dest and before.get(k) != v for k, v in after.items()) or set(after) != set(before):
            return SetResult(False, "Unexpected routing change; stopped", before, after)
    return SetResult(False, "Cable did not verify", before, after)


def build(dev, required_route, actions):
    expected, actual = route_guard.planned_route(dev, dev.reg, required_route, actions)
    if actual == expected:
        return SetResult(True, "Existing complete route verified; reused without writes", actual, actual)
    if actual:
        from . import insertion
        return insertion.build(dev, required_route, actions)
    # Only the historical Input 1 to Output 1 empty-grid build, no destructive
    # preset load or clear to make a nonempty preset appear to be empty.
    for col, eid in enumerate(expected, 1):
        result = dev.place_block((3, col), eid)
        if not result.ok:
            return result
    for col in range(1, len(expected)):
        result = dev.connect_cells(3, col, 3)
        if not result.ok:
            return result
    route_guard.check_route(dev, dev.reg, required_route, complete=True)
    return SetResult(True, "Complete route independently verified; no audio measurement", [], expected)
