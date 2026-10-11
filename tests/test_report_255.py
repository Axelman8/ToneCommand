"""Follow-ups from problem reports. #255: an FM3 owner on a MIDI adapter was
told, with FM9 selected, to install Fractal's USB driver, which cannot help
an FM3 (#221), and one port name in his report was driver garbage. #251: a
failed reorder read 'set to null'. #253: a block in the status dump with no
grid cell counted as present."""
import json
import subprocess
import sys
from pathlib import Path

sys.argv = ["x"]
import pytest

import server
from fm9 import diagnostics, midi_transport as mt, starter_template
from fm9.sim import SimFM9

PAGE = (Path(__file__).resolve().parent.parent / "ui" / "index.html").read_text(encoding="utf-8")
#: the #255 report's MIDI inputs, exactly
REPORT_INPUTS = ["-â\x80ºn\x17Ã¿\x7f 0", "MidiPort 1"]


# -- REQ-001: the not-found message --------------------------------------------------

def test_message_on_windows_names_the_fm9_driver_and_the_fm3_route():
    msg = mt._not_found("fm9", inputs=REPORT_INPUTS, system="Windows")
    assert msg == ("FM9 MIDI ports not found; is it connected and powered on? On Windows an FM9 also "
                   "needs Fractal's USB driver, the one FM9-Edit uses, from fractalaudio.com. If your unit "
                   "is an FM3, or you reach it through a MIDI interface, choose FM3 under Devices and pick "
                   "that interface's port: MidiPort 1.")
    assert "FM3 or FM9 also needs" not in msg and "FM3-Edit" not in msg


def test_message_off_windows_has_the_fm3_route_but_no_driver():
    msg = mt._not_found("fm9", inputs=REPORT_INPUTS, system="Darwin")
    assert "driver" not in msg and msg.endswith("pick that interface's port: MidiPort 1.")


def test_message_with_no_inputs_is_unchanged_but_for_the_fm9_only_driver():
    msg = mt._not_found("fm9", inputs=[], system="Windows")
    assert msg == ("FM9 MIDI ports not found: this computer sees no MIDI input at all. Is it connected "
                   "and powered on, with a USB cable that carries data? On Windows an FM9 also needs "
                   "Fractal's USB driver, the one FM9-Edit uses, from fractalaudio.com.")


def test_message_does_not_offer_an_fm9_port_an_unreadable_one_or_a_virtual_bus():
    msg = mt._not_found("fm9", inputs=["FM9 MIDI In", REPORT_INPUTS[0], "IAC Driver Bus 1",
                                       "loopMIDI Port"], system="Windows")
    assert "If your unit is an FM3" not in msg


def test_message_for_the_fm3_is_unchanged():
    assert mt._not_found("fm3", inputs=REPORT_INPUTS, system="Windows") == mt.fm3_connection_failure()


# -- REQ-002: the report --------------------------------------------------------------

def test_report_marks_an_unreadable_port_name_and_keeps_it_raw():
    line = diagnostics._names(REPORT_INPUTS)
    assert line == ("'-â\\x80ºn\\x17Ã¿\\x7f 0' (unreadable name: the driver reports "
                    "control characters), 'MidiPort 1'")
    assert diagnostics._names(["MidiPort 1", "Microsoft GS Wavetable Synth 0"]) == \
        "'MidiPort 1', 'Microsoft GS Wavetable Synth 0'"
    assert diagnostics._names([]) == "none"


@pytest.mark.parametrize("name,ok", [("MidiPort 1", True), ("FM9 MIDI In", True), ("café out", True),
                                     ("﻿Port", False), ("a\x17b", False), ("", False)])
def test_unreadable_names(name, ok):
    assert mt.readable_port(name) is ok


# -- REQ-003: describe() --------------------------------------------------------------

