"""Normal reviewed execution of the strictly measured eight-scene template.

No generic model, Cab mixer, graph, controller, memory or raw-write permission.
Each action consumes a fresh full-state check; any failure stops the session.
"""
from contextlib import contextmanager
from dataclasses import replace
import time
from fm9.device import SetResult
from fm9 import protocol as shared
from . import album_planning as planning, fw33_profile, serial_build, protocol, grid, tone_review
from .controller_review import digest


def supported(reg): return serial_build.supported(reg)


def seed():
    amp=dict(gain=5.,bass=4.,mid=5.,treble=5.,master=5.,depth=2.,presence=4.,level=-18.)
    role=dict(name='Scene',delay=False,chorus=False)
    return planning.Design.model_validate(dict(name='Album',summary='Measured template',
        albums=[dict(amp_model=planning.MODELS[14],cab='Greenback',amp=amp,lead=role,solo=role)]*4,
        delay=dict(active=False,time_ms=320.,feedback=20.,mix=15.),
        chorus=dict(active=False,rate_hz=.7,depth=25.,mix=10.)))


def validate_actions(reg,actions,existing):
    """Exact deterministic grammar, not an untrusted mode flag from the AI."""
    expected=planning.actions_for(reg,seed(),existing)
    if len(actions)!=len(expected): raise ValueError('Incomplete or extra album actions')
    role_flags={j for i,a in enumerate(expected) if a['kind']=='rename_scene' for j in (i-2,i-1)}
    # Same measured A-D selectors; only musical assignment is generalized.
    # Initial voicing/staging and the final verification survey stay fixed.
    scene_channel_indices=set()
    first_scene=next(i for i,a in enumerate(expected) if a['kind']=='set_scene')
    scene=0
    for i,a in enumerate(expected):
        if a['kind']=='set_scene':scene=a['value']
        if (first_scene<i<len(expected)-8 and a['kind']=='set_channel'
                and a['block'] in ('DISTORT','CABINET')):
            if type(actions[i].get('value')) is not int or actions[i]['value'] not in range(4):
                raise ValueError('Scene channel must be a measured A-D channel')
            if scene==1 and actions[i]['value']!=0:
                raise ValueError('Scene1 retains Amp/Cab A as the review starting point')
            scene_channel_indices.add(i)
    for index,(actual,template) in enumerate(zip(actions,expected)):
        if set(actual)!=set(template): raise ValueError('Unexpected album action fields')
        allowed=set()
        kind=template['kind']
        if kind=='set_param':
            if template['param']!='OUTPUT_LEVEL' and not (
                    template['param']=='DISTORT_LEVEL' and expected[index+1]['kind']=='set_type'):
                allowed={'value'}
            if template['param']=='DISTORT_LEVEL' and actual['value']>-12:
                raise ValueError('Album Amp level must remain <= -12dB')
            if template['param'].startswith('DISTORT_') and template['param']!='DISTORT_LEVEL' and actual['value']<=0:
                raise ValueError('Exact-zero Amp knobs are not measured')
        if kind=='set_type':
            if actual['type_name'] not in planning.MODELS.values(): raise ValueError('Unmeasured album model')
            allowed={'type_name'}
        if kind=='set_cab':
            if actual['value'] not in (515,799): raise ValueError('Unmeasured album IR1')
            allowed={'value'}
        if kind in ('rename_preset','rename_scene'): allowed={'type_name'}
        if index in role_flags: allowed={'bypassed'}
        if index in scene_channel_indices: allowed={'value'}
        if any(actual[key]!=value for key,value in template.items() if key not in allowed):
            raise ValueError('Album action order, channel, reserve or safety staging differs')


def cab_layout(words):
    if not isinstance(words,list) or len(words)!=424: raise ValueError('Complete Legacy Cab layout required')
    for c in range(4):
        v=words[c*106:(c+1)*106]
        if v[31]!=0 or v[24:28]!=[0,1,1,1] or v[8:12]!=[65534]*4 or v[12:16]!=[32767]*4:
            raise ValueError('Measured IR1-only Legacy mixer required; no automatic unmute or pan')


