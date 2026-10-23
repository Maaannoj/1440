// 1440 · app controller: boot, navigation, actions, timers.
import { SupabaseBackend, DemoBackend, ruleMessage, isNetworkError } from './backend.js';
import { Store } from './store.js';
import { clock, AVOID_CONFIRM_MINUTE } from './logic.js';
import * as V from './views.js';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
if (params.get('now')) clock.setNow(params.get('now'));

const cfg = window.APP_CONFIG || {};
const backend = DEMO ? new DemoBackend() : new SupabaseBackend(cfg.supabaseUrl, cfg.supabaseKey);
const store = new Store(backend, { cachePrefix: DEMO ? '1440demo' : '1440' });
window.__1440 = { store, backend, clock }; // handy for debugging

const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');
const tabbarEl = $('#tabbar');
const sheetRoot = $('#sheet-root');
const toastEl = $('#toast');

const ui = {
  demo: DEMO,
  tab: (location.hash.slice(1) || 'today'),
  calMonth: null,
  reorder: false,
  showArchived: false,
  sheet: null,        // { type, id }
  flash: null,
  lastLevel: null,
  lastPerfect: null,
  booted: false,
};
if (!['today', 'calendar', 'habits', 'me'].includes(ui.tab)) ui.tab = 'today';

// ---------- haptics (iOS 18+: toggling a switch input gives a tap) ----------
const hapticLabel = $('#haptic');
function haptic() { try { hapticLabel.click(); } catch { /* not supported */ } }

// ---------- timer (persists across app restarts) ----------
const timerKey = () => `${DEMO ? '1440demo' : '1440'}:timer:${store.user?.id}`;
function getTimer() { try { return JSON.parse(localStorage.getItem(timerKey()) || 'null'); } catch { return null; } }
function setTimer(t) { try { t ? localStorage.setItem(timerKey(), JSON.stringify(t)) : localStorage.removeItem(timerKey()); } catch {} }
function timerSeconds(t = getTimer()) { return t ? t.base * 60 + (clock.now() - t.startedAt) / 1000 : 0; }

function startTimer(id) {
  const day = store.today();
  const e = store.entry(id, day);
  const t = getTimer();
  if (t && t.habit_id !== id) pauseTimer(); // only one timer at a time
  setTimer({ habit_id: id, day, startedAt: clock.now(), base: e?.value || 0 });
  haptic();
}
function pauseTimer() {
  const t = getTimer();
  if (!t) return;
  saveTimerProgress(t);
  setTimer(null);
}
function saveTimerProgress(t) {
  const h = store.habit(t.habit_id);
  if (!h) { setTimer(null); return; }
  const mins = Math.min(h.target, Math.floor(timerSeconds(t) / 60));
  const e = store.entry(t.habit_id, t.day);
  if (mins > (e?.value || 0)) {
    const before = store.history();
    if (mins >= h.target) setTimer(null);   // stop first so the screen never shows a finished timer running
    const prev = store.setEntry(t.habit_id, t.day, mins, e?.meta);
    if (mins >= h.target) {
      haptic();
      toast(doneMessage(h, before), undoFor(t.habit_id, t.day, prev));
      if (ui.sheet?.type === 'timer') refreshSheet();
    }
  }
}

// ---------- context for views ----------
function ctx() {
  const now = store.now();
  const t = getTimer();
  return {
    store, ui, now,
    history: store.history(),
    entry: (id) => store.entry(id, now.day),
    timer: t && t.day === now.day ? t : null,
    timerSeconds: timerSeconds(t),
    shieldsOn: !!store.settings?.shields_enabled,
    flash: ui.flash,
  };
}

// ---------- rendering ----------
function render() {
  if (!store.user) return;
  if (!store.settings && !store.habits.length) { main.innerHTML = V.needsConnection(); tabbarEl.hidden = true; return; }
  tabbarEl.hidden = false;
  const c = ctx();
  main.innerHTML = V[ui.tab](c);
  tabbarEl.innerHTML = V.tabbar(ui.tab);
  document.title = ui.tab === 'today' ? '1440' : `${ui.tab[0].toUpperCase() + ui.tab.slice(1)} – 1440`;
  animateDial();
  ui.flash = null;
}

