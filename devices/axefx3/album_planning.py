"""Bounded FW33 album pairs, four measured voices and eight real scenes."""
import json
import re
from typing import Annotated, Literal
from pydantic import Field, StrictBool
from . import planning, serial_build, route_guard, executor

MODELS = {14: 'Brit 800 2204 High', 267: 'USA JP IIC+ Yellow'}
CABS = {'Greenback': (1, 515, '4x12 Brit70s GB57A'),
        'Recto': (1, 799, '4x12 Recto57A')}
KNOBS = ('gain','bass','mid','treble','master','depth','presence','level')
USER_CAB_NOTICE = ('Usercabselectie op dit FW33-profiel is nog niet onafhankelijk geverifieerd. '
    'Importeren leest alleen namen; het bewijst geen toegestane selectorwrite. '
    'Kies voor deze acht-scene AMP/CAB-build de gemeten Factory2-cabs '
    '(Greenback slot516 of Recto slot800), of wacht op de User-bankmeting. '
    'TC vervangt je gevraagde User-cab niet stilzwijgend door een Factory-cab. Niets verzonden.')
Positive = Annotated[float, Field(gt=0, le=10, allow_inf_nan=False, strict=True)]


def user_cab_requested(prompt):
    # Conservative explicit intent check, not a model/IR matching heuristic.
    return bool(re.search(r'\buser[\s_-]*cabs?\b|\buser\s*[12]\b|\bu[12]\.\d{1,4}\b',
                          prompt, re.I))


class Amp(planning.Amp):
    gain: Positive
    bass: Positive
    mid: Positive
    treble: Positive
    master: Positive
    depth: Positive
    presence: Positive
    level: Annotated[float, Field(ge=-60, le=-12, allow_inf_nan=False, strict=True)]


class Role(planning.Shape):
    name: planning.Text
    delay: StrictBool
    chorus: StrictBool


class Album(planning.Shape):
    amp_model: Literal['Brit 800 2204 High', 'USA JP IIC+ Yellow']
    cab: Literal['Greenback', 'Recto']
    amp: Amp
    lead: Role
    solo: Role


class Delay(planning.Delay):
    feedback: Annotated[float, Field(gt=0, le=60, allow_inf_nan=False, strict=True)]
    mix: Annotated[float, Field(gt=0, le=50, allow_inf_nan=False, strict=True)]


class Chorus(planning.Chorus):
    depth: Annotated[float, Field(gt=0, le=100, allow_inf_nan=False, strict=True)]
    mix: Annotated[float, Field(gt=0, le=100, allow_inf_nan=False, strict=True)]


class Design(planning.Shape):
    name: planning.Text
    summary: Annotated[str, Field(min_length=1, max_length=2500)]
    albums: Annotated[list[Album], Field(min_length=4, max_length=4)]
    delay: Delay
    chorus: Chorus


SYSTEM = '''Design eight Axe-Fx III scenes in four album lead/solo pairs.
Choose one amp voice and one Legacy IR1 per album from the measured reference.
Each pair shares one Amp/Cab channel A-D; no E-H channels exist. Preserve the
requested album order and short names, distinguishing lead/main and solo.
Use real gain and focused EQ; reduce LEVEL, not gain, for conservative volume.
Solos differ through delay/chorus bypass, not invented extra amp channels or
output boosts. Delay and Chorus each share exactly one fully voiced A channel.
Their active fields are global defaults only; the lead/solo flags decide the
actual scene states. Output A stays -18dB, Amp levels <=-12dB. Nonzero amp
knobs only; exact-zero knobs were not measured. No wah/controller, drive,
reverb, NAM, IR installation or arbitrary grid layout. Reserve blocks stay
bypassed on the fixed captured14-block route. Only IR1 is in mix; IR2-4 stay
muted and unchanged. IR1 is not a stereo left/right panning choice.
Models and factory IRs are approximations, not proof of the original rig or
exact album match. No listening or measured loudness claim. Review, mute
acknowledgement, SEND and Store are separate and never authorized by the AI.
Return only the supplied schema. Explain limitations briefly in user language.
'''


def reference(reg):
    return json.dumps(dict(firmware=reg.firmware, scenes=8, amp_channels='ABCD',
        models=list(MODELS.values()),
        cabs={k:dict(bank=b,slot=o+1,name=n) for k,(b,o,n) in CABS.items()},
        controls={f:reg.definitions[f] for f in ('DISTORT','OUTPUT','DELAY','CHORUS')},
        route=route_guard.labels(serial_build.ROUTE,reg), output_db=-18,
        shared_effect_channels='A only', reserve_effects_bypassed=True))