def prepare(dev,resolved,expected,actual):
    if not supported(dev.reg) or tuple(expected)!=serial_build.ROUTE or (actual and tuple(actual)!=serial_build.ROUTE):
        raise ValueError('Album build requires the exact measured MK2/FW33 serial route')
    validate_actions(dev.reg,[i.action for i in resolved],bool(actual))
    now=tone_review.snapshot(dev,include_nam=False)
    if now['scene']!=1 or (grid.snapshot(now['grid']) and grid.snapshot(now['grid'])!=serial_build.expected_grid()):
        raise ValueError('Album build begins on scene1 of empty or exact measured row1')
    if any(m['active'] for m in now['modifiers']): raise ValueError('Album build never clears active modifiers')
    if actual:
        if any(b.channel!=0 or b.channels_supported!=4 for b in now['blocks'] if b.effect_id in expected):
            raise ValueError('Existing album foundation must begin on channel A')
        if len(now['bulk'].get(58,[]))!=568: raise ValueError('Complete four-channel Amp layout required')
        cab_layout(now['bulk'].get(62))
        for item in resolved:
            if item.spec is not None and item.spec.tempo_param_id is not None:
                serial_build.require_tempo(dev,item.spec)
    return resolved,expected,actual


def frame_allowed(dev,frame):
    session=getattr(dev,'_album_session',None)
    active=(isinstance(session,Session) and session.dev is dev and not session.failed
        and supported(dev.reg) and session.target==getattr(dev,'_edit_target',None)
        and session.frame==tuple(frame) and session.item is not None)
    if not active: return False
    item=session.item
    if item.action['kind']=='set_type':
        ordinal=next(k for k,v in planning.MODELS.items() if v==item.value)
        return frame==protocol.param_frame(58,0,ordinal,opcode=9)
    if item.action['kind']=='set_cab':
        bank,ordinal,_=item.value
        return frame in [protocol.param_frame(62,p,v,opcode=9) for p,v in ((0,bank),(4,ordinal))]
    if item.action['kind']=='set_channel' and item.effect_id in (58,62):
        return frame==protocol.envelope(1,[22,0,item.effect_id,0,0,0,item.value,0,0,0,0,0,0,0,0])
    if item.action['kind']=='set_scene': return frame==protocol.envelope(0x0c,[item.value-1])
    return False


def amp_domain(dev,spec,channel):
    session=getattr(dev,'_album_session',None)
    return (isinstance(session,Session) and not session.failed and session.item is not None
        and session.item.action['kind']=='set_param' and session.item.spec==spec
        and spec.effect_id==58 and spec.family=='DISTORT' and channel in range(4)
        and supported(dev.reg) and session.target==getattr(dev,'_edit_target',None))


