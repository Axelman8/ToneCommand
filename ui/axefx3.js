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
let refineContext=null,adjusting=false;
let intakeResolution={},intakeSceneCount=null;
let dialogueToken=null,dialogueQuestions=[],dialogueAnswers={},lastDialogueRoute='';
const dialogueHistory=document.createElement('div');dialogueHistory.id='dialogueHistory';dialogueHistory.hidden=true;
el('conversation').after(dialogueHistory);
const intakePanel=document.createElement('section');intakePanel.id='requestQuestions';intakePanel.hidden=true;
intakePanel.setAttribute('aria-label','Verduidelijk je verzoek');
el('routeOptionsPanel').before(intakePanel);
function resetDialogue(){dialogueToken=null;dialogueQuestions=[];dialogueAnswers={};lastDialogueRoute='';dialogueHistory.replaceChildren();dialogueHistory.hidden=true;
  if(intakePanel.querySelector('[data-ai-answer]')){intakePanel.replaceChildren();intakePanel.hidden=true;}}
function resetIntake(){resetDialogue();intakeResolution={};intakeSceneCount=null;intakePanel.replaceChildren();intakePanel.hidden=true;}
function dialoguePayload(){return state?.ai_clarification_supported?{dialogue_token:dialogueToken,
  answers:dialogueQuestions.map(q=>({id:q.id,text:dialogueAnswers[q.id]||''}))}:{};}
