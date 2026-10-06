"""Reviewed single-block insertion, using FM9 planning and captured AFX3 moves.

FW32.06: same-row serial routes on display row 3 only. No block clear,
disconnect, shunt consumption, preset reload, model reset or flash store.
Moving temporarily breaks cables, so external audio mute remains required.
Partial failure stops; it never claims automatic rollback or topology Undo.
"""
import time

from fm9.device import FM9, SetResult
from fm9 import protocol as shared
from . import grid, protocol, route_guard


def move_right_frame():
    # Exact Axe-Edit drag captures for Output1, Reverb1 and Delay1, 2026-10-06.
    return protocol.envelope(1, [0x36, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0])


def plan(dev, required_route, actions):
    expected, actual = route_guard.planned_route(dev, dev.reg, required_route, actions)
    if not actual or actual == expected:
        return None
    missing = [e for e in expected if e not in actual]
    # First hardware-proven family only. Do not advertise generic insertion.
    if (62 not in actual or missing != [78]
            or expected != actual[:actual.index(62)+1] + [78] + actual[actual.index(62)+1:]):
        raise ValueError('Only one Chorus1 insertion immediately after Cab1 is verified')
    cells = grid.snapshot(dev.read_grid())
    columns = sorted(c for r, c in cells)
    if (dev.reg.firmware != '32.06' or {r for r,c in cells} != {3}
            or columns != list(range(columns[0], columns[-1]+1))):
        raise ValueError('Insertion requires one contiguous serial row 3 on FW32.06')
    if len(columns) >= 14 or columns[-1] >= 14:
        raise ValueError('No empty column to the right; existing shunts are not consumed')
    cab_col = next(c for (r,c),v in cells.items() if v[:2] == (62,False))
    col = cab_col+1
    if any(v[1] for (r,c),v in cells.items() if c >= col):
        raise ValueError('Insertion will not consume or move downstream shunts')
    # Reuse the upstream read-only displacement calculation, not its clear
    # and reinsert execution. Full topology was already checked independently.
    intent = FM9.plan_splice(dev, 3, col)
    if (not intent['ok'] or intent['spends_shunt']
            or intent['slack_col'] != columns[-1]+1
            or grid.snapshot(dev.read_grid()) != cells):
        raise ValueError('Insertion geometry changed or has no verified empty slack')
    if any(m['effect_id'] >= 128 for m in intent['moves']):
        raise ValueError('Ambiguous grid IDs cannot be moved')
    return dict(expected=expected, actual=actual, cells=cells, intent=intent)


def _held(before, after):
    old_ids = set(before['bulk'])
    return (old_ids <= set(after['bulk'])
            and all(before['bulk'][e] == after['bulk'][e] for e in old_ids)
            and before['modifiers'] == after['modifiers']
            and before['preset'] == after['preset']
            and before['scene'] == after['scene']
            and before['scene_names'] == after['scene_names']
            and [(b.effect_id,b.bypassed,b.channel,b.channels_supported) for b in before['blocks']]
                == [(b.effect_id,b.bypassed,b.channel,b.channels_supported) for b in after['blocks']
                    if b.effect_id in {o.effect_id for o in before['blocks']}])


def build(dev, required_route, actions):
    from .tone_review import snapshot as full_snapshot
    prepared = plan(dev, required_route, actions)
    if prepared is None:
        raise ValueError('No single insertion to execute')
    initial = full_snapshot(dev)
    if grid.snapshot(initial['grid']) != prepared['cells']:
        raise ValueError('Routing changed before insertion; nothing written')
    fail = lambda detail: SetResult(False, detail+'; keep external audio muted, partial routing may remain', None, None)
    for move in prepared['intent']['moves']:
        col, eid = move['from_col'], move['effect_id']
        before = grid.snapshot(dev.read_grid())
        if before.get((3,col), ())[:2] != (eid,False) or (3,col+1) in before:
            return fail('Move source/destination changed')
        wanted = dict(before)
        del wanted[3,col]
        wanted[3,col+1] = (eid,False,0)
        dev._write(grid.reframe(shared.build_select_grid_cell(3,col)))
        # Permit is scoped to this checked move, never a generic transport flag.
        frame = move_right_frame()
        dev._grid_move_permit = tuple(frame)
        try:
            dev._write(frame)
        finally:
            dev._grid_move_permit = None
        for _ in range(4):
            time.sleep(.15)
            after = grid.snapshot(dev.read_grid())
            if after == wanted:
                break
        else:
            return fail('Move grid readback did not match exactly')
        interim = full_snapshot(dev)
        if not _held(initial,interim):
            return fail('Existing parameters, modifiers, names or block states changed')
    placed = dev.place_block((3,prepared['intent']['at_col']),78)
    if not placed.ok:
        return fail(placed.detail)
    # Reconnect only the disturbed contiguous span, using the shared FM9
    # cable builder and the existing independent AFX3 connect readback.
    for col in range(prepared['intent']['at_col']-1,prepared['intent']['slack_col']):
        cable = dev.connect_cells(3,col,3)
        if not cable.ok:
            return fail(cable.detail)
    final = full_snapshot(dev)
    if not _held(initial,final):
        return fail('Existing state changed during placement/routing')
    actual = route_guard.serial_route(final['grid'],final['blocks'],dev.reg)
    if actual != prepared['expected']:
        return fail('Final complete signal route did not verify')
    return SetResult(True,'Chorus1 inserted; complete route and original state independently verified',
                     prepared['actual'],actual)