let lastDone = null;
function animateDial() {
  const el = $('#dial-done');
  if (!el) return;
  const len = parseFloat(el.dataset.len), C = el.dataset.c;
  if (lastDone === 0 && len > 0) el.removeAttribute('opacity');
  if (lastDone != null && lastDone !== len && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.animate([{ strokeDasharray: `${lastDone} ${C}` }, { strokeDasharray: `${len} ${C}` }],
      { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  lastDone = len;
}

function openSheet(type, id) {
  ui.sheet = { type, id };
  const c = ctx();
  const html = {
    day: () => V.daySheet(c, id),
    habit: () => V.habitSheet(c, id),
    form: () => V.habitForm(c, id),
    timer: () => V.timerSheet(c, id),
    people: () => V.peopleSheet(c, id),
    password: () => V.passwordSheet(),
  }[type]();
  const wasOpen = sheetRoot.classList.contains('is-open');
  if (!wasOpen) toastEl.classList.remove('is-on');
  sheetRoot.innerHTML = `<div class="sheet-backdrop" data-act="sheet-close"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${type}"><div class="sheet-grip" aria-hidden="true"></div>${html}</div>`;
  if (!wasOpen) requestAnimationFrame(() => sheetRoot.classList.add('is-open'));
  else sheetRoot.classList.add('is-open');
  document.body.classList.add('has-sheet');
  const kind = sheetRoot.querySelector('input[name="kind"]:checked');
  if (kind) syncKindFields(kind.form);
}
function refreshSheet() { if (ui.sheet) openSheet(ui.sheet.type, ui.sheet.id); }
function closeSheet() {
  ui.sheet = null;
  sheetRoot.classList.remove('is-open');
  document.body.classList.remove('has-sheet');
  setTimeout(() => { if (!ui.sheet) sheetRoot.innerHTML = ''; }, 260);
}

let toastTimer = null;
function toast(text, action) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = `<span>${V.esc(text)}</span>${action ? `<button data-act="toast-action">${V.esc(action.label)}</button>` : ''}`;
  toastEl._action = action?.run || null;
  toastEl.classList.add('is-on');
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), action ? 5000 : 2800);
}

// ---------- celebrating ----------
/** The best thing to say after a habit is completed. */
function doneMessage(h, before) {
  const after = store.history();
  const day = store.today();
  if (after.perDay.get(day)?.perfect && !before.perDay.get(day)?.perfect) return 'Perfect day. +50 XP';
  if (after.level.level > before.level.level) return `Level ${after.level.level} reached`;
  return `${h.name} done, +${h.xp} XP`;
}
function undoFor(id, day, prev) {
  return { label: 'Undo', run: () => store.setEntry(id, day, prev.value, prev.meta) };
}

// ---------- ticking ----------
function tickHabit(id) {
  const h = store.habit(id);
  const now = store.now();
  const day = now.day;
  const e = store.entry(id, day);
  const v = e?.value || 0;
  if (h.kind === 'timer') return openSheet('timer', id);
  if (h.kind === 'people') return openSheet('people', id);
  if (h.kind === 'avoid' && !e?.done && now.minutes < AVOID_CONFIRM_MINUTE) {
    toast('You can confirm a clean day after 8 PM.');
    return;
  }
  const next = h.kind === 'count' ? (v >= h.target ? 0 : v + 1) : (e?.done ? 0 : 1);
  const nowDone = next >= h.target;
  const before = store.history();
  ui.flash = nowDone ? id : null;
  const prev = store.setEntry(id, day, next, e?.meta);
  haptic();
  const msg = nowDone ? doneMessage(h, before)
    : next === 0 ? `${h.name} unticked` : `${h.name}: ${next} of ${h.target}`;
  toast(msg, undoFor(id, day, prev));
}

