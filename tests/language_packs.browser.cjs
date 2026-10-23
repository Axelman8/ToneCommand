// All network mocked: bundled languages never contact AI, accounts or MIDI.
const {chromium} = require(process.env.TC_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const folder = path.join(__dirname, '../ui/languages');
const read = name => fs.readFileSync(path.join(folder, name), 'utf8');
const catalog = JSON.parse(read('en.json'));
(async () => {
  const browser = await chromium.launch({headless:true,
    ...(process.env.TC_BROWSER_EXECUTABLE ? {executablePath:process.env.TC_BROWSER_EXECUTABLE} : {})});
  try {
    const page = await browser.newPage();
    const errors = [], requests = [];
    let brokenPack = null, brokenManifest = false, slowDutch = false, noEngine = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      requests.push({url:req.url(), method:req.method()});
      if(url.origin !== 'http://127.0.0.1:8909') return route.abort();
      if(url.pathname === '/') return route.fulfill({contentType:'text/html',body:
        '<html lang="en"><body><header></header><div id="drawer-settings">'
        + '<label for="tc-language-select">Language</label>'
        + '<select id="tc-language-select" aria-label="Interface language" data-no-translate>'
        + '<option value="en">English</option></select>'
        + '<p id="tc-language-status" role="status" data-no-translate></p></div>'
        + '<button id="sample">SETTINGS</button><p id="fallback">Chorus</p>'
        + '<p id="protected">External 1</p><p id="dynamic">Initial live preset</p>'
        + '<select id="wire"><option>External 1</option><option>Fast Pos</option></select>'
        + '<textarea id="prompt">Mijn verzoek</textarea><p id="live">Live preset name</p>'
        + '<input id="consent" type="checkbox" checked><div id="plan">My pending plan</div>'
        + '<script src="/language/i18next.min.js"></script><script src="/language/tc-language.js"></script>'
        + '<script>document.getElementById("live").textContent="Mijn preset";'
        + 'document.getElementById("dynamic").textContent="SETTINGS";</script></body></html>'});
      const asset = url.pathname.split('/').pop();
      if (asset === 'i18next.min.js' && noEngine) return route.fulfill({status:404,body:''});
      if (asset === 'nl.json' && slowDutch) await new Promise(resolve => setTimeout(resolve, 200));
      if (asset === 'nl.json' && brokenPack) return route.fulfill({json:brokenPack});
      if (asset === 'manifest.json' && brokenManifest) return route.fulfill({json:
        {...JSON.parse(read('manifest.json')),languages:[{locale:'../../secret',name:'bad'}]}});
      if(!fs.existsSync(path.join(folder, asset))) return route.fulfill({status:404,body:''});
      return route.fulfill({contentType:asset.endsWith('.js')?'text/javascript':'application/json',body:read(asset)});
    });
    const open = async () => {
      await page.goto('http://127.0.0.1:8909/');
      await page.evaluate(() => TCLanguage.ready);
    };
    const choose = async locale => {
      await page.locator('#tc-language-select').selectOption(locale);
      await page.waitForFunction(value => TCLanguage.locale === value, locale);
    };
    const preserved = async () => {
      assert.equal(await page.locator('#wire').inputValue(),'External 1');
      assert.equal(await page.locator('#prompt').inputValue(),'Mijn verzoek');
      assert.equal(await page.textContent('#live'),'Mijn preset');
      assert.equal(await page.textContent('#dynamic'),'SETTINGS');
      assert.equal(await page.textContent('#plan'),'My pending plan');
      assert.equal(await page.textContent('#protected'),'External 1');
      assert.equal(await page.textContent('#fallback'),'Chorus');
      assert(await page.locator('#consent').isChecked());
    };
    await open();
    assert.equal(await page.evaluate(() => TCLanguage.locale),'en');
    assert.deepEqual(await page.locator('#tc-language-select option').evaluateAll(nodes => nodes.map(n => [n.value,n.textContent])),
      [['en','English'],['de','Deutsch'],['nl','Nederlands']]);
    assert.equal(await page.locator('dialog,input[type=file]').count(),0);
    await choose('nl');
    assert.equal(await page.textContent('#sample'),'INSTELLINGEN');
    await preserved();
    await choose('de');
    assert.equal(await page.textContent('#sample'),'EINSTELLUNGEN');
    await preserved();
    await open();
    assert.equal(await page.evaluate(() => TCLanguage.locale),'de');
    assert.equal(await page.textContent('#sample'),'EINSTELLUNGEN');
    await choose('en');
    assert.equal(await page.textContent('#sample'),'SETTINGS');

    const pack = JSON.parse(read('nl.json'));
    for (const translations of [
      {[catalog.protected_keys[0]]:'Unsafe replacement'}, {'not-a-key':'x'},
      {'{{v0}} ms (shared A)':'without placeholder'}, {'Language':'$t(secret)'},
    ]) {
      const result = await page.evaluate(candidate => {
        try { TCLanguage.validate(candidate); return 'accepted'; } catch(e) { return e.message; }
      }, {...pack, translations});
      assert.match(result,/invalid keys or placeholders/);
    }
    const protectedTemplate = catalog.protected_keys.find(key => key.includes('{{v0}}'));
    if(protectedTemplate) assert(!(await page.evaluate(key => TCLanguage.t(key,{v0:'test'}),protectedTemplate)).includes('{{v0}}'));

    // Stored legacy imports are ignored, even if they claim the current locale.
    await page.evaluate(value => localStorage.setItem('tonecommand.language.v1', JSON.stringify({
      locale:'nl',pack:{...value,translations:{'SETTINGS':'UNTRUSTED OLD IMPORT'}}})), pack);
    await open();
    assert.equal(await page.textContent('#sample'),'INSTELLINGEN');
    await choose('en');

    // Bad bundled files leave the previous choice, draft and consent untouched.
    brokenPack = {...pack,catalog_sha256:'incompatible'};
    await open();
    await page.locator('#tc-language-select').selectOption('nl');
    await page.waitForFunction(() => document.getElementById('tc-language-status').textContent.includes('incompatible'));
    assert.equal(await page.evaluate(() => TCLanguage.locale),'en');
    await preserved();
    await page.evaluate(() => localStorage.setItem('tonecommand.language.v1', '{"locale":"nl"}'));
    await open();
    assert.equal(await page.evaluate(() => TCLanguage.locale),'en');
    assert(!(await page.locator('#tc-language-select').isDisabled()));
    await choose('de');
    await choose('en');
    brokenPack = null;

    // A late response from an earlier selection must not undo the latest choice.
    await open();
    slowDutch = true;
    await page.locator('#tc-language-select').selectOption('nl');
    await choose('de');
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => TCLanguage.locale),'de');
    assert.equal(await page.textContent('#sample'),'EINSTELLUNGEN');
    slowDutch = false;

    brokenManifest = true;
    await open();
    assert.equal(await page.evaluate(() => TCLanguage.locale),'en');
    assert(await page.locator('#tc-language-select').isDisabled());
    brokenManifest = false;

    // Browser storage and the translation engine are optional for English operation.
    await page.addInitScript(() => Object.defineProperty(window,'localStorage',{get(){throw new Error('Storage blocked');}}));
    await open();
    await choose('nl');
    await preserved();
    noEngine = true;
    await open();
    assert.equal(await page.evaluate(() => TCLanguage.locale),'en');
    assert(await page.locator('#tc-language-select').isDisabled());
    await preserved();
    assert(requests.every(r=>r.method==='GET' && r.url.startsWith('http://127.0.0.1:8909/')));
    assert(!requests.some(r=>r.url.includes('/api/')));
    assert.deepEqual(errors,[]);
    console.log('PASS: Settings-only bundled EN/NL/DE, fallback, persistence, legacy-import rejection, invalid packs, racing choices, no-storage/no-engine and preserved draft/plan/consent/wire values.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
