// Real Chrome, local shipped assets, mocked APIs. No MIDI, network AI or server required.
const {chromium}=require(process.env.TC_PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

(async()=>{
  const browser=await chromium.launch({headless:true,
    ...(process.env.TC_BROWSER_EXECUTABLE?{executablePath:process.env.TC_BROWSER_EXECUTABLE}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[],plans=[],sends=[];
    let audioFetches=0,sourceBackendReady=true,routeOptionsReady=false,navigationReady=false,serialReady=false;
    let currentPreset=325,currentScene=1,navigationRequest=null;
    const navigationSelections=[];
    const explorations=[];
    page.on('pageerror',e=>errors.push(e.message));
    let failPlan=false,failSend=false,failRead=false,addedExtras=false;
    let variant=null,fw33=false,namRoute=false,selected=null,slotsFull=false,slotsFail=false;
    const installs=[],stores=[],previews=[];
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();
      if(url.pathname==='/logo.png')return route.fulfill({contentType:'image/png',body:fs.readFileSync(path.join(__dirname,'../ui/logo.png'))});
      if(url.pathname==='/axefx3.css'){
        const source=fs.readFileSync(path.join(__dirname,'../ui/index.html'),'utf8');
        return route.fulfill({contentType:'text/css',body:source.split('<style>')[1].split('</style>')[0]});
      }
      if(url.pathname==='/axefx3'||url.pathname==='/axefx3.js'){
        return route.fulfill({contentType:name.endsWith('.js')?'text/javascript':'text/html',
          body:fs.readFileSync(path.join(__dirname,'../ui',name==='axefx3'?'axefx3.html':name),'utf8')});
      }
      if(!url.pathname.startsWith('/api/axefx3/'))return route.fulfill({status:404,body:''});
      let status=200,result={};
      if(url.pathname==='/api/axefx3/tone3000/status')result={configured:true,connected:true,selected,installation_supported:fw33&&variant==='mk2'};
      if(url.pathname==='/api/axefx3/tone3000/tones')result={data:[{id:42,title:'<img src=x onerror=alert(1)> Plexi',creator:{username:'test'}}]};
      if(url.pathname==='/api/axefx3/tone3000/tones/42')result={tone:{title:'Capture',description:'Untrusted creator claim'},models:[{id:7,name:'Synthetic A2'}]};
      if(url.pathname==='/api/axefx3/tone3000/select'){selected={model:{id:7,name:'Synthetic A2'}};result={selected};}
      if(url.pathname==='/api/axefx3/tone3000/slots'){
        result={complete:true,first_available:slotsFull?null:2,slots:Array.from({length:256},(_,i)=>({slot:i+1,name:i===0||slotsFull?'Old capture':'<EMPTY>',occupied:i===0||slotsFull}))};
        if(slotsFail){status=409;result={detail:'NAM inventory incomplete'};}
      }
      if(url.pathname==='/api/axefx3/tone3000/install/prepare'){
        const body=req.postDataJSON();previews.push(body);
        result={prepared_id:'install-ticket',name:'Synthetic A2',slot:body.slot,existing_name:body.slot===1||slotsFull?'Old capture':'<EMPTY>',existing_occupied:body.slot===1||slotsFull,expected_preset:325};
      }
      if(url.pathname==='/api/axefx3/tone3000/install'){installs.push(req.postDataJSON());result={bytes_verified:65536};}
      if(url.pathname==='/api/axefx3/store/prepare')result={token:'store-ticket',preset:325,name:'AI-Test NAM',replaces:'Old stored preset'};
      if(url.pathname==='/api/axefx3/store'){stores.push(req.postDataJSON());result={ok:true,stored:true,preset:325,name:'AI-Test NAM'};}
      if(url.pathname==='/api/axefx3/navigation/presets')result={readonly:true,slots:[{number:325,name:'Test'},{number:326,name:'<img src=x> Damage INC'}]};
      if(url.pathname==='/api/axefx3/navigation/prepare'){
        navigationRequest=req.postDataJSON();result={token:'navigation-test-ticket',kind:navigationRequest.kind,destination:{number:navigationRequest.value,name:'Selected'}};
      }
      if(url.pathname==='/api/axefx3/navigation/select'){
        navigationSelections.push(req.postDataJSON());
        if(navigationRequest.kind==='preset')currentPreset=navigationRequest.value;else currentScene=navigationRequest.value;
        result={ok:true,kind:navigationRequest.kind,selected:navigationRequest.value,stored:false};
      }
      if(name==='state'){
        result={connected:true,preset:currentPreset,name:'Test',scene:currentScene,firmware:fw33?'33.00-beta.20261006':'32.06',cab_count:fw33?0:20,
          source_support:{rig_reader:true,modes:['closest','faithful','simplified']},
          nam_selection_supported:fw33,nam:fw33?{slot:1,name:'Old capture'}:null,
          profile:{variant,warning:'Memory policy from declared variant',user2_cabs:true}};
        if(!sourceBackendReady)delete result.source_support;
        if(serialReady)result.serial_build_supported=true;
        if(routeOptionsReady)result.route_options_supported=true;
        if(navigationReady){result.navigation_supported=true;result.scene_names=Array.from({length:8},(_,i)=>[i+1,i?'Solo':'Rhythm']);}
        if(fw33)result.route=namRoute?['Input 1','NAM 1','Cab 1','Delay 1','Chorus 1','Reverb 1','Output 1']:[];
        if(serialReady&&result.route?.length)result.route_blocks=result.route.map((label,i)=>({label,channel:'A',bypassed:i===1}));
        if(failRead){status=409;result={detail:'Read failed'};}
      }
      if(name==='options'){
        explorations.push(req.postDataJSON());
        result={readonly:true,hardware_written:false,
          comparison:{recommended:'amp',reason:'Compare both, no automatic selection',amp_direction:'Brit crunch',nam_query:'Whole Lotta Love',pedals:['<img src=x> Delay']},
          routes:[{mode:'amp',label:'AMP / CAB + pedals',enabled:!fw33,reason:'Model selection requires measured firmware'},
                  {mode:'nam',label:'NAM + passende effecten',enabled:fw33,reason:'Installed compatible capture required'}],nam_candidates:[]};
        if(serialReady)result.routes.push({mode:'serial',label:'AMP / CAB: gemeten testketen',enabled:true,reason:'Vaste14-blokkenketen, modellen behouden.'});
      }
      if(name==='plan'){
        plans.push(req.postDataJSON());
        result={token:'one-use',name:'AI-Test',summary:'<img src=x onerror=alert(1)>',backend:'codex',model:'test',
          target:{preset:325},scenes:['Clean','Crunch','Heavy','Lead'],
          required_route:['Input 1','Wah 1','Amp 1','Cab 1','Output 1'],
          actions:[{kind:'set_param',param:'DISTORT_DRIVE',value:5}]};
        result.controller={source:req.postDataJSON().wah_source,auto_engage:req.postDataJSON().wah_auto_engage};
        result.warnings=['<img src=x onerror=alert(1)> Wah bypass warning'];
        result.cab_choices=[{side:'IR1',name:'Test Greenback',position:'USER 1 slot 28'}];
        result.design={amp_model:'Test Plexi',chorus_model:'Analog Stereo',cab_left:{bank:2,slot:28},cab_right:null,
          scenes:['Intro','Main','Heavy','Lead'].map((name,i)=>({name,amp:{gain:i+3,level:-15},wah:i===0||i===3,
            delay:{active:i===0||i===3,time_ms:280+i*30,feedback:20,mix:15},reverb:{active:true,time_s:1.2,mix:8},
            chorus:i===2?null:{active:i!==1,rate_hz:.3,depth:25,mix:20},
            drive:i===0?{model:'T808 Mod',active:true,drive:6,tone:4,level:2,mix:100}:null,
            compressor:i===1?{model:'Classic VCA Compressor',active:true,threshold:-30,ratio:4,attack_ms:5,release_ms:250,mix:75,level:-12}:null,
            geq:i===2?{active:true,gains:Array(10).fill(-3),level:-6}:null,
            peq:i===3?{active:true,bands:[200,400,800,1600,3200].map(frequency_hz=>({frequency_hz,gain:-3})),level:-6}:null}))};
        if(addedExtras){
          result.actions.push({kind:'add_block',block:'FUZZ'},{kind:'add_block',block:'COMP'});
          result.required_route=['Input 1','Wah 1','Drive 1','Compressor 1','Amp 1','Cab 1','Output 1'];
        }
        if(fw33){
          result.mode='nam';result.capture={name:'Synthetic A2',slot:req.postDataJSON().nam_slot||1,bytes:65536,sha256:'a'.repeat(64)};
          result.required_route=['Input 1','NAM 1','Cab 1','Delay 1','Chorus 1','Reverb 1','Output 1'];
          result.scenes=['Rhythm','Solo'].slice(0,req.postDataJSON().scenes);
          result.design={cab_active:false,delay:{time_ms:350},scenes:result.scenes.map(name=>({name,nam:{input_gain:0,level:-16},chorus:true,delay:true,reverb:true}))};
        }
        if(req.postDataJSON().mode==='serial'){
          result.mode='serial';delete result.capture;result.scenes=['Crunch'];
          result.design={scene_name:'Crunch',amp:{gain:5.5,level:-18},delay:{active:true,time_ms:320,feedback:20,mix:18},chorus:{active:true,rate_hz:.7,mix:12}};
          result.required_route=['Input 1','Wah 1','Drive 1','Amp 1','Cab 1','Chorus 1','Compressor 1','Delay 1','Enhancer 1','Filter 1','Flanger 1','GEQ 1','PEQ 2','Output 1'];
        }
        if(req.postDataJSON().source_kind==='rig'){
          result.source={title:'<img src=x onerror=alert(1)> Explained rig',spec:{reader:{backend:'codex'}}};
          result.rig_report={mode:req.postDataJSON().rig_mode,status:{nodes:{amp:{label:'<img src=x> Amp',state:'changed',provenance:'observed',reason:'Installed capture interpretation'},wah:{label:'Wah',state:'not_reproduced',provenance:'observed',reason:'Not measured'}},edges:{pedal:{state:'not_reproduced',reason:'No verified controller mapping'}}}};
        }
        if(failPlan){status=409;result={detail:'AI output refused'};}
      }
      if(name==='send'){
        sends.push(req.postDataJSON());
        result={ok:!failSend,skipped:failSend?100:0,stored:false,
          results:[{ok:!failSend,detail:failSend?'Readback mismatch':'Verified'}]};
        if(fw33&&!failSend)namRoute=true;
      }
      if(name==='cabs')result={imported:20};
      if(name==='profile'){variant=req.postDataJSON().variant;result={profile:{variant},hardware_written:false};}
      if(name==='search')result={candidates:[{id:42,title:'<img src=x onerror=alert(1)> Plexi',creator:'test'}]};
      if(name==='audio'){
        audioFetches++;
        const size=32000,buf=Buffer.alloc(44+size*2);
        buf.write('RIFF');buf.writeUInt32LE(buf.length-8,4);buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);
        buf.writeUInt16LE(1,20);buf.writeUInt16LE(1,22);buf.writeUInt32LE(16000,24);buf.writeUInt32LE(32000,28);
        buf.writeUInt16LE(2,32);buf.writeUInt16LE(16,34);buf.write('data',36);buf.writeUInt32LE(size*2,40);
        for(let i=0;i<size;i++)buf.writeInt16LE(Math.round(8000*Math.sin(2*Math.PI*440*i/16000)),44+2*i);
        return route.fulfill({contentType:'audio/wav',body:buf});
      }
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});
    });
    async function review(){
      await page.click('#engage');await page.locator('#pane-plan:not([hidden])').waitFor();
      assert(await page.locator('#pane-review').isHidden());
      assert(await page.locator('#pane-confirm').isHidden());
      await page.click('#reviewbtn');await page.locator('#pane-review:not([hidden])').waitFor();
    }
    async function request(){
      await page.click('#rail [data-step="0"]');
      if((await page.locator('#requestPanel').getAttribute('open'))===null)await page.click('#requestPanel summary');
    }
    async function confirmSend(){
      await page.click('#toconfirm');
      assert(await page.locator('#pane-review').isHidden());
      assert(await page.locator('#apply').isDisabled());
      await page.check('#confirmed');assert(await page.locator('#apply').isDisabled());
      await page.check('#muted');assert(await page.locator('#apply').isEnabled());
      await page.click('#apply');
    }
    await page.goto('http://tc.test/axefx3');await page.locator('#engage:not([disabled])').waitFor();
    assert.equal(await page.locator('#rail .stg').count(),5);
    assert.equal(await page.locator('#sceneRack .sc').count(),8);
    assert.equal(await page.locator('#shell').evaluate(x=>getComputedStyle(x).display),'flex');
    assert.equal(await page.locator('#hwbar h1').evaluate(x=>getComputedStyle(x).color),'rgb(47, 230, 255)');
    if(process.env.TC_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.TC_SCREENSHOT_DIR,'fm9-layout-request.png')});
    for(const width of [1440,1280,1180]){
      await page.setViewportSize({width,height:1000});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      for(const id of ['hwbar','context','workspace','shelf','engage']){
        assert(await page.locator('#'+id).evaluate(x=>{
          const r=x.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;
        }),id+' must fit at '+width);
      }
    }
    await page.setViewportSize({width:1440,height:1000});
    await page.fill('#prompt','Maak vier scenes');await page.press('#prompt','End');await page.press('#prompt','Enter');
    assert.equal(plans.length,0);assert((await page.inputValue('#prompt')).endsWith('\n'));
    await page.selectOption('#wah','External 1');await page.selectOption('#wahMode','Off');
    await review();
    assert.equal(plans[0].wah_source,'External 1');assert.equal(plans[0].expected_preset,325);
    assert.equal(plans[0].wah_auto_engage,'Off');
    assert.equal(await page.locator('#sceneRows tr').count(),4);
    for(const value of ['280 ms','Analog Stereo','T808 Mod','Classic VCA Compressor','GEQ: 10 banden','Q behouden']){
      assert((await page.textContent('#sceneRows')).includes(value));
    }
    assert.equal(await page.locator('#sceneRows tr').first().locator('td').count(),7);
    assert.equal(await page.locator('#planWarnings img').count(),0);
    assert.equal(await page.locator('#requestPanel').getAttribute('open'),null);
    await request();assert.equal(await page.inputValue('#prompt'),'Maak vier scenes\n');
    assert.equal(await page.locator('#conversation img').count(),0);
    await page.click('#rail [data-step="2"]');
    if(process.env.TC_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.TC_SCREENSHOT_DIR,'fm9-layout-review.png')});
    await page.click('#toconfirm');
    await page.check('#confirmed');await page.check('#muted');
    assert((await page.textContent('#confirmTarget')).includes('325'));
    await request();await page.fill('#prompt','Different sound');
    assert(await page.locator('#pane-review').isHidden());assert.equal(sends.length,0);
    assert(!(await page.isChecked('#confirmed')));
    addedExtras=true;await review();
    assert.match(await page.textContent('#sceneRows tr:nth-child(1)'),/Compressor: uit/);
    await confirmSend();await page.locator('#pane-send:not([hidden])').waitFor();
    await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(sends.length,1);assert.equal(sends[0].external_audio_muted,true);
    assert.match(await page.textContent('#resultText'),/Niets permanent opgeslagen/);
    await request();failPlan=true;await page.click('#engage');
    await page.waitForFunction(()=>document.getElementById('status').textContent==='AI output refused');
    assert(await page.locator('#pane-request').isVisible());assert(await page.locator('#engage').isEnabled());
    failPlan=false;failSend=true;await review();await confirmSend();
    await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Gestopt.'));
    assert.equal(sends.length,2);assert.match(await page.textContent('#resultText'),/Readback mismatch/);
    failRead=true;await page.click('#refresh');
    await page.waitForFunction(()=>document.getElementById('status').textContent==='Read failed');
    assert(await page.locator('#engage').isDisabled());
    failRead=false;await page.click('#refresh');await page.locator('#engage:not([disabled])').waitFor({state:'attached'});
    await request();await page.selectOption('#wahMode','Fast Pos');await review();await request();
    await page.selectOption('#wahMode','Off');assert(await page.locator('#pane-review').isHidden());
    await page.selectOption('#wah','');assert(await page.locator('#wahMode').isDisabled());
    await page.setViewportSize({width:390,height:844});
    assert(await page.locator('#unsupported').isVisible());assert(await page.locator('#shell').isHidden());
    await page.setViewportSize({width:1440,height:1000});
    await page.selectOption('#variant','mk2');await page.locator('#variant:not([disabled])').waitFor();
    assert.equal(await page.inputValue('#variant'),'mk2');
    await page.click('#namPanel summary');await page.fill('#namQuery','Marshall Plexi');await page.click('#namSearch');
    await page.locator('#namResults button').waitFor();
    assert.equal(await page.locator('#namResults img').count(),0);
    assert.match(await page.locator('#namResults button').textContent(),/Plexi/);
    page.once('dialog',dialog=>dialog.accept());await page.click('#newDesign');
    await page.locator('#prompt:not([disabled])').waitFor();assert.equal(await page.inputValue('#prompt'),'');
    await page.fill('#prompt','Maak de klank van https://youtu.be/test');await review();
    const measurement=plans.at(-1).audio_reference;
    assert.equal(measurement.url,'https://youtu.be/test');assert(Math.abs(measurement.centroid_hz-440)<30);
    assert(measurement.sample_seconds>1.9&&measurement.sample_seconds<=2);
    assert.equal(sends.length,2);
    // The FW33 foundation cannot select unverified scenes or Wah bindings.
    fw33=true;failSend=false;await page.click('#refresh');await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(await page.inputValue('#scenes'),'1');assert(await page.locator('#wah').isDisabled());
    assert(await page.locator('#scenes option').nth(1).evaluate(option=>option.disabled));
    await page.click('#namResults button');await page.locator('#namResults button').waitFor();
    await page.click('#namResults button');await page.locator('#namSlotsRefresh:not([disabled])').waitFor();
    assert(await page.locator('#namInstallPrepare').isDisabled());
    await page.click('#namSlotsRefresh');await page.locator('#namSlot:not([disabled])').waitFor();
    assert.equal(await page.locator('#namSlot option').count(),256);
    assert.equal(await page.inputValue('#namSlot'),'2');assert.equal(previews.length,0);assert.equal(installs.length,0);
    assert.match(await page.textContent('#namSlotsHint'),/Eerste lege slot: 002/);
    await page.selectOption('#namSlot','250');
    await page.click('#namInstallPrepare');await page.locator('#namInstallPanel:not([hidden])').waitFor();
    assert.equal(previews.at(-1).slot,250);assert.match(await page.textContent('#namSlotConsent'),/NAM-slot 250/);
    assert.match(await page.textContent('#namInstallWarning'),/opnieuw als leeg/);
    assert.equal(installs.length,0);assert(await page.locator('#namInstallCommit').isDisabled());
    await page.check('#namInstallMute');await page.check('#namInstallFlash');
    assert(await page.locator('#namInstallCommit').isDisabled());
    await page.check('#namInstallOverwrite');assert(await page.locator('#namInstallCommit').isEnabled());
    // A refresh invalidates a prepared permanent installation.
    await page.click('#refresh');await page.locator('#refresh:not([disabled])').waitFor();
    assert(await page.locator('#namInstallPanel').isHidden());assert.equal(installs.length,0);
    assert(await page.locator('#namInstallPrepare').isDisabled());
    await page.click('#namSlotsRefresh');await page.locator('#namSlot:not([disabled])').waitFor();
    await page.selectOption('#namSlot','1');
    await page.click('#namInstallPrepare');await page.locator('#namInstallPanel:not([hidden])').waitFor();
    assert.match(await page.textContent('#namInstallWarning'),/DIT SLOT IS BEZET/);
    assert.match(await page.textContent('#namSlotConsent'),/overschrijven van NAM-slot 001/);
    await page.selectOption('#namSlot','256');assert(await page.locator('#namInstallPanel').isHidden());
    await page.click('#namInstallPrepare');await page.locator('#namInstallPanel:not([hidden])').waitFor();
    assert.equal(previews.at(-1).slot,256);assert.equal(await page.textContent('#namInstallCommit'),'INSTALLEER IN NAM 256');
    for(const id of ['namInstallMute','namInstallFlash','namInstallOverwrite'])await page.check('#'+id);
    await page.click('#namInstallCommit');await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(installs.length,1);assert.deepEqual(installs[0],{prepared_id:'install-ticket',external_audio_muted:true,confirm_permanent_write:true,confirm_overwrite:true});
    assert(await page.locator('#namInstallPrepare').isDisabled());
    slotsFull=true;await page.click('#namSlotsRefresh');await page.locator('#namSlot:not([disabled])').waitFor();
    assert.equal(await page.inputValue('#namSlot'),'');assert(await page.locator('#namInstallPrepare').isDisabled());
    assert.equal(await page.locator('#namBuildSlot option').count(),257);
    assert.match(await page.textContent('#namSlotsHint'),/Geen lege slots/);
    await page.selectOption('#namSlot','250');assert(await page.locator('#namInstallPrepare').isEnabled());
    slotsFail=true;await page.click('#namSlotsRefresh');await page.locator('#namSlotsRefresh:not([disabled])').waitFor();
    assert(await page.locator('#namSlot').isDisabled());assert(await page.locator('#namInstallPrepare').isDisabled());
    assert.equal(installs.length,1);assert.match(await page.textContent('#status'),/NAM inventory incomplete/);
    assert.equal(await page.locator('#namBuildSlot option').count(),1);
    slotsFail=false;slotsFull=true;
    await page.click('#namSlotsRefresh');await page.locator('#namSlot:not([disabled])').waitFor();
    slotsFull=false;
    await request();await page.selectOption('#namBuildSlot','250');
    await page.fill('#prompt','Make a NAM rhythm foundation');await review();
    assert.equal(plans.at(-1).nam_slot,250);assert.match(await page.textContent('#toneChoice'),/NAM 250:/);
    assert.equal(plans.at(-1).scenes,1);assert.equal(await page.locator('#sceneRows tr').count(),1);
    assert.match(await page.textContent('#sceneRows'),/NAM input/);assert.equal(stores.length,0);
    await confirmSend();await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(sends.length,3);assert.equal(await page.inputValue('#scenes'),'1');
    assert(!(await page.locator('#scenes option').nth(1).evaluate(option=>option.disabled)));
    assert(await page.locator('#scenes option').nth(2).evaluate(option=>option.disabled));
    await page.click('#storePanel summary');await page.click('#storePrepare');await page.locator('#storePrepare:not([disabled])').waitFor();
    assert.match(await page.textContent('#storeSummary'),/Old stored preset/);assert(await page.locator('#storeCommit').isDisabled());
    await page.check('#storeMute');assert(await page.locator('#storeCommit').isDisabled());
    await page.check('#storeFlash');await page.click('#storeCommit');await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(stores.length,1);assert.deepEqual(stores[0],{token:'store-ticket',external_audio_muted:true,confirm_permanent_write:true});
    assert(await page.locator('#storeCommit').isDisabled());
    await request();await page.selectOption('#scenes','2');await review();
    assert.equal(plans.at(-1).scenes,2);assert.equal(await page.locator('#sceneRows tr').count(),2);
    await request();
    const beforeAudio=audioFetches,beforeSends=sends.length;
    await page.fill('#prompt','Maak de uitgelegde rig van https://youtu.be/Plwb_gfmSc4');
    await page.selectOption('#sourceKind','rig');await page.selectOption('#rigMode','closest');
    await review();
    assert.equal(plans.at(-1).source_kind,'rig');assert.equal(plans.at(-1).audio_reference,null);
    assert.equal(audioFetches,beforeAudio);assert.equal(sends.length,beforeSends);
    await page.click('#rail [data-step="1"]');
    assert(await page.locator('#rigReport').isVisible());
    await page.click('#rigReport summary');
    assert.match(await page.textContent('#rigComponents'),/Wah: not_reproduced/);
    assert.match(await page.textContent('#sourceTitle'),/codex/);
    assert.equal(await page.locator('#rigReport img').count(),0);
    await request();await page.selectOption('#rigMode','faithful');
    assert(await page.locator('#rigReport').isHidden());
    assert(!(await page.isChecked('#confirmed')));
    await review();assert.equal(plans.at(-1).rig_mode,'faithful');
    await request();sourceBackendReady=false;await page.click('#refresh');
    await page.locator('#refresh:not([disabled])').waitFor();
    assert(await page.locator('#sourceKind').isHidden());
    await page.fill('#prompt','Gewoon verzoek met een oudere backend');await review();
    assert(!Object.hasOwn(plans.at(-1),'source_kind'));
    assert(!Object.hasOwn(plans.at(-1),'rig_mode'));
    // A new backend exposes both strategies, with no automatic NAM selection.
    await request();routeOptionsReady=true;sourceBackendReady=true;
    await page.click('#refresh');await page.locator('#refresh:not([disabled])').waitFor();
    await page.setInputFiles('#audioFile',[]);await page.selectOption('#sourceKind','tone');
    await page.fill('#prompt','Maak de klank van https://example.com/reference.wav');
    await page.click('#routeOptionsPanel summary');
    assert(await page.locator('#engage').isDisabled());
    const beforeExplore={audio:audioFetches,sends:sends.length,installs:installs.length,plans:plans.length};
    await page.click('#exploreRoutes');await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(audioFetches,beforeExplore.audio+1);
    assert.equal(explorations.at(-1).audio_reference.url,'https://example.com/reference.wav');
    assert.equal(explorations.at(-1).expected_preset,325);
    assert.equal(await page.inputValue('#buildRoute'),'');
    assert.match(await page.textContent('#routeOptions'),/AMP \/ CAB/);
    assert.match(await page.textContent('#routeOptions'),/NAM \+ passende effecten/);
    assert.equal(await page.locator('#routeOptions details').getAttribute('open'),null);
    assert.match(await page.locator('#routeOptions details summary').textContent(),/Waarom dit advies/);
    assert.equal(await page.locator('#routeOptions img').count(),0);
    assert.equal(sends.length,beforeExplore.sends);assert.equal(installs.length,beforeExplore.installs);
    assert.equal(plans.length,beforeExplore.plans);
    await page.selectOption('#buildRoute','amp');assert(await page.locator('#engage').isDisabled());
    await page.selectOption('#buildRoute','nam');assert(await page.locator('#engage').isEnabled());
    if((await page.locator('#namPanel').getAttribute('open'))===null)await page.click('#namPanel summary');
    await page.fill('#namQuery','Marshall JTM45');
    await review();assert.equal(plans.at(-1).mode,'nam');
    assert.equal(audioFetches,beforeExplore.audio+1);
    await request();await page.fill('#prompt','Werk deze twee scenes verder uit van https://example.com/reference.wav');
    assert.equal(await page.inputValue('#buildRoute'),'');assert(await page.locator('#engage').isDisabled());
    await page.click('#exploreRoutes');await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(audioFetches,beforeExplore.audio+1);
    await page.selectOption('#buildRoute','nam');await review();
    assert.equal(audioFetches,beforeExplore.audio+1);
    await request();await page.fill('#prompt','Andere referentie https://example.com/changed.wav');
    await page.click('#exploreRoutes');await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(audioFetches,beforeExplore.audio+2);
    assert.equal(explorations.at(-1).audio_reference.url,'https://example.com/changed.wav');
    assert.equal(sends.length,beforeExplore.sends);assert.equal(installs.length,beforeExplore.installs);
    // A measured serial template is explicit, one scene, and not a NAM selection.
    await request();serialReady=true;await page.click('#refresh');await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(await page.locator('#liveRoute .chain-channel').count(),7);
    assert.equal(await page.locator('#liveRoute .bypassed .chain-channel').count(),1);
    assert.equal(await page.locator('#liveRoute .bypassed').evaluate(x=>getComputedStyle(x).color),'rgb(255, 255, 255)');
    await page.fill('#prompt','Een scene crunch met delay en chorus, modellen behouden');
    await page.click('#exploreRoutes');await page.locator('#refresh:not([disabled])').waitFor();
    await page.selectOption('#buildRoute','serial');
    assert.equal(await page.inputValue('#scenes'),'1');
    assert(await page.locator('#namBuildSlot').isHidden());
    assert(await page.locator('#scenes option').nth(1).evaluate(option=>option.disabled));
    await review();assert.equal(plans.at(-1).mode,'serial');
    assert(!Object.hasOwn(plans.at(-1),'nam_slot'));
    assert.match(await page.textContent('#toneChoice'),/geen model- of IR-keuze/);
    assert.match(await page.textContent('#sceneRows'),/320 ms.*feedback 20%/);
    assert.equal(await page.locator('#sceneRows tr').count(),1);
    await request();
    // Preset names are read-only; explicit selection needs mute and discard consent.
    navigationReady=true;await page.click('#refresh');await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(await page.textContent('#connectDevice'),'VERBONDEN');assert(await page.locator('#connectDevice').isDisabled());
    assert.match(await page.textContent('#target'),/^Preset 325:/);
    assert.match(await page.locator('#target').getAttribute('title'),/Axe-Fx III/);
    assert.equal(await page.locator('#sceneRack button').count(),8);assert.match(await page.textContent('#sceneRack button:first-child'),/Rhythm/);
    assert(!(await page.textContent('#sceneRack button:first-child')).includes('1,Rhythm'));
    await page.click('#sceneRack button[data-scene="2"]');await page.locator('#navigationDialog[open]').waitFor();
    assert.equal(navigationSelections.length,0);assert(await page.locator('#navigationSelect').isDisabled());
    await page.click('#navigationCancel');assert.equal(navigationSelections.length,0);
    await page.click('#sceneRack button[data-scene="2"]');await page.locator('#navigationDialog[open]').waitFor();
    await page.check('#navigationMute');await page.click('#navigationSelect');await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(navigationSelections.length,1);assert.equal(currentScene,2);
    assert.equal(await page.locator('#sceneRack button[data-scene="2"]').getAttribute('aria-pressed'),'true');
    const retained=await page.inputValue('#prompt');await page.click('#target');await page.locator('#presetChoices button').first().waitFor();
    assert.equal(navigationSelections.length,1);assert.equal(await page.locator('#presetChoices img').count(),0);
    await page.fill('#presetSearch','0326');assert.equal(await page.locator('#presetChoices button').count(),1);
    await page.click('#presetChoices button');await page.locator('#navigationDialog[open]').waitFor();
    assert.match(await page.textContent('#navigationWarning'),/niet-opgeslagen/);
    await page.check('#navigationMute');assert(await page.locator('#navigationSelect').isDisabled());
    await page.check('#navigationDiscard');await page.click('#navigationSelect');await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(currentPreset,326);assert.equal(navigationSelections.length,2);
    assert.equal(await page.inputValue('#prompt'),retained);
    assert.deepEqual(navigationSelections.at(-1),{token:'navigation-test-ticket',external_audio_muted:true,confirm_discard_edits:true});
    assert.equal(sends.length,beforeExplore.sends);assert.equal(installs.length,beforeExplore.installs);
    assert.deepEqual(errors,[]);
    console.log('AFX3 shared FM9 layout: workflow, fit, consent, reset, MK, audio, XSS; FW33 NAM foundation/two scenes, permanent install and separate Store consent passed');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
