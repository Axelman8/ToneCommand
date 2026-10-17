"""Bounded FW33 album pairs, four measured voices and eight real scenes."""
import json
import math
import re
from typing import Annotated, Literal
from pydantic import Field, StrictBool, StrictInt, model_validator
from . import planning, serial_build, route_guard, executor, scene_intent, amp_inventory, fw33_profile
from . import cab_inventory,effect_voicing

MODELS = amp_inventory.roster(fw33_profile.KEY)
AmpName = Literal[tuple(MODELS.values())]
CABS = {'Greenback': (1, 515, '4x12 Brit70s GB57A'),
        'Recto': (1, 799, '4x12 Recto57A')}
KNOBS = ('gain','bass','mid','treble','master','depth','presence','level')
USER_CAB_NOTICE = ('Usercabselectie gebruikt de geimporteerde namenlijst: User1/2 elk 1024 slots op MK2. '
    'Importeer eerst je actuele Usercabnamen; lege slots worden niet voorgesteld. '
    'FullRes is apart, alleen IR3/4. MK1 met NAM-firmware heeft geen User2-cabbank. '
    'Een naamimport installeert niets en bewijst geen hoorbare klankmatch.')
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
    drive: StrictBool=False
    compressor: StrictBool=False
    geq: StrictBool=False


class Drive(planning.Shape):
    model: Literal['T808 Mod']='T808 Mod'
    gain: Annotated[float,Field(ge=0,le=10,allow_inf_nan=False,strict=True)]
    tone: Annotated[float,Field(ge=0,le=10,allow_inf_nan=False,strict=True)]
    level: Annotated[float,Field(ge=0,le=2.5,allow_inf_nan=False,strict=True)]
    mix: Annotated[float,Field(ge=0,le=100,allow_inf_nan=False,strict=True)]


def has_drive(design):return any(a.drive is not None for a in design.albums)


def drive_voice(album):
    return album.drive or Drive(gain=0.,tone=5.,level=0.,mix=100.)


class CabIR(planning.Shape):
    bank: Literal[0,1,2,3,6]
    slot: Annotated[StrictInt,Field(ge=1,le=1024)]
    mode: Literal['normal','mute','solo']
    level_db: Annotated[float,Field(ge=-40,le=0,allow_inf_nan=False,strict=True)]
    pan: Annotated[float,Field(ge=-100,le=100,allow_inf_nan=False,strict=True)]


class CabVoice(planning.Shape):
    irs: Annotated[list[CabIR],Field(min_length=4,max_length=4)]

    @model_validator(mode='after')
    def safe_mix(self):
        sounding=[s for s in self.irs if s.mode!='mute']
        if not sounding or math.fsum(10**(s.level_db/20) for s in sounding)>1.00001:
            raise ValueError('Cab mix needs an active IR and conservative combined linear gain <=1')
        for i,s in enumerate(self.irs,1):
            if s.bank==6 and (i<3 or s.slot>64):
                raise ValueError('FullRes is restricted to IR3/4 and 64 positions')
        return self


def cab_voice(cab):
    if isinstance(cab,CabVoice):return cab
    bank,ordinal,_=CABS[cab]
    return CabVoice(irs=[CabIR(bank=bank if i==0 else 0,slot=ordinal+1 if i==0 else 1,
        mode='normal' if i==0 else 'mute',level_db=0.,pan=0.) for i in range(4)])


def expanded_cabs(design):
    return any(isinstance(a.cab,CabVoice) for a in design.albums)


class Album(planning.Shape):
    amp_model: AmpName
    cab: Literal['Greenback', 'Recto'] | CabVoice
    amp: Amp
    lead: Role
    solo: Role
    drive: Drive | None=None
    compressor: effect_voicing.Compressor | None=None
    geq: effect_voicing.GraphicEQ | None=None


class Delay(planning.Delay):
    feedback: Annotated[float, Field(gt=0, le=60, allow_inf_nan=False, strict=True)]
    mix: Annotated[float, Field(gt=0, le=50, allow_inf_nan=False, strict=True)]


class Chorus(planning.Chorus):
    depth: Annotated[float, Field(gt=0, le=100, allow_inf_nan=False, strict=True)]
    mix: Annotated[float, Field(gt=0, le=100, allow_inf_nan=False, strict=True)]


class SceneLayout(Role):
    amp_channel: Annotated[StrictInt, Field(ge=0, le=3)]
    cab_channel: Annotated[StrictInt, Field(ge=0, le=3)]


