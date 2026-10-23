// Real Chrome, shipped FX3 markup, every request mocked; no MIDI or AI.
const {chromium} = require(process.env.TC_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
(async () => {
  const browser = await chromium.launch({headless: true,
    ...(process.env.TC_BROWSER_EXECUTABLE ? {executablePath: process.env.TC_BROWSER_EXECUTABLE} : {})});
  try {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const req = route.request(), url = new URL(req.url());
      requests.push({method: req.method(), url: req.url()});
      if (url.origin !== 'http://127.0.0.1:8909' || req.method() !== 'GET') return route.abort();
      if (url.pathname === '/axefx3') {
        let html = fs.readFileSync(path.join(root, 'ui/axefx3.html'), 'utf8');
        // Keep the shipped surface, but never run a real design/device request.
        html = html.replace(/<script[^>]*src="\/axefx3\.js"[^>]*><\/script>/g, '');
        return route.fulfill({contentType: 'text/html', body: html});
      }
      if (url.pathname === '/simple') return route.fulfill({contentType: 'text/html', body:
        '<html><head></head><body><header></header><button id="sample">SETTINGS</button>'
        + '<textarea id="prompt">Keep my draft</textarea><div id="plan">Keep my plan</div>'
        + '<input id="consent" type="checkbox" checked><script src="/language/i18next.min.js"></script>'
        + '<script src="/language/tc-language.js"></script></body></html>'});
      let asset;
      if (url.pathname.startsWith('/language/')) asset = path.join(root, 'ui/languages', path.basename(url.pathname));
      if (url.pathname === '/axefx3.css') return route.fulfill({contentType: 'text/css',
        body: fs.readFileSync(path.join(root, 'ui/index.html'), 'utf8').split('<style>')[1].split('</style>')[0]});
      if (asset && fs.existsSync(asset)) return route.fulfill({contentType:
        asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : 'application/json',
        body: fs.readFileSync(asset)});
      return route.fulfill({status: 404, body: ''});
    });
    const open = async url => {
      await page.goto('http://127.0.0.1:8909' + url);
      await page.evaluate(() => TCLanguage.ready);
      await page.locator('.tc-language-trigger').click();
    };
    const choose = async locale => {
      await page.locator('input[name="tc-interface-language"][value="' + locale + '"]').check();
      await page.waitForFunction(value => TCLanguage.locale === value, locale);
    };
    await open('/axefx3');
    const dialog = page.locator('#tc-language-dialog');
    assert(await dialog.isVisible());
    assert.equal(await dialog.locator('input[type=radio]').count(), 3);
    assert(await dialog.locator('.tc-language-choice').evaluateAll(rows =>
      rows.every(row => row.firstElementChild.tagName === 'INPUT')));
    assert.equal(await dialog.locator('input[type=file],a').count(), 0);
    assert.equal(await dialog.getAttribute('aria-labelledby'), 'tc-language-title');
    await page.keyboard.press('Escape');
    await page.locator('#prompt').fill('Do not discard my design request');
    assert.equal(await page.locator('#prompt').inputValue(), 'Do not discard my design request');
    await page.locator('.tc-language-trigger').click();
    for (const locale of ['nl', 'de', 'en']) {
      await choose(locale);
      assert.equal(await page.locator('#prompt').inputValue(), 'Do not discard my design request');
      assert(await dialog.locator('input[value="' + locale + '"]').isChecked());
    }
    await choose('nl');
    assert.equal(await page.textContent('#tc-language-title'), 'Interfacetaal');
    assert.equal(await page.textContent('.tc-language-close'), 'Gereed');
    for (const width of [1440, 1180, 390]) {
      await page.setViewportSize({width, height: 900});
      const box = await dialog.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width);
      assert(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1));
      const font = await dialog.evaluate(e => getComputedStyle(e).fontFamily);
      assert.match(font, /system-ui/);
    }
    await page.setViewportSize({width: 1280, height: 900});
    const screenshot = process.env.TC_LANGUAGE_SCREENSHOT;
    if (screenshot) await dialog.screenshot({path: screenshot});
    await page.keyboard.press('Escape');
    assert(!(await dialog.isVisible()));
    assert(await page.locator('.tc-language-trigger').evaluate(e => e === document.activeElement));
    await page.reload();
    await page.evaluate(() => TCLanguage.ready);
    assert.equal(await page.evaluate(() => TCLanguage.locale), 'nl');
    await open('/simple');
    await choose('de');
    assert.equal(await page.textContent('#sample'), 'EINSTELLUNGEN');
    assert.equal(await page.textContent('#plan'), 'Keep my plan');
    assert.equal(await page.locator('#prompt').inputValue(), 'Keep my draft');
    assert(await page.locator('#consent').isChecked());
    // Native radio keyboard navigation, then an explicit close button.
    await page.locator('input[value="de"]').focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => TCLanguage.locale === 'nl');
    await page.locator('.tc-language-close').click();
    assert(!(await dialog.isVisible()));
    assert.deepEqual(errors, []);
    assert(requests.every(r => r.method === 'GET' && !r.url.includes('/api/')));
    console.log('PASS: shipped FX3 language cards, EN/NL/DE, narrow layout, keyboard/focus, persistence and unchanged draft/plan/consent.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode = 1;});
