"""Measured FW33 developer fixture, not public free-grid capability.

Only isolated Compressor1/Drive1 edits on row5 columns1/2 of preset324.
Frames were observed from the owner's Axe-Edit edits on 2026-10-10. Insert
payload positions differ from cursor positions: retain the actual frames,
not an assumed corrected position. No move, Store, model or level write.
"""
from . import fw33_profile, grid, protocol
from fm9 import protocol as shared


INSERTS = {
    46: protocol.envelope(1, [0x32,0,46,0,0,0,7,0,0,0,0,0,0,0,0]),
    118: protocol.envelope(1, [0x32,0,118,0,0,0,25,0,0,0,0,0,0,0,0]),
}


def delete(col):
    if type(col) is not int or col not in (1,2):
        raise ValueError('Only measured fixture columns1/2')
    payload=shared.build_select_grid_cell(5,col)[6:-2]
    payload[0]=0x33
    return protocol.envelope(1,payload)


def frames():
    return (grid.reframe(shared.build_select_grid_cell(5,1)), INSERTS[46],
            grid.reframe(shared.build_select_grid_cell(5,2)), INSERTS[118],
            grid.reframe(shared.build_set_grid_routing(5,1,5)),
            grid.reframe(shared.build_set_grid_routing(5,1,5,op=shared.ROUTING_DISCONNECT)),
            grid.reframe(shared.build_select_grid_cell(5,2)), delete(2),
            grid.reframe(shared.build_select_grid_cell(5,1)), delete(1))


def allowed(dev, frame):
    return (dev.reg.firmware==fw33_profile.KEY
            and getattr(dev,'_edit_target',None)==324
            and getattr(dev,'_grid_probe_permit',None)==tuple(frame)
            and frame in frames())


def write(dev, frame):
    """Fixture harness supplies full-state pre/post checks, no AI caller."""
    dev._check_edit_target()
    if dev.reg.firmware!=fw33_profile.KEY or dev._edit_target!=324 or frame not in frames():
        raise PermissionError('Only exact captured FW33 fixture operations')
    before=grid.snapshot(dev.read_grid())
    sub=frame[6]
    selection=getattr(dev,'_grid_probe_selection',None)
    if sub==0x32:
        eid=frame[8]
        position=(5,1 if eid==46 else 2)
        if (selection!=(position,before) or position in before
                or any(v[0]==eid for v in before.values())):
            raise PermissionError('Fresh empty fixture selection required, no replacement')
    elif sub in (0x33,0x35):
        positions=[(5,2 if frame==delete(2) else 1)] if sub==0x33 else [(5,1),(5,2)]
        for position in positions:
            if before.get(position,())[:2]!=(46 if position[1]==1 else 118,False):
                raise PermissionError('Only the measured fixture blocks may be edited')
        if sub==0x33:
            position=positions[0]
            if selection!=(position,before) or before[position][2]!=0:
                raise PermissionError('Deletion requires a fresh selection and no incoming cable')
            if any(c==position[1]+1 and v[2]&32 for (r,c),v in before.items()):
                raise PermissionError('Deletion requires no outgoing cable')
        elif before[(5,1)][2]!=0 or before[(5,2)][2]!=(0 if frame[12]==1 else 32):
            raise PermissionError('Only add/remove the isolated test cable')
    dev._grid_probe_selection=None
    dev._grid_probe_permit=tuple(frame)
    try:
        result=dev._write(frame)
        if sub==0x30:
            position=(5,1 if frame==frames()[0] else 2)
            dev._grid_probe_selection=(position,before)
        return result
    finally:
        dev._grid_probe_permit=None
