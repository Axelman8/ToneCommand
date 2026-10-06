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
    page.on('pageerror',e=>errors.push(e.message));
    let failPlan=false,failSend=false,failRead=false;
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url()),name=url.pathname.split('/').pop();
      if(url.pathname==='/axefx3'||url.pathname==='/axefx3.js'){
        return route.fulfill({contentType:name.endsWith('.js')?'text/javascript':'text/html',
          body:fs.readFileSync(path.join(__dirname,'../ui',name==='axefx3'?'axefx3.html':name),'utf8')});
      }
      if(!url.pathname.startsWith('/api/axefx3/'))return route.fulfill({status:404,body:''});
      let status=200,result={};
      if(name==='state'){
        result={connected:true,preset:325,name:'Test',scene:1,firmware:'32.06',cab_count:20};
        if(failRead){status=409;result={detail:'Read failed'};}
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
            drive:i===0?{active:true,drive:6,tone:4,level:2,mix:100}:null,
            compressor:i===1?{active:true,threshold:-30,ratio:4,attack_ms:5,release_ms:250,mix:75,level:-12}:null,
            geq:i===2?{active:true,gains:Array(10).fill(-3),level:-6}:null,
            peq:i===3?{active:true,bands:[200,400,800,1600,3200].map(frequency_hz=>({frequency_hz,gain:-3})),level:-6}:null}))};
        if(failPlan){status=409;result={detail:'AI output refused'};}
      }
      if(name==='send'){
        sends.push(req.postDataJSON());
        result={ok:!failSend,skipped:failSend?100:0,stored:false,
          results:[{ok:!failSend,detail:failSend?'Readback mismatch':'Verified'}]};
      }
      if(name==='cabs')result={imported:20};
      await route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});
    });
    await page.goto('http://tc.test/axefx3');
    await page.locator('#generate:not([disabled])').waitFor();
    await page.fill('#prompt','Maak vier scenes');
    await page.press('#prompt','End');await page.press('#prompt','Enter');
    assert.equal(plans.length,0);assert((await page.inputValue('#prompt')).endsWith('\n'));
    await page.selectOption('#wah','External 1');
    assert(await page.locator('#wahMode').isEnabled());
    assert.match(await page.textContent('#controllerHint'),/scene met Wah uit/);
    await page.selectOption('#wahMode','Off');
    await page.click('#generate');await page.locator('#review:not([hidden])').waitFor();
    assert.equal(plans[0].wah_source,'External 1');assert.equal(plans[0].expected_preset,325);
    assert.equal(plans[0].wah_auto_engage,'Off');
    assert.equal(await page.locator('#sceneRows tr').count(),4);
    assert.match(await page.textContent('#sceneRows'),/280 ms/);
    assert.match(await page.textContent('#sceneRows'),/Analog Stereo \| 0.3 Hz \| depth 25% \| mix 20%/);
    assert.equal(await page.locator('#sceneRows tr').first().locator('td').count(),7);
    assert.match(await page.textContent('#sceneRows'),/Drive: gain 6, tone 4, level 2\/10/);
    assert.match(await page.textContent('#sceneRows'),/Compressor: threshold -30 dB/);
    assert.match(await page.textContent('#sceneRows'),/GEQ: 10 banden/);
    assert.match(await page.textContent('#sceneRows'),/Q behouden/);
    assert.match(await page.textContent('#sceneRows tr:nth-child(3)'),/Bestaand behouden/);
    assert.match(await page.textContent('#controllerChoice'),/Auto Engage: Off/);
    assert.match(await page.textContent('#toneChoice'),/Test Greenback \(USER 1 slot 28\)/);
    if(process.env.TC_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.TC_SCREENSHOT_DIR,'wah-review-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(process.env.TC_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.TC_SCREENSHOT_DIR,'wah-review-mobile.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    assert.equal(await page.locator('#planWarnings img').count(),0);
    assert.equal(await page.locator('#requestPanel').getAttribute('open'),null);
    await page.click('#requestPanel summary');
    assert.equal(await page.inputValue('#prompt'),'Maak vier scenes\n');
    assert.equal(await page.locator('#summary img').count(),0);
    assert(await page.locator('#send').isDisabled());
    await page.check('#confirmed');assert(await page.locator('#send').isDisabled());
    await page.check('#muted');assert(await page.locator('#send').isEnabled());
    await page.fill('#prompt','Different sound');
    assert(await page.locator('#review').isHidden());assert.equal(sends.length,0);
    await page.click('#generate');await page.locator('#review:not([hidden])').waitFor();
    assert(!(await page.isChecked('#confirmed')));
    await page.check('#confirmed');await page.check('#muted');await page.click('#send');
    await page.locator('#result:not([hidden])').waitFor();await page.locator('#refresh:not([disabled])').waitFor();
    assert.equal(sends.length,1);assert.equal(sends[0].external_audio_muted,true);
    assert.match(await page.textContent('#resultText'),/Niets permanent opgeslagen/);
    await page.click('#requestPanel summary');
    failPlan=true;await page.click('#generate');
    await page.waitForFunction(()=>document.getElementById('status').textContent==='AI output refused');
    assert(await page.locator('#review').isHidden());assert(await page.locator('#generate').isEnabled());
    failPlan=false;failSend=true;
    await page.click('#generate');await page.locator('#review:not([hidden])').waitFor();
    await page.check('#confirmed');await page.check('#muted');await page.click('#send');
    await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Gestopt.'));
    assert.equal(sends.length,2);assert.match(await page.textContent('#resultText'),/Readback mismatch/);
    // Read errors may not leave the old target usable for planning.
    failRead=true;await page.click('#refresh');
    await page.waitForFunction(()=>document.getElementById('status').textContent==='Read failed');
    assert(await page.locator('#generate').isDisabled());
    failRead=false;await page.click('#refresh');await page.locator('#generate:not([disabled])').waitFor({state:'attached'});
    await page.click('#requestPanel summary');
    await page.selectOption('#wahMode','Fast Pos');
    await page.click('#generate');await page.locator('#review:not([hidden])').waitFor();
    await page.click('#requestPanel summary');
    await page.selectOption('#wahMode','Off');
    assert(await page.locator('#review').isHidden());
    assert(!(await page.isChecked('#confirmed')));
    await page.selectOption('#wah','');
    assert(await page.locator('#wahMode').isDisabled());
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    console.log('AFX3 text UI: scene table, controller mode, retained collapsible request, Enter newline, consent, stale draft, failure recovery, XSS, mobile passed');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
