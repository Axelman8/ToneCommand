import copy
import threading
from contextlib import nullcontext
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

import server
from devices.axefx3 import planning, tone_review, executor
from devices.axefx3.registry import Registry
from fm9.device import SetResult
from fm9.protocol import GridCell, BlockStatus

REAL_PLAN = server.planner.plan


@pytest.fixture
def design():
    return dict(name='AI-Test',summary='Four distinct scenes',amp_model='Brit 800 2204 High',
        cab_left=dict(bank=2,slot=28),cab_right=None,
        scenes=[dict(name=name,amp=dict(gain=gain,bass=4,mid=6,treble=5,master=5,
            depth=2,presence=4,level=-15),wah=i in (0,3),
            delay=dict(active=i in (0,3),time_ms=280+i*30,feedback=20,mix=15),
            reverb=dict(active=True,time_s=1.2,mix=8))
            for i,(name,gain) in enumerate(zip(['Intro','Verse','Heavy','Lead'],[2,4,5.5,6.2]))])


@pytest.fixture
def dev():
    d=Mock()
    d.reg=Registry('32.06');d.reg.import_cab_names('U1.0028 Test Greenback','user')
    d._lock=threading.RLock()
    d.current_preset.return_value=(324,'Empty');d.current_scene.return_value=1
    d.firmware_label.return_value='32.06'
    d.read_grid.return_value=[];d.status_dump.return_value=[]
    d.read_modifier.side_effect=lambda slot:[0]*25
    d.scene_name.side_effect=lambda n:(n,f'Scene {n}')
    d.bulk_read.side_effect=lambda eid:[1]*100
    d.edit_session.side_effect=lambda **kw:nullcontext()
    d.build_route.side_effect=lambda route,actions: build_route(d,route)
    d.set_param_display.return_value=SetResult(True,'verified',5,6)
    d.set_model.return_value=SetResult(True,'verified','old','new')
    d.set_cab.return_value=SetResult(True,'verified',None,28)
    d.bind_pedal_control.return_value=SetResult(True,'verified',None,12)
    d.set_scene.side_effect=lambda value:value
    d.set_channel.side_effect=lambda eid,value:value
    d.set_bypass.side_effect=lambda eid,value:value
    d.rename_preset.side_effect=lambda name:(324,name)
    d.rename_scene.side_effect=lambda number,name:(number,name)
    return d


def build_route(dev,route):
    ids=executor.route_guard.route_ids(route,dev.reg)
    dev.read_grid.return_value=[GridCell(2,i,e,False,8 if i else 0) for i,e in enumerate(ids)]
    dev.status_dump.return_value=[BlockStatus(e,False,0,4) for e in ids]
    return SetResult(True,'built',None,ids)


def test_compilation_names_channels_final_levels_cab_mixer_and_user_controller(dev,design):
    plan=planning.compile_design(dev.reg,design,[],4,'External 2')
    assert plan['name']=='AI-Test'
    assert plan['cab_choices']==[dict(side='IR1',name='Test Greenback',
        position='USER 1 slot 28',wire_bank=2,wire_ordinal=27)]
    actions=plan['actions']
    assert [a['value'] for a in actions if a['kind']=='set_channel' and a['block']=='DISTORT']==[0,1,2,3]
    assert [a['value'] for a in actions if a.get('param')=='DISTORT_DRIVE']==[2,4,5.5,6.2]
    assert all(a['value']==0 for a in actions if a.get('param') in ('WAH_LEVEL','DELAY_LEVEL','REVERB_LEVEL'))
    assert [a['value'] for a in actions if a.get('param','').startswith('CABINET_MUTE')]==[0,1,1,1]
    assert actions[-1]==dict(kind='bind_controller',block='WAH',instance=1,source='External 2',auto_engage='Fast Pos')
    assert not any(a['kind'] in ('store','select_preset') for a in actions)
    executor.prepare(dev,actions,plan['required_route'],324)


