'use strict';
const viewIds={planPanel:'pane-plan',review:'pane-review',confirmPanel:'pane-confirm',result:'pane-send',generate:'engage',toReview:'reviewbtn',toConfirm:'toconfirm',send:'apply'};
const el=id=>document.getElementById(viewIds[id]||id);
let state=null, proposal=null, busy=false;
let audioReference=null;
let audioReferenceKey='';
let namAccount=null,namSelection=null,namPreview=null;
let namSlots=null;
let storePreview=null;
let currentStage=0;
let routeExploration=null;
let navigationPreview=null,presetLibrary=[];
function clearRouteExploration(){routeExploration=null;el('buildRoute').value='';el('routeOptions').replaceChildren();el('routeReason').textContent='Vul je verzoek in en klik EXPLORE ROUTES. NAM wordt niet automatisch gekozen.';}
const note=text=>{el('status').textContent=text;};
const stageNames=['request','plan','review','confirm','send'];
const stagePanes=['pane-request','planPanel','review','confirmPanel','result'];
// Keep source intent compact beside the upstream-style request controls.
const sourceLabel=document.createElement('label');sourceLabel.textContent='Bron ';
const sourceKind=document.createElement('select');sourceKind.id='sourceKind';
sourceKind.append(new Option('Klankvoorbeeld / gewoon verzoek','tone'),new Option('Rig-uitleg / apparatuurvideo','rig'));
sourceLabel.append(sourceKind);el('requestPanel').querySelector('.formbar').prepend(sourceLabel);
sourceLabel.hidden=true;
const modeLabel=document.createElement('label');modeLabel.textContent='Rigvertaling ';
const rigMode=document.createElement('select');rigMode.id='rigMode';
rigMode.append(new Option('Dichtstbijzijnde benadering','closest'),new Option('Getrouwe routing (weigert beperkingen)','faithful'),new Option('Vereenvoudigde live-rig','simplified'));
modeLabel.append(rigMode);modeLabel.hidden=true;sourceLabel.after(modeLabel);
sourceKind.onchange=()=>{modeLabel.hidden=sourceKind.value!=='rig';audioReference=null;invalidate();
  clearRouteExploration();controls();
  el('audioStatus').textContent=sourceKind.value==='rig'?'Apparatuuruitleg wordt gelezen, geen spraakmeting als gitaarklank.':'Een link wordt als klankvoorbeeld lokaal gemeten.';};
rigMode.onchange=invalidate;
const captureLabel=document.createElement('label');captureLabel.textContent='Geinstalleerde NAM ';
const captureSlot=document.createElement('select');captureSlot.id='namBuildSlot';
captureSlot.append(new Option('Huidige NAM behouden',''));
captureLabel.append(captureSlot);modeLabel.after(captureLabel);captureLabel.hidden=true;
captureSlot.onchange=invalidate;
function stage(index){
  currentStage=index;document.body.dataset.stage=stageNames[index];
  stagePanes.forEach((id,i)=>{el(id).hidden=i!==index;});
  document.querySelectorAll('#rail .stg').forEach((step,i)=>{
    const available=i===0||(i<4&&!!proposal)||(i===4&&!proposal&&!!el('resultText').textContent.trim());
    step.disabled=busy||!available;step.classList.toggle('on',i===index);step.classList.toggle('avail',available);
    if(i===index)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');
  });
  el('navTitle').textContent=stageNames[index].toUpperCase();
  el('navHelp').textContent=['Vertel TC wat je wilt.','Voorstel, nog niets verzonden.','Controleer alle wijzigingen.','Bevestig doel en externe demping.','Resultaat van de verzending.'][index];
}
function controls(){
  el('target').disabled=busy||!state?.connected||!state?.navigation_supported;
  el('connectDevice').textContent=state?.connected?'VERBONDEN':'VERBIND';
  el('connectDevice').classList.toggle('linked',!!state?.connected);
  el('navigationSelect').disabled=busy||!navigationPreview||!el('navigationMute').checked||(navigationPreview.kind==='preset'&&!el('navigationDiscard').checked);
  for(const button of el('sceneRack').querySelectorAll('button'))button.disabled=busy||!state?.navigation_supported;
  const chooseRoute=!!state?.route_options_supported;
  el('routeOptionsPanel').hidden=!chooseRoute;
  el('exploreRoutes').disabled=busy||!state?.connected||!el('prompt').value.trim();
  el('buildRoute').disabled=busy||!routeExploration;
  const sourceSupported=!!state?.source_support?.rig_reader;
  sourceLabel.hidden=!sourceSupported;modeLabel.hidden=!sourceSupported||sourceKind.value!=='rig';
  if(!sourceSupported){sourceKind.value='tone';rigMode.value='closest';}
  sourceKind.disabled=busy;rigMode.disabled=busy;
  const serial=el('buildRoute').value==='serial';
  const serialOption=el('buildRoute').querySelector('option[value="serial"]');
  serialOption.hidden=!state?.serial_build_supported;
  serialOption.disabled=!state?.serial_build_supported||sourceKind.value==='rig';
  captureLabel.hidden=!state?.nam_selection_supported||serial;
  captureSlot.disabled=busy||!state?.nam_selection_supported;
  for(const id of ['refresh','generate','cabImport','prompt','scenes','wah','cabKind','cabFile','discard','variant','deviceChoice','connectDevice','newDesign','audioFile','namQuery','namFormat','namSearch','namLogin','namWithRequest','editRequest','toReview','backPlan','toConfirm','backReview','returnRequest']) el(id).disabled=busy;
  el('connectDevice').disabled=busy||!!state?.connected;
  el('wahMode').disabled=busy||!el('wah').value;
  const fw33=state?.firmware==='33.00-beta.20261006';
  const maxScenes=serial?1:fw33?(state.route?.length?2:1):state?.multiscene_planning_supported?8:4;
  for(const option of el('scenes').options)option.disabled=Number(option.value)>maxScenes;
  if(Number(el('scenes').value)>maxScenes)el('scenes').value=String(maxScenes);
  el('generate').disabled=busy||el('deviceChoice').value!=='axefx3'||!state?.connected||!!state.route_problem||(!fw33&&!state.cab_count);
  if(serial&&state?.scene!==1)el('generate').disabled=true;
  if(chooseRoute&&!routeExploration?.routes.some(r=>r.mode===el('buildRoute').value&&r.enabled))el('generate').disabled=true;
  for(const id of ['namSaveKey','namDisconnect','namSuggest','namKey'])el(id).disabled=busy;
  el('namSlotsRefresh').disabled=busy||!namAccount?.installation_supported||!state?.connected;
  el('namSlot').disabled=busy||!namSlots;
  el('namInstallPrepare').disabled=busy||!namSelection?.model||!namAccount?.installation_supported||!state?.connected||!namSlots||!el('namSlot').value;
  el('namInstallCommit').disabled=busy||!namPreview||!el('namInstallMute').checked||!el('namInstallFlash').checked||!el('namInstallOverwrite').checked;
  el('wah').disabled=busy||fw33; if(fw33)el('wah').value='';
  el('wahMode').disabled=busy||fw33||!el('wah').value;
  el('storePrepare').disabled=busy||!fw33||!state?.connected;
  el('storeCommit').disabled=busy||!storePreview||!el('storeMute').checked||!el('storeFlash').checked;
  el('send').disabled=busy||currentStage!==3||el('deviceChoice').value!=='axefx3'||!proposal||!el('confirmed').checked||!el('muted').checked;
  stage(currentStage);
  el('controllerHint').textContent=serial?'Gemeten AMP/CAB-testketen: uitsluitend scene1/A. Modellen blijven behouden, reserveblokken blijven bypassed. Geen nieuwe controllers.':fw33?'FW33 NAM: eerst 1 scene vanuit leeg; daarna maximaal 2 met NAM A/B. Nieuwe controllerkoppelingen zijn voor dit profiel nog niet geverifieerd.':!el('wah').value?'Geen nieuwe controllerkoppeling. Bestaande Auto Engage blijft behouden en kan de scene-bypass beinvloeden.':
    el('wahMode').value==='Fast Pos'?'Fast Pos: pedaalbeweging kan de Wah ook inschakelen in een scene met Wah uit. Kies Off voor aan/uit via de scenes.':
    el('wahMode').value==='Off'?'Off: het pedaal stuurt de Wah-filterstand, maar schakelt de Wah niet automatisch aan of uit.':
    'Bestaande Auto Engage-modus blijft behouden. Bij een nieuwe koppeling gebruikt het apparaat zijn standaard; controleer het gedrag.';
  if(!fw33&&state?.multiscene_planning_supported)el('controllerHint').textContent+=' Tot acht scenes, maximaal vier verschillende instellingen per blok. Gelijke instellingen delen kanalen; bypass en uitgangsniveau kunnen solo en ritme onderscheiden.';
}
function invalidate(){proposal=null;stage(0);el('confirmed').checked=el('muted').checked=false;
  el('rigReport').hidden=true;
  clearNamPreview();
  storePreview=null;el('storeMute').checked=el('storeFlash').checked=false;el('storeSummary').textContent='';
  el('requestPreview').textContent=el('prompt').value.slice(0,160)+(el('prompt').value.length>160?'...':'');controls();}
