'use strict';
const viewIds={planPanel:'pane-plan',review:'pane-review',confirmPanel:'pane-confirm',result:'pane-send',generate:'engage',toReview:'reviewbtn',toConfirm:'toconfirm',send:'apply'};
const el=id=>document.getElementById(viewIds[id]||id);
let state=null, proposal=null, busy=false;
let audioReference=null;
let currentStage=0;
const note=text=>{el('status').textContent=text;};
const stageNames=['request','plan','review','confirm','send'];
const stagePanes=['pane-request','planPanel','review','confirmPanel','result'];
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
  for(const id of ['refresh','generate','cabImport','prompt','scenes','wah','cabKind','cabFile','discard','variant','deviceChoice','connectDevice','newDesign','audioFile','namQuery','namFormat','namSearch','namLogin','namWithRequest','editRequest','toReview','backPlan','toConfirm','backReview','returnRequest']) el(id).disabled=busy;
  el('wahMode').disabled=busy||!el('wah').value;
  el('generate').disabled=busy||el('deviceChoice').value!=='axefx3'||!state?.connected||!!state.route_problem||!state.cab_count;
  el('send').disabled=busy||currentStage!==3||el('deviceChoice').value!=='axefx3'||!proposal||!el('confirmed').checked||!el('muted').checked;
  stage(currentStage);
  el('controllerHint').textContent=!el('wah').value?'Geen nieuwe controllerkoppeling. Bestaande Auto Engage blijft behouden en kan de scene-bypass beinvloeden.':
    el('wahMode').value==='Fast Pos'?'Fast Pos: pedaalbeweging kan de Wah ook inschakelen in een scene met Wah uit. Kies Off voor aan/uit via de scenes.':
    el('wahMode').value==='Off'?'Off: het pedaal stuurt de Wah-filterstand, maar schakelt de Wah niet automatisch aan of uit.':
    'Bestaande Auto Engage-modus blijft behouden. Bij een nieuwe koppeling gebruikt het apparaat zijn standaard; controleer het gedrag.';
}
function invalidate(){proposal=null;stage(0);el('confirmed').checked=el('muted').checked=false;
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
  el('variant').value=state.profile?.variant||'';
  el('memoryWarning').textContent=state.profile?.warning||'Kies MK1 of MK2 om de juiste geheugenindeling te tonen.';
  el('liveRoute').replaceChildren();
  if(state.route?.length){for(const [i,label] of state.route.entries()){
    if(i)el('liveRoute').append(document.createTextNode(' → '));
    const block=document.createElement('span');block.className='chain-block';block.textContent=label;el('liveRoute').append(block);
  }}else el('liveRoute').textContent=state.route_problem||'Lege of niet uitgelezen keten';
  el('sceneRack').replaceChildren();
  for(let i=0;i<8;i++){
    const scene=document.createElement('div');scene.className='sc'+(state.connected&&state.scene===i+1?' on':'');
    scene.setAttribute('aria-label',`Scene ${i+1}: ${state.scene_names?.[i]||'niet uitgelezen'}`);
    const num=document.createElement('span');num.className='n';num.textContent=String(i+1);
    const name=document.createElement('span');name.className='nm';name.textContent=state.scene_names?.[i]||'';scene.append(num,name);el('sceneRack').append(scene);
  }
  note(state.route_problem||(state.connected?'Status uitgelezen. Niets verzonden.':'Nog niet verbonden.'));
}
el('refresh').onclick=()=>run(refresh);
for(const id of ['prompt','scenes','wah','wahMode'])el(id).addEventListener('input',invalidate);
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
el('namSearch').onclick=()=>run(async()=>{showCaptures(await api('search',{query:el('namQuery').value,format:el('namFormat').value}));});
el('namLogin').onclick=()=>run(async()=>{
  const r=await fetch('/api/tone3000/login');const d=await r.json();
  if(!r.ok)throw new Error(d.error||d.detail||'TONE3000-aanmelding is nog niet geconfigureerd.');
  if(d.redirect_uri&&new URL(d.redirect_uri).origin!==location.origin)throw new Error('TONE3000-aanmelding vereist de integratie op de geregistreerde poort 8909. Deze tweede-poortpreview vervangt je bestaande TC niet.');
  const url=new URL(d.url);
  if(url.origin!=='https://www.tone3000.com')throw new Error('Ongeldige aanmeldlink.');
  location.href=url.href;
});
for(const id of ['namQuery','namWithRequest','audioFile'])el(id).addEventListener('input',()=>{audioReference=null;invalidate();});
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
    return measured;
  }finally{await context.close();}
}
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
    for(const value of [`${i+1}. ${scene.name} / ${'ABCD'[i]}`,`${scene.amp.gain} / ${scene.amp.level} dB`,scene.wah?'Aan':'Uit',chorus,delay,reverb,extras.join('\n')||'Bestaand behouden']){
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
  audioReference=await analyseRequestAudio();
  proposal=await api('plan',{prompt:el('prompt').value,expected_preset:state.preset,scenes:Number(el('scenes').value),wah_source:el('wah').value||null,
    wah_auto_engage:el('wah').value?(el('wahMode').value||null):null,audio_reference:audioReference,
    nam_query:el('namWithRequest').checked?(el('namQuery').value||null):null});
  el('conversation').textContent=proposal.summary;el('conversationPanel').hidden=false;
  el('emptyConversation').hidden=true;
  if(proposal.capture_search)showCaptures(proposal.capture_search);
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
