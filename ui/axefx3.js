'use strict';
const el=id=>document.getElementById(id);
let state=null, proposal=null, busy=false;
const note=text=>{el('status').textContent=text;};
function controls(){
  for(const id of ['refresh','generate','cabImport','prompt','scenes','wah','cabKind','cabFile','discard']) el(id).disabled=busy;
  el('wahMode').disabled=busy||!el('wah').value;
  el('generate').disabled=busy||!state?.connected||!!state.route_problem||!state.cab_count;
  el('send').disabled=busy||!proposal||!el('confirmed').checked||!el('muted').checked;
  el('controllerHint').textContent=!el('wah').value?'Geen nieuwe controllerkoppeling. Bestaande Auto Engage blijft behouden en kan de scene-bypass beinvloeden.':
    el('wahMode').value==='Fast Pos'?'Fast Pos: pedaalbeweging kan de Wah ook inschakelen in een scene met Wah uit. Kies Off voor aan/uit via de scenes.':
    el('wahMode').value==='Off'?'Off: het pedaal stuurt de Wah-filterstand, maar schakelt de Wah niet automatisch aan of uit.':
    'Bestaande Auto Engage-modus blijft behouden. Bij een nieuwe koppeling gebruikt het apparaat zijn standaard; controleer het gedrag.';
}
function invalidate(){proposal=null;el('review').hidden=true;el('confirmed').checked=el('muted').checked=false;
  el('requestPreview').textContent=el('prompt').value.slice(0,160)+(el('prompt').value.length>160?'...':'');controls();}
