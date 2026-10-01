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
    await page.click('#generate');await page.locator('#review:not([hidden])').waitFor();
    assert.equal(plans[0].wah_source,'External 1');assert.equal(plans[0].expected_preset,325);
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
    failRead=false;await page.click('#refresh');await page.locator('#generate:not([disabled])').waitFor();
    await page.setViewportSize({width:390,height:844});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);
    console.log('AFX3 text UI: Enter newline, explicit send, consent, stale draft, failure recovery, XSS, mobile passed');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