def _describe(tmp_path, actions):
    start = PAGE.index("function describe(a) {")
    end = PAGE.index("\n}\n", start) + 3
    script = tmp_path / "d.mjs"
    script.write_text("const esc = s => String(s); const geqKeys = []; const lastParams = {};\n" + PAGE[start:end]
                      + f"\nconsole.log(JSON.stringify({json.dumps(actions)}.map(describe)));\n", encoding="utf-8")
    out = subprocess.run(["node", str(script)], capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout)


def test_describe_names_moves_and_anchored_additions(tmp_path):
    got = _describe(tmp_path, [
        {"kind": "reorder", "block": "drive", "instance": 1, "ref": "amp", "position": "before"},
        {"kind": "reorder", "block": "delay", "instance": 1, "ref": "reverb"},
        {"kind": "add_block", "block": "wah", "instance": 1, "position": "before", "ref": "drive 1"},
        {"kind": "add_block", "block": "wah", "instance": 1, "position": "pre"},
        {"kind": "set_param", "block": "amp", "instance": 1, "param": "DISTORT_DRIVE", "value": 6}])
    assert got[:4] == ["Move drive 1 before amp", "Move delay 1 before reverb",
                       "ADD wah 1 (before drive 1)", "ADD wah 1 (pre-amp)"]
    assert "null" not in " ".join(got[:4])


# -- REQ-004: present means on the grid ---------------------------------------------------

def ghost_template():
    dev = SimFM9(server.reg)
    starter_template.lay(dev, server.reg, into_current=True)
    assert 46 in {b.effect_id for b in dev.status_dump()}            # the ghost compressor
    assert 46 not in {c.effect_id for c in dev.read_grid() if c.effect_id}
    return dev


def test_snapshot_lists_only_blocks_a_grid_cell_holds():
    dev = ghost_template()
    labels = [b["label"] for b in server.snapshot(dev)["blocks"]]
    assert "Compressor 1" not in labels and {"Amp 1", "Cab 1", "Drive 1"} <= set(labels)


def test_add_block_places_a_ghost_instead_of_saying_it_is_there():
    dev = ghost_template()
    res = server.run_action(dev, server.Action(kind="add_block", block="comp", instance=1, position="pre"))
    assert res["ok"] and "already in this preset" not in res["detail"]
    assert 46 in {c.effect_id for c in dev.read_grid() if c.effect_id}
    res = server.run_action(dev, server.Action(kind="add_block", block="comp", instance=1, position="pre"))
    assert res["detail"] == "comp 1 is already in this preset; nothing to add"   # now it is


def test_snapshot_keeps_the_status_list_when_the_grid_cannot_be_read(monkeypatch):
    dev = ghost_template()
    monkeypatch.setattr(dev, "read_grid", lambda *a, **k: None)
    labels = [b["label"] for b in server.snapshot(dev)["blocks"]]
    assert "Compressor 1" in labels


# -- REQ-008: an FM3 binding with its own input and output names ---------------------

ADAPTER = {"ins": ["MidiPort 1", "IAC Driver Bus 1"], "outs": ["MidiPort 2", "IAC Driver Bus 1"]}


@pytest.fixture
def adapter_bus(monkeypatch, tmp_path):
    for name in (mt.FM3_PORT_ENV, mt.FM3_PORT_OUT_ENV):
        monkeypatch.delenv(name, raising=False)
    path = tmp_path / "fm3_port.json"
    monkeypatch.setattr(mt, "fm3_binding_path", lambda: path)
    monkeypatch.setattr(mt, "backend", lambda env=None: "mido")
    monkeypatch.setattr(mt.mido, "get_input_names", lambda: list(ADAPTER["ins"]))
    monkeypatch.setattr(mt.mido, "get_output_names", lambda: list(ADAPTER["outs"]))
    opened = []
    monkeypatch.setattr(mt.mido, "open_input", lambda n: opened.append(("in", n)) or object())
    monkeypatch.setattr(mt.mido, "open_output", lambda n: opened.append(("out", n)) or object())
    return path, opened