@pytest.mark.parametrize('bad',['cab','model','level','feedback','scenes','extra','nan','bool','controller'])
def test_invalid_design_refused_without_device_write(dev,design,bad):
    source=None
    if bad=='cab':design['cab_left']['slot']=29
    if bad=='model':design['amp_model']='Imaginary amp'
    if bad=='level':design['scenes'][0]['amp']['level']=1
    if bad=='feedback':design['scenes'][0]['delay']['feedback']=101
    if bad=='scenes':design['scenes'].pop()
    if bad=='extra':design['actions']=[{'kind':'store'}]
    if bad=='nan':design['scenes'][0]['amp']['gain']=float('nan')
    if bad=='bool':design['scenes'][0]['amp']['gain']=True
    if bad=='controller':source='CC6'
    with pytest.raises((ValueError,KeyError)):
        planning.compile_design(dev.reg,design,[],4,source)
    dev._write.assert_not_called()


def test_dual_ir_is_explicit_with_moderate_mix_levels(dev,design):
    dev.reg.import_cab_names('F1.0001 Factory Test','factory')
    design['cab_right']=dict(bank=0,slot=1)
    actions=planning.compile_design(dev.reg,design,[],4)['actions']
    assert [a['cab_side'] for a in actions if a['kind']=='set_cab']==['left','right']
    assert [a['value'] for a in actions if a.get('param','').startswith('CABINET_MUTE')]==[0,0,1,1]
    assert all(a['value']==-6 for a in actions if a.get('param','').startswith('CABINET_LEVEL'))


@pytest.mark.parametrize('mode', ['Off', 'Fast Pos', None])
def test_user_controls_auto_engage_not_ai(dev,design,mode):
    plan=planning.compile_design(dev.reg,design,[],4,'External 1',mode)
    assert plan['actions'][-1]['auto_engage']==mode
    assert plan['controller']==dict(source='External 1',auto_engage=mode)
    if mode=='Fast Pos':
        assert any('scene met Wah uit' in warning for warning in plan['warnings'])
    elif mode is None:
        assert any('niet door dit ontwerp vastgesteld' in warning for warning in plan['warnings'])
    else:
        assert not plan['warnings']
    assert [a['bypassed'] for a in plan['actions'] if a['kind']=='set_bypass'
            and a['block']=='WAH']==[True,False,True,True,False]
    executor.prepare(dev,plan['actions'],plan['required_route'],324)
    dev._write.assert_not_called()


def test_no_source_preserves_binding_and_warns_instead_of_inventing_one(dev,design):
    plan=planning.compile_design(dev.reg,design,[],4,None,'Off')
    assert not any(a['kind']=='bind_controller' for a in plan['actions'])
    assert plan['controller']==dict(source=None,auto_engage=None)
    assert any('geen nieuwe Wah-controller' in warning for warning in plan['warnings'])


def test_unknown_auto_engage_refused(dev,design):
    with pytest.raises(ValueError,match='Auto Engage'):
        planning.compile_design(dev.reg,design,[],4,'External 1','Slow Pos')
    dev._write.assert_not_called()


def test_existing_route_does_not_add_or_remove_blocks(dev,design):
    route=[37,95,58,62,70,66,42]
    plan=planning.compile_design(dev.reg,design,route,4,'External 1')
    assert not any(a['kind']=='add_block' for a in plan['actions'])
    assert plan['actions'][-1]['instance']==2
    with pytest.raises(ValueError,match='compatible serial'):
        planning.compile_design(dev.reg,design,[37,58,62,102,42],4)


def test_dry_empty_build_reserves_voiced_bypassed_delay_for_later_adjustments(dev,design):
    design['scenes']=design['scenes'][:1]
    design['scenes'][0]['wah']=False
    design['scenes'][0]['delay']['active']=False
    plan=planning.compile_design(dev.reg,design,[],1)
    assert plan['required_route']==['Input 1','Amp 1','Cab 1','Delay 1','Reverb 1','Output 1']
    delay=[a for a in plan['actions'] if a.get('block')=='DELAY']
    assert delay[0]==dict(kind='add_block',block='DELAY',instance=1)
    assert [a['bypassed'] for a in delay if a['kind']=='set_bypass']==[True,True]
    assert [a['value'] for a in delay if a.get('param')=='DELAY_LEVEL']==[0]
    assert {a['param'] for a in delay if a['kind']=='set_param'}=={
        'DELAY_TIME','DELAY_FEED','DELAY_MIX','DELAY_LEVEL'}
    result=executor.execute(dev,plan['actions'],plan['required_route'],
        expected_preset=324,external_audio_muted=True)
    assert result['ok'] and not result['stored']
    dev.store_preset.assert_not_called()
    # A later request can activate the existing reserve, without another ADD.
    design['scenes'][0]['delay']['active']=True
    later=planning.compile_design(dev.reg,design,[37,58,62,70,66,42],1)
    assert not any(a['kind']=='add_block' for a in later['actions'])
    assert [a['bypassed'] for a in later['actions'] if a['kind']=='set_bypass'
            and a['block']=='DELAY']==[True,False]
    executor.prepare(dev,later['actions'],later['required_route'],324)