class Session:
    def __init__(self,dev,resolved):
        dev._check_edit_target()
        if not supported(dev.reg) or getattr(dev,'_album_session',None) is not None:
            raise PermissionError('One measured album session required')
        self.dev,self.target,self.resolved=dev,dev._edit_target,resolved
        self.index,self.failed,self.frame,self.item=0,False,None,None
        self.scene_states={}
        self.expected=tone_review.snapshot(dev,include_nam=False)
        cab_layout(self.expected['bulk'].get(62))
        dev._album_session=self

    def write(self,frame):
        if self.failed or self.item is None: raise PermissionError('Album operation not active')
        self.frame=tuple(frame)
        try: self.dev._write(frame)
        finally: self.frame=None

    def settle(self,match):
        for _ in range(5):
            time.sleep(.2)
            now=tone_review.snapshot(self.dev,include_nam=False)
            if match(now): return now
        raise ValueError('Independent full-state mismatch; no write retry or rollback')

    def channel(self,eid,value):
        if eid not in (58,62): return self.dev.set_channel(eid,value)
        before=self.expected
        wanted={**before,'blocks':[replace(b,channel=value) if b.effect_id==eid else b for b in before['blocks']]}
        if before==wanted: return value
        self.write(protocol.envelope(1,[22,0,eid,0,0,0,value,0,0,0,0,0,0,0,0]))
        self.settle(lambda now:now==wanted)
        return value

    def model(self,name):
        before=self.expected
        channel=next(b.channel for b in before['blocks'] if b.effect_id==58)
        base=142*channel
        ordinal=next(k for k,v in planning.MODELS.items() if v==name)
        if before['bulk'][58][base]==ordinal: return SetResult(True,'Model retained without reset',name,name)
        level=self.dev.get_param_display(self.dev.reg.find_param('DISTORT','DISTORT_LEVEL'))
        if self.dev.get_bypass(58) is not True or type(level) not in (int,float) or level>-18:
            raise PermissionError('Bypassed and verified quiet Amp required before model write')
        self.write(protocol.param_frame(58,0,ordinal,opcode=9))
        def match(now):
            if now['bulk'][58][base]!=ordinal: return False
            words=list(before['bulk'][58]);words[base:base+142]=now['bulk'][58][base:base+142]
            return now=={**before,'bulk':{**before['bulk'],58:words}}
        self.settle(match)
        return SetResult(True,'Measured model and independent full-channel preservation verified',before['bulk'][58][base],name)

    def cab(self,bank,ordinal):
        before=self.expected
        channel=next(b.channel for b in before['blocks'] if b.effect_id==62)
        base=106*channel
        cab_layout(before['bulk'][62])
        current=before
        for pid,value in ((0,bank),(4,ordinal)):
            if current['bulk'][62][base+pid]==value: continue
            words=list(current['bulk'][62]);words[base+pid]=value
            wanted={**current,'bulk':{**current['bulk'],62:words}}
            self.write(protocol.param_frame(62,pid,value,opcode=9))
            current=self.settle(lambda now:now==wanted)
        return SetResult(True,'IR1 selected, other IRs and full mixer preserved',None,(bank,ordinal,'IR1'))

    def run(self,item,operation):
        if self.failed or self.index>=len(self.resolved) or item is not self.resolved[self.index]:
            raise PermissionError('Album session consumed or action out of order')
        dev=self.dev
        if tone_review.snapshot(dev,include_nam=False)!=self.expected:
            self.failed=True;raise PermissionError('Fresh state changed before album action')
        self.item=item
        try:
            result=operation()
            if not result.ok: self.failed=True; return result
            before=self.expected
            kind,eid=item.action['kind'],item.effect_id
            def match(now):
                wanted=dict(before)
                if kind=='set_param':
                    channel=next(b.channel for b in before['blocks'] if b.effect_id==eid)
                    stride=fw33_profile.STRIDES[item.family]
                    pos=channel*stride+item.spec.param_id
                    # FW33 display/bulk anchors agree with this normalized
                    # law (including literal 1ms, not wire_min=0). Allow one
                    # quantization word, never copy an arbitrary stale value.
                    target=round(shared.display_to_normalized(item.value,item.spec.dmin,
                        item.spec.dmax,item.spec.scale)*65534)
                    if abs(now['bulk'][eid][pos]-target)>1: return False
                    words=list(before['bulk'][eid]);words[pos]=now['bulk'][eid][pos]
                    wanted['bulk']={**before['bulk'],eid:words}
                elif kind=='set_type':
                    c=next(b.channel for b in before['blocks'] if b.effect_id==58);base=142*c
                    words=list(before['bulk'][58]);words[base:base+142]=now['bulk'][58][base:base+142]
                    wanted['bulk']={**before['bulk'],58:words}
                elif kind=='set_cab':
                    c=next(b.channel for b in before['blocks'] if b.effect_id==62);base=106*c
                    words=list(before['bulk'][62]);words[base],words[base+4]=item.value[:2]
                    wanted['bulk']={**before['bulk'],62:words}
                elif kind in ('set_channel','set_bypass'):
                    field='channel' if kind=='set_channel' else 'bypassed'
                    wanted['blocks']=[replace(b,**{field:item.value}) if b.effect_id==eid else b for b in before['blocks']]
                elif kind=='set_scene':
                    wanted['scene']=item.value
                    old={b.effect_id:b for b in before['blocks']}
                    if any(b.effect_id not in old or replace(b,channel=old[b.effect_id].channel,bypassed=old[b.effect_id].bypassed)!=old[b.effect_id] for b in now['blocks']): return False
                    if len(old)!=len(now['blocks']): return False
                    wanted['blocks']=now['blocks']
                    if self.index>=len(self.resolved)-8:
                        if len(self.scene_states)!=8: return False
                        wanted['blocks']=self.scene_states[item.value]
                elif kind=='rename_preset': wanted['preset']=(before['preset'][0],item.value)
                elif kind=='rename_scene':
                    wanted['scene_names']=list(before['scene_names'])
                    wanted['scene_names'][item.value-1]=(item.value,item.action['type_name'])
                return now==wanted
            now=self.settle(match)
            if dev.get_param_display(dev.reg.find_param('OUTPUT','OUTPUT_LEVEL'))!=-18:
                raise PermissionError('Output attenuation changed; retain external mute')
            self.expected=now;self.index+=1
            if kind=='rename_scene': self.scene_states[item.value]=list(now['blocks'])
            return result
        except BaseException:
            self.failed=True
            raise
        finally: self.item=None;self.frame=None

    def proof(self):
        if self.failed or self.index!=len(self.resolved) or len(self.scene_states)!=8:
            raise PermissionError('Incomplete album cannot certify a Store proof')
        return dict(final_fingerprint=digest(self.expected),scene_fingerprints={str(n):
            digest({**self.expected,'scene':n,'blocks':self.scene_states[n]}) for n in range(1,9)})


@contextmanager
def execution(dev,resolved,enabled):
    if not enabled: yield None; return
    session=Session(dev,resolved)
    try: yield session
    finally:
        session.failed=True;session.frame=None;session.item=None
        dev._album_session=None