// ---------- actions ----------
const actions = {
  tab(name) {
    if (ui.tab === name) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    ui.tab = name; ui.reorder = false;
    history.replaceState(null, '', '#' + name);
    render(); window.scrollTo(0, 0);
  },
  tick: tickHabit,
  day(d) { openSheet('day', d); },
  month(m) { ui.calMonth = m; render(); },
  habit(id) { openSheet('habit', id); },
  edit(id) { openSheet('form', id); },
  'habit-add'() { openSheet('form', null); },
  reorder() { ui.reorder = !ui.reorder; render(); },
  archived() { ui.showArchived = !ui.showArchived; render(); },
  async 'move-up'(id) { await guard(() => store.moveHabit(id, -1)); },
  async 'move-down'(id) { await guard(() => store.moveHabit(id, 1)); },
  async archive(id) {
    const h = store.habit(id);
    if (!confirm(`Archive "${h.name}"? It stops from tomorrow on, and its history stays.`)) return;
    if (await guard(() => store.archiveHabit(id))) { closeSheet(); toast(`${h.name} archived`); }
  },
  async restore(id) {
    const h = store.habit(id);
    if (await guard(() => store.restoreHabit(id))) { closeSheet(); toast(`${h.name} restored`); }
  },
  async delete(id) {
    const h = store.habit(id);
    if (!confirm(`Delete "${h.name}"? This can't be undone.`)) return;
    if (await guard(() => store.deleteHabit(id))) { closeSheet(); toast(`${h.name} deleted`); }
  },
  'sheet-close'() { closeSheet(); },
  'toast-action'() { const run = toastEl._action; toastEl.classList.remove('is-on'); if (run) { run(); haptic(); } },
  'timer-start'(id) { startTimer(id); refreshSheet(); render(); },
  'timer-pause'(id) { pauseTimer(); refreshSheet(); render(); },
  'timer-add'(id) {
    const h = store.habit(id); const day = store.today(); const e = store.entry(id, day);
    const add = Math.min(5, h.target - (e?.value || 0));
    if (add <= 0) return;
    const before = store.history();
    const prev = store.setEntry(id, day, (e?.value || 0) + add, { ...(e?.meta || {}), manual: (e?.meta?.manual || 0) + add });
    haptic();
    if ((e?.value || 0) + add >= h.target) toast(doneMessage(h, before), undoFor(id, day, prev));
    refreshSheet();
  },
  'timer-reset'(id) {
    const day = store.today(); const e = store.entry(id, day);
    if (!confirm('Reset today\'s time to 0?')) return;
    store.setEntry(id, day, 0, { ...(e?.meta || {}), manual: 0 });
    refreshSheet();
  },
  'people-clear'(id) {
    const day = store.today();
    store.setEntry(id, day, 0, {});
    closeSheet();
  },
  password() { openSheet('password'); },
  async logout() {
    const pending = store.outbox.length;
    if (pending && !confirm(`${pending} change${pending === 1 ? ' hasn\'t' : 's haven\'t'} synced yet and will be lost. Log out anyway?`)) return;
    if (!pending && !confirm('Log out of 1440 on this phone?')) return;
    pauseTimer();
    await backend.signOut();
    store.clearLocal();
    location.reload();
  },
  async retry() { await boot(); },
};

async function guard(fn) {
  try { await fn(); return true; }
  catch (err) {
    toast(isNetworkError(err) ? 'You\'re offline. Connect to change habits.' : (ruleMessage(err) || err.message || 'Something went wrong.'));
    return false;
  }
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const [name, ...rest] = el.dataset.act.split(':');
  const arg = rest.join(':');
  const fn = actions[name];
  if (fn) { ev.preventDefault(); fn(arg); }
});

document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && ui.sheet) closeSheet(); });

// ---------- forms ----------
function syncKindFields(form) {
  const kind = form.querySelector('input[name="kind"]:checked')?.value;
  const field = form.querySelector('[data-target-field]');
  if (!kind || !field) return;
  field.hidden = !(kind === 'count' || kind === 'timer');
  form.querySelector('[data-target-label]').textContent = kind === 'timer' ? 'Minutes' : 'Times a day';
  form.querySelector('[data-kind-hint]').textContent = V.kindHint(kind);
}
document.addEventListener('change', (ev) => {
  if (ev.target.name === 'kind') syncKindFields(ev.target.form);
});

const forms = {
  async login(form) {
    const email = form.email.value.trim();
    const password = form.password.value;
    if (!email || !password) { showLogin('Enter your email and password.'); return; }
    showLogin('', true);
    try {
      const user = await backend.signIn(email, password);
      await startApp(user);
    } catch (err) {
      showLogin(isNetworkError(err) ? 'No connection. Check your internet and try again.'
        : /invalid/i.test(err.message) ? 'That email and password don\'t match. Try again.' : err.message);
    }
  },
  async habit(form) {
    const id = form.dataset.id || null;
    const err = form.querySelector('[data-error]');
    const name = form.name.value.trim();
    const kind = form.querySelector('input[name="kind"]:checked').value;
    const days = [...form.querySelectorAll('input[name="days"]:checked')].map(i => Number(i.value)).sort();
    let target = 1;
    if (kind === 'count' || kind === 'timer') target = Math.round(Number(form.target.value));
    if (!name) { err.textContent = 'Give the habit a name.'; form.name.focus(); return; }
    if (!days.length) { err.textContent = 'Pick at least one day.'; return; }
    if (!(target >= 1 && target <= (kind === 'timer' ? 600 : 50))) { err.textContent = kind === 'timer' ? 'Minutes must be between 1 and 600.' : 'Times a day must be between 1 and 50.'; return; }
    const fields = {
      name, kind, target, days,
      emoji: form.emoji.value.trim() || null,
      section: form.querySelector('input[name="section"]:checked').value,
      xp: Number(form.querySelector('input[name="xp"]:checked').value),
      unit: kind === 'timer' ? 'min' : null,
    };
    const ok = await guard(() => (id ? store.updateHabit(id, fields) : store.addHabit(fields)));
    if (ok) { closeSheet(); toast(id ? 'Habit saved' : `${name} added`); }
  },
  people(form) {
    const id = form.dataset.id;
    const who = [...form.querySelectorAll('input[name="who"]:checked')].map(i => i.value);
    const extra = form.new.value.trim();
    if (extra && !who.some(w => w.toLowerCase() === extra.toLowerCase())) who.push(extra);
    if (!who.length) { form.querySelector('[data-error]').textContent = 'Pick or type a name.'; return; }
    const h = store.habit(id); const day = store.today(); const e = store.entry(id, day);
    const before = store.history();
    const prev = store.setEntry(id, day, 1, { ...(e?.meta || {}), who });
    closeSheet();
    haptic();
    if (!e?.done) toast(doneMessage(h, before), undoFor(id, day, prev));
  },
  async password(form) {
    const err = form.querySelector('[data-error]');
    const pw = form.pw.value, pw2 = form.pw2.value;
    if (pw.length < 8) { err.textContent = 'Use at least 8 characters.'; return; }
    if (pw !== pw2) { err.textContent = 'The two passwords don\'t match.'; return; }
    try { await backend.updatePassword(pw); closeSheet(); toast('Password changed'); }
    catch (e) { err.textContent = isNetworkError(e) ? 'You\'re offline. Connect and try again.' : e.message; }
  },
};
document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  forms[form.dataset.form]?.(form);
});