class Design(planning.Shape, scene_intent.IntentDesign):
    name: planning.Text
    summary: Annotated[str, Field(min_length=1, max_length=2500)]
    albums: Annotated[list[Album], Field(min_length=4, max_length=4)]
    delay: Delay
    chorus: Chorus
    scene_count: Annotated[StrictInt,Field(ge=1,le=8)]=8
    scene_layout: Annotated[list[SceneLayout], Field(min_length=1, max_length=8)] | None = None

    @model_validator(mode='after')
    def exact_scene_layout(self):
        if self.scene_layout is not None and len(self.scene_layout)!=self.scene_count:
            raise ValueError('Explicit scene layout must match the requested scene count')
        if self.scene_count!=8 and self.scene_layout is None:
            raise ValueError('Short designs require an explicit scene layout, not inferred album pairs')
        return self


SYSTEM = '''Design exactly the requested number of Axe-Fx III scenes, one to
eight, not necessarily four album pairs. Set scene_count to the requested count.
The historical schema key albums holds FOUR available Amp/Cab voice slots
A-D, not a rule that four album pairs must share a sound. Return scene_layout
with exactly that many scene names, amp_channel/cab_channel 0..3 and effect flags.
Its assignments override the historical lead/solo fields, which remain schema
compatibility data only. Choose up to four amp configurations and four Legacy
cab mixer configurations from the measured reference. Scene1 uses Amp/Cab A; other
scenes freely reuse A-D only when that stored voice is intentionally shared.
No E-H channels exist. Preserve requested order and roles, including backing.
For four album pairs sharing a base tone is a musical choice, not compulsory.
Use real gain and focused EQ; reduce LEVEL, not gain, for conservative volume.
Any scene may use a different available Amp/Cab voice; do not invent extra
channels or output boosts. Delay and Chorus each share one fully voiced A.
Their active fields are global defaults only; the scene_layout flags decide the
actual scene states. Output A stays -18dB, Amp levels <=-12dB. Nonzero amp
knobs only; exact-zero Amp knobs were not measured. The supplied reference's
drive_executable flag is authoritative: when false, all album drive values
must be null and every scene drive flag false. Disclose a required-but-blocked
Drive rather than silently dropping it. When executable, optional drive on each
voice uses measured T808 Mod only, gain/tone0..10, level KNOB0..2.5 (NOT dB,
not guaranteed unity), mix0..100. Scene drive flags activate that amp voice's
Drive A-D channel; every active scene requires an explicit selected voice. Use
drive only for a musical reason, not as a substitute for high amp gain. Separate
compressor_executable and geq_executable flags govern optional four-channel
voices, also following Amp A-D. If false, omit that voicing and set every related
scene flag false; disclose a required-but-blocked feature. Compressor supports
Modern VCA only, automatic makeup/timing OFF, threshold<=0dB and level<=0dB.
GEQ supports10 Band Variable Q only, all10 gains<=0dB and level<=0dB, not PEQ.
No wah/controller, reverb, NAM, IR installation or arbitrary grid layout.
Other reserve blocks stay bypassed on the fixed captured14-block route.
Choose a cab object with exactly
four IR slots, bank/slot, mode(normal/mute/solo), level_db and pan(-100L..100R).
Factory bank0/1 and imported User1=bank2/User2=bank3 each have1024 slots;
User3 FullRes bank6 has64 slots and is eligible only for IR3/4. Never select
empty or absent User metadata. The sum of linear gains of ALL non-muted IRs
must be <=1, including normal IRs temporarily excluded by a solo. For two
equal IRs use <=-6.1dB each; for four <=-12.1dB each. A single IR may be0dB.
Prefer a focused single IR unless blending or stereo serves the request.
Mute unused slots explicitly. Slot numbers themselves do not imply panning.
The old Greenback/Recto string choices are compatibility aliases for IR1-only.
Models and factory IRs are approximations, not proof of the original rig or
exact album match. No listening or measured loudness claim. Review, mute
acknowledgement, SEND and Store are separate and never authorized by the AI.
Return only the supplied schema. Explain limitations briefly in user language.
'''