function receiveDialogue(result){
  if(!Object.hasOwn(result,'dialogue_token'))return;
  dialogueToken=result.dialogue_token;dialogueAnswers={};
  dialogueQuestions=result.needs_clarification?(result.intake.questions||[]).filter(q=>q.kind==='answer'):[];
  dialogueHistory.replaceChildren();
  for(const turn of result.dialogue_history||[]){
    if(!turn.answers?.length)continue;
    const question=document.createElement('p');question.className='cmsg';
    question.textContent='TONECOMMAND: '+turn.message+'\n'+turn.questions.map(q=>q.text).join('\n');dialogueHistory.append(question);
    const answer=document.createElement('p');answer.className='cmsg';
    answer.textContent='YOU: '+turn.answers.map(a=>a.text).join('\n\n');dialogueHistory.append(answer);
  }
  dialogueHistory.hidden=!dialogueHistory.childElementCount;
  if(!dialogueHistory.hidden){el('conversationPanel').hidden=false;el('emptyConversation').hidden=true;}
  if(!result.needs_clarification)intakePanel.hidden=true;
}
function showIntake(result){
  intakeSceneCount=result.scenes;el('scenes').value=String(result.scenes);
  intakePanel.replaceChildren();intakePanel.hidden=result.ready;
  if(result.ready)return;
  stage(0);proposal=null;
  const title=document.createElement('h2');title.textContent=result.questions.some(q=>q.kind==='answer')?'TONECOMMAND HEEFT EEN VRAAG':'EVEN AFSTEMMEN VOORDAT TC HET PLAN MAAKT';intakePanel.append(title);
  if(result.message){const message=document.createElement('p');message.textContent=result.message;intakePanel.append(message);}
  for(const question of result.questions){
    const row=document.createElement('label');row.className='intake-question';row.append(document.createTextNode(question.text+' '));
    if(question.kind==='answer'){
      const input=document.createElement('textarea');input.rows=3;input.maxLength=2000;input.dataset.aiAnswer=question.id;
      input.setAttribute('aria-label',question.text);input.placeholder='Jouw antwoord of aanpassing...';input.value=dialogueAnswers[question.id]||'';
      input.oninput=()=>{dialogueAnswers[question.id]=input.value;invalidate();};row.append(input);
      for(const suggestion of question.suggestions||[]){const button=document.createElement('button');button.type='button';button.textContent=suggestion;
        button.onclick=event=>{event.preventDefault();input.value=suggestion;dialogueAnswers[question.id]=suggestion;invalidate();input.focus();};row.append(button);}
    }else if(question.kind==='choice'){
      const select=document.createElement('select');select.dataset.intake=question.id;select.append(new Option('Kies wat je bedoelt',''));
      for(const option of question.options)select.append(new Option(option.label,option.value));
      select.value=intakeResolution[question.id]||'';
      select.onchange=()=>{intakeResolution[question.id]=select.value||null;invalidate();};row.append(select);
    }else if(question.kind==='omission'){
      const input=document.createElement('input');input.type='checkbox';input.dataset.intake=question.id;
      input.checked=(intakeResolution.accepted_omissions||[]).includes(question.id);
      input.onchange=()=>{const chosen=new Set(intakeResolution.accepted_omissions||[]);input.checked?chosen.add(question.id):chosen.delete(question.id);
        intakeResolution.accepted_omissions=[...chosen];invalidate();};
      row.prepend(input);row.append(document.createTextNode(' Ja, dit onderdeel uitstellen.'));
    }else if(question.kind==='scenes'){
      const select=document.createElement('select');select.dataset.intake='scene_count';select.append(new Option('Kies expliciet het sceneaantal',''));
      for(let n=1;n<=8;n++)select.append(new Option(String(n),String(n)));
      select.onchange=()=>{if(!select.value)return;el('scenes').value=select.value;intakeSceneCount=Number(select.value);intakeResolution.scene_count_override=true;invalidate();};row.append(select);
    }
    intakePanel.append(row);
  }
  const hint=document.createElement('p');hint.textContent='Je oorspronkelijke verzoek blijft behouden. Zonder jouw keuze wordt geen onvolledig plan gemaakt. Er wordt niets verzonden.';intakePanel.append(hint);
  const next=document.createElement('button');next.type='button';next.textContent=result.questions.some(q=>q.kind==='answer')?'VERSTUUR ANTWOORD':'VERDER MET MIJN ANTWOORDEN';next.onclick=()=>el('generate').click();intakePanel.append(next);
  intakePanel.scrollIntoView({block:'nearest'});note(result.questions.some(q=>q.kind==='answer')?
    'ToneCommand wacht op je antwoord. Vul het lege veld in en klik VERSTUUR ANTWOORD; Enter maakt een nieuwe regel.':
    'TC wacht op je keuze bij EVEN AFSTEMMEN. Daarna maakt TC alleen een voorstel.');
}
async function ensureIntake(mode){
  if(dialogueQuestions.some(q=>!dialogueAnswers[q.id]?.trim())){
    note('Beantwoord de openstaande vraag van ToneCommand en klik VERSTUUR ANTWOORD. Je verzoek blijft behouden.');
    intakePanel.scrollIntoView({block:'nearest'});return false;
  }
  if(!state?.request_intake_supported)return true;
  const result=await api('intake',{prompt:el('prompt').value,expected_preset:state.preset,mode,scenes:Number(el('scenes').value),
    resolution:intakeResolution,refining:adjusting,wah_source:el('wah').value||null});
  if(!result.ready||!dialogueQuestions.length)showIntake(result);return result.ready;
}
const ampRefreshButton=document.createElement('button');ampRefreshButton.id='ampRefresh';ampRefreshButton.textContent='REFRESH AMP MODELS';
const ampRefreshStatus=document.createElement('p');ampRefreshStatus.id='ampRefreshStatus';ampRefreshStatus.setAttribute('role','status');
const ampChanges=document.createElement('ul');ampChanges.id='ampChanges';ampChanges.style.maxHeight='200px';ampChanges.style.overflow='auto';ampChanges.hidden=true;
el('ampCount').after(ampRefreshButton,ampRefreshStatus,ampChanges);
const intentPanel=document.createElement('section');intentPanel.id='sceneIntent';intentPanel.hidden=true;
el('controllerChoice').after(intentPanel);
const refineButton=document.createElement('button');refineButton.id='refineSound';refineButton.textContent='BIJSTUREN NA LUISTERTEST';refineButton.hidden=true;
el('returnRequest').after(refineButton);
const adjustPanel=document.createElement('fieldset');adjustPanel.id='adjustScenes';adjustPanel.hidden=true;
el('requestOptions').after(adjustPanel);
const comparisonPanel=document.createElement('details');comparisonPanel.id='audioComparePanel';comparisonPanel.hidden=true;
comparisonPanel.innerHTML='<summary>OPNAME VERGELIJKEN</summary><p>Vergelijk een zelf opgenomen gitaarfragment met het klankvoorbeeld uit SONG / AUDIO of je verzoek. Gebruik dezelfde passage en vergelijkbare aanslag. Dit is geen automatische klankscore.</p><label>Eigen opname <input id="recordingFile" type="file" accept="audio/*"></label><label>Start (seconden) <input id="recordingStart" type="number" min="0" max="86400" step="0.25" value="0"></label><label>Lengte (maximaal 60 seconden) <input id="recordingLength" type="number" min="0.25" max="60" step="0.25" value="20"></label><button id="compareAudio">VERGELIJK FRAGMENTEN</button><p id="comparisonStatus" role="status">Alleen lokale analyse; geen opname, afspelen, AI-aanroep of verzending naar de Fractal.</p><div id="comparisonResults"></div>';
el('rightrail').prepend(comparisonPanel);
function clearAudioComparison(){el('comparisonResults').replaceChildren();el('comparisonStatus').textContent='Bron of opname gewijzigd. Vergelijk de fragmenten opnieuw.';}
for(const id of ['recordingFile','recordingStart','recordingLength'])el(id).addEventListener('input',clearAudioComparison);
function enterRefinement(){
  if(!refineContext)return;
  resetIntake();
  adjusting=true;invalidate();el('buildRoute').value=refineContext.mode;
  el('scenes').value=String(refineContext.count);el('prompt').value='';
  adjustPanel.replaceChildren();const legend=document.createElement('legend');legend.textContent='Welke scenes bijsturen? Andere scene-instellingen blijven beschermd.';adjustPanel.append(legend);
  for(let n=1;n<=refineContext.count;n++){
    const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=String(n);
    input.addEventListener('change',invalidate);label.append(input,document.createTextNode(` Scene ${n} `));adjustPanel.append(label);
  }
  adjustPanel.hidden=false;el('generate').textContent='VOORSTEL VOOR AANPASSING';
  el('requestPanel').open=true;stage(0);controls();el('prompt').focus();
  note('Beschrijf wat je hoort en wat moet veranderen. Selecteer scenes. Voor FW33 AMP/CAB eerst scene 1 selecteren; opnieuw bevestigen voor SEND.');
}
refineButton.onclick=()=>{if(!busy)enterRefinement();};
function clearRouteExploration(){routeExploration=null;el('buildRoute').value=adjusting&&refineContext?refineContext.mode:'';el('routeOptions').replaceChildren();el('routeReason').textContent=adjusting?'Bestaande bouwroute behouden bij deze luisteraanpassing.':'Vul je verzoek in en klik GENERATE PLAN. TC onderzoekt eerst de routes; NAM wordt niet automatisch gekozen.';}
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
sourceKind.onchange=()=>{resetIntake();modeLabel.hidden=sourceKind.value!=='rig';audioReference=null;invalidate();
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
  historyControls();
  comparisonPanel.hidden=state?.audio_analysis_version!==2;
  for(const id of ['compareAudio','recordingFile','recordingStart','recordingLength'])el(id).disabled=busy;
  ampRefreshButton.disabled=busy||!state?.connected||!state?.amp_refresh_supported;
  el('target').disabled=busy||!state?.connected||!state?.navigation_supported;
  const switchingDevice=el('deviceChoice').value==='fm9';
  el('connectDevice').textContent=switchingDevice?'OPEN FM9':state?.connected?'VERBONDEN':'VERBIND';
  el('connectDevice').classList.toggle('linked',!!state?.connected&&!switchingDevice);
  el('connectDevice').title=switchingDevice?'Open de FM9-interface en geef eerst de FX3 MIDI-poort vrij.':state?.connected?`Axe-Fx III | ${state.firmware}`:'Verbind met de Fractal';
  el('navigationSelect').disabled=busy||!navigationPreview||!el('navigationMute').checked||(navigationPreview.kind==='preset'&&!el('navigationDiscard').checked);
  for(const button of el('sceneRack').querySelectorAll('button'))button.disabled=busy||!state?.navigation_supported;
  const chooseRoute=!!state?.route_options_supported;
  el('routeOptionsPanel').hidden=!chooseRoute;
  el('exploreRoutes').disabled=busy||adjusting||!state?.connected||!el('prompt').value.trim();
  el('buildRoute').disabled=busy||adjusting||!routeExploration;
  const sourceSupported=!!state?.source_support?.rig_reader;
  sourceLabel.hidden=!sourceSupported;modeLabel.hidden=!sourceSupported||sourceKind.value!=='rig';
  if(!sourceSupported){sourceKind.value='tone';rigMode.value='closest';}
  sourceKind.disabled=busy;rigMode.disabled=busy;
  const serial=el('buildRoute').value==='serial';
  const album=el('buildRoute').value==='amp'&&!!state?.album_build_supported;
  const albumCounts=state?.album_scene_counts?.length?state.album_scene_counts:[8];
  const albumCountText=albumCounts.length===1&&albumCounts[0]===8?'acht':albumCounts.length===8&&albumCounts.every((n,i)=>n===i+1)?'1-8':albumCounts.join('/');
  el('buildRoute').querySelector('option[value="amp"]').textContent=state?.album_build_supported?`AMP / CAB: ${albumCountText} scenes met klankdoelen`:'AMP / CAB + pedals';
  const serialOption=el('buildRoute').querySelector('option[value="serial"]');
  serialOption.hidden=!state?.serial_build_supported;
  serialOption.disabled=!state?.serial_build_supported||sourceKind.value==='rig';
  captureLabel.hidden=!state?.nam_selection_supported||(state?.route_options_supported&&el('buildRoute').value!=='nam');
  captureSlot.disabled=busy||!state?.nam_selection_supported;
  for(const id of ['refresh','generate','cabImport','prompt','scenes','wah','cabKind','cabFile','discard','variant','deviceChoice','connectDevice','newDesign','audioFile','audioStart','audioLength','namQuery','namFormat','namSearch','namLogin','namWithRequest','editRequest','toReview','backPlan','toConfirm','backReview','returnRequest']) el(id).disabled=busy;
  el('connectDevice').disabled=busy||(!!state?.connected&&!switchingDevice);
  el('wahMode').disabled=busy||!el('wah').value;
  const fw33=state?.firmware==='33.00-beta.20261006';
  const awaitingRoute=chooseRoute&&!el('buildRoute').value&&!adjusting;
  const ampAvailable=awaitingRoute&&!!state?.album_build_supported;
  const maxScenes=album||ampAvailable?Math.max(...albumCounts):serial?1:fw33?(state.route?.length?2:1):state?.multiscene_planning_supported?8:4;
  for(const option of el('scenes').options)option.disabled=album||ampAvailable?!albumCounts.includes(Number(option.value)):Number(option.value)>maxScenes;
  if(intakeSceneCount===null){
    if((album||ampAvailable)&&!albumCounts.includes(Number(el('scenes').value)))el('scenes').value=String(albumCounts[0]);
    if(Number(el('scenes').value)>maxScenes)el('scenes').value=String(maxScenes);
  }
  el('requestOptionsSummary').textContent=`ONTWERPOPTIES: ${el('scenes').value} SCENE(S), BRON EN CONTROLLERS`;
  el('generate').disabled=busy||el('deviceChoice').value!=='axefx3'||!state?.connected||!!state.route_problem||(!fw33&&!state.cab_count);
  if((serial||album)&&state?.scene!==1)el('generate').disabled=true;
  const chosenRoute=routeExploration?.routes.find(r=>r.mode===el('buildRoute').value);
  if(chooseRoute&&!adjusting&&chosenRoute&&!chosenRoute.enabled)el('generate').disabled=true;
  el('generate').textContent=adjusting?'VOORSTEL VOOR AANPASSING':chooseRoute&&routeExploration&&!chosenRoute?'CHOOSE ROUTE':'GENERATE PLAN';
  if(!intakePanel.hidden)el('generate').textContent='VERDER MET MIJN ANTWOORDEN';
  if(dialogueQuestions.length)el('generate').textContent='VERSTUUR ANTWOORD';
  el('requestNext').textContent=busy?'TC is bezig. Je verzoek blijft behouden; wacht op de uitkomst.':
    !state?.connected?'Verbind eerst de Fractal; er wordt niets automatisch verzonden.':
    switchingDevice?'Klik OPEN FM9 om naar de geselecteerde apparaatinterface te gaan.':
    state.route_problem?state.route_problem:
    !fw33&&!state.cab_count?'Importeer eerst een beschikbare cabnamenlijst via CAB LIBRARY.':
    (serial||album)&&state.scene!==1?'Selecteer eerst scene 1 via de scenebalk. Niet-opgeslagen presetwijzigingen worden daardoor niet opgeslagen.':
    adjusting?'Selecteer de scenes en beschrijf je luisterfeedback. De knop maakt alleen een nieuw voorstel.':
    chooseRoute&&!routeExploration?'Begin met je verzoek en GENERATE PLAN. TC onderzoekt de routes en vraagt daarna om jouw keuze.':
    chooseRoute&&!chosenRoute?'TC wacht op je bouwroute. Klik CHOOSE ROUTE of open BOUWROUTE KIEZEN.':
    chosenRoute&&!chosenRoute.enabled?chosenRoute.reason:
    `Volgende stap: GENERATE PLAN maakt een voorstel voor ${el('scenes').value} scene(s). REVIEW en CONFIRM volgen voor SEND.`;
  if(adjusting){el('scenes').disabled=true;el('wah').disabled=true;el('wahMode').disabled=true;sourceKind.disabled=true;captureSlot.disabled=true;}
  refineButton.hidden=!refineContext;refineButton.disabled=busy;
  for(const input of adjustPanel.querySelectorAll('input'))input.disabled=busy;
  for(const input of intakePanel.querySelectorAll('input,select,textarea,button'))input.disabled=busy;
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
  el('controllerHint').textContent=awaitingRoute?'Kies na het routeadvies AMP/CAB of NAM. Het beschikbare sceneaantal en de bediening hangen af van die route en het geverifieerde apparaatprofiel.':album?`FW33: ${albumCountText} scenes beschikbaar, met klankdoelen en maximaal vier ampvoicings/vier cabkanalen A-D. Geen verplichte sceneparen. Delay/Chorus delen A, Output -18dB. Start op scene 1; alleen vrijgegeven effectprofielen, geen nieuwe controllers.`:serial?'Gemeten AMP/CAB-testketen: uitsluitend scene1/A. Modellen blijven behouden, reserveblokken blijven bypassed. Geen nieuwe controllers.':fw33?'FW33 NAM: eerst 1 scene vanuit leeg; daarna maximaal 2 met NAM A/B. Nieuwe controllerkoppelingen zijn voor dit profiel nog niet geverifieerd.':!el('wah').value?'Geen nieuwe controllerkoppeling. Bestaande Auto Engage blijft behouden en kan de scene-bypass beinvloeden.':
    el('wahMode').value==='Fast Pos'?'Fast Pos: pedaalbeweging kan de Wah ook inschakelen in een scene met Wah uit. Kies Off voor aan/uit via de scenes.':
    el('wahMode').value==='Off'?'Off: het pedaal stuurt de Wah-filterstand, maar schakelt de Wah niet automatisch aan of uit.':
    'Bestaande Auto Engage-modus blijft behouden. Bij een nieuwe koppeling gebruikt het apparaat zijn standaard; controleer het gedrag.';
  if(!fw33&&state?.multiscene_planning_supported)el('controllerHint').textContent+=' Tot acht scenes, maximaal vier verschillende instellingen per blok. Gelijke instellingen delen kanalen; bypass en uitgangsniveau kunnen solo en ritme onderscheiden.';
  if(fw33&&state?.firmware_migration?.wah_controller_workspace){
    el('controllerHint').textContent=el('controllerHint').textContent.replace('Nieuwe controllerkoppelingen zijn voor dit profiel nog niet geverifieerd.','Deze NAM-bouwroute maakt geen nieuwe controllerkoppelingen.');
    el('controllerHint').textContent+=' Wah 1/2 kan op FW33 wel afzonderlijk aan External 1/2 worden gekoppeld via CONTROLLERS onderaan. De bovenstaande ontwerpkeuze is nog niet aangesloten op deze FW33-bouwroute; Volume en pitch zijn hiermee niet vrijgegeven.';
  }
}
function invalidate(){proposal=null;stage(0);el('confirmed').checked=el('muted').checked=false;
  el('rigReport').hidden=true;
  clearNamPreview();
  storePreview=null;el('storeMute').checked=el('storeFlash').checked=false;el('storeSummary').textContent='';
  el('requestPreview').textContent=el('prompt').value.slice(0,160)+(el('prompt').value.length>160?'...':'');controls();}
