// Scan: read a receipt or a fridge photo with Claude (vision) and turn it into inventory items.
// Calls the Anthropic Messages API directly from the phone with the user's own key (no server, no build step).
(function () {
  'use strict';
  const F = window.__fridge;
  const { CATEGORIES } = window.FOOD;
  const $ = (s, el = document) => el.querySelector(s);
  const KEY_STORE = 'fridgeapp.apikey';
  const MODEL = 'claude-opus-5-5';
  const UNITS = ['ud', 'kg', 'g', 'l', 'ml', 'paquete'];
  const LOCS = ['nevera', 'congelador', 'despensa'];
  const CAT_KEYS = Object.keys(CATEGORIES);

  let mode = 'receipt';
  let result = null; // { kind, store, date, total, lines: [...] }

  function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
  function setKey(k) { try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch (e) {} }

  // ---------- Image: downscale so the long edge is ≤ 1568 px (what the model sees anyway) ----------
  async function toJpegBase64(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('This photo format could not be opened.')); i.src = url; });
      const max = 1568, scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      return { b64: dataUrl.split(',')[1], preview: dataUrl };
    } finally { URL.revokeObjectURL(url); }
  }

  // ---------- Schema the model must answer with ----------
  const nul = (t) => ({ anyOf: [{ type: t }, { type: 'null' }] });
  const SCHEMA = {
    type: 'object', additionalProperties: false,
    required: ['is_readable', 'problem', 'store', 'date', 'tax', 'total', 'items'],
    properties: {
      is_readable: { type: 'boolean' },
      problem: nul('string'),
      store: nul('string'),
      date: nul('string'),
      tax: nul('number'),
      total: nul('number'),
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['raw', 'name', 'qty', 'unit', 'price', 'category', 'location', 'expires_in_days', 'is_food', 'confidence'],
          properties: {
            raw: { type: 'string' },
            name: { type: 'string' },
            qty: { type: 'number' },
            unit: { type: 'string', enum: UNITS },
            price: nul('number'),
            category: { type: 'string', enum: CAT_KEYS },
            location: { type: 'string', enum: LOCS },
            expires_in_days: nul('integer'),
            is_food: { type: 'boolean' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
        },
      },
    },
  };

  const CAT_GUIDE = CAT_KEYS.map(k => `${k} = ${CATEGORIES[k].label}`).join('; ');
  const COMMON = `Units: ud = pieces, paquete = pack, plus kg, g, l, ml. Categories: ${CAT_GUIDE}. Locations: nevera = fridge, congelador = freezer, despensa = pantry. ` +
    `"name" is a short, plain English grocery name a person would say (e.g. "Whole milk", "Chicken thighs", "Cheddar cheese"), never the store's abbreviation. ` +
    `"expires_in_days" is a realistic shelf life from today for that item where it will be stored, or null if you cannot judge. ` +
    `Set confidence to "low" when you are guessing. If the photo is not what was asked for or is too blurry, set is_readable false and explain in "problem" in one short sentence.`;

  const PROMPTS = {
    receipt: `This is a photo of a grocery receipt (likely Canada or the US). Return one entry per purchased line. ` +
      `"raw" is the line text exactly as printed. "price" is the final price paid for that line after any line discount, as a number. ` +
      `If a line shows a quantity or weight (e.g. "2 @ 1.99" or "0.734 kg @ 8.80/kg"), use it for qty and unit; otherwise qty 1 and unit ud. ` +
      `Skip subtotal, tax (GST/HST/PST), deposits and fees, bag charges, payment and loyalty lines, but do include non-food items with is_food false. ` +
      `"tax" is the sum of all tax lines (GST/HST/PST/sales tax) plus deposits, bag and other fees, or null if none. "total" is the final amount paid. "date" is the purchase date as YYYY-MM-DD, or null. "store" is the store name, or null. ${COMMON}`,
    fridge: `This is a photo of the inside of a fridge, freezer, pantry shelf or groceries on a counter. List every distinct food item you can identify. ` +
      `"raw" is a few words on what you see (e.g. "carton on top shelf, Natrel label"). Estimate qty with unit ud or paquete when you cannot know the weight. ` +
      `"price" is always null. "store", "date", "tax" and "total" are null. Do not invent items you cannot see; if something is only partly visible, include it with confidence low. ${COMMON}`,
  };

  async function recognize(b64) {
    const key = getKey();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        fallbacks: 'default',
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            { type: 'text', text: `Today is ${F.todayISO()}. ${PROMPTS[mode]}` },
          ],
        }],
      }),
    });
    let body = null;
    try { body = await res.json(); } catch (e) {}
    if (!res.ok) {
      const msg = body?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401) throw new Error('The API key was rejected. Check it in Recognition settings below.');
      if (res.status === 429) throw new Error('Too many requests right now. Wait a minute and try again.');
      if (res.status === 400 && /credit|billing/i.test(msg)) throw new Error('Your Anthropic account has no credit left. Add credit at console.anthropic.com.');
      throw new Error(`Recognition failed: ${msg}`);
    }
    if (body.stop_reason === 'refusal') throw new Error('The photo could not be processed. Try another photo.');
    if (body.stop_reason === 'max_tokens') throw new Error('The receipt was too long to read in one go. Try photographing it in two halves.');
    const text = (body.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    try { return JSON.parse(text); } catch (e) { throw new Error('The answer could not be read. Try again.'); }
  }

  // ---------- Turn the model's answer into editable review lines ----------
  function prepare(data) {
    const db = F.db;
    const lines = (data.items || []).map(it => {
      const alias = db.aliases?.[F.nameKey(it.raw)];
      const name = alias?.name || F.cap(it.name || it.raw || '');
      const learned = db.learned[F.nameKey(name)];
      const category = alias?.category || learned?.category || (CAT_KEYS.includes(it.category) ? it.category : 'otros');
      const location = alias?.location || learned?.location || (LOCS.includes(it.location) ? it.location : CATEGORIES[category].loc);
      let days = Number.isInteger(it.expires_in_days) && it.expires_in_days >= 0 ? it.expires_in_days : null;
      if (days == null) days = location === 'congelador' ? CATEGORIES.congelado.days : CATEGORIES[category].days;
      return {
        raw: it.raw || '', name, origName: name, qty: it.qty > 0 ? it.qty : 1, unit: UNITS.includes(it.unit) ? it.unit : 'ud',
        price: typeof it.price === 'number' ? Math.round(it.price * 100) / 100 : null,
        category, location, days, on: it.is_food !== false, isFood: it.is_food !== false,
        low: it.confidence === 'low', remembered: !!alias,
      };
    });
    return { kind: mode, store: data.store || null, date: data.date || null, tax: typeof data.tax === 'number' ? data.tax : null, total: typeof data.total === 'number' ? data.total : null, lines };
  }

  // ---------- Rendering ----------
  const EXPLAIN = {
    receipt: 'Take a flat, well-lit photo of the whole receipt. You will check every line before anything is saved.',
    fridge: 'Photograph one shelf at a time, door open, with good light. Expect to correct a few items: hidden items and expiry dates cannot be seen.',
  };
  function show(state) {
    $('#scan-start').hidden = state !== 'start';
    $('#scan-busy').hidden = state !== 'busy';
    $('#scan-review').hidden = state !== 'review';
    $('.seg', $('#view-scan')).hidden = state === 'review' || state === 'busy';
    $('#scan-explain').hidden = state !== 'start';
    if (state !== 'error-keep') $('#scan-error').hidden = true;
  }
  function renderStart() {
    document.querySelectorAll('.scan-mode').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    $('#scan-explain').textContent = EXPLAIN[mode];
    const hasKey = !!getKey();
    $('#api-key').value = hasKey ? '••••••••••••' + getKey().slice(-4) : '';
    if (!hasKey) $('#scan-settings').open = true;
  }
  function error(msg) {
    const e = $('#scan-error'); e.textContent = msg; e.hidden = false;
  }

  function opt(v, label, sel) { return `<option value="${v}"${v === sel ? ' selected' : ''}>${label}</option>`; }
  function renderReview() {
    const r = result, money = F.money;
    const on = r.lines.filter(l => l.on);
    const sum = r.lines.reduce((s, l) => s + (l.price || 0), 0);
    let summary = '';
    if (r.kind === 'receipt') {
      const title = [r.store, r.date].filter(Boolean).join(' · ') || 'Receipt';
      summary = `<strong>${F.esc(title)}</strong>${r.lines.length} lines read`;
      if (r.total != null) {
        const tax = r.tax || 0;
        const diff = Math.round((r.total - sum - tax) * 100) / 100;
        summary += ` · lines ${money.format(sum)}${tax ? ` + tax and fees ${money.format(tax)}` : ''}, receipt total ${money.format(r.total)}`;
        summary += Math.abs(diff) < 0.01 ? ' <span class="okk">✓ adds up</span>'
          : ` <span class="warn">${money.format(Math.abs(diff))} ${diff > 0 ? 'missing' : 'too much'}: check the prices</span>`;
      }
    } else {
      summary = `<strong>Found ${r.lines.length} item${r.lines.length === 1 ? '' : 's'}</strong>Untick anything that is wrong or already in your inventory.`;
    }
    $('#scan-summary').innerHTML = summary;
    $('#scan-lines').innerHTML = r.lines.map((l, i) => `
      <li class="rline${l.on ? '' : ' off'}" data-i="${i}">
        <input type="checkbox" data-f="on" ${l.on ? 'checked' : ''} aria-label="Include ${F.esc(l.name)}">
        <div class="rfields">
          ${l.raw ? `<div class="rraw" title="${F.esc(l.raw)}">${F.esc(l.raw)}${l.remembered ? ' · remembered' : ''}</div>` : ''}
          <input class="rname" data-f="name" value="${F.esc(l.name)}" aria-label="Name">
          ${l.low ? '<span class="conf-low">Not sure about this one, please check</span>' : ''}
          ${!l.isFood ? '<span class="conf-low">Not food, unticked</span>' : ''}
          <div class="rrow">
            <label class="mini">Qty<input data-f="qty" inputmode="decimal" value="${String(l.qty)}"></label>
            <label class="mini">Unit<select data-f="unit">${UNITS.map(u => opt(u, F.UL(u), l.unit)).join('')}</select></label>
            <label class="mini">Where<select data-f="location">${LOCS.map(x => opt(x, F.LOC_LABEL[x], l.location)).join('')}</select></label>
          </div>
          <div class="rrow">
            ${r.kind === 'receipt' ? `<label class="mini">Price<input data-f="price" inputmode="decimal" value="${l.price != null ? l.price.toFixed(2) : ''}"></label>` : '<span></span>'}
            <label class="mini">Days left ≈<input data-f="days" inputmode="numeric" value="${l.days}"></label>
            <span></span>
          </div>
        </div>
      </li>`).join('');
    $('#scan-add').textContent = on.length ? `Add ${on.length} item${on.length === 1 ? '' : 's'} to inventory` : 'Nothing selected';
    $('#scan-add').disabled = on.length === 0;
  }

  function num(v) { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; }
  $('#scan-lines').addEventListener('input', e => {
    const row = e.target.closest('.rline'); if (!row) return;
    const l = result.lines[Number(row.dataset.i)], f = e.target.dataset.f;
    if (f === 'on') { l.on = e.target.checked; renderReview(); return; }
    if (f === 'name') l.name = e.target.value;
    if (f === 'qty') l.qty = num(e.target.value) ?? l.qty;
    if (f === 'price') { l.price = num(e.target.value); }
    if (f === 'days') l.days = Math.max(0, Math.round(num(e.target.value) ?? l.days));
    if (f === 'unit' || f === 'location') l[f] = e.target.value;
  });
  $('#scan-lines').addEventListener('change', e => { if (['price', 'on'].includes(e.target.dataset.f)) renderReview(); });

  $('#scan-review').addEventListener('submit', e => {
    e.preventDefault();
    const db = F.db, today = F.todayISO(), r = result;
    const bought = r.kind === 'receipt' && /^\d{4}-\d{2}-\d{2}$/.test(r.date || '') ? r.date : today;
    const purchaseId = r.kind === 'receipt' ? 'p' + Date.now().toString(36) : null;
    let added = 0;
    for (const l of r.lines) {
      // Remember corrections of the printed line, so the next receipt with the same line is named right
      if (l.raw && r.kind === 'receipt') {
        db.aliases = db.aliases || {};
        if (l.name.trim() && (l.name !== l.origName || l.remembered)) db.aliases[F.nameKey(l.raw)] = { name: F.cap(l.name), category: l.category, location: l.location };
      }
      if (!l.on || !l.name.trim()) continue;
      db.items.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        name: F.cap(l.name), category: l.category, location: l.location,
        qty: l.qty, unit: l.unit, origQty: l.qty, price: l.price ?? null,
        boughtAt: bought, expiresAt: F.addDays(today, l.days), expiryEstimated: true,
        minStock: db.learned[F.nameKey(l.name)]?.minStock ?? null, createdAt: Date.now(), purchaseId,
        source: r.kind === 'receipt' ? 'receipt' : 'photo',
      });
      added++;
    }
    if (r.kind === 'receipt') {
      db.purchases = db.purchases || [];
      db.purchases.push({
        id: purchaseId, store: r.store, date: bought, tax: r.tax, total: r.total, currency: db.settings.currency, createdAt: Date.now(),
        lines: r.lines.map(l => ({ raw: l.raw, name: l.name, qty: l.qty, unit: l.unit, price: l.price, isFood: l.isFood, added: l.on })),
      });
    }
    F.save();
    result = null; show('start');
    F.toast(`${added} item${added === 1 ? '' : 's'} added${r.kind === 'receipt' && r.total != null ? ` · receipt ${F.money.format(r.total)} saved` : ''}`);
    F.showView('inventario');
  });
  $('#scan-discard').addEventListener('click', () => { result = null; show('start'); renderStart(); });

  async function handleFile(file) {
    if (!file) return;
    if (!getKey()) { show('start'); renderStart(); error('Add your API key in Recognition settings below first.'); $('#scan-settings').open = true; return; }
    try {
      show('busy');
      $('#scan-busy-text').textContent = mode === 'receipt' ? 'Reading the receipt… (10 to 30 seconds)' : 'Looking for food… (10 to 30 seconds)';
      const { b64, preview } = await toJpegBase64(file);
      $('#scan-preview').src = preview;
      const data = await recognize(b64);
      if (!data.is_readable || !data.items?.length) {
        show('start'); renderStart();
        error(data.problem || (mode === 'receipt' ? 'No receipt lines found. Try a flatter, brighter photo.' : 'No food found in this photo. Try one shelf at a time with more light.'));
        return;
      }
      result = prepare(data);
      show('review'); renderReview(); window.scrollTo(0, 0);
    } catch (err) {
      show('start'); renderStart(); error(err.message || String(err));
    }
  }
  ['#scan-camera', '#scan-library'].forEach(s => $(s).addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; handleFile(f); }));
  document.querySelectorAll('.scan-mode').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; renderStart(); }));

  $('#api-key-save').addEventListener('click', () => {
    const v = $('#api-key').value.trim();
    if (v.startsWith('••')) { F.toast('Key already saved'); return; }
    if (!/^sk-ant-/.test(v)) { F.toast('That does not look like an Anthropic key (it starts with sk-ant-)'); return; }
    setKey(v); renderStart(); $('#scan-settings').open = false; $('#scan-error').hidden = true; F.toast('Key saved on this phone');
  });
  $('#api-key-clear').addEventListener('click', () => { setKey(''); renderStart(); F.toast('Key removed'); });
  $('#api-key').addEventListener('focus', e => { if (e.target.value.startsWith('••')) e.target.value = ''; });

  document.addEventListener('fridge:render-scan', () => { if (!result) { show('start'); renderStart(); } });
  if (!$('#view-scan').hidden) { show('start'); renderStart(); }

  // For automated tests
  window.__scan = { prepare, SCHEMA, PROMPTS, setMode: m => { mode = m; }, setResult: r => { result = r; show('review'); renderReview(); } };
})();