async function api(name,body){
  const r=await fetch('/api/axefx3/'+name,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await r.json();
  if(!r.ok)throw new Error(typeof data.detail==='string'?data.detail:(data.error||'Verzoek geweigerd. Lees de status opnieuw.'));
  return data;
}
async function run(work){if(busy)return;busy=true;controls();try{await work();}catch(e){invalidate();note(e.message);}finally{busy=false;controls();}}
async function refresh(){
  invalidate();state=null;state=await api('state');
  el('target').textContent=state.connected?`Axe-Fx III | ${state.firmware} | Preset ${state.preset}: ${state.name} | Scene ${state.scene}`:'Verbind eerst via Verbinding & controllers.';
  el('cabCount').textContent=state.connected?`${state.cab_count} cabnamen beschikbaar.`:'';
  note(state.route_problem||(state.connected?'Status uitgelezen. Niets verzonden.':'Nog niet verbonden.'));
}
el('refresh').onclick=()=>run(refresh);
for(const id of ['prompt','scenes','wah','wahMode'])el(id).addEventListener('input',invalidate);
el('confirmed').onchange=el('muted').onchange=controls;
function showDesign(plan){
  const design=plan.design, controller=plan.controller;
  const cabs=(plan.cab_choices||[]).map(cab=>`${cab.side}: ${cab.name} (${cab.position})`).join(' | ');
  el('toneChoice').textContent=cabs?`Amp: ${design?.amp_model||'?'} | ${cabs}`:design?`Amp: ${design.amp_model} | IR1: wire-bank ${design.cab_left.bank}, slot ${design.cab_left.slot}`+
    (design.cab_right?` | IR2: bank ${design.cab_right.bank}, slot ${design.cab_right.slot}`:' | IR2-4 gedempt'):'';
  el('controllerChoice').textContent=controller?.source?`Wah: ${controller.source} | Auto Engage: ${controller.auto_engage||'bestaande modus behouden'}`:'Wah-controller: bestaande koppeling behouden.';
  el('planWarnings').replaceChildren();
  for(const warning of plan.warnings||[]){const li=document.createElement('li');li.textContent=warning;el('planWarnings').append(li);}
  el('sceneRows').replaceChildren();el('sceneTable').hidden=!design;
  for(const [i,scene] of (design?.scenes||[]).entries()){
    const tr=document.createElement('tr');
    const delay=scene.delay.active?`${scene.delay.time_ms} ms | feedback ${scene.delay.feedback}% | mix ${scene.delay.mix}%`:'Uit';
    const reverb=scene.reverb.active?`${scene.reverb.time_s} s | mix ${scene.reverb.mix}%`:'Uit';
    const chorus=scene.chorus?(scene.chorus.active?`${design.chorus_model||'Analog Stereo'} | ${scene.chorus.rate_hz} Hz | depth ${scene.chorus.depth}% | mix ${scene.chorus.mix}%`:'Uit'):
      plan.actions.some(a=>a.kind==='add_block'&&String(a.block).toUpperCase()==='CHORUS')?'Uit (niet gevraagd)':'Bestaand behouden';
    for(const value of [`${i+1}. ${scene.name} / ${'ABCD'[i]}`,`${scene.amp.gain} / ${scene.amp.level} dB`,scene.wah?'Aan':'Uit',chorus,delay,reverb]){
      const td=document.createElement('td');td.textContent=value;tr.append(td);
    }
    el('sceneRows').append(tr);
  }
}
el('generate').onclick=()=>run(async()=>{
  invalidate();el('result').hidden=true;
  note('AI werkt het voorstel uit. Er wordt nog niets naar de Fractal gestuurd...');
  proposal=await api('plan',{prompt:el('prompt').value,expected_preset:state.preset,scenes:Number(el('scenes').value),wah_source:el('wah').value||null,
    wah_auto_engage:el('wah').value?(el('wahMode').value||null):null});
  el('summary').textContent=proposal.summary;el('planName').textContent=proposal.name;
  el('who').textContent=`AI: ${proposal.backend||'onbekend'} / ${proposal.model||'onbekend'} | Doel: preset ${proposal.target.preset} | Voorstel 10 minuten geldig`;
  el('sceneNames').textContent=proposal.scenes.map((name,i)=>`${i+1}. ${name}`).join('\n');
  showDesign(proposal);
  el('route').textContent=proposal.required_route.join(' → ');
  el('actionCount').textContent=`Bekijk alle ${proposal.actions.length} wijzigingen`;
  el('actions').replaceChildren();
  for(const action of proposal.actions){const li=document.createElement('li');li.textContent=JSON.stringify(action);el('actions').append(li);}
  el('requestPreview').textContent=el('prompt').value.slice(0,160)+(el('prompt').value.length>160?'...':'');
  el('requestPreview').hidden=false;el('requestPanel').open=false;
  el('review').hidden=false;el('review').focus();note('Voorstel klaar. Controleer het voordat je verzendt.');
});
el('discard').onclick=()=>run(async()=>{invalidate();await api('discard',{});note('Voorstel verwijderd. Niets verzonden.');});
el('cabImport').onclick=()=>run(async()=>{
  const file=el('cabFile').files[0];if(!file)throw new Error('Kies een cabnamenlijst.');
  if(file.size>2*1024*1024)throw new Error('Maximaal 2 MiB tekst.');
  invalidate();const result=await api('cabs',{kind:el('cabKind').value,text:await file.text()});
  await refresh();note(`${result.imported} namen geïmporteerd voor deze verbinding. Geen IR-audio of hardware gewijzigd.`);
});
el('send').onclick=()=>run(async()=>{
  if(!proposal||!el('confirmed').checked||!el('muted').checked)throw new Error('Bevestig eerst doel en externe demping.');
  const token=proposal.token;invalidate();note('Bezig met gecontroleerd verzenden. Laat de externe audio gedempt.');
  let result;
  try{result=await api('send',{token,target_confirmed:true,external_audio_muted:true});}
  catch(e){throw new Error('Verzending niet bevestigd. Houd audio gedempt; niet automatisch opnieuw verzenden. '+e.message);}
  el('resultTitle').textContent=result.ok?'Schrijfopdrachten teruggelezen en bevestigd':'Verzending gestopt';
  el('resultText').textContent=`${result.results.filter(r=>r.ok).length} acties bevestigd; ${result.skipped} overgeslagen.\n`+
    (result.detail||'')+'\n'+result.results.filter(r=>!r.ok).map(r=>r.detail).join('\n')+
    '\nNiets permanent opgeslagen. Controleer fysieke pedalen, klank en balans apart op laag fysiek volume.';
  el('result').hidden=false;await refresh();el('result').focus();
  note(result.ok?'Bouw afgerond, geen hoorbaar resultaat gemeten.':'Gestopt. Gedeeltelijke wijzigingen kunnen achterblijven; houd audio gedempt.');
});
run(refresh);
