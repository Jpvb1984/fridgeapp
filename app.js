(function () {
  'use strict';
  const { CATEGORIES, guessCategory, DEFAULT_UNIT } = window.FOOD;
  const KEY = 'fridgeapp.v1';
  const SOON_DAYS = 3;
  const UNIT_LABEL = { ud: 'pcs', paquete: 'pack' };
  const UL = (u) => UNIT_LABEL[u] || u;
  const LOC_LABEL = { nevera: 'Fridge', congelador: 'Freezer', despensa: 'Pantry' };
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ---------- Almacenamiento (solo en este dispositivo) ----------
  function emptyDb() { return { version: 1, items: [], events: [], learned: {}, aliases: {}, purchases: [], settings: { currency: 'CAD' } }; }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyDb();
      const d = JSON.parse(raw);
      const out = Object.assign(emptyDb(), d);
      out.settings = Object.assign({ currency: 'CAD' }, d.settings || {});
      return out;
    } catch (e) { return emptyDb(); }
  }
  let db = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { toast('Could not save on this device'); }
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Fechas (en hora local) ----------
  function todayISO() { return toISO(new Date()); }
  function toISO(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function addDays(iso, n) { const [y, m, d] = iso.split('-').map(Number); return toISO(new Date(y, m - 1, d + n)); }
  function daysUntil(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(); const a = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((new Date(y, m - 1, d) - a) / 86400000);
  }
  function expLabel(n) {
    if (n === null) return 'No date';
    if (n < -1) return `Expired ${-n} days ago`;
    if (n === -1) return 'Expired yesterday';
    if (n === 0) return 'Expires today';
    if (n === 1) return 'Expires tomorrow';
    return `${n} days`;
  }
  function expClass(n) { return n === null ? 'none' : n < 0 ? 'expired' : n <= SOON_DAYS ? 'soon' : 'ok'; }
  const CURRENCIES = ['CAD', 'USD'];
  let fmtMoney;
  function setMoneyFormat() {
    const c = db.settings.currency;
    fmtMoney = new Intl.NumberFormat(c === 'USD' ? 'en-US' : 'en-CA', { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol' });
  }
  setMoneyFormat();
  const fmtNum = (n) => Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function cap(s) { s = s.trim(); return s.charAt(0).toUpperCase() + s.slice(1); }
  function nameKey(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim(); }

  // ---------- Alta rápida: «2 leche», «leche x2», «500 g carne picada», «1,5 kg patatas» ----------
  const UNIT_RX = '(kg|g|gr|l|lt|ml|ud|uds|unidades?|paquetes?|paq|pcs?|pack|packs|units?)';
  function parseQuick(text) {
    let t = text.trim().replace(/\s+/g, ' ');
    let qty = null, unit = null, m;
    if ((m = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*${UNIT_RX}?\\.?\\s+(?:(?:de|of)\\s+)?(.+)$`, 'i')))) {
      qty = parseFloat(m[1].replace(',', '.')); unit = m[2]; t = m[3];
    } else if ((m = t.match(new RegExp(`^(.+?)\\s+(?:x\\s*)?(\\d+(?:[.,]\\d+)?)\\s*${UNIT_RX}?$`, 'i'))) && (m[3] || /x\s*\d/i.test(text))) {
      t = m[1]; qty = parseFloat(m[2].replace(',', '.')); unit = m[3];
    }
    if (unit) {
      unit = unit.toLowerCase();
      unit = { gr: 'g', lt: 'l', uds: 'ud', unidad: 'ud', unidades: 'ud', paquetes: 'paquete', paq: 'paquete', pc: 'ud', pcs: 'ud', unit: 'ud', units: 'ud', pack: 'paquete', packs: 'paquete' }[unit] || unit;
    }
    return { name: cap(t), qty, unit };
  }

  function defaultsFor(name) {
    const learned = db.learned[nameKey(name)];
    const category = learned?.category || guessCategory(name);
    const cat = CATEGORIES[category];
    const location = learned?.location || cat.loc;
    const days = location === 'congelador' && category !== 'congelado' ? CATEGORIES.congelado.days : (learned?.days || cat.days);
    return { category, location, unit: learned?.unit || DEFAULT_UNIT[category] || 'ud', days };
  }

  function addItem(input) {
    const p = parseQuick(input);
    if (!p.name) return;
    const d = defaultsFor(p.name);
    const today = todayISO();
    const item = {
      id: uid(), name: p.name, category: d.category, location: d.location,
      qty: p.qty ?? 1, unit: p.unit || d.unit, origQty: p.qty ?? 1,
      price: null, boughtAt: today, expiresAt: addDays(today, d.days), expiryEstimated: true,
      minStock: db.learned[nameKey(p.name)]?.minStock ?? null, createdAt: Date.now(),
    };
    db.items.push(item); save(); render();
    const n = daysUntil(item.expiresAt);
    toast(`${item.name} → ${LOC_LABEL[item.location]}, expires in about ${n} days`, 'Adjust', () => openSheet(item.id));
    return item;
  }

  // ---------- Salidas del inventario (consumido / tirado) ----------
  function unitValue(it) { return it.price != null && it.origQty > 0 ? it.price / it.origQty : null; }
  function logEvent(it, type, qty) {
    const uv = unitValue(it);
    db.events.push({ id: uid(), type, at: Date.now(), date: todayISO(), itemId: it.id, name: it.name, category: it.category, qty, unit: it.unit, value: uv != null ? Math.round(uv * qty * 100) / 100 : null });
  }
  function removeItem(id, type) {
    const i = db.items.findIndex(x => x.id === id); if (i < 0) return;
    const it = db.items[i];
    const snapshot = JSON.parse(JSON.stringify(it)), evCount = db.events.length;
    if (type) logEvent(it, type, it.qty);
    db.items.splice(i, 1); save(); render();
    const msg = type === 'wasted' ? `${it.name}: thrown away` : type === 'consumed' ? `${it.name}: used up` : `${it.name} deleted`;
    toast(msg, 'Undo', () => { db.items.splice(i, 0, snapshot); db.events.length = evCount; save(); render(); });
  }
  function stepQty(id, dir) {
    const it = db.items.find(x => x.id === id); if (!it) return;
    const step = ['kg', 'l'].includes(it.unit) ? 0.25 : ['g', 'ml'].includes(it.unit) ? 100 : 1;
    if (dir > 0) { it.qty = Math.round((it.qty + step) * 100) / 100; it.origQty = Math.max(it.origQty, it.qty); save(); render(); return; }
    const used = Math.min(step, it.qty);
    if (it.qty - used <= 0) { removeItem(id, 'consumed'); return; }
    logEvent(it, 'consumed', used);
    it.qty = Math.round((it.qty - used) * 100) / 100; save(); render();
  }

  // ---------- Vistas ----------
  let currentView = 'inventario', currentLoc = 'nevera';

  function sortByExpiry(a, b) {
    const da = daysUntil(a.expiresAt), dbb = daysUntil(b.expiresAt);
    if (da === null && dbb === null) return a.name.localeCompare(b.name, 'en');
    if (da === null) return 1; if (dbb === null) return -1;
    return da - dbb || a.name.localeCompare(b.name, 'en');
  }

  function itemRow(it, withQty = true) {
    const n = daysUntil(it.expiresAt), cls = expClass(n);
    const meta = [`${fmtNum(it.qty)} ${UL(it.unit)}`, LOC_LABEL[it.location]];
    if (it.price != null) meta.push(fmtMoney.format(it.price));
    const exp = `<span class="exp ${cls}">${expLabel(n)}${it.expiryEstimated && n !== null ? '<span class="est" title="Estimated date"> ≈</span>' : ''}</span>`;
    return `<li class="item" data-id="${it.id}">
      <span class="ava ${cls}" aria-hidden="true">${CATEGORIES[it.category]?.icon || '🛒'}</span>
      <div class="main">
        <div class="name">${esc(it.name)}</div>
        <div class="meta">${withQty ? exp + ' · ' : ''}${esc(meta.join(' · '))}</div>
      </div>
      ${withQty ? `<div class="qty-ctl"><button type="button" data-step="-1" aria-label="Remove one ${esc(it.name)}">−</button><button type="button" data-step="1" aria-label="Add one ${esc(it.name)}">+</button></div>` : exp}
    </li>`;
  }

  function renderInventory() {
    const counts = { todo: db.items.length, nevera: 0, congelador: 0, despensa: 0 };
    const soonBy = { todo: 0, nevera: 0, congelador: 0, despensa: 0 };
    db.items.forEach(i => {
      counts[i.location]++;
      const d = daysUntil(i.expiresAt);
      if (d !== null && d <= SOON_DAYS) { soonBy[i.location]++; soonBy.todo++; }
    });
    $$('[data-loc]').forEach(b => {
      const on = b.dataset.loc === currentLoc;
      b.classList.toggle('active', on); b.setAttribute('aria-selected', on);
    });
    $$('[data-count]').forEach(el => {
      const k = el.dataset.count, n = counts[k];
      el.innerHTML = k === 'todo' ? (n ? `(${n})` : '')
        : `${n ? `${n} item${n === 1 ? '' : 's'}` : 'Empty'}${soonBy[k] ? ` · <b>${soonBy[k]} soon</b>` : ''}`;
    });
    // Sticky note on the fridge door: what to use first
    const urgent = [...db.items].filter(i => { const d = daysUntil(i.expiresAt); return d !== null && d <= SOON_DAYS; }).sort(sortByExpiry);
    const note = $('#note');
    note.hidden = urgent.length === 0;
    note.innerHTML = `<b>Use first</b>${urgent.slice(0, 3).map(i => `<span>${esc(i.name)}</span>`).join('')}${urgent.length > 3 ? `<span class="more">+${urgent.length - 3} more · tap</span>` : ''}`;

    $('#interior').dataset.where = currentLoc;
    const items = db.items.filter(i => currentLoc === 'todo' || i.location === currentLoc).sort(sortByExpiry);
    // One shelf per category, shelves ordered by their most urgent item
    const shelves = new Map();
    for (const it of items) { if (!shelves.has(it.category)) shelves.set(it.category, []); shelves.get(it.category).push(it); }
    $('#inv-list').innerHTML = [...shelves.entries()].map(([cat, list]) => `
      <li class="shelf">
        <div class="shelf-h"><span>${CATEGORIES[cat].icon}</span> ${esc(CATEGORIES[cat].label)} <em>${list.length}</em></div>
        <ul class="shelf-items">${list.map(i => itemRow(i)).join('')}</ul>
      </li>`).join('');
    const none = db.items.length === 0;
    $('#inv-empty').hidden = items.length > 0;
    if (!none && items.length === 0) {
      $('#inv-empty').innerHTML = `<p class="empty-title">The ${esc(LOC_LABEL[currentLoc].toLowerCase())} is empty</p><p>Items you store here will show up on these shelves.</p>`;
    } else if (none) {
      $('#inv-empty').innerHTML = `<p class="empty-title">Your fridge is empty</p><p>Type what you have above, for example “milk” or “2 kg potatoes”, and tap Add. Or use Scan to read a receipt.</p>`;
    }
    $('#known-names').innerHTML = Object.values(db.learned).map(l => `<option value="${esc(l.name)}">`).join('');
  }

  const GROUPS = [
    { key: 'expired', title: 'Expired', test: n => n !== null && n < 0, cls: 'expired' },
    { key: 'today', title: 'Today', test: n => n === 0, cls: 'soon' },
    { key: 'tomorrow', title: 'Tomorrow', test: n => n === 1, cls: 'soon' },
    { key: 'soon', title: `Within ${SOON_DAYS} days`, test: n => n >= 2 && n <= SOON_DAYS, cls: 'soon' },
    { key: 'week', title: 'This week', test: n => n > SOON_DAYS && n <= 7, cls: '' },
    { key: 'later', title: 'Later', test: n => n > 7, cls: '' },
    { key: 'nodate', title: 'No date', test: n => n === null, cls: '' },
  ];
  function renderExpiry() {
    const items = [...db.items].sort(sortByExpiry);
    let html = '';
    const expired = items.filter(i => { const n = daysUntil(i.expiresAt); return n !== null && n < 0; });
    const atRisk = items.filter(i => { const n = daysUntil(i.expiresAt); return n !== null && n <= SOON_DAYS; });
    const riskValue = atRisk.reduce((s, i) => s + (unitValue(i) != null ? unitValue(i) * i.qty : 0), 0);
    if (atRisk.length) {
      const soonN = atRisk.length - expired.length;
      const parts = [];
      if (expired.length) parts.push(`${expired.length} ${expired.length === 1 ? 'item has expired' : 'items have expired'}`);
      if (soonN) parts.push(`${soonN} ${soonN === 1 ? 'expires' : 'expire'} within ${SOON_DAYS} days`);
      const verb = expired.length ? 'Check what has expired and use the rest first.' : 'Use them first.';
      html += `<p class="banner ${expired.length ? '' : 'amber'}">${parts.join(' and ')}${riskValue > 0 ? ` (${fmtMoney.format(riskValue)} at stake)` : ''}. ${verb}</p>`;
    }
    for (const g of GROUPS) {
      const gi = items.filter(i => g.test(daysUntil(i.expiresAt)));
      if (!gi.length) continue;
      html += `<div class="group-h ${g.cls}"><h2>${g.title}</h2><span class="v">${gi.length}</span></div><ul class="list">${gi.map(i => itemRow(i, false)).join('')}</ul>`;
    }
    $('#exp-groups').innerHTML = html;
    $('#exp-empty').hidden = items.length > 0;
  }

  function renderBadge() {
    const n = db.items.filter(i => { const d = daysUntil(i.expiresAt); return d !== null && d <= SOON_DAYS; }).length;
    const b = $('#exp-badge'); b.hidden = n === 0; b.textContent = n > 99 ? '99+' : n;
    b.setAttribute('aria-label', `${n} expiring soon`);
  }

  function render() {
    renderBadge(); renderCurrency();
    if (currentView === 'inventario') renderInventory(); else if (currentView === 'caduca') renderExpiry(); else document.dispatchEvent(new Event('fridge:render-scan'));
  }

  function showView(v) {
    currentView = v;
    $$('.view').forEach(s => s.hidden = s.id !== `view-${v}`);
    $$('.tab').forEach(t => { t.classList.toggle('active', t.dataset.view === v); t.setAttribute('aria-current', t.dataset.view === v ? 'page' : 'false'); });
    $('#title').textContent = $(`#view-${v}`).dataset.title;
    document.title = `${$(`#view-${v}`).dataset.title} · FridgeApp`;
    render(); window.scrollTo(0, 0);
    try { sessionStorage.setItem('fridgeapp.view', v); } catch (e) {}
  }

  // ---------- Hoja de detalle ----------
  const sheet = $('#sheet'), form = $('#item-form');
  let editingId = null;
  form.category.innerHTML = Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');

  function openSheet(id) {
    const it = db.items.find(x => x.id === id); if (!it) return;
    editingId = id;
    $('#sheet-title').textContent = it.name;
    form.name.value = it.name; form.qty.value = fmtNum(it.qty); form.unit.value = it.unit;
    form.location.value = it.location; form.category.value = it.category;
    form.expiresAt.value = it.expiresAt || ''; form.price.value = it.price != null ? it.price.toFixed(2) : '';
    form.boughtAt.value = it.boughtAt || ''; form.minStock.value = it.minStock != null ? fmtNum(it.minStock) : '';
    $('#est-note').textContent = it.expiryEstimated ? 'Estimated expiry date based on the type of food. Replace it with the date on the label if you have it.' : '';
    sheet.showModal();
    form.expiresAt.dataset.orig = form.expiresAt.value;
  }
  function closeSheet() { sheet.close(); editingId = null; }

  function saveSheet() {
    const it = db.items.find(x => x.id === editingId); if (!it) return closeSheet();
    const qty = parseFloat(String(form.qty.value).replace(',', '.'));
    if (!form.reportValidity() || !(qty >= 0)) return;
    const prevLoc = it.location, prevCat = it.category;
    it.name = cap(form.name.value); it.qty = qty; it.origQty = Math.max(it.origQty || 0, qty);
    it.unit = form.unit.value; it.location = form.location.value; it.category = form.category.value;
    const price = form.price.value === '' ? null : parseFloat(String(form.price.value).replace(',', '.'));
    it.price = Number.isFinite(price) ? price : null;
    it.boughtAt = form.boughtAt.value || null;
    const ms = form.minStock.value === '' ? null : parseFloat(String(form.minStock.value).replace(',', '.'));
    it.minStock = Number.isFinite(ms) ? ms : null;
    if (form.expiresAt.value !== form.expiresAt.dataset.orig) {
      it.expiresAt = form.expiresAt.value || null; it.expiryEstimated = false;
    } else if (it.expiryEstimated && (prevLoc !== it.location || prevCat !== it.category) && it.boughtAt) {
      // Recalcular la estimación si cambió dónde se guarda o qué es (p. ej. lo meto en el congelador)
      const days = it.location === 'congelador' ? CATEGORIES.congelado.days : CATEGORIES[it.category].days;
      it.expiresAt = addDays(it.boughtAt, days);
    }
    // Aprender para la próxima vez que se añada este nombre
    db.learned[nameKey(it.name)] = { name: it.name, category: it.category, location: it.location, unit: it.unit, minStock: it.minStock };
    save(); closeSheet(); render();
  }

  // ---------- Avisos ----------
  let toastTimer;
  function toast(msg, actionLabel, action) {
    const t = $('#toast');
    t.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button type="button">${esc(actionLabel)}</button>` : ''}`;
    t.hidden = false;
    if (actionLabel) $('button', t).onclick = () => { t.hidden = true; action(); };
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 4500);
  }

  function renderCurrency() {
    $('#currency').textContent = db.settings.currency;
    $('#price-label').textContent = `Price (${db.settings.currency})`;
  }

  // ---------- Eventos ----------
  $('#currency').addEventListener('click', () => {
    const i = CURRENCIES.indexOf(db.settings.currency);
    db.settings.currency = CURRENCIES[(i + 1) % CURRENCIES.length];
    save(); setMoneyFormat(); renderCurrency(); render();
    toast(`Prices now shown in ${db.settings.currency}`);
  });
  $('#quick-add').addEventListener('submit', e => {
    e.preventDefault();
    const input = $('#qa-name');
    if (!input.value.trim()) return;
    addItem(input.value); input.value = ''; $('#qa-hint').textContent = '';
    input.focus();
  });
  $('#qa-name').addEventListener('input', e => {
    const v = e.target.value.trim();
    if (!v) { $('#qa-hint').textContent = ''; return; }
    const p = parseQuick(v), d = defaultsFor(p.name || v);
    $('#qa-hint').textContent = `${p.qty ?? 1} ${UL(p.unit || d.unit)} · ${CATEGORIES[d.category].label} · ${LOC_LABEL[d.location]} · expires in about ${d.days} days`;
  });
  $$('[data-loc]').forEach(b => b.addEventListener('click', e => {
    if (e.target.closest('#note')) { showView('caduca'); return; }
    currentLoc = b.dataset.loc; renderInventory();
  }));
  $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
  document.addEventListener('click', e => {
    const step = e.target.closest('[data-step]');
    const row = e.target.closest('.item');
    if (step && row) { e.stopPropagation(); stepQty(row.dataset.id, Number(step.dataset.step)); return; }
    if (row) openSheet(row.dataset.id);
  });
  $('#sheet-cancel').addEventListener('click', closeSheet);
  form.addEventListener('submit', e => { e.preventDefault(); saveSheet(); });
  $('#sheet-actions').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || !editingId) return;
    const id = editingId; closeSheet();
    removeItem(id, b.dataset.act === 'delete' ? null : b.dataset.act);
  });
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

  // Cambio de día con la app abierta, o vuelta a primer plano: recalcular caducidades
  let lastDay = todayISO();
  function checkDay() { const t = todayISO(); if (t !== lastDay) { lastDay = t; render(); } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { db = load(); setMoneyFormat(); render(); checkDay(); } });
  setInterval(checkDay, 60000);

  // Arranque
  let startView = 'inventario';
  try { startView = sessionStorage.getItem('fridgeapp.view') || 'inventario'; } catch (e) {}
  showView(['caduca', 'scan'].includes(startView) ? startView : 'inventario');

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Para pruebas automáticas
  window.__fridge = {
    parseQuick, defaultsFor, addItem, render, save, toast, showView, todayISO, addDays, nameKey, cap, esc, LOC_LABEL, UL,
    get db() { return db; }, get money() { return fmtMoney; },
  };
  document.dispatchEvent(new Event('fridge:ready'));
})();
