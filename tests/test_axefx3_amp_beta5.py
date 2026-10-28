"""Closed operation-profile tests, independent fake wire responses, no MIDI."""
import hashlib
import os

import mido
import pytest
from fastapi.testclient import TestClient

import server
from devices.axefx3 import amp_beta5 as beta, protocol as p
from devices.axefx3.adapter import ReadOnlyRegistry
from devices.axefx3.amp_writer import AmpWriter, AmpEdit, AmpReadbackError, _AmpOutput
from fm9 import protocol as shared
from fm9.device import ReadOnly
from tests.test_axefx3_amp_writer import AmpPorts
from tests.test_axefx3_edit_routes import payload


IDENTITY=(0,1,116,16,8,97,0,16,1,17,0,0,79,99,116,32,50,54,32,50,48,50,54,32,49,50,58,52,50,58,52,53,0,0,0,0,0,0,0,0,0,0,0,0,2)


def test_test_harness_does_not_inherit_developer_optins():
    assert 'TONECOMMAND_AXEFX3_REVIEWED_AMP' not in os.environ
    assert 'TONECOMMAND_AXEFX3_REVIEWED_AMP_PROFILE' not in os.environ


def grid_reply(extra=False):
    # Independent bit-stream fixture, no production grid encoder or parser.
    bits='0'*46
    for column in range(14):
        for row in range(6):
            eid=58 if (row,column)==(0,0) else 62 if extra and (row,column)==(0,1) else 0
            bits+=f'{eid*2:08b}'+('00000001' if eid else '00000000')+'0'*16
    bits=bits.ljust((len(bits)+6)//7*7,'0')
    head=[0,1,116,16,1,46]+[0]*343
    body=head+[int(bits[i:i+7],2) for i in range(0,len(bits),7)]
    return body+[shared.checksum(body)]


class BetaPorts(AmpPorts):
    def __init__(self):
        super().__init__()
        self.identity,self.preset=IDENTITY,327
        self.amp[0]=0;self.amp[1]=self.amp[3]=32767;self.amp[21]=44563
        self.controllers={200:[0]*1525,201:[0]*350}
        self.controllers[200][5]=65535  # Observed unused-entry sentinel, preserve without normalization.
        self.extra_cell,self.level=False,-12.

    def answer(self,wire):
        fn,args=wire[5],wire[6:-2]
        if fn==19:
            return [p.envelope(19,[58,0,64+self.channel,72,1,16,73,1,16])[1:-1]]
        if fn==1 and args[:2]==[46,0]:return [grid_reply(self.extra_cell)]
        if fn==1 and args[:6]==[16,0,58,0,21,0]:
            text=f'{self.level:.1f} dB\0'
            bits=''.join(f'{b:08b}' for b in text.encode())
            bits=bits.ljust((len(bits)+6)//7*7,'0')
            packed=[int(bits[i:i+7],2) for i in range(0,len(bits),7)]
            return [p.envelope(1,[16,0,58,0,21,0,*([0]*7),len(packed),0,*packed])[1:-1]]
        if fn==31 and shared.decode14(*args) in self.controllers:
            eid=shared.decode14(*args);words=self.controllers[eid]
            result=[p.envelope(116,[*shared.encode14(eid),*shared.encode14(len(words))])[1:-1]]
            for offset in range(0,len(words),64):
                packed=[b for word in words[offset:offset+64] for b in (word&127,word>>7&127,word>>14)]
                result.append(p.envelope(117,[0,0,*packed])[1:-1])
            return result+[p.envelope(118,[])[1:-1]]
        return super().answer(wire)


@pytest.fixture
def device(monkeypatch):
    monkeypatch.setattr('fm9.midi_transport.open_ports',lambda *a,**k:pytest.fail('Native MIDI opened'))
    monkeypatch.setattr('devices.axefx3.amp_writer.time.sleep',lambda _:None)
    ports=BetaPorts();dev=AmpWriter((ports.inp,ports.outp),profile=beta.KEY)
    yield dev,ports
    dev.close()


def test_identity_and_all_four_literal_frames_are_independent():
    assert hashlib.sha256(bytes(IDENTITY)).hexdigest()==beta.IDENTITY_SHA256
    for (control,value),literal in beta.LITERALS.items():
        assert AmpEdit(327,control,value).frame()==list(bytes.fromhex(literal))


@pytest.mark.parametrize('control,value',[('gain',4.6),('mid',5.6)])
def test_closed_profile_verifies_one_word_and_preserves_extra_surfaces(device,control,value):
    dev,ports=device;edit=AmpEdit(327,control,value);before=dev._observe(edit)
    review=dev.review_amp(edit);assert not ports.writes
    result=dev.apply_amp(review,external_audio_muted=True)
    assert result==dict(verified=True,sent=True,stored=False)
    assert ports.writes==[list(bytes.fromhex(beta.LITERALS[control,value]))]
    after=dev._observe(edit);after['amp'][edit.pid]=before['amp'][edit.pid];after['shown']=before['shown']
    assert after==before and len(before['controllers']['200'])==1525
    assert not dev.capabilities().verifies_writes


@pytest.mark.parametrize('preset,control,value',[(328,'gain',4.6),(327,'gain',4.),
    (327,'gain',5.6),(327,'mid',4.6),(327,'mid',6.)])
def test_uncaptured_edits_refuse_before_inspection_and_at_final_output(device,preset,control,value):
    dev,ports=device;ports.sent.clear();edit=AmpEdit(preset,control,value)
    with pytest.raises(ReadOnly):dev.review_amp(edit)
    assert not ports.sent
    with pytest.raises(ReadOnly):
        with dev.outp._once(edit):pytest.fail('Unsupported final permit was granted')
    assert not ports.writes


@pytest.mark.parametrize('changed',['preset','scene','model','channel','grid','level','modifier','controller'])
def test_changed_or_incomplete_fixture_never_sends(device,changed):
    dev,ports=device;edit=AmpEdit(327,'gain',4.6);review=dev.review_amp(edit)
    if changed=='preset':ports.preset=328
    if changed=='scene':ports.scene=1
    if changed=='model':ports.amp[0]=14
    if changed=='channel':ports.channel=1
    if changed=='grid':ports.extra_cell=True
    if changed=='level':ports.level=-6
    if changed=='modifier':ports.mods[3][8]=94
    if changed=='controller':ports.controllers[201][0]=1
    with pytest.raises(ReadOnly):dev.apply_amp(review,external_audio_muted=True)
    assert not ports.writes


@pytest.mark.parametrize('fault',['ignore','raise','other_channel','modifier','identity'])
def test_uncertain_native_outcome_latches_without_retry(device,fault):
    dev,ports=device;review=dev.review_amp(AmpEdit(327,'mid',5.6));ports.behavior=fault
    with pytest.raises(AmpReadbackError):dev.apply_amp(review,external_audio_muted=True)
    assert len(ports.writes)==1 and dev._uncertain


def test_ordinary_and_old_profile_do_not_gain_beta5_permission():
    ports=BetaPorts();dev=AmpWriter((ports.inp,ports.outp))
    try:
        with pytest.raises(ReadOnly):dev.review_amp(AmpEdit(327,'gain',4.6))
        for frame in (beta.grid_query(),p.envelope(31,list(shared.encode14(200)))):
            with pytest.raises(ReadOnly):dev.outp.send(mido.Message('sysex',data=frame[1:-1]))
        assert not ports.writes
    finally:dev.close()


@pytest.mark.parametrize('profile,chassis',[('unknown','mk2'),(beta.KEY,'mk1'),(beta.KEY,'turbo')])
def test_unknown_profile_or_other_chassis_refuses_before_open(monkeypatch,profile,chassis):
    monkeypatch.setattr('fm9.midi_transport.open_ports',lambda *a,**k:pytest.fail('Native MIDI opened'))
    with pytest.raises(ReadOnly):AmpWriter(profile=profile,chassis=chassis)


def test_native_unmeasured_platform_does_not_open_midi(monkeypatch):
    monkeypatch.setattr(beta,'native_supported',lambda:False)
    monkeypatch.setattr('fm9.midi_transport.open_ports',lambda *a,**k:pytest.fail('Native MIDI opened'))
    with pytest.raises(ReadOnly):AmpWriter(profile=beta.KEY)


def test_additional_surface_drift_after_set_is_uncertain(device,monkeypatch):
    dev,ports=device;review=dev.review_amp(AmpEdit(327,'gain',4.6))
    original=ports.send
    def changing(message):
        original(message)
        if message.bytes()[5:8]==[1,9,0]:ports.controllers[200][22]+=1
    ports.outp.send=changing
    with pytest.raises(AmpReadbackError):dev.apply_amp(review,external_audio_muted=True)
    assert dev._uncertain and len(ports.writes)==1


def test_registered_http_uses_the_same_bounded_profile(device,monkeypatch):
    dev,ports=device
    monkeypatch.setenv('TONECOMMAND_AXEFX3_REVIEWED_AMP','1')
    monkeypatch.setattr(server,'_context',server.DeviceContext('axefx3',ReadOnlyRegistry(),dev,'Fractal Axe-Fx III'))
    monkeypatch.setattr(server,'_gig_mode',{'on':False});monkeypatch.setattr(server,'_plan_revisions',{})
    client=TestClient(server.app);server._afx3_edit_workflow.discard()
    state=client.get('/api/axefx3/edit/state').json()
    assert state['available'] and state['calibration_only'] and state['allowed_values']['DISTORT_DRIVE']==[4.6,5.]
    body=dict(actions=[dict(kind='set_param',block='amp',param='DISTORT_DRIVE',value=4.6)],expected_preset=327,expected_scene=1)
    proposal=client.post('/api/axefx3/edit/prepare',json=body)
    assert proposal.status_code==200,proposal.text
    view=proposal.json()
    view=client.post('/api/axefx3/edit/review',json=payload(view)).json()
    view=client.post('/api/axefx3/edit/confirm',json=payload(view,True)).json()
    assert not ports.writes
    result=client.post('/api/axefx3/edit/send',json=payload(view,True))
    assert result.status_code==200,result.text
    assert result.json()['verified'] and len(ports.writes)==1
    client.close();server._afx3_edit_workflow.discard()