async function api(name,body){
  const r=await fetch('/api/axefx3/'+name,body===undefined?{headers:{'X-ToneCommand':'1'}}:{method:'POST',headers:{'Content-Type':'application/json','X-ToneCommand':'1'},body:JSON.stringify(body)});
  const data=await r.json();
  if(!r.ok)throw new Error(typeof data.detail==='string'?data.detail:(data.error||'Verzoek geweigerd. Lees de status opnieuw.'));
  return data;
}
async function run(work){if(busy)return;busy=true;controls();try{await work();}catch(e){invalidate();note(e.message);}finally{busy=false;controls();}}
async function refresh(){
  navigationPreview=null;el('navigationDialog').close();
  clearRouteExploration();invalidate();clearNamSlots();state=null;state=await api('state');
  el('target').textContent=state.connected?`Preset ${state.preset}: ${state.name} \u25be`:'Verbind eerst via Verbinding & controllers.';
  el('target').title=state.connected?`Axe-Fx III | ${state.firmware} | Preset ${state.preset}: ${state.name} | Scene ${state.scene}. Klik om een preset te kiezen.`:'Verbind eerst via Verbinding & controllers.';
  el('connectDevice').title=state.connected?`Axe-Fx III | ${state.firmware}`:'Verbind met de Fractal';
  el('cabCount').textContent=state.connected?`${state.cab_count} cabnamen beschikbaar.`:'';
  el('variant').value=state.profile?.variant||'';
  el('memoryWarning').textContent=state.profile?.warning||'Kies MK1 of MK2 om de juiste geheugenindeling te tonen.';
  if(state.nam_selection_supported){
    const selected=captureSlot.value;
    captureSlot.replaceChildren(new Option(`Huidige NAM ${String(state.nam?.slot||1).padStart(3,'0')} behouden`,''));
    for(const row of namSlots||[])if(row.occupied)captureSlot.append(new Option(`${String(row.slot).padStart(3,'0')} | ${row.name}`,String(row.slot)));
    if([...captureSlot.options].some(o=>o.value===selected))captureSlot.value=selected;
  }
  el('liveRoute').replaceChildren();
  if(state.route?.length){for(const [i,label] of state.route.entries()){
    if(i)el('liveRoute').append(document.createTextNode(' → '));
    const actual=state.route_blocks?.[i];
    const block=document.createElement('span');block.className='chain-block'+(actual?.bypassed?' bypassed':'');block.textContent=label;
    if(actual){const channel=document.createElement('span');channel.className='chain-channel';channel.textContent=actual.channel;block.append(channel);block.title=actual.bypassed?'Bypassed':'Actief';}
    el('liveRoute').append(block);
  }}else el('liveRoute').textContent=state.route_problem||'Lege of niet uitgelezen keten';
  el('sceneRack').replaceChildren();
  for(let i=0;i<8;i++){
    const raw=state.scene_names?.[i],label=Array.isArray(raw)?raw[1]:(raw||'');
    const scene=document.createElement('button');scene.type='button';scene.className='sc'+(state.connected&&state.scene===i+1?' on':'');
    scene.dataset.scene=String(i+1);scene.disabled=busy||!state.navigation_supported;
    scene.setAttribute('aria-label',`Scene ${i+1}: ${label||'geen naam'}`);scene.setAttribute('aria-pressed',String(state.scene===i+1));
    const num=document.createElement('span');num.className='n';num.textContent=String(i+1);
    const name=document.createElement('span');name.className='nm';name.textContent=label;scene.append(num,name);el('sceneRack').append(scene);
  }
  if(el('namPanel').open)await accountStatus();
  note(state.route_problem||(state.connected?'Status uitgelezen. Niets verzonden.':'Nog niet verbonden.'));
}
el('refresh').onclick=()=>run(refresh);
function renderPresets(){
  const query=el('presetSearch').value.trim().toLowerCase();el('presetChoices').replaceChildren();
  for(const row of presetLibrary.filter(r=>`${String(r.number).padStart(4,'0')} ${r.number} ${r.name}`.toLowerCase().includes(query))){
    const button=document.createElement('button');button.type='button';button.dataset.preset=String(row.number);
    button.textContent=`${String(row.number).padStart(3,'0')} | ${row.name}`;
    button.onclick=()=>{el('presetDialog').close();prepareNavigation('preset',row.number);};el('presetChoices').append(button);
  }
}
el('presetSearch').oninput=renderPresets;
el('presetClose').onclick=()=>el('presetDialog').close();
el('target').onclick=()=>run(async()=>{
  el('presetSearch').value='';presetLibrary=[];el('presetChoices').replaceChildren();el('presetDialog').showModal();
  el('presetScanStatus').textContent='Presetnamen 000-511 lezen. Dit selecteert niets...';
  let result;
  try{result=await api('navigation/presets');}
  catch(error){el('presetScanStatus').textContent=error.message;throw error;}
  presetLibrary=result.slots;renderPresets();
  el('presetScanStatus').textContent=`${presetLibrary.length} presetnamen gelezen. Klik een preset om de wissel te bevestigen.`;
});
function prepareNavigation(kind,value){return run(async()=>{
  navigationPreview=null;el('navigationMute').checked=el('navigationDiscard').checked=false;
  const preview=await api('navigation/prepare',{kind,value,expected_preset:state.preset,expected_scene:state.scene});
  navigationPreview=preview;el('navigationTitle').textContent=kind==='preset'?'PRESET SELECTEREN':'SCENE SELECTEREN';
  el('navigationDestination').textContent=`${kind==='preset'?'Preset':'Scene'} ${preview.destination.number}: ${preview.destination.name||'geen naam'}`;
  el('navigationWarning').textContent=kind==='preset'?'Deze wissel verwerpt niet-opgeslagen wijzigingen op de Fractal. Je verzoektekst blijft behouden; een bestaand plan wordt ongeldig.':'Deze wissel verandert de actieve sound. Externe audio moet tijdens de testwissel gedempt zijn. Een bestaand plan wordt ongeldig.';
  el('navigationDiscardLabel').hidden=kind!=='preset';el('navigationDialog').showModal();
});}
el('sceneRack').onclick=event=>{const button=event.target.closest('button[data-scene]');if(button&&!button.disabled)prepareNavigation('scene',Number(button.dataset.scene));};
el('navigationMute').onchange=el('navigationDiscard').onchange=controls;
el('navigationCancel').onclick=()=>{navigationPreview=null;el('navigationDialog').close();controls();};
el('navigationDialog').addEventListener('cancel',()=>{navigationPreview=null;controls();});
el('navigationSelect').onclick=()=>run(async()=>{
  const preview=navigationPreview;if(!preview)throw new Error('Selectie opnieuw bevestigen.');
  navigationPreview=null;el('navigationDialog').close();
  const result=await api('navigation/select',{token:preview.token,external_audio_muted:el('navigationMute').checked,confirm_discard_edits:el('navigationDiscard').checked});
  el('navigationDialog').close();await refresh();note(`${result.kind==='preset'?'Preset':'Scene'} geselecteerd en van de Fractal teruggelezen. Niets opgeslagen.`);
});
for(const id of ['prompt','scenes','wah','wahMode'])el(id).addEventListener('input',invalidate);
el('prompt').addEventListener('input',()=>{clearRouteExploration();controls();});
el('audioFile').addEventListener('input',()=>{clearRouteExploration();controls();});
el('buildRoute').onchange=()=>{invalidate();const choice=routeExploration?.routes.find(r=>r.mode===el('buildRoute').value);
  el('routeReason').textContent=choice?choice.reason:'Kies zelf NAM of AMP/CAB.';controls();};
