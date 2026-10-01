'use strict';
const el=id=>document.getElementById(id);
let state=null, proposal=null, busy=false;
const note=text=>{el('status').textContent=text;};
function controls(){
  for(const id of ['refresh','generate','cabImport','prompt','scenes','wah','cabKind','cabFile','discard']) el(id).disabled=busy;
  el('generate').disabled=busy||!state?.connected||!!state.route_problem||!state.cab_count;
  el('send').disabled=busy||!proposal||!el('confirmed').checked||!el('muted').checked;
}
function invalidate(){proposal=null;el('review').hidden=true;el('confirmed').checked=el('muted').checked=false;controls();}
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
for(const id of ['prompt','scenes','wah'])el(id).addEventListener('input',invalidate);
el('confirmed').onchange=el('muted').onchange=controls;
el('generate').onclick=()=>run(async()=>{
  invalidate();el('result').hidden=true;
  note('AI werkt het voorstel uit. Er wordt nog niets naar de Fractal gestuurd...');
  proposal=await api('plan',{prompt:el('prompt').value,expected_preset:state.preset,scenes:Number(el('scenes').value),wah_source:el('wah').value||null});
  el('summary').textContent=proposal.summary;el('planName').textContent=proposal.name;
  el('who').textContent=`AI: ${proposal.backend||'onbekend'} / ${proposal.model||'onbekend'} | Doel: preset ${proposal.target.preset} | Voorstel 10 minuten geldig`;
  el('sceneNames').textContent=proposal.scenes.map((name,i)=>`${i+1}. ${name}`).join('\n');
  el('route').textContent=proposal.required_route.join(' → ');
  el('actionCount').textContent=`Bekijk alle ${proposal.actions.length} wijzigingen`;
  el('actions').replaceChildren();
  for(const action of proposal.actions){const li=document.createElement('li');li.textContent=JSON.stringify(action);el('actions').append(li);}
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
