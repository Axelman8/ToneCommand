from fm9 import protocol as p


def test_default_profile_stays_fm9(monkeypatch):
    monkeypatch.delenv("TONECOMMAND_DEVICE", raising=False)
    monkeypatch.delenv("TONECOMMAND_MIDI_PORT_HINT", raising=False)
    assert p.device_name() == "FM9"
    assert p.device_model() == p.MODEL_FM9
    assert p.device_port_hint() == "fm9"
    assert p.envelope(p.FN_SCENE, [0x7F])[4] == p.MODEL_FM9


def test_axefx3_profile_uses_axe_model_byte_and_port_hint(monkeypatch):
    monkeypatch.setenv("TONECOMMAND_DEVICE", "axe-fx-iii")
    monkeypatch.delenv("TONECOMMAND_MIDI_PORT_HINT", raising=False)
    assert p.device_name() == "Axe-Fx III"
    assert p.device_model() == p.MODEL_AXE_FX_III
    assert p.device_port_hint() == "axe-fx"
    assert p.envelope(p.FN_SCENE, [0x7F])[4] == p.MODEL_AXE_FX_III


def test_port_hint_can_be_overridden(monkeypatch):
    monkeypatch.setenv("TONECOMMAND_DEVICE", "axe-fx-iii")
    monkeypatch.setenv("TONECOMMAND_MIDI_PORT_HINT", "Axe-Fx III MIDI")
    assert p.device_port_hint() == "axe-fx iii midi"


def test_preset_parse_follows_selected_device(monkeypatch):
    from tests.test_install import make_file
    from fm9 import presetfile

    monkeypatch.setenv("TONECOMMAND_DEVICE", "axe-fx-iii")
    pf = presetfile.parse(make_file(model=p.MODEL_AXE_FX_III))
    assert pf.model == p.MODEL_AXE_FX_III


def test_cab_retarget_follows_selected_device(monkeypatch):
    from tests.test_cabs import make_cab
    from fm9 import cabfile

    monkeypatch.setenv("TONECOMMAND_DEVICE", "axe-fx-iii")
    cf = cabfile.parse(make_cab(model=p.MODEL_FM9), "U1-Test.syx")
    frames = cabfile.retarget(cf, 4)
    assert all(frame[4] == p.MODEL_AXE_FX_III for frame in frames)