def reference(reg):
    return json.dumps(dict(firmware=reg.firmware, scene_counts=sorted(fw33_profile.ALBUM_SCENE_COUNTS), amp_channels='ABCD',
        drive_executable=fw33_profile.DRIVE_RELEASED,
        compressor_executable=effect_voicing.COMPRESSOR_RELEASED,geq_executable=effect_voicing.GEQ_RELEASED,
        drive_notice='When false, omit Drive voicing and keep every scene drive flag false. A requested Drive remains an explicit unsupported requirement, not a silent substitution.',
        models=list(MODELS.values()),
        cabs=[[c['bank'],c['slot'],c['name']] for c in cab_inventory.choices(reg,include_fullres=True)],
        cab_format='Each entry is [wire bank, one-based slot, name]. FullRes bank6 only IR3/4. Names do not prove audible match.',
        controls={f:reg.definitions[f] for f in ('DISTORT','OUTPUT','DELAY','CHORUS','CABINET','FUZZ','COMP','GEQ')},
        route=route_guard.labels(serial_build.ROUTE,reg), output_db=-18,
        shared_effect_channels='Delay/Chorus A; optional T808 Mod Drive A-D follows Amp channel',
        reserve_effects_bypassed='All except explicitly voiced and requested T808 Mod'))


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
        if expanded_cabs(design):
            voice=cab_voice(album.cab)
            # Explicitly mute all IRs before selection, levels and panning.
            # Amp stays bypassed and external mute remains mandatory.
            for i in range(1,5):param(62,f'CABINET_MUTE{i}',1)
            for i,ir in enumerate(voice.irs,1):
                cab_inventory.selection(reg,ir.bank,ir.slot-1,i)
                emit('set_cab',62,bank=ir.bank,value=ir.slot-1,cab_side=f'ir{i}')
                param(62,f'CABINET_LEVEL{i}',ir.level_db)
                param(62,f'CABINET_PAN{i}',ir.pan)
            for i,ir in enumerate(voice.irs,1):
                param(62,f'CABINET_MUTE{i}',{'normal':0,'mute':1,'solo':2}[ir.mode])
        else:
            bank,ordinal,_=CABS[album.cab]
            emit('set_cab',62,bank=bank,value=ordinal,cab_side='left')
        if has_drive(design):
            voice=drive_voice(album)
            param(58,'DISTORT_LEVEL',-18.)
            emit('set_channel',118,value=c)
            emit('set_type',118,type_name=voice.model)
            param(118,'FUZZ_LEVEL',0.)
            for name,value in (('DRIVE',voice.gain),('TONE',voice.tone),('MIX',voice.mix),('LEVEL',voice.level)):
                param(118,'FUZZ_'+name,value)
            param(58,'DISTORT_LEVEL',album.amp.level)
    for eid in (58,62,70,78,42): emit('set_channel',eid,value=0)
    if has_drive(design):emit('set_channel',118,value=0)
    # Additional measured voices are staged separately with Amp bypassed.
    # Re-select Amp A and quiet it BEFORE any auxiliary model operation.
    for key,family in (('compressor','COMP'),('geq','GEQ')):
        if not any(getattr(a,key) is not None for a in design.albums):continue
        eid=effect_voicing.MODELS[family][0]
        emit('set_channel',58,value=0);param(58,'DISTORT_LEVEL',-18.)
        for c,album in enumerate(design.albums):
            voice=getattr(album,key) or effect_voicing.default(family)
            emit('set_channel',eid,value=c);emit('set_type',eid,type_name=voice.model)
            for name,value in effect_voicing.parameters(family,voice):param(eid,name,value)
        emit('set_channel',eid,value=0)
        param(58,'DISTORT_LEVEL',design.albums[0].amp.level)
    for eid,family,values in (
        (70,'DELAY',dict(TIME=design.delay.time_ms,FEED=design.delay.feedback,MIX=design.delay.mix,LEVEL=0)),
        (78,'CHORUS',dict(RATE=design.chorus.rate_hz,DEPTH=design.chorus.depth,MIX=design.chorus.mix,LEVEL=0))):
        for name,value in values.items(): param(eid,family+'_'+name,value)
    bypass(62,False)
    for number,item in enumerate(layout(design.model_dump()),1):
        emit('set_scene',value=number)
        # Bypass belongs to the NEW scene. Staging it before switching
        # would overwrite the previous scene's final musical state.
        # External mute and already quiet A-D levels protect the switch.
        for eid in (58,70,78): bypass(eid)
        emit('set_channel',58,value=item['amp_channel'])
        emit('set_channel',62,value=item['cab_channel'])
        for eid in (70,78,42): emit('set_channel',eid,value=0)
        for eid in sorted(serial_build.RESERVE): bypass(eid)
        if has_drive(design):
            emit('set_channel',118,value=item['amp_channel'])
            bypass(118,not item.get('drive',False))
        for key,family in (('compressor','COMP'),('geq','GEQ')):
            if any(getattr(a,key) is not None for a in design.albums):
                eid=effect_voicing.MODELS[family][0]
                emit('set_channel',eid,value=item['amp_channel']);bypass(eid,not item.get(key,False))
        bypass(58,False); bypass(62,False)
        bypass(70,not item['delay']); bypass(78,not item['chorus'])
        emit('rename_scene',value=number,type_name=item['name'])
    emit('rename_preset',type_name=design.name)
    # Explicit final survey: select only, do NOT rewrite mappings while checking.
    for number in range(1,design.scene_count+1): emit('set_scene',value=number)
    return actions


def layout(design):
    if design.get('scene_layout') is not None:
        return design['scene_layout']
    return [dict(**role,amp_channel=c,cab_channel=c)
            for c,album in enumerate(design['albums']) for role in (album['lead'],album['solo'])][:design.get('scene_count',8)]