def test_pair_saves_each_direction_and_opens_them_exactly(adapter_bus):
    path, opened = adapter_bus
    assert mt.save_fm3_binding("MidiPort 1", "MidiPort 2") == {
        "port_in": "MidiPort 1", "port_out": "MidiPort 2", "port": None, "source": "file"}
    assert json.loads(path.read_text(encoding="utf-8")) == {"port_in": "MidiPort 1", "port_out": "MidiPort 2"}
    mt.open_ports("fm3")
    assert opened == [("in", "MidiPort 1"), ("out", "MidiPort 2")]


def test_binding_from_the_221_file_still_loads_as_both_directions(adapter_bus):
    path, _ = adapter_bus
    path.write_text(json.dumps({"port": "IAC Driver Bus 1"}), encoding="utf-8")
    assert mt.load_fm3_binding() == {"port_in": "IAC Driver Bus 1", "port_out": "IAC Driver Bus 1",
                                     "port": "IAC Driver Bus 1", "source": "file"}


@pytest.mark.parametrize("value", [{"port_in": "MidiPort 1"}, {"port_out": "MidiPort 2"},
                                   {"port_in": "", "port_out": "MidiPort 2"}, ["MidiPort 1"]])
def test_binding_file_half_written_fails_closed(adapter_bus, value):
    path, opened = adapter_bus
    path.write_text(json.dumps(value), encoding="utf-8")
    with pytest.raises(mt.TransportError):
        mt.load_fm3_binding()
    with pytest.raises(mt.TransportError):
        mt.open_ports("fm3")
    assert not opened


@pytest.mark.parametrize("port_in,port_out", [("MidiPort 2", "MidiPort 2"), ("MidiPort 1", "MidiPort 1"),
                                              ("MidiPort 1", ""), ("", "MidiPort 2")])
def test_pair_refuses_a_name_missing_from_its_own_list(adapter_bus, port_in, port_out):
    path, _ = adapter_bus
    with pytest.raises(mt.TransportError, match="Choose the MIDI"):
        mt.save_fm3_binding(port_in, port_out)
    assert not path.exists()


def test_fm3_port_out_alone_takes_the_input_from_the_saved_file(adapter_bus, monkeypatch):
    path, opened = adapter_bus
    mt.save_fm3_binding("MidiPort 1", "MidiPort 2")
    monkeypatch.setenv(mt.FM3_PORT_OUT_ENV, "IAC Driver Bus 1")
    assert mt.load_fm3_binding() == {"port_in": "MidiPort 1", "port_out": "IAC Driver Bus 1",
                                     "port": None, "source": "env"}
    with pytest.raises(mt.TransportError, match=mt.FM3_PORT_OUT_ENV):
        mt.save_fm3_binding("MidiPort 1", "MidiPort 2")
    mt.open_ports("fm3")
    assert opened == [("in", "MidiPort 1"), ("out", "IAC Driver Bus 1")]


def test_fm3_port_out_alone_with_no_saved_input_never_guesses_one(adapter_bus, monkeypatch):
    path, opened = adapter_bus
    monkeypatch.setenv(mt.FM3_PORT_OUT_ENV, "MidiPort 2")
    assert mt.load_fm3_binding() == {"port_in": None, "port_out": "MidiPort 2",
                                     "port": None, "source": "env"}
    with pytest.raises(mt.TransportError):
        mt.open_ports("fm3")
    assert not opened and not path.exists()


def test_fm3_port_fixes_both_and_fm3_port_out_overrides_the_output(adapter_bus, monkeypatch):
    _, opened = adapter_bus
    monkeypatch.setenv(mt.FM3_PORT_ENV, "MidiPort 1")
    monkeypatch.setenv(mt.FM3_PORT_OUT_ENV, "MidiPort 2")
    assert mt.load_fm3_binding()["port_in"] == "MidiPort 1"
    mt.open_ports("fm3")
    assert opened == [("in", "MidiPort 1"), ("out", "MidiPort 2")]
