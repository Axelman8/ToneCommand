"""Captured fixture is NOT a public builder or firmware-wide permission."""
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from devices.axefx3 import grid_probe,grid,fw33_profile,protocol,fw33
from devices.axefx3.registry import Registry
from devices.axefx3.adapter import AxeFxIII
from fm9 import protocol as shared


def device():
    return SimpleNamespace(reg=Registry(fw33_profile.KEY),_edit_target=324,
                           _grid_probe_permit=None)


@pytest.mark.parametrize('frame',grid_probe.frames())
def test_fixture_requires_exact_permit_and_current_target(frame):
    dev=device()
    assert not grid_probe.allowed(dev,frame)
    dev._grid_probe_permit=tuple(frame)
    assert grid_probe.allowed(dev,frame)
    fw33.check_frame(dev,frame)
    assert protocol.valid_reply(frame[1:-1])
    assert not grid.valid_write(frame,dev.reg)
    dev._edit_target=323
    assert not grid_probe.allowed(dev,frame)
    dev._edit_target=324
    dev.reg=Registry('32.06')
    assert not grid_probe.allowed(dev,frame)


def test_insert_retains_captured_payload_not_assumed_cursor_position():
    assert grid_probe.INSERTS[46]!=grid.reframe(shared.build_set_grid_cell(5,1,46))
    assert grid_probe.INSERTS[118]!=grid.reframe(shared.build_set_grid_cell(5,2,118))


def test_unknown_fixture_write_rejected_and_permit_always_cleared():
    dev=device()
    dev._check_edit_target=lambda:None
    dev.read_grid=lambda:[]
    def fail(frame):
        assert grid_probe.allowed(dev,frame)
        raise RuntimeError('Stopped once, no write retry')
    dev._write=fail
    with pytest.raises(RuntimeError):
        grid_probe.write(dev,grid_probe.frames()[0])
    assert dev._grid_probe_permit is None
    with pytest.raises(PermissionError):
        grid_probe.write(dev,grid.reframe(shared.build_set_grid_cell(5,3,58)))


@pytest.mark.parametrize('col',[0,3,True,None])
def test_delete_other_cells_never_enabled(col):
    with pytest.raises(ValueError):grid_probe.delete(col)


def test_captured_cable_matches_shared_fm9_builder_exactly():
    assert bytes(grid_probe.frames()[4]).hex(' ')==(
        'f0 00 01 74 10 01 35 00 00 00 00 00 01 00 00 00 00 00 00 02 00 02 02 40 62 f7')
    assert bytes(grid_probe.frames()[5]).hex(' ')==(
        'f0 00 01 74 10 01 35 00 00 00 00 00 02 00 00 00 00 00 00 02 00 02 02 40 61 f7')


@pytest.mark.parametrize('fault',['unselected','occupied','duplicate','cable','other_block'])
def test_probe_rejects_unsafe_fixture_state_before_transport(fault):
    dev=device();dev._check_edit_target=lambda:None
    cells=[];written=[]
    dev.read_grid=lambda:cells
    dev._write=lambda frame:written.append(frame)
    frame=grid_probe.INSERTS[46]
    if fault=='occupied':cells.append(shared.GridCell(4,0,58,False,0))
    if fault=='duplicate':cells.append(shared.GridCell(1,7,46,False,0))
    if fault in ('cable','other_block'):
        frame=grid_probe.delete(1)
        cells.append(shared.GridCell(4,0,46 if fault=='cable' else 58,False,8 if fault=='cable' else 0))
    if fault!='unselected':dev._grid_probe_selection=((5,1),grid.snapshot(cells))
    with pytest.raises(PermissionError):grid_probe.write(dev,frame)
    assert not written
    assert dev._grid_probe_permit is None


@pytest.mark.parametrize('fault',['no_permit','raw','wrong_target','unmeasured'])
def test_transport_still_refuses_unreviewed_fixture_frames(fault):
    dev=device();frame=grid_probe.frames()[1]
    dev.guard=AxeFxIII.guard;dev.outp=Mock();dev._check_edit_target=lambda:None
    dev._approved_frame=tuple(frame);dev._grid_probe_permit=tuple(frame)
    if fault=='no_permit':dev._grid_probe_permit=None
    if fault=='raw':dev._approved_frame=None
    if fault=='wrong_target':dev._edit_target=325
    if fault=='unmeasured':
        frame=grid.reframe(shared.build_set_grid_cell(5,3,58))
        dev._approved_frame=dev._grid_probe_permit=tuple(frame)
    with pytest.raises(PermissionError):AxeFxIII._send(dev,frame)
    dev.outp.send.assert_not_called()