el('exploreRoutes').onclick=()=>run(async()=>{
  clearRouteExploration();invalidate();await api('discard',{});
  audioReference=sourceKind.value==='rig'?null:await analyseRequestAudio();
  const result=await api('options',{prompt:el('prompt').value,expected_preset:state.preset,audio_reference:audioReference,source_kind:sourceKind.value});
  routeExploration=result;el('routeOptionsPanel').open=true;
  el('routeReason').textContent=`Advies: ${result.comparison.recommended==='amp'?'AMP/CAB':result.comparison.recommended==='nam'?'NAM':'beide routes mogelijk'}. Kies zelf je bouwroute; hieronder zie je wat nu uitvoerbaar is.`;
  for(const route of result.routes){const p=document.createElement('p');
    p.textContent=`${route.label}: ${route.enabled?'uitvoerbaar binnen de huidige geverifieerde bediening':'muzikale optie, nog niet uitvoerbaar op dit profiel'}. ${route.reason}`;el('routeOptions').append(p);}
  const evidence=document.createElement('details'),summary=document.createElement('summary');
  summary.textContent='Waarom dit advies? Amp-richting en mogelijke effecten';evidence.append(summary);
  const reason=document.createElement('p');reason.textContent=result.comparison.reason;evidence.append(reason);
  const detail=document.createElement('p');detail.textContent=`Amp-richting: ${result.comparison.amp_direction}. NAM-zoekterm: ${result.comparison.nam_query}. Mogelijke effecten: ${result.comparison.pedals.join(', ')||'geen extra effecten nodig'}. Dit zijn interpretaties, geen toegezegde parameterwrites.`;evidence.append(detail);el('routeOptions').append(evidence);
  el('namQuery').value=result.comparison.nam_query;
  if(result.nam_candidates?.length){await showAccountTones(result.nam_candidates);el('namPanel').open=true;}
  if(result.nam_search_warning){const warning=document.createElement('p');warning.textContent=result.nam_search_warning;el('routeOptions').append(warning);}
  note('Routes onderzocht. Kies NAM of AMP/CAB; niets geselecteerd, geinstalleerd of verzonden.');
});
el('confirmed').onchange=el('muted').onchange=controls;
function navigate(index){
  if(busy||(index>0&&index<4&&!proposal)||(index===4&&!el('resultText').textContent))return;
  stage(index);controls();el(stagePanes[index]).focus();
}
document.querySelectorAll('#rail .stg').forEach(button=>{button.onclick=()=>navigate(Number(button.dataset.step));});
el('toReview').onclick=()=>navigate(2);el('backPlan').onclick=()=>navigate(1);
el('toConfirm').onclick=()=>navigate(3);el('backReview').onclick=()=>navigate(2);
el('editRequest').onclick=()=>{navigate(0);el('requestPanel').open=true;el('prompt').focus();};
el('returnRequest').onclick=()=>navigate(0);
el('storePrepare').onclick=()=>run(async()=>{
  await api('discard',{});storePreview=await api('store/prepare',{expected_preset:state.preset});
  el('storeMute').checked=el('storeFlash').checked=false;
  el('storeSummary').textContent=`Preset ${storePreview.preset}: ${storePreview.replaces} -> ${storePreview.name}. Permanent. Nog niets opgeslagen.`;
});
el('storeMute').onchange=el('storeFlash').onchange=controls;
el('storeCommit').onclick=()=>run(async()=>{
  const token=storePreview?.token;
  if(!token||!el('storeMute').checked||!el('storeFlash').checked)throw new Error('Bevestig doelopslag en externe demping.');
  storePreview=null;
  const result=await api('store',{token,external_audio_muted:true,confirm_permanent_write:true});
  el('storeSummary').textContent=`Opgeslagen: preset ${result.preset} ${result.name}. Geen herlaad- of luistertest uitgevoerd.`;
});
el('deviceChoice').onchange=()=>{invalidate();note('Klik VERBIND om van apparaat te wisselen. Tot dan verandert de MIDI-verbinding niet.');};
el('variant').onchange=()=>run(async()=>{
  invalidate();if(!el('variant').value)return;
  await api('profile',{variant:el('variant').value});await refresh();
});
el('connectDevice').onclick=()=>run(async()=>{
  const fm9=el('deviceChoice').value==='fm9';
  const r=await fetch('/api/controllers/'+(fm9?'disconnect':'connect'),{method:'POST'});
  if(!r.ok)throw new Error((await r.json()).detail||'Verbinding mislukt. Sluit Axe-Edit en andere TC-sessies.');
  if(fm9){location.href='/';return;}await refresh();
});
el('newDesign').onclick=()=>run(async()=>{
  if((el('prompt').value||proposal)&&!confirm('Nieuw ontwerp beginnen? Het verzoek en voorstel worden gewist, niet de Fractal.'))return;
  await api('discard',{});invalidate();el('prompt').value='';audioReference=null;el('audioFile').value='';
  clearRouteExploration();
  el('conversationPanel').hidden=true;el('requestPanel').open=true;el('requestPreview').hidden=true;
  el('emptyConversation').hidden=false;el('resultText').textContent='';stage(0);
  el('result').hidden=true;el('audioStatus').textContent='Een link in het verzoek wordt automatisch gebruikt.';
  // Focus after the busy guard releases the input.
  setTimeout(()=>el('prompt').focus(),0);note('Nieuw ontwerp. Fractal niet gewijzigd.');
});
function showCaptures(result){
  el('namResults').replaceChildren();
  for(const candidate of result.candidates||[]){
    const a=document.createElement('a');a.textContent=candidate.title+' | '+candidate.creator;
    // Only server-generated TONE3000 detail links, never arbitrary metadata URLs.
    a.href='https://www.tone3000.com/tones/'+Number(candidate.id);a.target='_blank';a.rel='noopener noreferrer';
    el('namResults').append(a);
  }
  if(!result.candidates?.length)el('namResults').textContent='Geen kandidaten gevonden. TC verzint geen capture.';
}
async function accountStatus(){
  namAccount=await api('tone3000/status');namSelection=namAccount.selected;
  el('namStatus').textContent=namAccount.connected?'Account verbonden. '+(namAccount.reason||''):namAccount.configured?'Key opgeslagen. Klik SIGN IN.':'Vul eerst je publishable client key in.';
  el('namSelected').textContent=namSelection?.model?`Geselecteerd: ${namSelection.model.name}. Selectie is geen installatie.`:'Nog geen NAM-model geselecteerd.';
  controls();
}
function clearNamPreview(){namPreview=null;el('namInstallPanel').hidden=true;
  for(const id of ['namInstallMute','namInstallFlash','namInstallOverwrite'])el(id).checked=false;}
