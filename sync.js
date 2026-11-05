// Share one fridge between phones.
// Each household lives under households/{code} in Firestore; every item, event and purchase is its own
// document, so two phones editing different things never overwrite each other. Deletions are written as
// tombstones (_deleted: true) so they reach the other phone too. Firestore keeps an offline copy and
// sends pending changes when the phone is back online.
const F = window.__fridge;
const $ = (s) => document.querySelector(s);
const STATE_KEY = 'fridgeapp.sync';
const COLLS = ['items', 'events', 'purchases'];
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

let backend = null;   // { put(coll, id, data), putMeta(data), stop() }
let state = loadState();
let applying = false;

function loadState() { try { return JSON.parse(localStorage.getItem(STATE_KEY)) || null; } catch (e) { return null; } }
function saveState() { try { state ? localStorage.setItem(STATE_KEY, JSON.stringify(state)) : localStorage.removeItem(STATE_KEY); } catch (e) {} }

function newCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const b = crypto.getRandomValues(new Uint8Array(20));
  const s = [...b].map(x => A[x % 32]).join('');
  return s.match(/.{4}/g).join('-'); // 20 chars ≈ 100 bits, e.g. 7KQ2-M9XA-…
}
const cleanCode = (c) => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?=.)/g, '$1-');
const docId = (code) => code.replace(/-/g, '');

// ---------- Backends ----------
async function firestoreBackend(code, onChange, onStatus) {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg) throw new Error('not-configured');
  const [{ initializeApp, getApps }, auth, fs] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
  ]);
  const app = getApps()[0] || initializeApp(cfg);
  await auth.signInAnonymously(auth.getAuth(app));
  let db;
  try { db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache() }); }
  catch (e) { db = fs.getFirestore(app); }
  const hid = docId(code);
  await fs.setDoc(fs.doc(db, 'households', hid), { v: 1 }, { merge: true });
  const unsubs = COLLS.map(coll => fs.onSnapshot(
    fs.collection(db, 'households', hid, coll),
    { includeMetadataChanges: true },
    snap => {
      onStatus(snap.metadata.fromCache ? 'offline' : 'live');
      const ch = snap.docChanges().filter(c => c.type !== 'removed').map(c => ({ id: c.doc.id, data: c.doc.data() }));
      if (ch.length) onChange(coll, ch);
    },
    err => onStatus('error', err)));
  unsubs.push(fs.onSnapshot(fs.doc(db, 'households', hid, 'meta', 'main'), d => { if (d.exists()) onChange('meta', d.data()); }, err => onStatus('error', err)));
  return {
    put: (coll, id, data) => fs.setDoc(fs.doc(db, 'households', hid, coll, id), data).catch(e => onStatus('error', e)),
    putMeta: (data) => fs.setDoc(fs.doc(db, 'households', hid, 'meta', 'main'), data, { merge: true }).catch(e => onStatus('error', e)),
    stop: () => unsubs.forEach(u => u()),
  };
}
async function connect(code, onChange, onStatus) {
  if (window.__mockBackend) return window.__mockBackend(docId(code), onChange, onStatus); // automated tests
  return firestoreBackend(code, onChange, onStatus);
}

// ---------- Push local changes ----------
const strip = (o) => { const r = {}; for (const k in o) if (k[0] !== '_') r[k] = o[k]; return r; };
const sig = (o) => JSON.stringify(o);
function metaOf(db) { return { learned: db.learned || {}, aliases: db.aliases || {}, settings: db.settings || {} }; }

function pushLocal() {
  if (!backend || applying || !state) return;
  const db = F.db, now = Date.now();
  for (const coll of COLLS) {
    const seen = state.synced[coll] || (state.synced[coll] = {});
    const current = new Map((db[coll] || []).map(r => [r.id, r]));
    for (const [id, rec] of current) {
      const s = sig(rec);
      if (seen[id] !== s) { seen[id] = s; backend.put(coll, id, { ...rec, _deleted: false, _at: now }); }
    }
    for (const id of Object.keys(seen)) {
      if (!current.has(id)) { delete seen[id]; backend.put(coll, id, { _deleted: true, _at: now }); }
    }
  }
  const m = sig(metaOf(db));
  if (state.synced.meta !== m) { state.synced.meta = m; backend.putMeta(metaOf(db)); }
  saveState();
}