def test_reserving_delay_does_not_rebuild_existing_dry_routes(dev,design):
    design['scenes']=design['scenes'][:1]
    design['scenes'][0]['delay']['active']=False
    plan=planning.compile_design(dev.reg,design,[37,94,58,62,66,42],1,'External 1')
    assert not any(a.get('block')=='DELAY' or a['kind']=='add_block' for a in plan['actions'])
    design['scenes'][0]['delay']['active']=True
    with pytest.raises(ValueError,match='Automatic insertion is not verified'):
        planning.compile_design(dev.reg,design,[37,94,58,62,66,42],1,'External 1')
    dev._write.assert_not_called()


def test_active_ambience_delay_before_cab_is_refused_without_moving_blocks(dev,design):
    for route in ([37,94,70,58,62,66,42], [37,94,58,70,62,66,42]):
        with pytest.raises(ValueError,match='ambience delay must follow Cab'):
            planning.compile_design(dev.reg,design,route,4,'External 1')
    for scene in design['scenes']:
        scene['delay']['active']=False
    plan=planning.compile_design(dev.reg,design,[37,94,70,58,62,66,42],4,'External 1')
    assert plan['required_route']==['Input 1','Wah 1','Delay 1','Amp 1','Cab 1','Reverb 1','Output 1']
    assert not any(a['kind']=='add_block' for a in plan['actions'])
    assert all(a['bypassed'] for a in plan['actions'] if a['kind']=='set_bypass' and a['block']=='DELAY')
    dev._write.assert_not_called()


@pytest.fixture
def api(dev,design,monkeypatch):
    monkeypatch.setattr(server,'_context',server.DeviceContext('axefx3',dev.reg,dev,'Axe-Fx III'))
    monkeypatch.setattr(server,'_gig_mode',{'on':False})
    monkeypatch.setattr(server,'_plan_revisions',{})
    monkeypatch.setattr(server,'_audition',{'open':False})
    monkeypatch.setattr(server,'_settings_lock',threading.Lock())
    monkeypatch.setattr(server.ai_settings,'apply_to_env',lambda:None)
    monkeypatch.setenv('PLANNER_BACKEND','cli')
    ask=Mock(side_effect=lambda *args,**kw:dict(**kw['validate'](copy.deepcopy(design)),backend='cli',model='test'))
    monkeypatch.setattr(server.planner,'plan',ask)
    server._afx3_tone_reviews.clear()
    with TestClient(server.app) as client:yield client,ask
    server._afx3_tone_reviews.clear()


BODY=dict(prompt='Four bluesrock scenes',expected_preset=324,scenes=4,wah_source='External 1')


@pytest.mark.parametrize('mode', ['Off', 'Fast Pos', None])
def test_auto_engage_api_choice_survives_review_and_execution(api,dev,mode):
    client,ask=api
    response=client.post('/api/axefx3/plan',json={**BODY,'wah_auto_engage':mode})
    assert response.status_code==200,response.text
    plan=response.json()
    assert plan['controller']['auto_engage']==mode
    assert plan['actions'][-1]['auto_engage']==mode
    assert f'Wah Auto Engage: {mode or "preserve"}' in ask.call_args.args[0]
    dev.bind_pedal_control.assert_not_called()
    sent=client.post('/api/axefx3/send',json=dict(token=plan['token'],
        target_confirmed=True,external_audio_muted=True))
    assert sent.json()['ok']
    assert dev.bind_pedal_control.call_args.args==(94,12,mode)
    dev.store_preset.assert_not_called()