async function api(name,body,prefix='/api/axefx3/'){
  let r,data;
  try{r=await fetch(prefix+name,body===undefined?{headers:{'X-ToneCommand':'1'}}:{method:'POST',headers:{'Content-Type':'application/json','X-ToneCommand':'1'},body:JSON.stringify(body)});}
  catch(e){
    if(state)state={...state,connected:false};
    throw new Error('Geen antwoord van TC. Controleer de verbinding en gebruik RESCAN. Je verzoek blijft behouden. Controleer na een verzending eerst de apparaatstatus; niet automatisch opnieuw verzenden.');
  }
  try{data=await r.json();}catch(e){
    if(state)state={...state,connected:false};
    throw new Error('TC gaf een ongeldig antwoord. Gebruik RESCAN om de status te controleren. Je verzoek blijft behouden. Niet automatisch opnieuw verzenden.');
  }
  if(!data||typeof data!=='object'||Array.isArray(data)){
    if(state)state={...state,connected:false};
    throw new Error('TC gaf een ongeldig antwoord. Controleer de status met RESCAN; niet automatisch opnieuw verzenden.');
  }
  if(!r.ok&&data.detail?.code==='dialogue_stale'){
    const draft=dialogueQuestions.map(q=>q.text+'\n'+(dialogueAnswers[q.id]||'')).join('\n\n');
    resetDialogue();
    if(draft){const saved=document.createElement('p');saved.className='cmsg';saved.textContent='Eerder antwoord, niet opnieuw verzonden:\n'+draft;
      dialogueHistory.append(saved);dialogueHistory.hidden=false;el('conversationPanel').hidden=false;el('emptyConversation').hidden=true;}
    throw new Error(data.detail.message);
  }
  if(!r.ok)throw new Error(typeof data.detail==='string'?data.detail:(data.error||'Verzoek geweigerd. Lees de status opnieuw.'));
  return data;
}
async function run(work){if(busy)return;busy=true;el('workflowError').hidden=true;controls();try{await work();}catch(e){invalidate();el('workflowError').textContent=e.message;el('workflowError').hidden=false;note(e.message);}finally{busy=false;controls();}}
function renderAmps(amps){
  el('ampCount').textContent=amps?`${amps.count} modellen beschikbaar voor de AMP/CAB-bouwer. De AI kiest uit deze volledige FW33-lijst. Dit verandert niets zonder review en SEND.`:'De volledige FW33-versterkerlijst vereist het ondersteunde MK2-profiel.';
  el('ampModels').replaceChildren();
  if(amps)for(const amp of amps.models){const item=document.createElement('li');item.textContent=amp.name;el('ampModels').append(item);}
}
function renderCabs(){
  const query=el('cabSearch').value.trim().toLocaleLowerCase();
  const all=state?.cab_inventory||[],matches=all.filter(c=>`${c.position} ${c.name}`.toLocaleLowerCase().includes(query));
  el('cabInventoryCount').textContent=`${all.length} niet-lege namen beschikbaar; ${matches.length} treffers${matches.length>100?', eerste 100 getoond. Verfijn je zoekterm.':'.'}`;
  el('cabNames').replaceChildren();
  for(const cab of matches.slice(0,100)){const row=document.createElement('li');row.textContent=`${cab.position}: ${cab.name}${cab.fullres?' (alleen IR3/4)':''}`;el('cabNames').append(row);}
  const mix=state?.cab_mix;el('cabMixer').replaceChildren();
  el('cabMixerNote').textContent=mix?.supported?`Cab 1 / ${'ABCD'[mix.channel]}: actuele onafhankelijke uitlezing.`:(mix?.reason||'Geen geverifieerde actuele mix gelezen.');
  for(const slot of mix?.slots||[]){
    const name=all.find(c=>c.bank===slot.bank&&c.slot===slot.ordinal+1);
    const row=document.createElement('li');row.textContent=`IR${slot.slot}: ${name?.name||`bank ${slot.bank}, positie ${slot.ordinal+1}`} | ${slot.status} | ${slot.level_db}dB | pan ${slot.pan}`;el('cabMixer').append(row);
  }
}
function renderHistory(data){
  el('historyDesign').replaceChildren(new Option('Kies een ontwerp voor de huidige preset',''));
  for(const item of data.designs){
    const option=new Option(`${item.preset}: ${item.name} | ${new Date(item.created).toLocaleString()}`,item.id);
    option.disabled=item.preset!==state?.preset;el('historyDesign').append(option);
  }
  el('historyTarget').checked=el('historyMute').checked=false;
  el('historyStatus').textContent=`${data.designs.length} ontwerpen gevonden${data.unreadable?`; ${data.unreadable} onleesbare records overgeslagen`:''}. Hervatten verzendt geen opgeslagen parameteracties.`;
  historyControls();
}
function historyControls(){
  for(const id of ['historyRefresh','historyDesign','historyTarget','historyMute'])el(id).disabled=busy||!state?.design_history_supported;
  el('historyResume').disabled=busy||!state?.design_history_supported||!!proposal||!el('historyDesign').value||!el('historyTarget').checked||!el('historyMute').checked;
}
el('historyDesign').onchange=()=>{el('historyTarget').checked=el('historyMute').checked=false;historyControls();};
for(const id of ['historyTarget','historyMute'])el(id).onchange=historyControls;
el('historyRefresh').onclick=async()=>{
  if(busy)return;busy=true;controls();historyControls();
  try{renderHistory(await api('history'));}catch(error){el('historyStatus').textContent=error.message;}
  finally{busy=false;controls();historyControls();}
};
el('historyResume').onclick=()=>run(async()=>{
  const draft=el('prompt').value;
  const result=await api('history/resume',{record_id:el('historyDesign').value,expected_preset:state.preset,
    external_audio_muted:el('historyMute').checked,target_confirmed:el('historyTarget').checked});
  await refresh();
  refineContext={token:result.refine_token,count:result.scenes.length,preset:result.preset,mode:result.mode};
  enterRefinement();el('prompt').value=draft;
  el('historyStatus').textContent=result.warning;
  note('Ontwerp opnieuw gecontroleerd. Kies scenes en beschrijf je aanpassing; niets opgeslagen.');
});
el('cabSearch').oninput=renderCabs;
function cabDescription(cab){
  if(!cab.irs)return `${cab.name} | Factory 2 slot ${cab.slot} / ${cab.channel}`;
  const solo=cab.irs.some(ir=>ir.mode==='solo');
  return `${cab.channel}: `+cab.irs.map(ir=>{
    const membership=ir.mode==='mute'?'MUTED':solo&&ir.mode!=='solo'?'EXCLUDED BY SOLO':ir.mode==='solo'?'SOLO':'IN MIX';
    return `IR${ir.ir} ${ir.name} [bank ${ir.bank}, slot ${ir.slot}] ${membership}, ${ir.level_db}dB, pan ${ir.pan}`;
  }).join(' | ');
}
ampRefreshButton.onclick=async()=>{
  if(busy||!state?.connected)return;
  busy=true;controls();ampRefreshStatus.textContent='Firmware en lokale modellenlijst controleren...';ampChanges.replaceChildren();ampChanges.hidden=true;
  try{
    const result=await api('amps/refresh',{expected_firmware:state.firmware});
    renderAmps(result.inventory);ampRefreshStatus.textContent=result.message;
    ampRefreshStatus.className=result.status==='up_to_date'?'':'warning';
    for(const [key,label] of [['added','Nieuw, nog geblokkeerd'],['changed','Gewijzigd, nog geblokkeerd'],['removed','Ontbreekt in lokale cache']]){
      for(const model of result[key]){const row=document.createElement('li');row.textContent=`${label}: ${model.name}${model.verified_name?' (geverifieerd: '+model.verified_name+')':''}`;ampChanges.append(row);}
    }
    ampChanges.hidden=!ampChanges.childElementCount;
  }catch(error){ampRefreshStatus.className='warning';ampRefreshStatus.textContent=error.message;}
  finally{busy=false;controls();}
};
async function refresh(){
  resetIntake();
  const priorState=state,priorRoute=el('buildRoute').value,priorScenes=el('scenes').value;
  navigationPreview=null;el('navigationDialog').close();
  clearRouteExploration();invalidate();clearNamSlots();state=null;state=await api('state');
  if(!adjusting&&priorState?.connected&&state.connected&&priorState.preset===state.preset&&priorState.firmware===state.firmware&&priorState.profile?.variant===state.profile?.variant&&priorRoute){
    el('buildRoute').value=priorRoute;el('scenes').value=priorScenes;
    el('routeReason').textContent='Bouwroute en sceneaantal behouden. Verken de routes opnieuw voordat je een nieuw plan maakt; niets is verzonden.';
  }
  if(refineContext&&state.preset!==refineContext.preset){refineContext=null;adjusting=false;adjustPanel.hidden=true;el('generate').textContent='GENERATE PLAN';clearRouteExploration();}
  el('workspaceIdentity').textContent='TC FX3'+(state.workspace?.revision?' '+state.workspace.revision:'');
  el('workspaceIdentity').title=state.workspace?`${state.workspace.source_root} | PID ${state.workspace.pid}`:'Werkruimte-identiteit niet beschikbaar; controleer je startscript.';
  el('target').textContent=state.connected?`Preset ${state.preset}: ${state.name} \u25be`:'Verbind eerst via Verbinding & controllers.';
  el('target').title=state.connected?`Axe-Fx III | ${state.firmware} | Preset ${state.preset}: ${state.name} | Scene ${state.scene}. Klik om een preset te kiezen.`:'Verbind eerst via Verbinding & controllers.';
  el('connectDevice').title=state.connected?`Axe-Fx III | ${state.firmware}`:'Verbind met de Fractal';
  el('cabCount').textContent=state.connected?`${state.cab_count} geimporteerde naamposities. ${state.cab_metadata_note||''} ${state.cab_selection_note||''}`:'';
  renderAmps(state.amp_inventory);ampRefreshStatus.textContent='';ampChanges.replaceChildren();ampChanges.hidden=true;
  renderCabs();
  el('historyPanel').hidden=!state.design_history_supported;
  if(state.design_history_supported){
    try{renderHistory(await api('history'));}catch(error){el('historyStatus').textContent=error.message;}
  }
  historyControls();
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
el('prompt').addEventListener('input',()=>{resetIntake();clearRouteExploration();controls();});
el('scenes').addEventListener('change',()=>{resetDialogue();intakeResolution.scene_count_override=true;intakeSceneCount=Number(el('scenes').value);});
el('audioFile').addEventListener('input',()=>{resetDialogue();clearRouteExploration();controls();});
el('buildRoute').onchange=()=>{if(lastDialogueRoute&&lastDialogueRoute!==el('buildRoute').value)resetDialogue();lastDialogueRoute=el('buildRoute').value;
  intakeResolution.accepted_omissions=[];intakePanel.hidden=true;invalidate();const choice=routeExploration?.routes.find(r=>r.mode===el('buildRoute').value);
  el('routeReason').textContent=choice?choice.reason:'Kies zelf NAM of AMP/CAB.';controls();};
async function exploreRequestRoutes(){
  if(!el('prompt').value.trim())throw new Error('Beschrijf eerst de gewenste sound of voeg een link toe.');
  if(!await ensureIntake('auto'))return;
  clearRouteExploration();invalidate();await api('discard',{});
  note('TC onderzoekt je verzoek en de beschikbare bouwroutes. Er wordt niets naar de Fractal gestuurd...');
  if(sourceKind.value==='rig'&&el('audioFile').files.length)throw new Error('Rig-uitleg gebruikt tekst of een YouTube-link. Verwijder het klankbestand of kies klankvoorbeeld.');
  audioReference=sourceKind.value==='rig'?null:await analyseRequestAudio();
  const result=await api('options',{prompt:el('prompt').value,expected_preset:state.preset,audio_reference:audioReference,source_kind:sourceKind.value,
    ...dialoguePayload(),
    ...(state.request_intake_supported?{resolution:intakeResolution,scenes:Number(el('scenes').value)}:{})});
  receiveDialogue(result);
  if(result.needs_clarification){showIntake(result.intake);return;}
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
  el('routeOptionsPanel').scrollIntoView({block:'nearest'});
  note('Routes onderzocht. Kies NAM of AMP/CAB; niets geselecteerd, geinstalleerd of verzonden.');
}
el('exploreRoutes').onclick=()=>run(exploreRequestRoutes);
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
  el('storeSummary').textContent=`Preset ${storePreview.preset}: ${storePreview.replaces} -> ${storePreview.name}. Permanent. Nog niets opgeslagen. ${storePreview.verification_note||''}`;
});
el('storeMute').onchange=el('storeFlash').onchange=controls;
el('storeCommit').onclick=()=>run(async()=>{
  const token=storePreview?.token;
  if(!token||!el('storeMute').checked||!el('storeFlash').checked)throw new Error('Bevestig doelopslag en externe demping.');
  storePreview=null;
  const result=await api('store',{token,external_audio_muted:true,confirm_permanent_write:true});
  el('storeSummary').textContent=`Opgeslagen: preset ${result.preset} ${result.name}. Geen herlaad- of luistertest uitgevoerd.`;
});
el('deviceChoice').onchange=()=>{invalidate();note('Bevestig je apparaatkeuze via de knop rechtsboven. Tot dan verandert de MIDI-verbinding niet.');};
el('variant').onchange=()=>run(async()=>{
  invalidate();if(!el('variant').value)return;
  await api('profile',{variant:el('variant').value});await refresh();
});
el('connectDevice').onclick=()=>run(async()=>{
  const fm9=el('deviceChoice').value==='fm9';
  if(fm9&&(el('prompt').value||proposal)&&!confirm('FM9-interface openen? De verzoektekst wordt niet meegenomen. De Fractal wordt niet opgeslagen of herladen.'))return;
  await api(fm9?'disconnect':'connect',{},'/api/controllers/');
  if(fm9){location.href='/';return;}await refresh();
});
el('newDesign').onclick=()=>run(async()=>{
  if((el('prompt').value||proposal)&&!confirm('Nieuw ontwerp beginnen? Het verzoek en voorstel worden gewist, niet de Fractal.'))return;
  await api('discard',{});invalidate();el('prompt').value='';audioReference=null;el('audioFile').value='';
  resetIntake();
  el('audioStart').value='0';el('audioLength').value='60';audioReferenceKey='';
  el('recordingFile').value='';clearAudioComparison();
  el('historyTarget').checked=el('historyMute').checked=false;
  refineContext=null;adjusting=false;adjustPanel.hidden=true;el('generate').textContent='GENERATE PLAN';
  clearRouteExploration();
  el('conversationPanel').hidden=true;el('requestPanel').open=true;el('requestPreview').hidden=true;
  el('requestOptions').open=false;el('routeOptionsPanel').open=false;
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
el('audioFile').addEventListener('input',()=>{audioReference=null;clearAudioComparison();invalidate();});
for(const id of ['audioStart','audioLength'])el(id).addEventListener('input',()=>{
  resetDialogue();audioReference=null;audioReferenceKey='';clearAudioComparison();invalidate();clearRouteExploration();
});
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
  return {centroid:total?weighted/total:0,bands:bands.map(x=>total?x/total:0),total,weighted,band_power:bands};
}
async function measureWindowV2(buffer,first,limit){
  const channels=buffer.numberOfChannels,rate=16000;
  if(!Number.isInteger(first)||!Number.isInteger(limit)||first<0||first+limit>buffer.length||channels<1||channels>8||limit<buffer.sampleRate*.25||limit>buffer.sampleRate*60)
    throw new Error('Kies 0,25 tot 60 seconden audio met maximaal acht kanalen.');
  let power=0,peak=0;
  // Meter original samples per channel: opposite phases must not cancel and
  // filtering/downsampling must not hide the original file's sample peaks.
  for(let ch=0;ch<channels;ch++){
    const data=buffer.getChannelData(ch);
    for(let i=first;i<first+limit;i++){
      const x=data[i];if(!Number.isFinite(x))throw new Error('Audio bevat ongeldige samples.');
      power+=x*x;peak=Math.max(peak,Math.abs(x));
    }
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(peak<1e-7)throw new Error('Audiofragment bevat geen meetbaar signaal.');
  // Explicit phase-table, Blackman-windowed sinc resampling. Browser
  // interpolation alone did NOT reject a12kHz alias in the real Chrome test.
  // Original samples remain untouched; no audio is played or uploaded.
  const cutoff=Math.min(7000,buffer.sampleRate*.45),phases=512;
  const radius=Math.min(256,Math.max(32,Math.ceil(buffer.sampleRate/700))),taps=radius*2+1;
  const kernels=Array.from({length:phases},(_,p)=>{
    const kernel=new Float64Array(taps),fraction=p/phases;let sum=0;
    for(let k=0;k<taps;k++){
      const x=k-radius-fraction;
      if(Math.abs(x)>radius)continue;
      const lowpass=Math.abs(x)<1e-12?2*cutoff/buffer.sampleRate:Math.sin(2*Math.PI*cutoff/buffer.sampleRate*x)/(Math.PI*x);
      kernel[k]=lowpass*(.42+.5*Math.cos(Math.PI*x/radius)+.08*Math.cos(2*Math.PI*x/radius));sum+=kernel[k];
    }
    for(let k=0;k<taps;k++)kernel[k]/=sum;
    return kernel;
  });
  const length=Math.floor(limit/buffer.sampleRate*rate),count=Math.min(512,Math.max(1,Math.ceil(length/2048)));
  let total=0,weighted=0;const bands=[0,0,0,0,0];
  for(let ch=0;ch<channels;ch++){
    const original=buffer.getChannelData(ch),data=new Float32Array(length);
    for(let i=0;i<length;i++){
      const position=i*buffer.sampleRate/rate;let center=Math.floor(position),phase=Math.round((position-center)*phases);
      if(phase===phases){center++;phase=0;}
      const kernel=kernels[phase];let value=0;
      for(let k=0;k<taps;k++){
        const index=center+k-radius;
        if(index>=0&&index<limit)value+=original[first+index]*kernel[k];
      }
      data[i]=value;
      if(i%8192===8191)await new Promise(resolve=>setTimeout(resolve,0));
    }
    for(let i=0;i<count;i++){
      const offset=Math.floor(i*Math.max(0,data.length-2048)/Math.max(1,count-1));
      const frame=spectrum(data.subarray(offset,offset+2048),rate);
      total+=frame.total;weighted+=frame.weighted;
      for(let b=0;b<5;b++)bands[b]+=frame.band_power[b];
    }
  }
  const db=x=>20*Math.log10(Math.max(x,1e-7)),rms=Math.sqrt(power/(channels*limit));
  return {rms_dbfs:db(rms),peak_dbfs:db(peak),crest_db:db(peak)-db(rms),
    centroid_hz:total?weighted/total:0,band_energy:bands.map(x=>total?x/total:0),
    analysis_method:'channel-power-v2',analysis_rate_hz:rate,analysis_cutoff_hz:cutoff,analysis_channels:channels,analysis_frames:count};
}
async function analyseRequestAudio(){
  const urls=requestLinks(el('prompt').value),file=el('audioFile').files[0];
  if(urls.length>1)throw new Error('Gebruik een audiolink per verzoek.');
  if(file&&urls.length)throw new Error('Gebruik een audiolink OF een bestand, niet beide.');
  if(!file&&!urls.length)return null;
  if(file&&file.size>40*1024*1024)throw new Error('Maximaal 40 MiB audio.');
  const start=Number(el('audioStart').value),length=Number(el('audioLength').value);
  if(!Number.isFinite(start)||start<0||start>86400||!Number.isFinite(length)||length<.25||length>60)
    throw new Error('Kies een geldige starttijd en een fragmentlengte van 0,25 tot 60 seconden.');
  const key=JSON.stringify([file?[file.name,file.size,file.lastModified]:urls[0],start,length,state?.audio_analysis_version||1]);
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
    const buffer=await context.decodeAudioData(bytes),first=Math.floor(start*buffer.sampleRate);
    if(!Number.isFinite(buffer.duration)||buffer.duration>86400||first>=buffer.length)
      throw new Error('De starttijd valt buiten het audiobestand of de bron is te lang.');
    const limit=Math.min(buffer.length-first,Math.floor(buffer.sampleRate*length));
    if(limit<buffer.sampleRate*.25)throw new Error('Het gekozen fragment is korter dan 0,25 seconde.');
    let metrics;
    if(state?.audio_analysis_version===2)metrics=await measureWindowV2(buffer,first,limit);
    else{
    const step=Math.max(1,Math.floor(buffer.sampleRate/16000)),mono=new Float32Array(Math.ceil(limit/step));
    for(let ch=0;ch<buffer.numberOfChannels;ch++){const data=buffer.getChannelData(ch);for(let i=0,j=0;i<limit;i+=step,j++)mono[j]+=data[first+i]/buffer.numberOfChannels;}
    let power=0,peak=0;for(const x of mono){power+=x*x;peak=Math.max(peak,Math.abs(x));}
    if(peak<1e-7)throw new Error('Audiofragment bevat geen meetbaar signaal.');
    const rms=Math.sqrt(power/mono.length),db=x=>20*Math.log10(Math.max(x,1e-7));
    const count=Math.min(32,Math.max(1,Math.floor(mono.length/2048))),bands=[0,0,0,0,0];let centroid=0;
    for(let i=0;i<count;i++){const offset=Math.floor(i*(mono.length-2048)/Math.max(1,count-1));
      const frame=spectrum(mono.subarray(Math.max(0,offset),Math.max(0,offset)+2048),buffer.sampleRate/step);
      centroid+=frame.centroid/count;for(let b=0;b<5;b++)bands[b]+=frame.bands[b]/count;
    }
    metrics={rms_dbfs:db(rms),peak_dbfs:db(peak),crest_db:db(peak)-db(rms),centroid_hz:centroid,band_energy:bands};
    }
    const measured={url:urls[0]||null,file_name:file?.name?.slice(0,180)||null,sample_seconds:limit/buffer.sampleRate,
      start_seconds:first/buffer.sampleRate,source_seconds:buffer.duration,...metrics};
    el('audioStatus').textContent=`Fragment ${measured.start_seconds.toFixed(2)}-${(measured.start_seconds+measured.sample_seconds).toFixed(2)} s lokaal gemeten, RMS ${measured.rms_dbfs.toFixed(1)} dBFS. ${metrics.analysis_method?`Kanaalenergie apart, spectrum met ${metrics.analysis_cutoff_hz/1000} kHz anti-aliasfilter. `:''}Geen gitaarisolatie of directe AI-beluistering.`;
    audioReferenceKey=key;
    return measured;
  }finally{await context.close();}
}
el('compareAudio').onclick=async()=>{
  if(busy)return;
  busy=true;controls();clearAudioComparison();
  try{
    if(state?.audio_analysis_version!==2)throw new Error('Deze backend ondersteunt de nieuwe lokale analyse nog niet.');
    if(sourceKind.value==='rig')throw new Error('Kies een klankvoorbeeld, geen gesproken apparatuuruitleg.');
    const file=el('recordingFile').files[0],start=Number(el('recordingStart').value),length=Number(el('recordingLength').value);
    if(!file||file.size>40*1024*1024)throw new Error('Kies een eigen audio-opname van maximaal 40 MiB.');
    if(!Number.isFinite(start)||start<0||start>86400||!Number.isFinite(length)||length<.25||length>60)
      throw new Error('Kies een geldige opnamestart en lengte van 0,25 tot 60 seconden.');
    audioReference=await analyseRequestAudio();
    if(!audioReference)throw new Error('Voeg eerst het klankvoorbeeld toe in SONG / AUDIO of je verzoek.');
    const context=new AudioContext();let recording;
    try{
      const buffer=await context.decodeAudioData(await file.arrayBuffer()),first=Math.floor(start*buffer.sampleRate);
      if(buffer.duration>86400||first>=buffer.length)throw new Error('De starttijd valt buiten de opname.');
      const count=Math.min(buffer.length-first,Math.floor(length*buffer.sampleRate));
      recording={sample_seconds:count/buffer.sampleRate,start_seconds:first/buffer.sampleRate,source_seconds:buffer.duration,
        ...await measureWindowV2(buffer,first,count)};
    }finally{await context.close();}
    const result=await api('audio/compare',{reference:audioReference,recording});
    const d=result.differences,root=el('comparisonResults');
    for(const text of [`Opname minus referentie: RMS ${d.rms_db.toFixed(1)} dB, piek ${d.peak_db.toFixed(1)} dB, crest ${d.crest_db.toFixed(1)} dB.`,
        `Spectraal zwaartepunt: ${d.centroid_hz.toFixed(0)} Hz verschil.`,
        ...d.band_energy.map(b=>`${b.band}: ${(100*b.delta_fraction).toFixed(1)} procentpunt energieverschil${b.relative_db===null?'':`, ${b.relative_db.toFixed(1)} dB relatief`}.`),result.note]){
      const p=document.createElement('p');p.textContent=text;root.append(p);
    }
    el('comparisonStatus').textContent='Vergelijking gereed. Geen preset, AI-plan of instellingen gewijzigd; niets afgespeeld of naar de Fractal verzonden.';
  }catch(error){el('comparisonStatus').textContent=error.message;}
  finally{busy=false;controls();}
};
function showDesign(plan){
  intentPanel.replaceChildren();intentPanel.hidden=!plan.scene_intent?.goals?.length;
  if(!intentPanel.hidden){
    const heading=document.createElement('h3');heading.textContent='KLANKDOEL PER SCENE';intentPanel.append(heading);
    for(const goal of plan.scene_intent.goals){
      const p=document.createElement('p'),title=document.createElement('strong');title.textContent=`${goal.scene}. ${goal.role}: `;
      p.append(title,document.createTextNode(goal.target));const detail=document.createElement('div');detail.textContent=goal.realization;p.append(detail);intentPanel.append(p);
    }
    const hint=document.createElement('p');hint.textContent='Ontwerpcontrole, geen luisterbewijs. '+(plan.adjustment?`Bijgestuurd: ${plan.adjustment.changed_scenes.join(', ')}. Beschermd: ${plan.adjustment.preserved_scenes.join(', ')||'geen'}. Volledig ontwerp wordt gecontroleerd opnieuw toegepast, geen minimale live-patch.`:'Controleer na SEND de klank en balans op laag fysiek volume.');intentPanel.append(hint);
  }
  const design=plan.design, controller=plan.controller;
  if(plan.mode==='album'){
    el('toneChoice').textContent='Maximaal vier ampvoicings en vier cabkanalen A-D, expliciete indeling per scene; Output A -18dB.';
    el('controllerChoice').textContent='Alleen expliciet ingerichte effecten actief; overige reserveblokken bypassed. Geen nieuwe controllers of NAM.';
    el('planWarnings').replaceChildren();for(const warning of plan.warnings||[]){const li=document.createElement('li');li.textContent=warning;el('planWarnings').append(li);}
    el('sceneTable').hidden=false;el('sceneRows').replaceChildren();
    const layout=design.scene_layout||design.albums.flatMap((a,c)=>[a.lead,a.solo].map(role=>({...role,amp_channel:c,cab_channel:c})));
    for(const [index,role] of layout.entries()){
      const album=design.albums[role.amp_channel],cab=plan.cab_choices[role.cab_channel],row=document.createElement('tr');
      const voice=album.drive;
      const drive=voice?`Drive: ${role.drive?'aan':'uit'} | ${voice.model} / ${'ABCD'[role.amp_channel]} | gain ${voice.gain}, tone ${voice.tone}, levelknop ${voice.level}/10, mix ${voice.mix}%`:'Drive: uit (geen voicing)';
      const comp=album.compressor,eq=album.geq;
      const auxiliary=[drive,comp?`Compressor: ${role.compressor?'aan':'uit'} / ${'ABCD'[role.amp_channel]} | ${comp.model}, threshold ${comp.threshold}dB, ratio ${comp.ratio}, attack ${comp.attack_ms}ms, release ${comp.release_ms}ms, mix ${comp.mix}%, level ${comp.level}dB, auto OFF`:'Compressor: uit (geen voicing)',
        eq?`GEQ: ${role.geq?'aan':'uit'} / ${'ABCD'[role.amp_channel]} | ${eq.model}, banden ${eq.gains.join('/')}dB, Q ${eq.q}, level ${eq.level}dB`:'GEQ: uit (geen voicing)'].join('\n');
      for(const value of [`${index+1}. ${role.name} / ${'ABCD'[role.amp_channel]}`,`${album.amp_model} | gain ${album.amp.gain} | EQ ${album.amp.bass}/${album.amp.mid}/${album.amp.treble} | ${album.amp.level}dB`,'Uit',role.chorus?`${design.chorus.rate_hz}Hz / ${design.chorus.mix}% (A)`:'Uit',role.delay?`${design.delay.time_ms}ms / ${design.delay.feedback}% / ${design.delay.mix}% (A)`:'Uit','Niet in route',`${auxiliary}\n${cabDescription(cab)} | Output A -18dB`]){const td=document.createElement('td');td.textContent=value;row.append(td);}
      el('sceneRows').append(row);
    }return;
  }
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
  if(!el('prompt').value.trim())throw new Error('Beschrijf eerst de gewenste sound of voeg een link toe.');
  if(state.route_options_supported&&!adjusting){
    if(!routeExploration){await exploreRequestRoutes();return;}
    if(!routeExploration.routes.some(r=>r.mode===el('buildRoute').value&&r.enabled)){
      el('routeOptionsPanel').open=true;setTimeout(()=>el('buildRoute').focus(),0);
      note('Kies een uitvoerbare bouwroute. Er is nog geen voorstel gemaakt of iets verzonden.');return;
    }
  }
  if(!await ensureIntake(el('buildRoute').value||'auto'))return;
  invalidate();el('result').hidden=true;
  note('AI werkt het voorstel uit. Er wordt nog niets naar de Fractal gestuurd...');
  stage(1);
  if(el('namWithRequest').checked&&!el('namQuery').value.trim())throw new Error('Vul een Tone3000-zoekterm in, of schakel zoeken bij dit voorstel uit.');
  const adjustTargets=[...adjustPanel.querySelectorAll('input:checked')].map(input=>Number(input.value));
  if(adjusting&&(!adjustTargets.length||!el('prompt').value.trim()))throw new Error('Kies scenes en beschrijf je luisterfeedback.');
  if(sourceKind.value==='rig'&&el('audioFile').files.length)throw new Error('Rig-uitleg gebruikt tekst of een YouTube-link. Verwijder het klankbestand of kies klankvoorbeeld.');
  audioReference=sourceKind.value==='rig'?null:await analyseRequestAudio();
  proposal=await api('plan',{prompt:el('prompt').value,expected_preset:state.preset,scenes:Number(el('scenes').value),wah_source:el('wah').value||null,
    wah_auto_engage:el('wah').value?(el('wahMode').value||null):null,audio_reference:audioReference,
    ...(state.route_options_supported?{mode:el('buildRoute').value}:{}),
    nam_query:el('namWithRequest').checked?(el('namQuery').value||null):null,
    ...(adjusting?{refine_token:refineContext.token,adjust_scenes:adjustTargets}:{}),
    ...(state.request_intake_supported?{resolution:intakeResolution}:{}),
    ...dialoguePayload(),
    ...(state.nam_selection_supported&&(!state.route_options_supported||el('buildRoute').value==='nam')?{nam_slot:captureSlot.value?Number(captureSlot.value):null}:{}),
    ...(state.source_support?.rig_reader?{source_kind:sourceKind.value,rig_mode:rigMode.value}:{})});
  receiveDialogue(proposal);
  if(proposal.needs_clarification){const clarification=proposal.intake;proposal=null;showIntake(clarification);return;}
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
  await refresh();note(`${result.imported} namen geimporteerd${result.locally_saved?' en lokaal bewaard':' voor deze verbinding'}. Geen IR-audio of hardware gewijzigd. ${result.note||''}`);
});
el('send').onclick=()=>run(async()=>{
  if(!proposal||!el('confirmed').checked||!el('muted').checked)throw new Error('Bevestig eerst doel en externe demping.');
  if(currentStage!==3)throw new Error('Ga eerst naar CONFIRM.');
  const sentPlan=proposal,token=proposal.token;refineContext=null;adjusting=false;
  adjustPanel.hidden=true;el('generate').textContent='GENERATE PLAN';
  invalidate();note('Bezig met gecontroleerd verzenden. Laat de externe audio gedempt.');
  stage(4);
  let result;
  try{result=await api('send',{token,target_confirmed:true,external_audio_muted:true});}
  catch(e){throw new Error('Verzending niet bevestigd. Houd audio gedempt; niet automatisch opnieuw verzenden. '+e.message);}
  refineContext=result.ok&&result.refine_token?{token:result.refine_token,count:sentPlan.scenes.length,mode:sentPlan.mode==='album'?'amp':sentPlan.mode||'amp',preset:state.preset}:null;
  adjusting=false;adjustPanel.hidden=true;el('generate').textContent='GENERATE PLAN';
  el('resultTitle').textContent=result.ok?'Schrijfopdrachten teruggelezen en bevestigd':'Verzending gestopt';
  el('resultText').textContent=`${result.results.filter(r=>r.ok).length} acties bevestigd; ${result.skipped} overgeslagen.\n`+
    (result.detail||'')+'\n'+result.results.filter(r=>!r.ok).map(r=>r.detail).join('\n')+
    '\nNiets permanent opgeslagen. Controleer fysieke pedalen, klank en balans apart op laag fysiek volume.';
  await refresh();stage(4);el('result').focus();
  note(result.ok?'Bouw afgerond, geen hoorbaar resultaat gemeten.':'Gestopt. Gedeeltelijke wijzigingen kunnen achterblijven; houd audio gedempt.');
});
run(refresh);