function clearNamSlots(){namSlots=null;el('namSlot').replaceChildren(new Option('Lees eerst de slots',''));
  captureSlot.replaceChildren(new Option(`Huidige NAM ${String(state?.nam?.slot||1).padStart(3,'0')} behouden`,''));
  el('namSlotsHint').textContent='Lees de NAM-slots en kies waar je de download wilt plaatsen. Er wordt niets automatisch geinstalleerd.';}
el('namSlotsRefresh').onclick=()=>run(async()=>{
  clearNamPreview();clearNamSlots();
  const result=await api('tone3000/slots');
  if(!result.complete||result.slots?.length!==256)throw new Error('De NAM-slotlijst is niet volledig. Geen slot wordt als leeg aangenomen.');
  namSlots=result.slots;el('namSlot').replaceChildren();
  captureSlot.replaceChildren(new Option(`Huidige NAM ${String(state?.nam?.slot||1).padStart(3,'0')} behouden`,''));
  for(const row of namSlots)if(row.occupied)captureSlot.append(new Option(`${String(row.slot).padStart(3,'0')} | ${row.name}`,String(row.slot)));
  for(const row of namSlots){const value=String(row.slot).padStart(3,'0');
    el('namSlot').append(new Option(`${value} | ${row.occupied?'BEZET: '+row.name:'LEEG'}`,String(row.slot)));}
  el('namSlot').value=result.first_available?String(result.first_available):'';
  if(!result.first_available)el('namSlot').prepend(new Option('Alle slots bezet: kies bewust een slot','',true,true));
  el('namSlotsHint').textContent=result.first_available?
    `Eerste lege slot: ${String(result.first_available).padStart(3,'0')}. Wil je de download hier plaatsen? Kies dit of een ander slot en controleer het voorstel.`:
    'Geen lege slots. Kies alleen een gevuld slot als je de bestaande NAM bewust wilt vervangen.';
  el('namSlotsHint').textContent+=' Gevulde slots zijn ook bovenaan bij Geinstalleerde NAM te kiezen voor je presetontwerp. Installeren en in de preset kiezen zijn aparte stappen.';
});
el('namSlot').onchange=()=>{clearNamPreview();controls();};
async function showAccountTones(tones){
  el('namResults').replaceChildren();
  for(const tone of tones){
    const button=document.createElement('button');button.textContent=`${tone.title} | ${tone.creator?.username||'creator'}`;
    button.onclick=()=>run(async()=>{
      const detail=await api('tone3000/tones/'+Number(tone.id));el('namResults').replaceChildren();
      const claim=document.createElement('p');claim.textContent=`${detail.tone?.title||tone.title}: ${detail.tone?.description||''} (creatorclaim, niet gemeten)`;el('namResults').append(claim);
      for(const model of detail.models||[]){const choose=document.createElement('button');choose.textContent='SELECT '+model.name;
        choose.onclick=()=>run(async()=>{invalidate();clearNamPreview();await api('tone3000/select',{tone_id:Number(tone.id),model_id:Number(model.id)});await accountStatus();});el('namResults').append(choose);}
    });el('namResults').append(button);
  }
  if(!tones.length)el('namResults').textContent='Geen kandidaten gevonden. Probeer een versterkernaam of andere zoekterm.';
}
el('namPanel').addEventListener('toggle',()=>{if(el('namPanel').open&&!busy)run(accountStatus);});
el('namSaveKey').onclick=()=>run(async()=>{await api('tone3000/config',{client_id:el('namKey').value.trim()});el('namKey').value='';await accountStatus();});
el('namDisconnect').onclick=()=>run(async()=>{clearNamPreview();await api('tone3000/disconnect',{});await accountStatus();});
el('namSearch').onclick=()=>run(async()=>{
  if(el('namFormat').value==='ir'){showCaptures(await api('search',{query:el('namQuery').value,format:'ir'}));return;}
  const result=await api('tone3000/tones?query='+encodeURIComponent(el('namQuery').value));await showAccountTones(result.data||[]);
});
el('namSuggest').onclick=()=>run(async()=>{const result=await api('tone3000/suggest',{query:el('namQuery').value,prompt:el('prompt').value.slice(0,4000)});
  await showAccountTones(result.tone?[result.tone]:[]);note(result.reason+' Nog niets geselecteerd of geïnstalleerd.');});
