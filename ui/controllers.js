'use strict';
const el = id => document.getElementById(id);
let current = null, review = null, busy = false;

async function api(path, body) {
  const response = await fetch('/api/controllers/' + path, body === undefined ? {} : {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : (data.error || 'Verzoek geweigerd. Lees de status opnieuw uit.'));
  return data;
}
function message(text) { el('status').textContent = text; }
function invalidate() {
  review = null; el('review').hidden = true;
  el('targetConfirmed').checked = el('muted').checked = false;
  controls();
}
function controls() {
  const linked = !!current?.connected;
  const selected = linked || !!current?.controller_selected;
  el('connect').disabled = busy || linked;
  el('disconnect').disabled = busy || !selected;
  el('refresh').disabled = busy || !linked;
  el('back').hidden = selected;
  el('send').disabled = busy || !review || !el('targetConfirmed').checked || !el('muted').checked;
  el('cancel').disabled = busy;
  document.querySelectorAll('#rows button,#rows select').forEach(node => {
    node.disabled = busy || !!current?.gig_locked || node.dataset.blocked === 'true';
  });
}
async function run(action) {
  if (busy) return;
  busy = true; controls(); message('Bezig...');
  try { await action(); }
  catch (error) { invalidate(); message(error.message); }
  finally { busy = false; controls(); }
}
function option(select, value, label) {
  const node = document.createElement('option'); node.value = value; node.textContent = label; select.append(node);
}
function labeledSelect(label, id) {
  const wrap = document.createElement('label'); wrap.textContent = label;
  const select = document.createElement('select'); select.id = id; wrap.append(select);
  return [wrap, select];
}
async function load() {
  invalidate();
  current = await api('state');
  el('targets').hidden = !current.connected;
  el('connection').textContent = current.connected
    ? `Axe-Fx III | FW ${current.firmware} | Preset ${current.preset}: ${current.preset_name} | Scene ${current.scene}`
    : 'Nog niet verbonden. Sluit Axe-Edit en andere TC-sessies voordat je verbindt.';
  el('rows').replaceChildren();
  for (const target of current.targets || []) {
    const row = document.createElement('div'); row.className = 'row';
    const title = document.createElement('div'); const heading = document.createElement('h3'); heading.textContent = target.label;
    const before = document.createElement('p'); before.textContent = `Nu: ${target.source_name} | Auto Engage: ${target.auto_engage || 'niet ingesteld'}`;
    title.append(heading, before);
    const [sourceLabel, source] = labeledSelect('Controller', 'source-' + target.effect_id);
    option(source, '', target.source ? 'Huidige koppeling behouden' : 'Niet koppelen');
    for (const item of current.sources) option(source, item.value, item.label);
    const [modeLabel, mode] = labeledSelect('Auto Engage', 'mode-' + target.effect_id);
    option(mode, '', 'Behouden (nieuw: Off)');
    for (const item of target.modes) option(mode, item, item);
    if (target.effect_id === 102) { mode.value = 'Off'; mode.dataset.blocked = 'true'; }
    source.dataset.blocked = String(!target.writable);
    if (!target.writable) mode.dataset.blocked = 'true';
    const button = document.createElement('button'); button.textContent = 'Controleer';
    button.dataset.blocked = 'true';
    const changed = () => {
      invalidate();
      button.dataset.blocked = String(!target.writable || (!source.value && !mode.value));
      // Volume's fixed Off is not itself a request.
      if (target.effect_id === 102 && !source.value) button.dataset.blocked = 'true';
      controls();
    };
    source.onchange = mode.onchange = changed;
    button.onclick = () => run(async () => {
      invalidate(); el('result').hidden = true;
      const chosen = source.value ? Number(source.value) : target.source;
      if (![12,13].includes(chosen)) throw new Error('Kies eerst External 1 of External 2.');
      review = await api('review', {effect_id:target.effect_id, source:chosen, auto_engage:mode.value || null});
      el('reviewDetails').replaceChildren();
      for (const [key, value] of [
        ['Preset', `${review.preset}: ${review.preset_name}`], ['Doel', review.target],
        ['Controller', `${review.before_source} → ${review.after_source}`],
        ['Auto Engage', `${review.before_auto || 'niet ingesteld'} → ${review.after_auto}`],
        ['Koppeling', review.new_binding ? 'Nieuw, met apparaatcurve' : 'Bestaande curve behouden']
      ]) {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = key; dd.textContent = value; el('reviewDetails').append(dt,dd);
      }
      el('review').hidden = false; el('review').focus(); message('Voorstel klaar. Er is nog niets verzonden.');
    });
    row.append(title,sourceLabel,modeLabel,button);
    if (target.reason) { const p=document.createElement('p'); p.className='reason'; p.textContent=target.reason; row.append(p); }
    el('rows').append(row);
  }
  el('empty').hidden = !!current.targets?.length;
  message(current.gig_locked ? 'GIG LOCK staat aan; wijzigen is geblokkeerd.' : 'Status uitgelezen. Het uitlezen heeft niets gewijzigd.');
}
el('connect').onclick = () => run(async () => {
  try { await api('connect', {}); }
  catch(error) { await load(); throw error; }
  await load();
});
el('refresh').onclick = () => run(load);
el('disconnect').onclick = () => run(async () => { await api('disconnect', {}); await load(); });
el('cancel').onclick = () => run(async () => { invalidate(); await api('discard', {}); message('Voorstel geannuleerd. Niets verzonden.'); });
el('targetConfirmed').onchange = el('muted').onchange = controls;
el('send').onclick = () => run(async () => {
  const token = review?.token;
  const confirmed = el('targetConfirmed').checked, muted = el('muted').checked;
  if (!token || !confirmed || !muted) throw new Error('Controleer het voorstel en bevestig eerst beide vakjes.');
  invalidate();
  let result;
  try { result = await api('send', {token, target_confirmed:confirmed, external_audio_muted:muted}); }
  catch(error) {
    throw new Error('Verzending niet bevestigd. Houd de audio gedempt en lees de status opnieuw uit voordat je verdergaat. Geen automatische herhaling. ' + error.message);
  }
  el('resultTitle').textContent = result.ok ? 'Koppeling teruggelezen en bevestigd' : 'Verzending gestopt';
  el('resultText').textContent = (result.ok
    ? 'De modifier is gecontroleerd op de Fractal. Test de fysieke pedaalwerking; readback bewijst geen hoorbaar resultaat.'
    : result.results.map(r=>r.detail).join('\n') + ' Er kunnen gedeeltelijke wijzigingen achterblijven; houd de audio gedempt.')
    + ' Niets permanent opgeslagen. Geen automatische Undo.';
  el('result').hidden = false; el('result').focus();
  await load();
  message(result.ok ? 'Verzending afgerond. Fysieke bediening en luidheid nog controleren.' : 'Gestopt. Niet automatisch opnieuw verzenden.');
});
run(load);