def compile_design(reg,raw,current_route,scene_count):
    if type(scene_count) is not int or scene_count not in fw33_profile.ALBUM_SCENE_COUNTS:
        raise ValueError('This scene count awaits independent normal SEND/editor acceptance')
    if not isinstance(raw,dict):raise ValueError('A structured scene design is required')
    design=Design.model_validate({**raw,'scene_count':raw.get('scene_count',scene_count)})
    if design.scene_count!=scene_count:
        raise ValueError('AI scene count differs from the explicitly requested scene count')
    assignments=layout(design.model_dump())
    for key,family,released in (('compressor','COMP',effect_voicing.COMPRESSOR_RELEASED),('geq','GEQ',effect_voicing.GEQ_RELEASED)):
        present=any(getattr(a,key) is not None for a in design.albums)
        if present and not released:
            raise ValueError(f'{family} normal builder awaits independent SEND/editor acceptance')
        if any(item.get(key) and getattr(design.albums[item['amp_channel']],key) is None for item in assignments):
            raise ValueError(f'Every active {family} scene requires explicit voicing on its selected amp channel')
    if has_drive(design) and not fw33_profile.DRIVE_RELEASED:
        raise ValueError('Drive prototype awaits exact engage/bypass and normal SEND/editor acceptance; nothing sent')
    if any(item.get('drive') for item in assignments) and not has_drive(design):
        raise ValueError('Active Drive scenes require explicit T808 Mod voicing')
    if any(item.get('drive') and design.albums[item['amp_channel']].drive is None for item in assignments):
        raise ValueError('Every active Drive scene requires its own selected amp voice to have explicit T808 Mod voicing')
    if assignments[0]['amp_channel'] != 0 or assignments[0]['cab_channel'] != 0:
        raise ValueError('Scene1 must retain Amp/Cab A as the measured review starting point')
    if not serial_build.supported(reg):
        raise ValueError('Measured album AMP/CAB mode requires exact FW33/MK2')
    if current_route and tuple(current_route)!=serial_build.ROUTE:
        raise ValueError('Album build cannot replace or splice another route')
    actions=actions_for(reg,design,bool(current_route))
    for a in actions: executor.resolve(reg,a)
    names=[item['name'] for item in assignments]
    return scene_intent.attach(dict(mode='album',name=executor.preset_name(design.name),summary=design.summary,
        design=design.model_dump(),scenes=names,actions=actions,
        required_route=route_guard.labels(serial_build.ROUTE,reg),controller=None,
        cab_choices=[(dict(channel='ABCD'[c],side='IR mixer',
            name=' + '.join(cab_inventory.selection(reg,ir.bank,ir.slot-1,i) for i,ir in enumerate(cab_voice(a.cab).irs,1) if ir.mode!='mute'),
            irs=[dict(**ir.model_dump(),ir=i,name=cab_inventory.selection(reg,ir.bank,ir.slot-1,i))
                 for i,ir in enumerate(cab_voice(a.cab).irs,1)]) if expanded_cabs(design)
            else dict(channel='ABCD'[c],bank=CABS[a.cab][0],slot=CABS[a.cab][1]+1,
                      name=CABS[a.cab][2],side='IR1 only')) for c,a in enumerate(design.albums)],
        channel_mapping=[dict(scene=i+1,amp='ABCD'[item['amp_channel']],cab='ABCD'[item['cab_channel']],
            delay='A',chorus='A',output='A',**({'drive':'ABCD'[item['amp_channel']]} if has_drive(design) else {}),
            **{key:'ABCD'[item['amp_channel']] for key in ('compressor','geq') if any(getattr(a,key) is not None for a in design.albums)}) for i,item in enumerate(assignments)],
        warnings=['Maximaal vier ampvoicings en vier cabkanalen A-D; zie de expliciete scene-indeling. Delay/Chorus delen A.',
            f'{len(MODELS)} FW33-ampmodellen, 2048 Factory-cabs en geimporteerde niet-lege Usercabs. Alleen vrijgegeven effectprofielen mogen worden ingericht.',
            'Gemeten vaste14-blokkenketen. Alleen expliciet ingerichte en vrijgegeven T808 Mod, Modern VCA en 10 Band Variable Q mogen actief; overige reserve-effecten blijven bypassed. Geen nieuwe controllers.',
            'Expliciete vier-IR-mix met level/pan/mute/solo.' if expanded_cabs(design) else 'Compatibiliteitsontwerp: alleen IR1 in de mix; IR2-4 blijven gemute.',
            'Cabselectie installeert geen IRs. Mixerstatus bewijst geen hoorbare output of veilige fysieke luidheid.',
            'Output -18dB; voorlopige scenevolumes. Externe mute is verplicht, geen limiter.',
            'Interpretatie, geen exacte reproductie. SEND slaat niets permanent op.']))