el('namLogin').onclick=()=>run(async()=>{
  const d=await api('tone3000/auth/start',{mode:'signin'});
  const url=new URL(d.url);
  if(url.origin!=='https://www.tone3000.com')throw new Error('Ongeldige aanmeldlink.');
  location.href=url.href;
});
el('namInstallPrepare').onclick=()=>run(async()=>{
  const slot=Number(el('namSlot').value);
  if(!namSelection?.model||!state?.connected||!namSlots||!Number.isInteger(slot)||slot<1||slot>256)throw new Error('Selecteer een model, lees de NAM-slots en kies je doelslot.');
  invalidate();clearNamPreview();await api('discard',{});
  namPreview=await api('tone3000/install/prepare',{model_id:namSelection.model.id,expected_preset:state.preset,slot});
  if(namPreview.slot!==slot)throw new Error('Het installatievoorstel noemt een ander NAM-slot. Niets installeren.');
  const destination=String(slot).padStart(3,'0');
  el('namInstallSummary').textContent=`NAM ${destination}: ${namPreview.existing_name} -> ${namPreview.name}. Permanent; herstelbackup wordt vóór installatie gecontroleerd. Preset ${namPreview.expected_preset} wordt niet opgeslagen.`;
    if(namPreview.name_adjusted)el('namInstallSummary').textContent+=` Catalogusnaam: ${namPreview.source_name}. Alleen de Fractal-naam is aangepast tot maximaal 27 ASCII-tekens; het model blijft hetzelfde.`;
  el('namInstallWarning').textContent=namPreview.existing_occupied?
    'DIT SLOT IS BEZET. Vervangen verandert ook andere presets die dit NAM-slot gebruiken. TC inventariseert die verwijzingen niet; een lege doelpreset voorkomt dit niet.':
    'Dit slot is opnieuw als leeg geverifieerd. TC controleert het nogmaals vóór schrijven. De NAM wordt niet automatisch in een preset geselecteerd.';
  el('namSlotConsent').textContent=namPreview.existing_occupied?
    `Ik bevestig het overschrijven van NAM-slot ${destination}, ook voor andere presets die het gebruiken.`:
    `Ik kies NAM-slot ${destination} voor deze download.`;
  el('namInstallCommit').textContent=`INSTALLEER IN NAM ${destination}`;
  el('namInstallPanel').hidden=false;
});
for(const id of ['namInstallMute','namInstallFlash','namInstallOverwrite'])el(id).onchange=controls;
el('namInstallCommit').onclick=()=>run(async()=>{
  const token=namPreview?.prepared_id;if(!token||!el('namInstallMute').checked||!el('namInstallFlash').checked||!el('namInstallOverwrite').checked)throw new Error('Bevestig de drie installatievoorwaarden.');
  clearNamPreview();invalidate();
  const result=await api('tone3000/install',{prepared_id:token,external_audio_muted:true,confirm_permanent_write:true,confirm_overwrite:true});
  await accountStatus();await refresh();note(`${result.bytes_verified} NAM-bytes gecontroleerd. Geen preset opgeslagen; audio blijft gedempt.`);
});
for(const id of ['namQuery','namWithRequest'])el(id).addEventListener('input',invalidate);
el('audioFile').addEventListener('input',()=>{audioReference=null;invalidate();});
function requestLinks(text){return [...new Set((text.match(/https?:\/\/[^\s<>"\]]+/g)||[]).map(x=>x.replace(/[).,;]+$/,'')))];}
function spectrum(samples,rate){
  const size=2048,real=new Float64Array(size),imag=new Float64Array(size);
  for(let i=0;i<size;i++)real[i]=(samples[i]||0)*(.5-.5*Math.cos(2*Math.PI*i/(size-1)));
  for(let i=1,j=0;i<size;i++){let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)[real[i],real[j]]=[real[j],real[i]];}
  for(let n=2;n<=size;n*=2){for(let start=0;start<size;start+=n){for(let j=0;j<n/2;j++){
    const angle=-2*Math.PI*j/n,c=Math.cos(angle),s=Math.sin(angle),a=start+j,b=a+n/2;
    const r=real[b]*c-imag[b]*s,v=real[b]*s+imag[b]*c;
    real[b]=real[a]-r;imag[b]=imag[a]-v;real[a]+=r;imag[a]+=v;
  }}}
  let total=0,weighted=0;const bands=[0,0,0,0,0];
  for(let i=1;i<size/2;i++){const hz=i*rate/size,power=real[i]**2+imag[i]**2;
    const band=hz<250?0:hz<600?1:hz<2000?2:hz<5000?3:4;bands[band]+=power;total+=power;weighted+=hz*power;}
  return {centroid:total?weighted/total:0,bands:bands.map(x=>total?x/total:0)};
}
async function analyseRequestAudio(){
  const urls=requestLinks(el('prompt').value),file=el('audioFile').files[0];
  if(urls.length>1)throw new Error('Gebruik een audiolink per verzoek.');
  if(file&&urls.length)throw new Error('Gebruik een audiolink OF een bestand, niet beide.');
  if(!file&&!urls.length)return null;
  if(file&&file.size>40*1024*1024)throw new Error('Maximaal 40 MiB audio.');
  const key=file?JSON.stringify([file.name,file.size,file.lastModified]):urls[0];
  if(audioReference&&audioReferenceKey===key){
    el('audioStatus').textContent='Eerder lokaal gemeten klankvoorbeeld hergebruikt; geen tweede download.';
    return audioReference;
  }
  el('audioStatus').textContent='Audio ophalen en lokaal analyseren...';
  let bytes;
  if(file)bytes=await file.arrayBuffer();
  else{
    const response=await fetch('/api/axefx3/audio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:urls[0]})});
    if(!response.ok)throw new Error((await response.json()).detail||'Audio ophalen mislukt.');
    bytes=await response.arrayBuffer();
  }
  const context=new AudioContext();
  try{
    const buffer=await context.decodeAudioData(bytes),limit=Math.min(buffer.length,Math.floor(buffer.sampleRate*60));
    const step=Math.max(1,Math.floor(buffer.sampleRate/16000)),mono=new Float32Array(Math.ceil(limit/step));
    for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0,j=0;i<limit;i+=step,j++)mono[j]+=data[i]/buffer.numberOfChannels;}
    let power=0,peak=0;for(const x of mono){power+=x*x;peak=Math.max(peak,Math.abs(x));}
    if(peak<1e-7)throw new Error('Audiofragment bevat geen meetbaar signaal.');
    const rms=Math.sqrt(power/mono.length),db=x=>20*Math.log10(Math.max(x,1e-7));
    const count=Math.min(32,Math.max(1,Math.floor(mono.length/2048))),bands=[0,0,0,0,0];let centroid=0;
    for(let i=0;i<count;i++){const offset=Math.floor(i*(mono.length-2048)/Math.max(1,count-1));
      const frame=spectrum(mono.subarray(Math.max(0,offset),Math.max(0,offset)+2048),buffer.sampleRate/step);
      centroid+=frame.centroid/count;for(let b=0;b<5;b++)bands[b]+=frame.bands[b]/count;
    }
    const measured={url:urls[0]||null,file_name:file?.name?.slice(0,180)||null,sample_seconds:limit/buffer.sampleRate,
      rms_dbfs:db(rms),peak_dbfs:db(peak),crest_db:db(peak)-db(rms),centroid_hz:centroid,band_energy:bands};
    el('audioStatus').textContent=`${measured.sample_seconds.toFixed(1)} s lokaal gemeten, RMS ${measured.rms_dbfs.toFixed(1)} dBFS. Geen gitaarisolatie of directe AI-beluisering.`;
    audioReferenceKey=key;
    return measured;
  }finally{await context.close();}
}
function showDesign(plan){
  const design=plan.design, controller=plan.controller;
  if(plan.mode==='serial'){
    el('toneChoice').textContent='Gemeten AMP/CAB-testketen: bestaande/standaard modellen behouden, geen model- of IR-keuze.';
    el('controllerChoice').textContent='Wah en andere reserveblokken bypassed; geen nieuwe controllerkoppeling.';
    el('planWarnings').replaceChildren();for(const warning of plan.warnings||[]){const li=document.createElement('li');li.textContent=warning;el('planWarnings').append(li);}
    el('sceneTable').hidden=false;el('sceneRows').replaceChildren();
    const row=document.createElement('tr');
    for(const value of [`1. ${design.scene_name} / A`,`${design.amp.gain} / ${design.amp.level} dB`,'Uit',design.chorus.active?`${design.chorus.rate_hz} Hz / mix ${design.chorus.mix}%`:'Uit',design.delay.active?`${design.delay.time_ms} ms / feedback ${design.delay.feedback}% / mix ${design.delay.mix}%`:'Uit','Niet in route','Reserveblokken bypassed']){const td=document.createElement('td');td.textContent=value;row.append(td);}
    el('sceneRows').append(row);return;
  }
  if(plan.mode==='nam'){
    el('toneChoice').textContent=`NAM ${String(plan.capture.slot||1).padStart(3,'0')}: ${plan.capture.name} | Cab ${design.cab_active?'bestaand behouden':'bypassed'}`;
    el('controllerChoice').textContent='FW33 controllerwrites niet gemeten; geen nieuwe koppeling.';
    el('planWarnings').replaceChildren();for(const warning of plan.warnings||[]){const li=document.createElement('li');li.textContent=warning;el('planWarnings').append(li);}
    el('sceneTable').hidden=false;el('sceneRows').replaceChildren();
    for(const [i,scene] of design.scenes.entries()){const tr=document.createElement('tr');
      for(const value of [`${i+1}. ${scene.name} / ${'AB'[i]}`,`NAM input ${scene.nam.input_gain} dB / level ${scene.nam.level} dB`,'Niet in route',scene.chorus?'Aan (gedeeld A)':'Uit',scene.delay?`${design.delay.time_ms} ms (gedeeld A)`:'Uit',scene.reverb?'Aan (gedeeld A)':'Uit','Geen onbewezen extra pedals']){const td=document.createElement('td');td.textContent=value;tr.append(td);}el('sceneRows').append(tr);
    }return;
  }
  const cabs=(plan.cab_choices||[]).map(cab=>`${cab.side}: ${cab.name} (${cab.position})`).join(' | ');
  el('toneChoice').textContent=cabs?`Amp: ${design?.amp_model||'?'} | ${cabs}`:design?`Amp: ${design.amp_model} | IR1: wire-bank ${design.cab_left.bank}, slot ${design.cab_left.slot}`+
    (design.cab_right?` | IR2: bank ${design.cab_right.bank}, slot ${design.cab_right.slot}`:' | IR2-4 gedempt'):'';
  if(design?.scenes.some(scene=>scene.amp_model||scene.cab_left))el('toneChoice').textContent='Amp- en cabkeuze per scene: zie de scenetabel met model, IR-naam, bank en kanaal.';
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
    const extras=[];
    for(const [key,label] of [['drive','Drive'],['compressor','Compressor'],['geq','GEQ'],['peq','PEQ']]){
      const config=scene[key];
      if(!config){
        const family={drive:'FUZZ',compressor:'COMP',geq:'GEQ',peq:'PEQ'}[key];
        if(plan.actions.some(a=>a.kind==='add_block'&&String(a.block).toUpperCase()===family))extras.push(`${label}: uit (niet gevraagd)`);
        continue;
      }
      const model=config.model?` | ${config.model}`:'';
      if(!config.active){extras.push(`${label}: uit${model}`);continue;}
      const value=key==='drive'?`gain ${config.drive}, tone ${config.tone}, level ${config.level}/10, mix ${config.mix}%`:
        key==='compressor'?`threshold ${config.threshold} dB, ratio ${config.ratio}, attack ${config.attack_ms} ms, release ${config.release_ms} ms, mix ${config.mix}%, level ${config.level} dB`:
        key==='geq'?`10 banden ${config.gains.join('/')} dB, level ${config.level} dB`:
        `banden ${config.bands.map(b=>`${b.frequency_hz} Hz/${b.gain} dB`).join(', ')}, Q behouden, level ${config.level} dB`;
      extras.push(`${label}: ${value}${model}`);
    }
    const channels=plan.scene_channels;
    const ampChannel=channels?.DISTORT?.[i]??i;
    const mapping=channels?Object.entries(channels).filter(([family])=>!['FUZZ','COMP','GEQ','PEQ'].includes(family)||scene[{FUZZ:'drive',COMP:'compressor',GEQ:'geq',PEQ:'peq'}[family]]).map(([family,values])=>`${family} ${'ABCD'[values[i]]}`).join(' | '):'';
    const cabInfo=plan.scene_cabs?.[i]?.choices.map(cab=>`${cab.side}: ${cab.name} (${cab.position})`).join(' | ');
    const label=`${i+1}. ${scene.name} / ${'ABCD'[ampChannel]}`;
    for(const value of [label,`${scene.amp_model||design.amp_model} | gain ${scene.amp.gain} / ${scene.amp.level} dB | Output ${scene.output_level??-6} dB`,scene.wah?'Aan':'Uit',chorus,delay,reverb,[extras.join('\n')||'Bestaand behouden',cabInfo,mapping].filter(Boolean).join('\n')]){
      const td=document.createElement('td');td.textContent=value;tr.append(td);
    }
    el('sceneRows').append(tr);
  }
}
el('generate').onclick=()=>run(async()=>{
  invalidate();el('result').hidden=true;
  note('AI werkt het voorstel uit. Er wordt nog niets naar de Fractal gestuurd...');
  stage(1);
  if(el('namWithRequest').checked&&!el('namQuery').value.trim())throw new Error('Vul een Tone3000-zoekterm in, of schakel zoeken bij dit voorstel uit.');
  if(state.route_options_supported&&!routeExploration?.routes.some(r=>r.mode===el('buildRoute').value&&r.enabled))throw new Error('Verken eerst de routes en kies een uitvoerbare bouwroute.');
  if(sourceKind.value==='rig'&&el('audioFile').files.length)throw new Error('Rig-uitleg gebruikt tekst of een YouTube-link. Verwijder het klankbestand of kies klankvoorbeeld.');
  audioReference=sourceKind.value==='rig'?null:await analyseRequestAudio();
  proposal=await api('plan',{prompt:el('prompt').value,expected_preset:state.preset,scenes:Number(el('scenes').value),wah_source:el('wah').value||null,
    wah_auto_engage:el('wah').value?(el('wahMode').value||null):null,audio_reference:audioReference,
    ...(state.route_options_supported?{mode:el('buildRoute').value}:{}),
    nam_query:el('namWithRequest').checked?(el('namQuery').value||null):null,
    ...(state.nam_selection_supported&&el('buildRoute').value!=='serial'?{nam_slot:captureSlot.value?Number(captureSlot.value):null}:{}),
    ...(state.source_support?.rig_reader?{source_kind:sourceKind.value,rig_mode:rigMode.value}:{})});
  el('conversation').textContent=proposal.summary;el('conversationPanel').hidden=false;
  el('emptyConversation').hidden=true;
  if(proposal.capture_search)showCaptures(proposal.capture_search);
  el('summary').textContent=proposal.summary;el('planName').textContent=proposal.name;
  el('who').textContent=`AI: ${proposal.backend||'onbekend'} / ${proposal.model||'onbekend'} | Doel: preset ${proposal.target.preset} | Voorstel 10 minuten geldig`+
    (proposal.capture?` | NAM ${String(proposal.capture.slot).padStart(3,'0')}: ${proposal.capture.name}`:'');
  el('sceneNames').textContent=proposal.scenes.map((name,i)=>`${i+1}. ${name}`).join('\n');
  showDesign(proposal);
  el('rigReport').hidden=!proposal.rig_report;el('rigComponents').replaceChildren();
  if(proposal.rig_report){
    el('sourceTitle').textContent=`${proposal.source?.title||'Geplakte rig-uitleg'} | ${proposal.rig_report.mode} | lezer: ${proposal.source?.spec?.reader?.backend||'onbekend'}`;
    for(const entry of Object.values(proposal.rig_report.status.nodes)){
      const li=document.createElement('li');li.textContent=`${entry.label}: ${entry.state} (${entry.provenance}) - ${entry.reason}`;el('rigComponents').append(li);
    }
    for(const entry of Object.values(proposal.rig_report.status.edges)){
      if(entry.state==='not_reproduced'){const li=document.createElement('li');li.textContent=`Verbinding: ${entry.reason}`;el('rigComponents').append(li);}
    }
  }
  el('route').textContent=proposal.required_route.join(' → ');
  el('actionCount').textContent=`Bekijk alle ${proposal.actions.length} wijzigingen`;
  el('actions').replaceChildren();
  for(const action of proposal.actions){const li=document.createElement('li');li.textContent=JSON.stringify(action);el('actions').append(li);}
  el('requestPreview').textContent=el('prompt').value.slice(0,160)+(el('prompt').value.length>160?'...':'');
  el('requestPreview').hidden=false;el('requestPanel').open=false;
  el('confirmTarget').textContent=`Preset ${proposal.target.preset}: ${proposal.name}`;
  el('confirmScope').textContent=`${proposal.actions.length} wijzigingen; ${proposal.scenes.length} ingerichte scenes. Gedeelde kanalen kunnen andere scenes raken.`;
  stage(1);el('planPanel').focus();note('Voorstel klaar. Ga via REVIEW CHANGES naar controle en bevestiging.');
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
  if(currentStage!==3)throw new Error('Ga eerst naar CONFIRM.');
  const token=proposal.token;invalidate();note('Bezig met gecontroleerd verzenden. Laat de externe audio gedempt.');
  stage(4);
  let result;
  try{result=await api('send',{token,target_confirmed:true,external_audio_muted:true});}
  catch(e){throw new Error('Verzending niet bevestigd. Houd audio gedempt; niet automatisch opnieuw verzenden. '+e.message);}
  el('resultTitle').textContent=result.ok?'Schrijfopdrachten teruggelezen en bevestigd':'Verzending gestopt';
  el('resultText').textContent=`${result.results.filter(r=>r.ok).length} acties bevestigd; ${result.skipped} overgeslagen.\n`+
    (result.detail||'')+'\n'+result.results.filter(r=>!r.ok).map(r=>r.detail).join('\n')+
    '\nNiets permanent opgeslagen. Controleer fysieke pedalen, klank en balans apart op laag fysiek volume.';
  await refresh();stage(4);el('result').focus();
  note(result.ok?'Bouw afgerond, geen hoorbaar resultaat gemeten.':'Gestopt. Gedeeltelijke wijzigingen kunnen achterblijven; houd audio gedempt.');
});
run(refresh);