// ---------- Apply the other phone's changes ----------
function onChange(coll, changes) {
  if (!state) return;
  applying = true;
  try {
    F.applyRemote(db => {
      if (coll === 'meta') {
        db.learned = { ...(db.learned || {}), ...(changes.learned || {}) };
        db.aliases = { ...(db.aliases || {}), ...(changes.aliases || {}) };
        db.settings = { ...(db.settings || {}), ...(changes.settings || {}) };
        state.synced.meta = sig(metaOf(db));
        return;
      }
      const arr = db[coll] || (db[coll] = []);
      const seen = state.synced[coll] || (state.synced[coll] = {});
      for (const { id, data } of changes) {
        const i = arr.findIndex(r => r.id === id);
        if (data._deleted) { if (i >= 0) arr.splice(i, 1); delete seen[id]; continue; }
        const rec = strip(data); rec.id = id;
        if (i >= 0) arr[i] = rec; else arr.push(rec);
        seen[id] = sig(rec);
      }
    });
  } finally { applying = false; }
  saveState();
  // A tombstone may have reached us for something we still had queued locally; nothing else to do.
}

// ---------- Start / stop ----------
let status = 'off';
function setStatus(s, err) {
  status = s;
  if (err) console.warn('Sync:', err);
  renderUi();
}
async function start(code, { fresh } = {}) {
  if (backend) { backend.stop(); backend = null; }
  state = { code, synced: fresh ? {} : (state?.code === code ? state.synced : {}) };
  saveState();
  setStatus('connecting');
  try {
    backend = await connect(code, onChange, setStatus);
    pushLocal(); // send what this phone already had (merge on join)
    if (status === 'connecting') setStatus('live');
  } catch (e) {
    backend = null;
    if (e.message === 'not-configured') { state = null; saveState(); setStatus('off'); return; }
    setStatus('error', e);
  }
}
function leave() {
  if (backend) backend.stop();
  backend = null; state = null; saveState(); setStatus('off');
}

document.addEventListener('fridge:saved', pushLocal);

// ---------- UI ----------
const sheet = $('#share-sheet');
function renderUi() {
  const on = !!state;
  $('#share-off').hidden = on;
  $('#share-on').hidden = !on;
  $('#share-btn').classList.toggle('on', on && status === 'live');
  $('#share-state').textContent = !on ? 'Share' : status === 'live' ? 'Shared' : status === 'offline' ? 'Offline' : status === 'connecting' ? 'Connecting' : 'Shared';
  if (on) $('#share-mycode').value = state.code;
  const live = $('#share-live'), dot = document.querySelector('.live-dot');
  const text = {
    live: 'Shared and up to date', offline: 'No connection: changes will sync when you are back online',
    connecting: 'Connecting…', error: 'Could not reach the sync service. Changes are kept and will be sent later.',
    'not-configured': 'Sharing is not switched on in this version of the app yet.',
  };
  if (live) live.textContent = text[status] || 'Shared';
  if (dot) dot.classList.toggle('off', status !== 'live');
}
function msg(t) { $('#share-msg').textContent = t || ''; }

$('#share-btn').addEventListener('click', () => { msg(''); renderUi(); sheet.showModal(); });
$('#share-close').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
$('#share-create').addEventListener('click', async () => {
  await start(newCode(), { fresh: true });
  msg(status === 'not-configured' ? '' : 'Done. Now send the invite to the other phone.');
});
$('#share-join').addEventListener('click', async () => {
  const code = cleanCode($('#share-code').value);
  if (docId(code).length !== 20) { msg('That code looks incomplete. It has 20 letters and numbers.'); return; }
  await start(code, { fresh: true });
  if (status !== 'not-configured' && status !== 'error') { msg('Joined. Your items are merged with the household.'); F.toast('Joined the shared household'); }
});
$('#share-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.code); F.toast('Code copied'); } catch (e) { $('#share-mycode').select(); }
});
$('#share-send').addEventListener('click', async () => {
  const text = `Join our FridgeApp so we share one fridge. Install it from ${location.origin}${location.pathname} , then tap 👪 Share and enter this code: ${state.code}`;
  try { if (navigator.share) await navigator.share({ title: 'FridgeApp invite', text }); else { await navigator.clipboard.writeText(text); F.toast('Invite copied: paste it in a message'); } }
  catch (e) { /* user closed the share sheet */ }
});
$('#share-leave').addEventListener('click', () => {
  if (!confirm('Stop sharing on this phone? Your items stay here, but changes will no longer reach the other phone.')) return;
  leave(); msg('Sharing stopped on this phone.');
});

// Hidden until the cloud service is set up (firebase-config.js)
$('#share-btn').hidden = !window.FIREBASE_CONFIG && !window.__mockBackend;
renderUi();
if (state?.code) start(state.code);

window.__sync = { start, leave, pushLocal, get state() { return state; }, get status() { return status; } };