// ---------- live clock ----------
let lastDay = null;
let lastMinute = null;
setInterval(() => {
  if (!store.user || !store.settings) return;
  const now = store.now();
  if (lastDay && now.day !== lastDay) {           // midnight: the day locks
    const t = getTimer();
    if (t && t.day !== now.day) { saveTimerProgress(t); setTimer(null); }
    lastDay = now.day; lastDone = null;
    render(); if (ui.sheet && ui.sheet.type !== 'password') closeSheet();
    toast('A new day. Yesterday is locked.');
    return;
  }
  lastDay = now.day;
  const t = getTimer();
  if (t) {
    if (Math.floor(timerSeconds(t) / 60) > (store.entry(t.habit_id, t.day)?.value || 0)) saveTimerProgress(t);
    const secs = timerSeconds(t);
    const n = $('#timer-n'); if (n) n.textContent = V.fmtClock(secs);
    const arc = $('#timer-arc');
    if (arc) {
      const f = Math.min(1, secs / 60 / arc.dataset.target);
      arc.setAttribute('stroke-dasharray', `${(f * arc.dataset.c).toFixed(2)} ${arc.dataset.c}`);
      arc.setAttribute('opacity', f > 0 ? '1' : '0');
    }
    const rowT = $('[data-live="row-timer"]'); if (rowT) rowT.textContent = 'Timing ' + V.fmtClock(secs);
  }
  if (now.minutes !== lastMinute) {
    lastMinute = now.minutes;
    const m = $('#dial-min'); if (m) m.textContent = 1440 - now.minutes;
    const a = V.timeArc(now.minutes);
    const tEl = $('#dial-time'); if (tEl) { tEl.setAttribute('stroke-dasharray', a.dash); tEl.setAttribute('stroke-dashoffset', a.offset); }
    const dot = $('#dial-now'); if (dot) { dot.setAttribute('cx', a.x); dot.setAttribute('cy', a.y); }
    if (now.minutes === AVOID_CONFIRM_MINUTE && ui.tab === 'today') render();
  }
}, 1000);

setInterval(() => { if (store.user) store.flush(); }, 20000);
addEventListener('online', () => store.flush());
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !store.user) return;
  render();
  if (Date.now() - store.lastRefresh > 60000) { await store.refresh().catch(() => {}); }
  store.flush();
});

store.addEventListener('change', (ev) => {
  const d = ev.detail;
  if (d && d.type === 'rejected') toast(d.message);
  if (!ui.booted) return;
  if (d === 'sync' || d === 'synced') {           // only the sync line changes
    const holder = $('.top > div');
    if (ui.tab === 'today' && holder) {
      holder.querySelector('.top-sub')?.remove();
      holder.insertAdjacentHTML('beforeend', V.syncLine(ctx()));
    }
    return;
  }
  render();
});

// ---------- boot ----------
function showLogin(error = '', busy = false) {
  tabbarEl.hidden = true;
  main.innerHTML = V.login({ error, busy });
  if (!busy) { const f = $('input[name="email"]'); if (f && !error) f.focus(); }
}

async function startApp(user) {
  ui.booted = true;
  try { await store.start(user); }
  catch (err) { toast(ruleMessage(err) || err.message || 'Couldn\'t load your data.'); }
  render();
}

async function boot() {
  const user = await backend.getUser().catch(() => null);
  if (!user) { showLogin(); return; }
  await startApp(user);
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
boot();
