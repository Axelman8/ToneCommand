"""Measured FW33 developer fixture, not public free-grid capability.

Only isolated Compressor1/Drive1 edits on preset324. Compressor is at row5
column1; Drive is at row5 or row6 column2, with one measured cable between.
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


def delete(col, *, row=5):
    if type(col) is not int or type(row) is not int or (row,col) not in ((5,1),(5,2),(6,2)):
        raise ValueError('Only measured fixture positions')
    payload=shared.build_select_grid_cell(row,col)[6:-2]
    payload[0]=0x33
    return protocol.envelope(1,payload)


def frames(dest_row=5):
    if type(dest_row) is not int or dest_row not in (5,6):
        raise ValueError('Only measured fixture rows5/6')
    return (grid.reframe(shared.build_select_grid_cell(5,1)), INSERTS[46],
            grid.reframe(shared.build_select_grid_cell(dest_row,2)), INSERTS[118],
            grid.reframe(shared.build_set_grid_routing(5,1,dest_row)),
            grid.reframe(shared.build_set_grid_routing(5,1,dest_row,op=shared.ROUTING_DISCONNECT)),
            grid.reframe(shared.build_select_grid_cell(dest_row,2)), delete(2,row=dest_row),
            grid.reframe(shared.build_select_grid_cell(5,1)), delete(1))


def allowed(dev, frame):
    return (dev.reg.firmware==fw33_profile.KEY
            and getattr(dev,'_edit_target',None)==324
            and getattr(dev,'_grid_probe_permit',None)==tuple(frame)
            and frame in frames()+frames(6))


def write(dev, frame):
    """Fixture harness supplies full-state pre/post checks, no AI caller."""
    dev._check_edit_target()
    if dev.reg.firmware!=fw33_profile.KEY or dev._edit_target!=324 or frame not in frames()+frames(6):
        raise PermissionError('Only exact captured FW33 fixture operations')
    before=grid.snapshot(dev.read_grid())
    sub=frame[6]
    selection=getattr(dev,'_grid_probe_selection',None)
    if sub==0x32:
        eid=frame[8]
        position=selection[0] if selection else None
        choices=((5,1),) if eid==46 else ((5,2),(6,2))
        if (position not in choices or selection!=(position,before) or position in before
                or any(v[0]==eid for v in before.values())):
            raise PermissionError('Fresh empty fixture selection required, no replacement')
    elif sub in (0x33,0x35):
        if sub==0x33:
            positions=[next((r,c) for r,c in ((5,1),(5,2),(6,2)) if frame==delete(c,row=r))]
        else:
            dest_row=6 if frame in frames(6)[4:6] else 5
            positions=[(5,1),(dest_row,2)]
        for position in positions:
            if before.get(position,())[:2]!=(46 if position[1]==1 else 118,False):
                raise PermissionError('Only the measured fixture blocks may be edited')
        if sub==0x33:
            position=positions[0]
            if selection!=(position,before) or before[position][2]!=0:
                raise PermissionError('Deletion requires a fresh selection and no incoming cable')
            if any(c==position[1]+1 and v[2]&(1<<position[0]) for (r,c),v in before.items()):
                raise PermissionError('Deletion requires no outgoing cable')
        elif before[(5,1)][2]!=0 or before[positions[1]][2]!=(0 if frame[12]==1 else 32):
            raise PermissionError('Only add/remove the isolated test cable')
    dev._grid_probe_selection=None
    dev._grid_probe_permit=tuple(frame)
    try:
        result=dev._write(frame)
        if sub==0x30:
            col,row=divmod(sum(v<<(7*i) for i,v in enumerate(frame[12:17])),6)
            position=(row+1,col+1)
            dev._grid_probe_selection=(position,before)
        return result
    finally:
        dev._grid_probe_permit=None