def actions_for(reg, design, existing):
    actions = []
    def emit(kind,eid=None,**kw):
        if eid is None: actions.append(dict(kind=kind,**kw)); return
        family,instance=reg.family_of_effect_id(eid)
        actions.append(dict(kind=kind,block=family,instance=instance,**kw))
    def param(eid,name,value): emit('set_param',eid,param=name,value=value)
    def bypass(eid,value=True): emit('set_bypass',eid,bypassed=value)
    param(42,'OUTPUT_LEVEL',-18)
    if not existing:
        for eid in serial_build.ROUTE[1:-1]: emit('add_block',eid)
    for eid in sorted(serial_build.RESERVE): bypass(eid)
    for eid in (58,70,78): bypass(eid)
    for c,album in enumerate(design.albums):
        emit('set_channel',58,value=c)
        param(58,'DISTORT_LEVEL',-18)
        emit('set_type',58,type_name=album.amp_model)
        param(58,'DISTORT_LEVEL',album.amp.level)
        for key in KNOBS[:-1]:
            param(58,'DISTORT_'+('DRIVE' if key=='gain' else key.upper()),getattr(album.amp,key))
        emit('set_channel',62,value=c)
        bank,ordinal,_=CABS[album.cab]
        emit('set_cab',62,bank=bank,value=ordinal,cab_side='left')
    for eid in (58,62,70,78,42): emit('set_channel',eid,value=0)
    for eid,family,values in (
        (70,'DELAY',dict(TIME=design.delay.time_ms,FEED=design.delay.feedback,MIX=design.delay.mix,LEVEL=0)),
        (78,'CHORUS',dict(RATE=design.chorus.rate_hz,DEPTH=design.chorus.depth,MIX=design.chorus.mix,LEVEL=0))):
        for name,value in values.items(): param(eid,family+'_'+name,value)
    bypass(62,False)
    for c,album in enumerate(design.albums):
        for offset,role in enumerate((album.lead,album.solo),1):
            number=c*2+offset
            emit('set_scene',value=number)
            # Bypass belongs to the NEW scene. Staging it before switching
            # would overwrite the previous scene's final musical state.
            # External mute and already quiet A-D levels protect the switch.
            for eid in (58,70,78): bypass(eid)
            for eid in (58,62): emit('set_channel',eid,value=c)
            for eid in (70,78,42): emit('set_channel',eid,value=0)
            for eid in sorted(serial_build.RESERVE): bypass(eid)
            bypass(58,False); bypass(62,False)
            bypass(70,not role.delay); bypass(78,not role.chorus)
            emit('rename_scene',value=number,type_name=role.name)
    emit('rename_preset',type_name=design.name)
    # Explicit final survey: select only, do NOT rewrite mappings while checking.
    for number in range(1,9): emit('set_scene',value=number)
    return actions


def compile_design(reg,raw,current_route,scene_count):
    design=Design.model_validate(raw)
    if not serial_build.supported(reg) or scene_count!=8:
        raise ValueError('Measured album AMP/CAB mode requires exact FW33/MK2 and eight scenes')
    if current_route and tuple(current_route)!=serial_build.ROUTE:
        raise ValueError('Album build cannot replace or splice another route')
    actions=actions_for(reg,design,bool(current_route))
    for a in actions: executor.resolve(reg,a)
    names=[role.name for album in design.albums for role in (album.lead,album.solo)]
    return dict(mode='album',name=executor.preset_name(design.name),summary=design.summary,
        design=design.model_dump(),scenes=names,actions=actions,
        required_route=route_guard.labels(serial_build.ROUTE,reg),controller=None,
        cab_choices=[dict(channel='ABCD'[c],bank=CABS[a.cab][0],slot=CABS[a.cab][1]+1,
            name=CABS[a.cab][2],side='IR1 only') for c,a in enumerate(design.albums)],
        channel_mapping=[dict(scene=i+1,amp='ABCD'[i//2],cab='ABCD'[i//2],
            delay='A',chorus='A',output='A') for i in range(8)],
        warnings=['Vier albumvoicings delen A-D per lead/solopaar; delay en chorus delen A.',
            'Gemeten vaste14-blokkenketen. Reserve-effecten blijven bypassed; geen nieuwe controllers.',
            'Alleen IR1 in de mix; IR2-4 blijven gemute. Geen stereopanning of IR-installatie.',
            'Output -18dB; voorlopige scenevolumes. Externe mute is verplicht, geen limiter.',
            'Interpretatie, geen exacte albumreproductie. SEND slaat niets permanent op.'])
