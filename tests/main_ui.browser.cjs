// Run only against a local TONECOMMAND_SIM=1 server. No AI calls or writes.
const {chromium} = require(process.env.TC_PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');

(async () => {
  assert.equal(process.env.TC_BROWSER_SIM, '1', 'Explicit SIM server required');
  const base = process.env.TC_TEST_URL || 'http://127.0.0.1:8912';
  assert.equal(new URL(base).hostname, '127.0.0.1');
  const browser = await chromium.launch({headless:true,
    ...(process.env.TC_BROWSER_EXECUTABLE ? {executablePath:process.env.TC_BROWSER_EXECUTABLE} : {})});
  try {
    const page = await browser.newPage({viewport:{width:1280,height:1000}});
    const errors = [], posts = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      if (new URL(request.url()).origin !== new URL(base).origin) return route.abort();
      if (request.method() !== 'GET') {
        posts.push(request.url());
        return route.fulfill({status:409,contentType:'application/json',body:'{"error":"Smoke test is read-only"}'});
      }
      return route.continue();
    });
    const stateResponse = page.waitForResponse(r => r.url() === base + '/api/state', {timeout:30000});
    await page.goto(base + '/');
    const state = await (await stateResponse).json();
    assert.equal(state.connected, true);
    assert.equal(state.device.active, 'fm9');
    await page.locator('#prompt').fill('Browser smoke: do not generate a plan.');
    assert.equal(await page.locator('#prompt').inputValue(), 'Browser smoke: do not generate a plan.');
    await page.locator('#shset').click();
    await page.waitForFunction(() => !document.getElementById('drawer-settings').hidden);
    await page.locator('#drawclose').click();
    await page.waitForFunction(() => document.getElementById('drawer').hidden);
    await page.locator('#shact').click();
    await page.waitForFunction(() => !document.getElementById('drawer-activity').hidden);
    await page.locator('#drawclose').click();
    await page.locator('#shset').click();
    const initialScale = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale'));
    await page.locator('#tsup').click();
    assert.notEqual(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')), initialScale);
    await page.locator('#tsdown').click();
    await page.locator('#drawclose').click();
    assert.equal(await page.locator('a[href="/controllers"]').count(), 1);
    assert.equal(await page.evaluate(() => typeof runArtistInstall), 'function');
    assert.equal(await page.evaluate(() => typeof runAxeChange), 'function');
    assert.deepEqual(errors, []);
    assert.deepEqual(posts, []);
    if (process.env.TC_SCREENSHOT) await page.screenshot({path:process.env.TC_SCREENSHOT,fullPage:true});
    console.log('PASS: main UI parses, polls SIM, accepts text, opens drawers and controls text size; no AI requests or writes.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
