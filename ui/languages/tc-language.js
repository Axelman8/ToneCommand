/* Local i18next wrapper. Translation data never authorizes an action. */
(() => {
  'use strict';
  const STORAGE = 'tonecommand.language.v1';
  const LIMIT = 2 * 1024 * 1024;
  const LOCALE = /^[a-z]{2,3}(?:-[A-Z]{2})?$/;
  let catalog = null, selected = 'en', available = ['en'], revision = 0;
  const registered = [], loaded = new Map();
  const attrs = ['title', 'placeholder', 'aria-label'];
  const select = document.getElementById('tc-language-select');
  let status = document.getElementById('tc-language-status');
  let picker = null, controlsReady = false;
  const engine = window.i18next?.createInstance();
  if (engine) engine.init({lng: 'en', fallbackLng: 'en', initAsync: false,
    keySeparator: false, nsSeparator: false, returnNull: false,
    resources: {en: {translation: {}}},
    interpolation: {escapeValue: false}, saveMissing: false});

  function text(key, values = {}) {
    if (catalog?.protected_keys.includes(key)) return key.replace(/\{\{(\w+)\}\}/g,
      (_, name) => String(values[name] ?? '{{' + name + '}}'));
    return engine ? engine.t(key, values) : key.replace(/\{\{(\w+)\}\}/g,
      (_, name) => String(values[name] ?? '{{' + name + '}}'));
  }
  function placeholders(value) {
    return [...value.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort().join('|');
  }
  function validate(pack, locale) {
    if (!catalog) throw new Error('The English catalog is unavailable. Keep using English.');
    if (!pack || Object.getPrototypeOf(pack) !== Object.prototype || pack.schema !== 1
        || typeof pack.locale !== 'string' || !LOCALE.test(pack.locale) || pack.locale === 'en'
        || (locale && pack.locale !== locale) || typeof pack.name !== 'string'
        || !pack.name.trim() || pack.name.length > 60
        || pack.catalog_version !== catalog.catalog_version
        || pack.catalog_sha256 !== catalog.catalog_sha256
        || !pack.translations || Object.getPrototypeOf(pack.translations) !== Object.prototype)
      throw new Error('Invalid or incompatible bundled language. Keep using English.');
    const entries = Object.entries(pack.translations);
    if (!entries.length) throw new Error('The bundled language has no translations.');
    for (const [key, value] of entries) {
      if (!Object.hasOwn(catalog.translations, key) || typeof value !== 'string'
          || !value.trim() || value.length > 12000 || /\$t\(/.test(value)
          || (catalog.protected_keys.includes(key) && value !== key)
          || placeholders(value) !== placeholders(key))
        throw new Error('A bundled translation has invalid keys or placeholders. Keep using English.');
    }
    return pack;
  }
  // Bind initial shipped markup only. Never scan a later user/AI/device response.
  function capture(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, parent = node.parentElement;
      if (!parent || parent.closest('script,style,textarea,code,pre,[data-no-translate]')) continue;
      const value = node.nodeValue, key = value.trim();
      if (!key || !/[A-Za-z]/.test(key)) continue;
      if (parent.tagName === 'OPTION' && !parent.hasAttribute('value'))
        parent.setAttribute('value', parent.value);
      registered.push({node, key, prefix: value.slice(0, value.indexOf(key)),
        suffix: value.slice(value.indexOf(key) + key.length), last: value});
    }
    root.querySelectorAll('*').forEach(node => {
      if (node.closest('[data-no-translate]')) return;
      for (const attr of attrs) if (node.hasAttribute(attr)) {
        const key = node.getAttribute(attr);
        registered.push({node, attr, key, last: key});
      }
    });
  }
  function apply() {
    for (const entry of registered) {
      if (!entry.node.isConnected) continue;
      const current = entry.attr ? entry.node.getAttribute(entry.attr) : entry.node.nodeValue;
      if (current !== entry.last) continue;
      if (!catalog || !Object.hasOwn(catalog.translations, entry.key)) continue;
      const translated = text(entry.key);
      entry.last = entry.attr ? translated : entry.prefix + translated + entry.suffix;
      if (entry.attr) entry.node.setAttribute(entry.attr, entry.last);
      else entry.node.nodeValue = entry.last;
    }
    document.documentElement.lang = selected;
    syncControls();
    window.dispatchEvent(new CustomEvent('tc-language-changed', {detail: {locale: selected}}));
  }
  async function jsonAsset(name) {
    const response = await fetch('/language/' + name);
    if (!response.ok) throw new Error('Bundled language unavailable. Keep using English.');
    const raw = await response.text();
    if (raw.length > LIMIT) throw new Error('Bundled language is too large.');
    return JSON.parse(raw);
  }
  async function load(locale) {
    if (!available.includes(locale) || !LOCALE.test(locale))
      throw new Error('This language is not bundled with the app.');
    if (!loaded.has(locale)) loaded.set(locale, jsonAsset(locale + '.json')
      .then(pack => validate(pack, locale))
      .catch(error => { loaded.delete(locale); throw error; }));
    return loaded.get(locale);
  }
  async function choose(locale, persist = true) {
    const request = ++revision;
    if (!engine) throw new Error('The local translation engine is unavailable. Keep using English.');
    if (locale !== 'en') {
      const pack = await load(locale);
      if (request !== revision) return;
      engine.addResourceBundle(locale, 'translation', pack.translations, false, true);
    }
    if (request !== revision) return;
    selected = locale;
    await engine.changeLanguage(locale);
    if (request !== revision) return;
    apply();
    if (persist) {
      try { localStorage.setItem(STORAGE, JSON.stringify({locale: selected})); }
      catch { /* Session-only choice when browser storage is unavailable. */ }
    }
  }
  function syncControls() {
    if (select) select.value = selected;
    picker?.querySelectorAll('input[type=radio]').forEach(input => {
      input.checked = input.value === selected;
      input.disabled = !engine || !controlsReady;
    });
  }
  async function chooseFromControl(locale) {
    try {
      await choose(locale);
      if (status) status.textContent = text('Interface language changed. Existing plans and unsent input are unchanged.');
    } catch (error) {
      syncControls();
      if (status) status.textContent = error.message;
    }
  }
  function renderChoices(languages) {
    if (!picker) return;
    const options = picker.querySelector('.tc-language-options');
    options.replaceChildren(...languages.map(language => {
      const label = document.createElement('label');
      label.className = 'tc-language-choice';
      const badge = document.createElement('span');
      badge.className = 'tc-language-code'; badge.textContent = language.locale.toUpperCase();
      badge.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'tc-language-name'; name.textContent = language.name;
      const input = document.createElement('input');
      input.type = 'radio'; input.name = 'tc-interface-language'; input.value = language.locale;
      input.onchange = () => { if (input.checked) chooseFromControl(input.value); };
      label.append(input, name, badge);
      return label;
    }));
    syncControls();
  }
  function mountPicker() {
    if (select) return; // The upstream Settings dropdown needs no extra dialog.
    const style = document.createElement('link');
    style.rel = 'stylesheet'; style.href = '/language/tc-language.css';
    document.head.append(style);
    picker = document.createElement('dialog');
    picker.id = 'tc-language-dialog';
    picker.setAttribute('aria-labelledby', 'tc-language-title');
    picker.setAttribute('aria-describedby', 'tc-language-description');
    picker.innerHTML = '<div class="tc-language-heading"><span class="tc-language-icon" aria-hidden="true">'
      + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/></svg></span>'
      + '<div><h2 id="tc-language-title">Interface language</h2><p id="tc-language-description">Choose the language for menus and controls.</p></div></div>'
      + '<fieldset><legend>Choose your language</legend><div class="tc-language-options" data-no-translate></div></fieldset>'
      + '<p class="tc-language-note">Missing translations stay in English. Your requests, plans and device names are not translated.</p>'
      + '<p id="tc-language-status" role="status" aria-live="polite" data-no-translate></p>'
      + '<div class="tc-language-footer"><span>Changes apply immediately.</span><button type="button" class="tc-language-close">Done</button></div>';
    document.body.append(picker);
    status = picker.querySelector('#tc-language-status');
    picker.querySelector('button').onclick = () => picker.close();
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'tc-language-trigger';
    trigger.textContent = 'Language'; trigger.setAttribute('aria-label', 'Interface language');
    trigger.onclick = () => { syncControls(); picker.showModal(); };
    const settings = document.getElementById('drawer-settings');
    const header = document.querySelector('#hwbar .status, header, nav');
    (settings || header || document.body).append(trigger);
    renderChoices([{locale: 'en', name: 'English'}]);
  }
  mountPicker();
  capture(document.body);
  if (select) {
    select.disabled = true;
    select.onchange = () => chooseFromControl(select.value);
  }
  const ready = (async () => {
    let listReady = false;
    try {
      const english = await jsonAsset('en.json');
      if (english.schema !== 1 || english.locale !== 'en' || !english.translations
          || Object.getPrototypeOf(english.translations) !== Object.prototype
          || !Array.isArray(english.protected_keys)) throw new Error('Invalid English catalog.');
      catalog = english;
      engine?.addResourceBundle('en', 'translation', catalog.translations, false, true);
      const manifest = await jsonAsset('manifest.json');
      if (manifest.schema !== 1 || manifest.catalog_sha256 !== catalog.catalog_sha256
          || manifest.catalog_version !== catalog.catalog_version
          || !Array.isArray(manifest.languages) || manifest.languages.length > 32
          || !manifest.languages.some(item => item?.locale === 'en')
          || manifest.languages.some(item => !item || typeof item.locale !== 'string'
            || !LOCALE.test(item.locale) || typeof item.name !== 'string'
            || !item.name.trim() || item.name.length > 60)
          || new Set(manifest.languages.map(item => item.locale)).size !== manifest.languages.length)
        throw new Error('Invalid bundled language list. Keep using English.');
      available = manifest.languages.map(item => item.locale);
      listReady = true;
      controlsReady = true;
      renderChoices(manifest.languages);
      if (select) {
        select.replaceChildren(...manifest.languages.map(item => new Option(item.name, item.locale)));
        select.disabled = !engine;
      }
      let saved;
      try { saved = JSON.parse(localStorage.getItem(STORAGE) || 'null'); }
      catch { /* A damaged browser preference cannot prevent English startup. */ }
      // Only the bundled locale is restored; legacy imported translations are ignored.
      if (engine) await choose(available.includes(saved?.locale) ? saved.locale : 'en', false);
      else apply();
    } catch (error) {
      selected = 'en';
      if (engine) await engine.changeLanguage('en');
      apply();
      if (select) { select.value = 'en'; select.disabled = !engine || !listReady; }
      controlsReady = listReady;
      syncControls();
      if (status) status.textContent = error.message;
    }
  })();
  window.TCLanguage = Object.freeze({t: text, ready, validate,
    get locale() { return selected; }, get catalog() { return catalog; }});
})();