def test_invalid_auto_engage_api_choice_never_calls_ai(api,dev):
    client,ask=api
    assert client.post('/api/axefx3/plan',json={**BODY,'wah_auto_engage':'invented'}).status_code==422
    ask.assert_not_called();dev.edit_session.assert_not_called()


def test_whole_text_review_send_route_uses_afx3_and_no_fm9_executor(api,dev,monkeypatch):
    client,ask=api
    generic=Mock(side_effect=AssertionError('FM9 executor reached'))
    monkeypatch.setattr(server,'run_action',generic)
    response=client.post('/api/axefx3/plan',json=BODY)
    assert response.status_code==200,response.text
    proposal=response.json();assert proposal['target']['preset']==324
    dev.edit_session.assert_not_called();dev.build_route.assert_not_called()
    send=dict(token=proposal['token'],target_confirmed=True,external_audio_muted=True)
    result=client.post('/api/axefx3/send',json=send)
    assert result.status_code==200,result.text
    assert result.json()['ok'] and not result.json()['stored']
    assert dev.bind_pedal_control.call_args.args==(94,12,'Fast Pos')
    assert client.post('/api/axefx3/send',json=send).status_code==409
    generic.assert_not_called();dev.store_preset.assert_not_called()
    assert ask.call_args.kwargs['system']==planning.SYSTEM


@pytest.mark.parametrize('change',['preset','scene','bulk','catalogue','connection'])
def test_stale_tone_review_is_refused_before_build(api,dev,change,monkeypatch):
    client,_=api
    if change=='bulk':build_route(dev,['Input 1','Wah 1','Amp 1','Cab 1','Delay 1','Reverb 1','Output 1'])
    response=client.post('/api/axefx3/plan',json=BODY)
    assert response.status_code==200,response.text
    if change=='preset':dev.current_preset.return_value=(325,'Other')
    if change=='scene':dev.current_scene.return_value=2
    if change=='bulk':dev.bulk_read.side_effect=lambda eid:[2]*100
    if change=='catalogue':dev.reg.import_cab_names('U1.0028 Changed','user')
    if change=='connection':monkeypatch.setattr(server,'_context',server._default_context)
    result=client.post('/api/axefx3/send',json=dict(token=response.json()['token'],target_confirmed=True,external_audio_muted=True))
    assert result.status_code==409
    dev.edit_session.assert_not_called()


def test_changed_state_during_ai_invalidates_plan(api,dev):
    client,ask=api
    original=ask.side_effect
    def changed(*args,**kw):
        result=original(*args,**kw);dev.current_scene.return_value=2;return result
    ask.side_effect=changed
    assert client.post('/api/axefx3/plan',json=BODY).status_code==409
    assert server._afx3_tone_reviews.pending is None
    dev.edit_session.assert_not_called()


def test_cross_origin_and_missing_consent_refused(api,dev):
    client,ask=api
    assert client.post('/api/axefx3/plan',json=BODY,headers={'Origin':'https://elsewhere.invalid'}).status_code==403
    ask.assert_not_called()
    response=client.post('/api/axefx3/plan',json=BODY)
    send=dict(token=response.json()['token'],target_confirmed=True,external_audio_muted=False)
    assert client.post('/api/axefx3/send',json=send).status_code==409
    dev.edit_session.assert_not_called()


def test_unsupported_audio_and_missing_cabs_never_call_ai(api,dev):
    client,ask=api
    assert client.post('/api/axefx3/plan',json={**BODY,'prompt':'https://example.com/song'}).status_code==409
    dev.reg.cab_catalog.names={}
    assert client.post('/api/axefx3/plan',json=BODY).status_code==409
    ask.assert_not_called()


def test_first_verification_failure_skips_remaining_plan(api,dev):
    client,_=api
    proposal=client.post('/api/axefx3/plan',json=BODY).json()
    dev.set_param_display.return_value=SetResult(False,'Mismatch',0,None)
    result=client.post('/api/axefx3/send',json=dict(token=proposal['token'],target_confirmed=True,external_audio_muted=True)).json()
    assert not result['ok'] and result['skipped']>0
    dev.bind_pedal_control.assert_not_called()


