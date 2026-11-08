// Recipes tab: what can I cook with what is in the fridge, freezer and pantry, and where is each thing?
(function () {
  'use strict';
  const F = window.__fridge;
  const { CATEGORIES } = window.FOOD;
  const $ = (s, el = document) => el.querySelector(s);
  const SOON = 3;
  const LOC_ICON = { nevera: '', congelador: '❄️ ', despensa: '' };
  const strip = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const esc = F.esc;

  let filter = 'all';
  let open = null;          // id of expanded recipe
  let cooking = null;       // id of recipe being marked as cooked
  let aiRecipes = [];       // recipes suggested by AI this session
  let aiBusy = false;

  function daysLeft(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(); const a = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return Math.round((new Date(y, m - 1, d) - a) / 86400000);
  }
  const PROCESSED = /sauce|salsa|paste|soup|sopa|ketchup|frito|juice|zumo|chips/;
  const rx = new Map();
  function kwRe(k) { if (!rx.has(k)) rx.set(k, new RegExp('(^|[^a-z0-9])' + strip(k).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); return rx.get(k); }

  // Best inventory item for one ingredient: matches a keyword, not expired if possible, soonest to expire first
  function findItem(ing, items, used) {
    // "Tomato sauce" should not count as fresh tomatoes, unless the recipe asks for a sauce
    const wantsProcessed = PROCESSED.test(strip(ing.n)) || ing.k.some(k => PROCESSED.test(strip(k)));
    const cands = items.filter(it => !used.has(it.id)
      && ing.k.some(k => kwRe(k).test(strip(it.name)))
      && (wantsProcessed || !PROCESSED.test(strip(it.name)) || ing.k.some(k => strip(it.name) === strip(k))));
    if (!cands.length) return null;
    cands.sort((a, b) => {
      const da = daysLeft(a.expiresAt), db = daysLeft(b.expiresAt);
      const ea = da !== null && da < 0, eb = db !== null && db < 0;
      if (ea !== eb) return ea ? 1 : -1;
      return (da ?? 999) - (db ?? 999);
    });
    return cands[0];
  }

  function evaluate(recipe, items) {
    const used = new Set();
    const rows = recipe.ing.map(ing => {
      const it = findItem(ing, items, used);
      if (it) used.add(it.id);
      return { ing, it };
    });
    const missing = rows.filter(r => !r.it && !r.ing.opt);
    const have = rows.filter(r => r.it);
    const expiring = have.filter(r => { const d = daysLeft(r.it.expiresAt); return d !== null && d >= 0 && d <= SOON; });
    const score = (missing.length * -100) + expiring.length * 12 + have.length * 3 - recipe.mins / 30;
    return { recipe, rows, missing, have, expiring, score };
  }

  function locPill(it) {
    const d = daysLeft(it.expiresAt);
    const when = d === null ? '' : d < 0 ? ` · <b class="x">expired</b>` : d <= SOON ? ` · <b class="s">${d === 0 ? 'today' : d === 1 ? '1 day' : d + ' days'}</b>` : '';
    return `<span class="loc loc-${it.location}">${LOC_ICON[it.location]}${esc(F.LOC_LABEL[it.location])}</span><span class="have-name">${esc(it.name)}${when}</span>`;
  }

  function card(ev, ai) {
    const r = ev.recipe, isOpen = open === r.id, isCooking = cooking === r.id;
    const badges = [];
    if (ev.expiring.length) badges.push(`<span class="badge-soon">Uses ${ev.expiring.length} expiring</span>`);
    if (ai) badges.push('<span class="badge-ai">AI idea</span>');
    const ingList = ev.rows.map(({ ing, it }) => `
      <li class="${it ? 'ok' : ing.opt ? 'opt' : 'miss'}">
        <span class="ing-name">${esc(ing.n)}${ing.amount ? ` <small>${esc(ing.amount)}</small>` : ''}</span>
        <span class="ing-where">${it ? locPill(it) : ing.opt ? '<span class="loc loc-none">optional</span>' : '<span class="loc loc-miss">missing</span>'}</span>
      </li>`).join('');
    const cookList = ev.have.map(({ it }) => `<label class="cook-row"><input type="checkbox" data-used="${it.id}"> Finished the ${esc(it.name)} <small>(${esc(F.LOC_LABEL[it.location])})</small></label>`).join('');
    return `
    <article class="recipe${isOpen ? ' open' : ''}" data-id="${esc(r.id)}">
      <button type="button" class="recipe-head" data-toggle="${esc(r.id)}" aria-expanded="${isOpen}">
        <span class="recipe-ico" aria-hidden="true">${r.icon || '🍽️'}</span>
        <span class="recipe-main">
          <span class="recipe-name">${esc(r.name)}</span>
          <span class="recipe-meta">${r.mins} min · serves ${r.serves} · ${ev.missing.length ? `<b class="m">missing ${ev.missing.length}</b>` : '<b class="r">ready to cook</b>'}</span>
          ${badges.length ? `<span class="recipe-badges">${badges.join('')}</span>` : ''}
        </span>
        <span class="chev" aria-hidden="true">›</span>
      </button>
      <ul class="ing">${ingList}</ul>
      ${isOpen ? `
        <ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        ${isCooking ? `
          <div class="cook-box">
            <p>Nice! Tick anything you finished so it leaves the inventory:</p>
            ${cookList || '<p class="hint">No inventory items used.</p>'}
            <div class="row-btns"><button type="button" class="btn primary" data-cook-done="${esc(r.id)}">Update inventory</button><button type="button" class="btn ghost" data-cook-cancel>Cancel</button></div>
          </div>` : `<button type="button" class="btn primary wide" data-cook="${esc(r.id)}">I cooked this</button>`}
        ${r.id.startsWith('ai-') ? '' : `<a class="cookidoo" href="https://www.google.com/search?q=${encodeURIComponent('Cookidoo Thermomix ' + r.name)}" target="_blank" rel="noopener">Look for a Thermomix version on Cookidoo ↗</a>`}
      ` : ''}
    </article>`;
  }

  function render() {
    const db = F.db;
    const items = db.items || [];
    const box = $('#recipes-list');
    const urgent = items.filter(i => { const d = daysLeft(i.expiresAt); return d !== null && d >= 0 && d <= SOON; });
    $('#recipes-urgent').innerHTML = urgent.length
      ? `<b>Use first:</b> ${urgent.slice(0, 6).map(i => `${CATEGORIES[i.category]?.icon || ''} ${esc(i.name)}`).join(', ')}${urgent.length > 6 ? '…' : ''}`
      : '';
    $('#recipes-urgent').hidden = !urgent.length;
    document.querySelectorAll('.rfilter').forEach(b => b.classList.toggle('active', b.dataset.f === filter));

    if (!items.length) {
      box.innerHTML = '<div class="empty"><p class="empty-title">Nothing to cook with yet</p><p>Add what you have in Inventory or scan a receipt, and recipes will appear here with where to find each ingredient.</p></div>';
      return;
    }
    let evs = window.RECIPES.map(r => evaluate(r, items));
    if (filter === 'quick') evs = evs.filter(e => e.recipe.mins <= 20);
    if (filter === 'expiring') evs = evs.filter(e => e.expiring.length);
    evs = evs.filter(e => e.have.length && e.missing.length <= 1);
    evs.sort((a, b) => b.score - a.score);
    const ready = evs.filter(e => !e.missing.length), almost = evs.filter(e => e.missing.length === 1);
    const aiEvs = aiRecipes.map(r => evaluate(r, items));

    let html = '';
    if (aiEvs.length) html += `<h2 class="rsec">AI ideas for today</h2>${aiEvs.map(e => card(e, true)).join('')}`;
    html += ready.length ? `<h2 class="rsec">Ready to cook <span>${ready.length}</span></h2>${ready.map(e => card(e)).join('')}` : '';
    html += almost.length ? `<h2 class="rsec">Missing just one thing <span>${almost.length}</span></h2>${almost.slice(0, 12).map(e => card(e)).join('')}` : '';
    if (!ready.length && !almost.length && !aiEvs.length) {
      html += `<div class="empty"><p class="empty-title">No recipe matches yet</p><p>${filter !== 'all' ? 'Try “All”, or ' : ''}ask for AI ideas below: it can invent something with exactly what you have.</p></div>`;
    }
    box.innerHTML = html;
  }

  // ---------- AI ideas (optional, uses the key saved in Scan → Recognition settings) ----------
  const AI_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['recipes'],
    properties: { recipes: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['name', 'emoji', 'minutes', 'serves', 'ingredients', 'steps'],
      properties: {
        name: { type: 'string' }, emoji: { type: 'string' }, minutes: { type: 'integer' }, serves: { type: 'integer' },
        ingredients: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'amount', 'inventory_item', 'optional'],
          properties: { name: { type: 'string' }, amount: { type: 'string' }, inventory_item: { anyOf: [{ type: 'string' }, { type: 'null' }] }, optional: { type: 'boolean' } } } },
        steps: { type: 'array', items: { type: 'string' } },
      } } } },
  };
  async function askAI() {
    let key = ''; try { key = localStorage.getItem('fridgeapp.apikey') || ''; } catch (e) {}
    if (!key) { F.toast('Add your API key in Scan → Recognition settings first'); return; }
    const items = F.db.items || [];
    if (!items.length) { F.toast('Add some items first'); return; }
    aiBusy = true; renderAiBtn();
    const list = items.map(i => { const d = daysLeft(i.expiresAt); return `- ${i.name} (${i.qty} ${F.UL(i.unit)}, ${F.LOC_LABEL[i.location]}${d === null ? '' : d < 0 ? ', expired' : `, ${d} days left`})`; }).join('\n');
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({
          model: 'claude-opus-5-5', max_tokens: 16000, fallbacks: 'default',
          output_config: { effort: 'low', format: { type: 'json_schema', schema: AI_SCHEMA } },
          messages: [{ role: 'user', content: `This is what we have at home (Canada):\n${list}\n\nSuggest 3 different home recipes that mainly use these items, prioritising what expires soonest and never using expired items. Assume salt, pepper, oil, water and common spices are available. For each ingredient set "inventory_item" to the exact item name from the list above when it comes from there, otherwise null. Keep steps short (3 to 6), with oven temperatures in °F and °C.` }],
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(res.status === 401 ? 'The API key was rejected. Check it in Scan → Recognition settings.' : body?.error?.message || `HTTP ${res.status}`);
      if (body.stop_reason === 'refusal') throw new Error('No ideas this time. Try again.');
      const data = JSON.parse((body.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
      aiRecipes = (data.recipes || []).map((r, i) => ({
        id: 'ai-' + Date.now() + '-' + i, name: r.name, icon: r.emoji || '🍽️', mins: r.minutes || 30, serves: r.serves || 2,
        steps: r.steps || [],
        // Exact item name first; the keyword matcher is the fallback
        ing: (r.ingredients || []).map(g => ({ n: g.name, amount: g.amount, opt: !!g.optional && !g.inventory_item, k: g.inventory_item ? [g.inventory_item] : [g.name.split(' ').slice(-1)[0]] })),
      }));
      open = aiRecipes[0]?.id || null;
      render(); window.scrollTo(0, 0);
    } catch (e) {
      F.toast(e.message || 'Could not get ideas');
    } finally { aiBusy = false; renderAiBtn(); }
  }
  function renderAiBtn() {
    const b = $('#recipes-ai');
    b.disabled = aiBusy;
    b.innerHTML = aiBusy ? '<span class="spinner" aria-hidden="true"></span> Thinking of recipes…' : '✨ More ideas with AI';
  }

  // ---------- Events ----------
  $('#view-recetas').addEventListener('click', e => {
    const t = e.target.closest('[data-toggle]');
    if (t) { open = open === t.dataset.toggle ? null : t.dataset.toggle; cooking = null; render(); return; }
    const c = e.target.closest('[data-cook]');
    if (c) { cooking = c.dataset.cook; render(); return; }
    if (e.target.closest('[data-cook-cancel]')) { cooking = null; render(); return; }
    const d = e.target.closest('[data-cook-done]');
    if (d) {
      const art = d.closest('.recipe');
      const ids = [...art.querySelectorAll('[data-used]:checked')].map(x => x.dataset.used);
      const db = F.db, today = F.todayISO();
      for (const id of ids) {
        const i = db.items.findIndex(x => x.id === id); if (i < 0) continue;
        const it = db.items[i];
        const value = it.price != null && it.origQty > 0 ? Math.round(it.price / it.origQty * it.qty * 100) / 100 : null;
        db.events.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), type: 'consumed', at: Date.now(), date: today, itemId: it.id, name: it.name, category: it.category, qty: it.qty, unit: it.unit, value, recipe: d.dataset.cookDone });
        db.items.splice(i, 1);
      }
      F.save(); cooking = null; open = null; render();
      F.toast(ids.length ? `Enjoy! ${ids.length} item${ids.length === 1 ? '' : 's'} removed from inventory` : 'Enjoy your meal!');
      return;
    }
    const f = e.target.closest('.rfilter');
    if (f) { filter = f.dataset.f; render(); }
  });
  $('#recipes-ai').addEventListener('click', askAI);
  document.addEventListener('fridge:render-recetas', render);
  if (!$('#view-recetas').hidden) render();

  window.__recipes = { evaluate, render };
})();
