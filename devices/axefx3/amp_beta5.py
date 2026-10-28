"""Closed Beta 5 Amp calibration, not a general firmware promotion.

Four independent editor literals, disconnected disposable327, Bassguy/A.
No new parameter family, model/routing/level change, Store or MK1 claim.
"""
from fm9 import protocol as shared
from fm9.device import ReadOnly
from . import protocol

KEY = 'mk2-beta5-calibration'
IDENTITY_SHA256 = '15e9277d25e2180599d6d8a9d1fda73373ee592cdc0ce8682a1f7c007b67a616'
LABEL = '33.00-beta5.20261026'
WORDS = {200:1525, 201:350}
LITERALS = {
    ('gain',4.6):'f0 00 01 74 10 01 09 00 3a 00 01 00 1e 0a 2e 77 03 00 00 00 00 68 f7',
    ('gain',5.):'f0 00 01 74 10 01 09 00 3a 00 01 00 00 00 00 78 03 00 00 00 00 5d f7',
    ('mid',5.6):'f0 00 01 74 10 01 09 00 3a 00 03 00 29 38 3d 78 03 00 00 00 00 73 f7',
    ('mid',5.):'f0 00 01 74 10 01 09 00 3a 00 03 00 00 00 00 78 03 00 00 00 00 5f f7',
}


def native_supported():
    import struct
    import sys
    from fm9 import midi_transport
    return (sys.platform == 'win32' and sys.version_info[:2] == (3,12)
            and struct.calcsize('P') == 8 and midi_transport.backend() == 'mido')


def check_edit(edit):
    literal = LITERALS.get((edit.control, edit.value))
    if edit.preset != 327 or literal is None or edit.frame() != list(bytes.fromhex(literal)):
        raise ReadOnly('Beta 5 calibration accepts only captured Gain 4.6/5.0 or Mid 5.0/5.6 on disposable327')


def grid_query():
    return protocol.envelope(1, [shared.SUB_GRID_LAYOUT,0]+[0]*13)


def extra_read(frame):
    return frame in [grid_query(), protocol.envelope(1,[16,0,58,0,21,0]),
        *(protocol.envelope(31,list(shared.encode14(eid))) for eid in WORDS)]


def fixture(state):
    status = state['status']
    if (status['preset']['number'] != 327 or status['scene']['number'] != 1
            or {b['effect_id'] for b in status['blocks']} != {58,200,201}
            or len(status['blocks']) != 3
            or any(b['channel'] != 'A' for b in status['blocks'])
            or state['amp'][0] != 0
            or state['grid'] != [dict(row=0,col=0,effect_id=58,is_shunt=False,cable_in_mask=0)]
            or state['level'] is None or state['level'] > -12
            or state['level'] < -80
            or any(not isinstance(state['controllers'][str(eid)],list)
                   or len(state['controllers'][str(eid)]) != words for eid,words in WORDS.items())):
        raise ReadOnly('Beta 5 calibration requires sole Bassguy Amp1/A at row1/column1 on327/scene1, no I/O/cables, Level at most -12dB and complete controllers')