def test_auto_backend_refused_instead_of_falling_back(api,monkeypatch):
    client,ask=api
    monkeypatch.delenv('PLANNER_BACKEND')
    monkeypatch.setattr(server.planner,'_env',lambda name,*args:'')
    result=client.post('/api/axefx3/plan',json=BODY)
    assert result.status_code==409 and 'explicit AI' in result.text
    ask.assert_not_called()


def test_expiry_and_regeneration_invalidate_old_tokens(api,dev,monkeypatch):
    client,_=api
    first=client.post('/api/axefx3/plan',json=BODY).json()
    second=client.post('/api/axefx3/plan',json=BODY).json()
    body=dict(token=first['token'],target_confirmed=True,external_audio_muted=True)
    assert client.post('/api/axefx3/send',json=body).status_code==409
    reviews=server._afx3_tone_reviews
    # send clears pending before checking its deadline; capture that deadline.
    expired=reviews.pending['expires']+1
    monkeypatch.setattr(reviews,'clock',lambda:expired)
    assert client.post('/api/axefx3/send',json={**body,'token':second['token']}).status_code==409
    dev.edit_session.assert_not_called()


def test_gig_lock_and_overlapping_ai_never_send(api,dev,monkeypatch):
    client,ask=api
    monkeypatch.setitem(server._gig_mode,'on',True)
    assert client.post('/api/axefx3/plan',json=BODY).status_code==423
    ask.assert_not_called()
    monkeypatch.setitem(server._gig_mode,'on',False)
    original=ask.side_effect
    def nested(*args,**kw):
        assert client.post('/api/axefx3/plan',json=BODY).status_code==409
        return original(*args,**kw)
    ask.side_effect=nested
    assert client.post('/api/axefx3/plan',json=BODY).status_code==200
    assert ask.call_count==1
    dev.edit_session.assert_not_called()


def test_native_binding_failure_stops_without_store(api,dev):
    client,_=api
    proposal=client.post('/api/axefx3/plan',json=BODY).json()
    dev.bind_pedal_control.return_value=SetResult(False,'Allocation not verified',None,None)
    result=client.post('/api/axefx3/send',json=dict(token=proposal['token'],target_confirmed=True,external_audio_muted=True)).json()
    assert not result['ok'] and 'Allocation' in result['results'][-1]['detail']
    dev.store_preset.assert_not_called()


def test_actual_planner_entrypoint_compiles_selected_backend_design(api,dev,design,monkeypatch):
    client,_=api
    runner=Mock(return_value=(design,'selected-model'))
    monkeypatch.setattr(server.planner,'plan',REAL_PLAN)
    monkeypatch.setattr(server.planner,'_RUNNERS',{'cli':runner})
    response=client.post('/api/axefx3/plan',json=BODY)
    assert response.status_code==200,response.text
    result=response.json()
    assert result['backend']=='cli' and result['model']=='selected-model'
    assert len(result['actions'])>100 and result['plan_quality']=='actions'
    assert runner.call_args.args[3]==planning.SYSTEM
    assert result['actions'][-1]['kind']=='bind_controller'
    dev.edit_session.assert_not_called()


def test_full_modifier_capacity_checked_before_any_route_write(dev,design,monkeypatch):
    from devices.axefx3 import pedal_control
    plan=planning.compile_design(dev.reg,design,[],4,'External 1')
    monkeypatch.setattr(pedal_control,'entries',lambda device:[
        dict(effect_id=58,param_id=n+1,source=12) for n in range(32)])
    with pytest.raises(ValueError,match='Insufficient'):
        executor.execute(dev,plan['actions'],plan['required_route'],
                         expected_preset=324,external_audio_muted=True)
    dev.edit_session.assert_not_called();dev.build_route.assert_not_called()


def test_empty_preset_system_records_are_not_bulk_parameter_blocks(api,dev):
    client,_=api
    dev.status_dump.return_value=[BlockStatus(200,False,0,1),BlockStatus(201,False,0,1)]
    dev.bulk_read.side_effect=AssertionError('System records must not get a bulk query')
    assert client.get('/api/axefx3/state').status_code==200
    result=client.post('/api/axefx3/plan',json=BODY)
    assert result.status_code==200,result.text
    dev.bulk_read.assert_not_called();dev.edit_session.assert_not_called()
