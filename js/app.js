// 1440 · app controller: boot, navigation, ticking, rewards, timers.
// Smoothness rules: the screen is rebuilt only on tab changes; a tick patches just
// the rows and numbers that changed, so looping animations never restart.
import { SupabaseBackend, DemoBackend, STARTERS, ruleMessage, isNetworkError } from './backend.js';
import { Store } from './store.js';
import { clock, AVOID_CONFIRM_MINUTE, rankFor } from './logic.js';
import * as V from './views.js';
import * as fx from './fx.js';
import { readDevicePrefs, writeDevicePrefs, applyDevicePrefs, buildBackdrop, lookTransition, lookId, LOOKS } from './themes.js';
import { audio } from './audio.js';
import { WORLD_IDS, words, heroState, patchHero, heroCelebrate, COMIC_WORDS } from './worlds.js';
import { shouldShow as tutorialDue, openTutorial } from './tutorial.js';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
if (params.get('now')) clock.setNow(params.get('now'));

const cfg = window.APP_CONFIG || {};
const DEMO_NEW = params.get('demo') === 'new';
const backend = DEMO ? new DemoBackend({ empty: DEMO_NEW }) : new SupabaseBackend(cfg.supabaseUrl, cfg.supabaseKey);
const store = new Store(backend, { cachePrefix: DEMO ? (DEMO_NEW ? '1440demonew' : '1440demo') : '1440' });

const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');
const tabbarEl = $('#tabbar');
const sheetRoot = $('#sheet-root');
const toastEl = $('#toast');
const bk = $('#bk');

let hadDevicePrefs = false;
try { hadDevicePrefs = !!localStorage.getItem('1440:device'); } catch {}
const device = readDevicePrefs();
if (params.get('look')) { device.look = params.get('look'); device.world = 'cyberpunk'; }
if (WORLD_IDS.includes(params.get('world'))) device.world = params.get('world');
applyDevicePrefs(device);
buildBackdrop(bk, lookId(device));
audio.sfxOn = !!device.sound;
audio.musicOn = !!device.music;
audio.look = lookId(device);
writeDevicePrefs(device);
// browsers only allow sound after a tap, so the first tap anywhere wakes the audio
document.addEventListener('pointerdown', () => audio.unlock(), { capture: true });

let savedPeriod = 'week';
try { savedPeriod = localStorage.getItem('1440:boardPeriod') === 'all' ? 'all' : 'week'; } catch {}
const ui = {
  demo: DEMO,
  tab: V.TABS.some(t => t[0] === location.hash.slice(1)) ? location.hash.slice(1) : 'today',
  boardPeriod: savedPeriod, push: 'off', pushSynced: false,
  calMonth: null, reorder: false, showArchived: false,
  expanded: new Set(), sheet: null, confirm: null, booted: false,
  combo: 0, lastTickAt: -1e9, shownLevel: null, adding: new Set(),
};
window.__1440 = { store, backend, clock, ui, fx }; // for debugging

// ---------- timer (survives app restarts) ----------
const timerKey = () => `${DEMO ? '1440demo' : '1440'}:timer:${store.user?.id}`;
function getTimer() { try { return JSON.parse(localStorage.getItem(timerKey()) || 'null'); } catch { return null; } }
function setTimer(t) { try { t ? localStorage.setItem(timerKey(), JSON.stringify(t)) : localStorage.removeItem(timerKey()); } catch {} }
function timerSeconds(t = getTimer()) { return t ? t.base * 60 + (clock.now() - t.startedAt) / 1000 : 0; }
function startTimer(id) {
  const day = store.today();
  if (getTimer()?.habit_id && getTimer().habit_id !== id) pauseTimer();
  setTimer({ habit_id: id, day, startedAt: clock.now(), base: store.entry(id, day)?.value || 0 });
}
function pauseTimer() { const t = getTimer(); if (!t) return; saveTimerProgress(t); setTimer(null); }
function saveTimerProgress(t) {
  const h = store.habit(t.habit_id);
  if (!h) { setTimer(null); return; }
  const mins = Math.min(h.target, Math.floor(timerSeconds(t) / 60));
  const e = store.entry(t.habit_id, t.day);
  if (mins <= (e?.value || 0)) return;
  if (t.day !== store.today()) { setTimer(null); return; }
  const before = store.history();
  if (mins >= h.target) setTimer(null);
  const prev = store.setEntry(t.habit_id, t.day, mins, e?.meta);
  if (mins >= h.target) {
    const arc = $('#timer-arc')?.closest('.timer')?.getBoundingClientRect();
    reward(h, before, arc ? { x: arc.left + arc.width / 2, y: arc.top + arc.height / 2 } : null);
    toast(`${h.name} done`, undoFor(h.id, t.day, prev));
    if (ui.sheet?.type === 'timer') refreshSheet();
  }
}

// ---------- context ----------
function ctx() {
  const now = store.now();
  const t = getTimer();
  return {
    store, ui, now, device,
    history: store.history(),
    entry: (id) => store.entry(id, now.day),
    timer: t && t.day === now.day ? t : null,
    timerSeconds: timerSeconds(t),
    shieldsOn: !!store.settings?.shields_enabled,
  };
}

// ---------- rendering ----------
const VIEW = { today: V.today, log: V.log, quests: V.quests, board: V.board, me: V.me };
function render() {
  if (!store.user) return;
  if (!store.settings && !store.habits.length) { main.innerHTML = V.needsConnection(); tabbarEl.hidden = true; return; }
  tabbarEl.hidden = false;
  const c = ctx();
  main.innerHTML = VIEW[ui.tab](c);
  ui.shownLevel = c.history.level.level;
  updateTabbar();
  updateBadge();
  document.title = ui.tab === 'today' ? '1440' : `${ui.tab[0].toUpperCase() + ui.tab.slice(1)} · 1440`;
}
function updateTabbar() {
  if (!tabbarEl.firstElementChild) tabbarEl.innerHTML = V.tabbar(ui.tab);
  const i = V.TABS.findIndex(t => t[0] === ui.tab);
  $('#tab-ind').style.transform = `translateX(${i * 100}%)`;
  tabbarEl.querySelectorAll('.tab').forEach((b, k) => {
    b.classList.toggle('is-active', k === i);
    if (k === i) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

/** Replace only the keyed children that changed; keep the rest (and their running animations). */
function morph(oldP, newP) {
  const oldKids = [...oldP.children], newKids = [...newP.children];
  if (oldKids.length !== newKids.length) { oldP.replaceChildren(...newKids); return newKids; }
  const inserted = [];
  newKids.forEach((n, i) => {
    const o = oldKids[i];
    if (o.isEqualNode(n)) return;
    if (n.hasAttribute('data-deep') && o.tagName === n.tagName && o.dataset.key === n.dataset.key) {
      for (const a of [...o.attributes]) if (!n.hasAttribute(a.name)) o.removeAttribute(a.name);
      for (const a of [...n.attributes]) if (o.getAttribute(a.name) !== a.value) o.setAttribute(a.name, a.value);
      inserted.push(...morph(o, n));
    } else { o.replaceWith(n); inserted.push(n); }
  });
  return inserted;
}

function patchHud(c) {
  const d = V.hudData(c);
  const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== String(v)) el.textContent = v; };
  set('hud-lv', String(d.level).padStart(2, '0'));
  set('hud-rank', d.rank); set('hud-lvl', 'LVL ' + d.level);
  set('hud-xp', d.xp.toLocaleString('en-IN')); set('hud-next', d.next.toLocaleString('en-IN'));
  set('hud-streak', d.streak); set('hud-shields', d.shields);
  const fill = document.getElementById('hud-xpfill');
  if (fill) {
    if (ui.shownLevel != null && d.level > ui.shownLevel) {
      fill.style.transform = 'scaleX(1)';
      setTimeout(() => { fill.style.transition = 'none'; fill.style.transform = 'scaleX(0)'; fill.getBoundingClientRect();
        fill.style.transition = ''; fill.style.transform = `scaleX(${d.pct.toFixed(4)})`; }, 900);
    } else fill.style.transform = `scaleX(${d.pct.toFixed(4)})`;
  }
  ui.shownLevel = d.level;
}

function patchToday() {
  if (ui.tab !== 'today' || !$('#quests')) { render(); return []; }
  const c = ctx();
  patchHud(c);
  const s = V.dialState(c);
  const hero = $('#hero');
  if (!hero || Number(hero.dataset.total) !== s.total) { render(); return []; }
  patchHero(device.world, hero, heroState(c, s));
  $('#core-done').textContent = s.done;
  $('#core-total').textContent = s.total;
  const tpl = document.createElement('div');
  tpl.innerHTML = V.questsHtml(c);
  const inserted = morph($('#quests'), tpl);
  updateSyncLine();
  updateBadge();
  return inserted;
}
function updateSyncLine() {
  const el = $('#sync-line');
  if (!el) return;
  const tpl = document.createElement('div');
  tpl.innerHTML = V.syncLine(ctx());
  el.replaceWith(tpl.firstElementChild);
}

// opening animation: finished quests light up one by one on the hero
function introDial() {
  const hero = $('#hero');
  if (!hero || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  hero.querySelectorAll('[data-slot].on').forEach((el, i) => {
    const frames = el instanceof SVGElement ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, scale: '.3' }, { opacity: 1, scale: '1' }];
    el.animate(frames, { duration: 320, delay: 140 + i * 70, easing: 'cubic-bezier(.2,.9,.3,1.3)', fill: 'backwards' });
  });
}

// ---------- sheets ----------
function openSheet(type, arg) {
  ui.sheet = { type, arg };
  const c = ctx();
  const html = {
    day: () => V.daySheet(c, arg), habit: () => V.habitSheet(c, arg), form: () => V.habitForm(c, arg),
    timer: () => V.timerSheet(c, arg), people: () => V.peopleSheet(c, arg), password: () => V.passwordSheet(), name: () => V.nameSheet(c),
    confirm: () => V.confirmSheet({ ...arg, act: 'confirm-yes' }),
  }[type]();
  const wasOpen = sheetRoot.classList.contains('is-open');
  if (!wasOpen) toastEl.classList.remove('is-on');
  sheetRoot.innerHTML = `<div class="sheet-backdrop" data-act="sheet-close"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${type}"><div class="sheet-grip" aria-hidden="true"></div>${html}</div>`;
  if (!wasOpen) { sheetRoot.getBoundingClientRect(); sheetRoot.classList.add('is-open'); audio.play('open'); }
  document.body.classList.add('has-sheet');
  const kind = sheetRoot.querySelector('input[name="kind"]:checked');
  if (kind) syncKindFields(kind.form);
}
function refreshSheet() { if (ui.sheet) openSheet(ui.sheet.type, ui.sheet.arg); }
function closeSheet() {
  ui.sheet = null; ui.confirm = null;
  sheetRoot.classList.remove('is-open');
  document.body.classList.remove('has-sheet');
  setTimeout(() => { if (!ui.sheet) sheetRoot.innerHTML = ''; }, 340);
}
function ask(opts, run) { ui.confirm = run; openSheet('confirm', opts); }

let toastTimer = null;
function toast(text, action) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = `<span>${V.esc(text)}</span>${action ? `<button data-act="toast-action">${V.esc(action.label)}</button>` : ''}`;
  toastEl._action = action?.run || null;
  toastEl.classList.add('is-on');
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), action ? 4500 : 2600);
}
function undoFor(id, day, prev) { return { label: 'Undo', run: () => { store.setEntry(id, day, prev.value, prev.meta); audio.play('untick'); } }; }

// ---------- rewards ----------
function sectionDone(h, hist, day) {
  const x = hist.perDay.get(day);
  const ids = store.habitsForDay(day).filter(k => k.section === h.section).map(k => k.id);
  return ids.length > 0 && ids.every(id => x?.done.includes(id));
}
function reward(h, before, point) {
  const day = store.today();
  const after = store.history();
  const W = words(device.world);
  if (point) {
    fx.burst(point.x, point.y);
    fx.floatText(point.x, point.y - 30, `+${h.xp} XP`);
    if (device.world === 'comic') fx.word(point.x - 70, point.y - 20, COMIC_WORDS[Math.floor(Math.random() * COMIC_WORDS.length)]);
  }
  const t = performance.now();
  ui.combo = t - ui.lastTickAt < 4000 ? ui.combo + 1 : 1;
  ui.lastTickAt = t;
  if (ui.combo >= 2) { fx.badge($('#combo'), `Combo ×${ui.combo}`); audio.play('combo', ui.combo); }
  else audio.play('tick');
  fx.haptic();

  const done = after.perDay.get(day)?.done.length || 0;
  const hero = $('#hero');
  const seg = hero?.querySelector(`[data-slot="${done - 1}"]`);
  if (seg instanceof SVGElement) seg.animate([{ opacity: .15 }, { opacity: 1, offset: .25 }, { opacity: .4, offset: .5 }, { opacity: 1 }], { duration: 600, easing: 'ease-out' });
  heroCelebrate(device.world, hero, done - 1);

  const wasPerfect = before.perDay.get(day)?.perfect, isPerfect = after.perDay.get(day)?.perfect;
  if (!(isPerfect && !wasPerfect) && sectionDone(h, after, day) && !sectionDone(h, before, day)) {
    setTimeout(() => { fx.stamp(W.cleared(V.SECTION[h.section])); audio.play('cleared'); }, 260);
  }
  if (isPerfect && !wasPerfect) {
    setTimeout(() => {
      fx.moment({ kind: 'perfect', title: W.perfect, big: '+50', sub: 'Bonus XP', foot: `Perfect streak: ${after.perfect.current} day${after.perfect.current === 1 ? '' : 's'}` });
      audio.play('perfect'); fx.haptic(3);
    }, 700);
  }
  if (after.level.level > before.level.level) {
    const r = rankFor(after.level.level), newRank = r.name !== rankFor(before.level.level).name;
    setTimeout(() => {
      fx.moment({ kind: 'level', title: W.level, big: String(after.level.level).padStart(2, '0'),
        sub: newRank ? `New rank: ${r.name}` : r.name, foot: `${(after.level.next - after.level.xp).toLocaleString('en-IN')} XP to level ${after.level.level + 1}` });
      audio.play('level'); fx.haptic(3);
    }, 750);
  }
}

// ---------- ticking ----------
function rowPoint(id) {
  const box = $(`.q[data-key="${id}"] .q-box`)?.getBoundingClientRect();
  return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
}
function tickHabit(id) {
  const h = store.habit(id);
  const now = store.now();
  const day = now.day;
  const e = store.entry(id, day);
  const v = e?.value || 0;
  if (h.kind === 'timer') return openSheet('timer', id);
  if (h.kind === 'people') return openSheet('people', id);
  if (h.kind === 'avoid' && !e?.done && now.minutes < AVOID_CONFIRM_MINUTE) {
    fx.pop($(`.q[data-key="${id}"]`), 'shake'); audio.play('deny');
    toast('You can confirm a clean day after 8 PM.');
    return;
  }
  const next = h.kind === 'count' ? (v >= h.target ? 0 : v + 1) : (e?.done ? 0 : 1);
  const nowDone = next >= h.target;
  const point = rowPoint(id);
  const before = store.history();
  // keep a finishing section open for a moment, then fold it into a "cleared" bar
  const sec = h.section;
  const wasExpanded = ui.expanded.has(sec);
  if (nowDone && !wasExpanded) ui.expanded.add(sec);
  const prev = store.setEntry(id, day, next, e?.meta);   // patches the screen synchronously
  if (nowDone) {
    const row = $(`.q[data-key="${id}"]`);
    fx.flash(row);
    fx.pop(row?.querySelector('.q-emo .emo'));
    reward(h, before, point);
    toast(`${h.name} done`, undoFor(id, day, prev));
    if (!wasExpanded) setTimeout(() => {
      ui.expanded.delete(sec);
      if (ui.tab !== 'today') return;
      for (const el of patchToday()) {
        if (el.dataset.key === 'clr-' + sec) el.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
      }
    }, 1300);
  } else if (next > 0) {
    audio.play('step', next); fx.haptic();
    if (point) fx.floatText(point.x, point.y - 26, `${next}/${h.target}`, 'flt-small');
    toast(`${h.name}: ${next} of ${h.target}`, undoFor(id, day, prev));
  } else {
    audio.play('untick'); fx.haptic();
    toast(`${h.name} unticked`, undoFor(id, day, prev));
  }
}

// ---------- actions ----------
const actions = {
  tab(name) {
    if (ui.tab === name) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    ui.tab = name; ui.reorder = false;
    history.replaceState(null, '', '#' + name);
    render();
    window.scrollTo(0, 0);
    if (name === 'today') introDial();
    if (name === 'board') refreshBoard();
    if (name === 'me') checkPush();
    main.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.9,.2,1)' });
    fx.haptic(); audio.play('tab');
  },
  tick: tickHabit,
  expand(sec) { ui.expanded.add(sec); patchToday(); },
  day(d) { openSheet('day', d); },
  month(m) { ui.calMonth = m; render(); },
  habit(id) { openSheet('habit', id); },
  edit(id) { openSheet('form', id); },
  'habit-add'() { openSheet('form', null); },
  async starter(i) {
    const s = STARTERS[Number(i)];
    if (!s || ui.adding.has(s.name)) return;
    const chip = document.querySelector(`[data-act="starter:${i}"]`);
    const r = chip?.getBoundingClientRect();
    ui.adding.add(s.name); chip?.classList.add('is-adding');
    const ok = await guard(() => store.addHabit({ ...s }));
    ui.adding.delete(s.name);
    if (!ok) { chip?.classList.remove('is-adding'); return; }
    if (r) { fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 14 }); fx.floatText(r.left + r.width / 2, r.top - 4, `+ ${s.name}`, 'flt-small'); }
    audio.play('cleared'); fx.haptic();
  },
  reorder() { ui.reorder = !ui.reorder; render(); },
  archived() { ui.showArchived = !ui.showArchived; render(); },
  async 'move-up'(id) { await guard(() => store.moveHabit(id, -1)); },
  async 'move-down'(id) { await guard(() => store.moveHabit(id, 1)); },
  archive(id) {
    const h = store.habit(id);
    ask({ title: `Archive ${h.name}?`, text: 'It stops from tomorrow on. Its history stays in your log.', yes: 'Archive quest' },
      async () => { if (await guard(() => store.archiveHabit(id))) { closeSheet(); toast(`${h.name} archived`); } });
  },
  async restore(id) { const h = store.habit(id); if (await guard(() => store.restoreHabit(id))) { closeSheet(); toast(`${h.name} restored`); } },
  delete(id) {
    const h = store.habit(id);
    ask({ title: `Delete ${h.name}?`, text: 'This can\'t be undone.', yes: 'Delete quest', danger: true },
      async () => { if (await guard(() => store.deleteHabit(id))) { closeSheet(); toast(`${h.name} deleted`); } });
  },
  'confirm-yes'() { const run = ui.confirm; ui.confirm = null; run?.(); },
  'sheet-close'() { closeSheet(); },
  'toast-action'() { const run = toastEl._action; toastEl.classList.remove('is-on'); run?.(); fx.haptic(); },
  'timer-start'(id) { startTimer(id); audio.play('step', 3); fx.haptic(); refreshSheet(); patchToday(); },
  'timer-pause'() { pauseTimer(); fx.haptic(); refreshSheet(); patchToday(); },
  'timer-add'(id) {
    const h = store.habit(id); const day = store.today(); const e = store.entry(id, day);
    const add = Math.min(5, h.target - (e?.value || 0));
    if (add <= 0) return;
    const before = store.history();
    const prev = store.setEntry(id, day, (e?.value || 0) + add, { ...(e?.meta || {}), manual: (e?.meta?.manual || 0) + add });
    refreshSheet();
    if ((e?.value || 0) + add >= h.target) {
      const r = $('.timer')?.getBoundingClientRect();
      reward(h, before, r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
      toast(`${h.name} done`, undoFor(id, day, prev));
    } else { audio.play('step', 2); fx.haptic(); }
  },
  'timer-reset'(id) {
    const h = store.habit(id);
    ask({ title: 'Reset the timer?', text: `Today's ${h.name.toLowerCase()} time goes back to 0.`, yes: 'Reset to 0', danger: true }, () => {
      const day = store.today(); const e = store.entry(id, day);
      store.setEntry(id, day, 0, { ...(e?.meta || {}), manual: 0 });
      openSheet('timer', id);
    });
  },
  'people-clear'(id) { store.setEntry(id, store.today(), 0, {}); closeSheet(); audio.play('untick'); },
  password() { openSheet('password'); },
  logout() {
    const pending = store.outbox.length;
    ask({ title: 'Log out?', text: pending ? `${pending} change${pending === 1 ? ' hasn\'t' : 's haven\'t'} synced yet and will be lost.` : 'You\'ll need your email and password to log back in.', yes: 'Log out', danger: true },
      async () => { pauseTimer(); if (ui.push === 'on') await disablePush({ quiet: true }); await backend.signOut(); store.clearLocal(); location.reload(); });
  },
  look(id) {
    if ((device.look === id && device.world === 'cyberpunk') || !LOOKS.some(l => l.id === id)) return;
    device.look = id; device.world = 'cyberpunk';
    switchTo();
  },
  world(id) {
    if (device.world === id || !WORLD_IDS.includes(id)) return;
    device.world = id;
    switchTo();
  },
  tutorial() { startTutorial(); },
  'board-period'(p) {
    if (ui.boardPeriod === p) return;
    ui.boardPeriod = p;
    try { localStorage.setItem('1440:boardPeriod', p); } catch {}
    const ind = $('#bseg-ind'); if (ind) ind.style.transform = `translateX(${p === 'all' ? 100 : 0}%)`;
    document.querySelectorAll('[data-act^="board-period:"]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.act.endsWith(p))));
    const foot = $('.lb-foot'); if (foot) foot.textContent = `Only names, levels and XP are shared. Your quests stay private.${p === 'all' ? '' : ' Weeks start on Monday.'}`;
    patchBoard(true);
    audio.play('tab'); fx.haptic();
  },
  'board-reload'() { store.boardError = null; patchBoard(); store.loadBoard(); },
  'name-edit'() { openSheet('name'); setTimeout(() => $('#f-bname')?.focus(), 350); },
  'push-on'() { enablePush(); },
  'push-off'() { disablePush(); },
  async 'push-test'() {
    if (DEMO) { toast('Test sent (demo). On your phone it lands in a few seconds.'); fx.haptic(); return; }
    let id;
    try { id = await backend.sendTestPush(); toast('Test sent. It should land in a few seconds.'); fx.haptic(); audio.play('tick'); }
    catch (err) { toast(isNetworkError(err) ? 'You\'re offline. Connect and try again.' : (ruleMessage(err) || err.message)); audio.play('deny'); return; }
    // check what happened, so a setup problem says so instead of failing silently
    setTimeout(async () => {
      const r = await backend.testPushResult(id).catch(() => null);
      if (!r) return;
      const ok = { label: 'OK', run: () => {} };
      if (!r.sent) toast('The push sender didn\'t pick it up. Check the "push" function is deployed with JWT verification off.', ok);
      else if (/^2\d\d/.test(r.result || '')) toast('Test delivered ✓ No banner? Check Focus mode and Settings → Notifications → 1440.', ok);
      else toast(`The push service refused it (${(r.result || 'no answer').slice(0, 60)}). Try turning reminders off and on.`, ok);
    }, 9000);
  },
  async remind(field) {
    const s = store.settings;
    if (!s || !(field in REMIND_DEFAULT)) return;
    const on = !!s[field];
    const value = on ? null : ($(`[data-remind="${field}"]`)?.value || REMIND_DEFAULT[field]);
    if (await guard(() => store.updateSettings({ [field]: value }))) { fx.haptic(); toast(on ? 'Reminder off' : `Reminder at ${V.fmtTime(value)}`); }
  },
  toggle(which) {
    device[which] = !device[which]; writeDevicePrefs(device);
    if (which === 'sound') { audio.sfxOn = device.sound; if (device.sound) audio.play('tick'); }
    if (which === 'music') { audio.musicOn = device.music; if (device.music) { audio.unlock(); audio.startMusic(); } else audio.stopMusic(); }
    applyDevicePrefs(device);
    document.querySelectorAll(`[data-act="toggle:${which}"]`).forEach(el =>
      el.setAttribute(el.getAttribute('role') === 'switch' ? 'aria-checked' : 'aria-pressed', String(device[which])));
    fx.haptic();
  },
  async retry() { await boot(); },
};

async function guard(fn) {
  try { await fn(); return true; }
  catch (err) { toast(isNetworkError(err) ? 'You\'re offline. Connect to change quests.' : (ruleMessage(err) || err.message || 'Something went wrong.')); return false; }
}

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const [name, ...rest] = el.dataset.act.split(':');
  const fn = actions[name];
  if (fn) { ev.preventDefault(); fn(rest.join(':')); }
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
document.addEventListener('change', (ev) => { if (ev.target.name === 'kind') syncKindFields(ev.target.form); });
document.addEventListener('change', async (ev) => {
  const field = ev.target.dataset?.remind;
  const v = ev.target.value;
  if (!field || !v || String(store.settings?.[field] || '').slice(0, 5) === v) return;
  if (await guard(() => store.updateSettings({ [field]: v }))) toast(`Reminder at ${V.fmtTime(v)}`);
});

const forms = {
  async login(form) {
    const email = form.email.value.trim(), password = form.password.value;
    if (!email || !password) { showLogin('Enter your email and password.'); return; }
    showLogin('', true);
    try { await startApp(await backend.signIn(email, password)); }
    catch (err) {
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
    const target = kind === 'count' || kind === 'timer' ? Math.round(Number(form.target.value)) : 1;
    if (!name) { err.textContent = 'Give the quest a name.'; form.name.focus(); return; }
    if (!days.length) { err.textContent = 'Pick at least one day.'; return; }
    if (!(target >= 1 && target <= (kind === 'timer' ? 600 : 50))) { err.textContent = kind === 'timer' ? 'Minutes must be between 1 and 600.' : 'Times a day must be between 1 and 50.'; return; }
    const fields = { name, kind, target, days, emoji: form.emoji.value.trim() || null,
      section: form.querySelector('input[name="section"]:checked').value,
      xp: Number(form.querySelector('input[name="xp"]:checked').value), unit: kind === 'timer' ? 'min' : null };
    if (await guard(() => (id ? store.updateHabit(id, fields) : store.addHabit(fields)))) { closeSheet(); toast(id ? 'Quest saved' : `${name} added`); audio.play('cleared'); }
  },
  people(form) {
    const id = form.dataset.id;
    const who = [...form.querySelectorAll('input[name="who"]:checked')].map(i => i.value);
    const extra = form.new.value.trim();
    if (extra && !who.some(w => w.toLowerCase() === extra.toLowerCase())) who.push(extra);
    if (!who.length) { form.querySelector('[data-error]').textContent = 'Pick or type a name.'; return; }
    const h = store.habit(id), day = store.today(), e = store.entry(id, day);
    closeSheet();
    const point = rowPoint(id);
    const before = store.history();
    const prev = store.setEntry(id, day, 1, { ...(e?.meta || {}), who });
    if (!e?.done) {
      const row = $(`.q[data-key="${id}"]`); fx.flash(row); fx.pop(row?.querySelector('.q-emo .emo'));
      reward(h, before, point);
      toast(`${h.name} done`, undoFor(id, day, prev));
    }
  },
  async name(form) {
    const err = form.querySelector('[data-error]');
    const name = form.name.value.trim().replace(/\s+/g, ' ');
    if (!name) { err.textContent = 'Type a name.'; form.name.focus(); return; }
    if (Array.from(name).length > 20) { err.textContent = 'Keep it to 20 characters.'; return; }
    if (await guard(() => store.updateSettings({ display_name: name }))) {
      if (ui.sheet?.type === 'name') closeSheet();
      toast('Name saved'); audio.play('cleared'); fx.haptic();
    }
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
let lastDay = null, lastMinute = null;
setInterval(() => {
  if (!store.user || !store.settings) return;
  const now = store.now();
  if (lastDay && now.day !== lastDay) {
    const t = getTimer();
    if (t && t.day !== now.day) { saveTimerProgress(t); setTimer(null); }
    lastDay = now.day; ui.expanded.clear();
    render(); if (ui.sheet && ui.sheet.type !== 'password') closeSheet();
    toast('A new day. Yesterday is locked.');
    return;
  }
  lastDay = now.day;
  const t = getTimer();
  if (t) {
    if (Math.floor(timerSeconds(t) / 60) > (store.entry(t.habit_id, t.day)?.value || 0)) saveTimerProgress(t);
    const live = getTimer();
    if (live) {
      const h = store.habit(live.habit_id);
      const secs = Math.min(h.target * 60, timerSeconds(live));
      const n = $('#timer-n'); if (n) n.textContent = V.fmtClock(secs);
      const arc = $('#timer-arc');
      if (arc) { const f = Math.min(1, secs / 60 / arc.dataset.target); arc.setAttribute('stroke-dasharray', `${(f * arc.dataset.c).toFixed(2)} ${arc.dataset.c}`); arc.setAttribute('opacity', f > 0 ? '1' : '0'); }
      const rowT = $('[data-live="row-timer"]'); if (rowT) rowT.textContent = V.fmtClock(secs);
    }
  }
  if (now.minutes !== lastMinute) {
    lastMinute = now.minutes;
    const left = 1440 - now.minutes;
    const m = $('#dial-min'); if (m) { m.textContent = left; m.dataset.text = left; }
    const d = $('#core-date'); if (d) d.textContent = V.dateText(now.day, now, device.world);
    const hero = $('#hero');
    if (hero && ui.tab === 'today') { const c = ctx(); patchHero(device.world, hero, heroState(c, V.dialState(c))); }
    const a = V.timeArc(now.minutes);
    const tr = $('#time-ring'); if (tr) { tr.setAttribute('stroke-dasharray', a.dash); tr.setAttribute('stroke-dashoffset', a.offset); }
    const dot = $('#time-dot'); if (dot) { dot.setAttribute('cx', a.x); dot.setAttribute('cy', a.y); }
    if (now.minutes === AVOID_CONFIRM_MINUTE && ui.tab === 'today') patchToday();
  }
}, 1000);

setInterval(() => { if (store.user) store.flush(); }, 20000);
addEventListener('online', () => store.flush());
document.addEventListener('visibilitychange', async () => {
  document.documentElement.classList.toggle('is-away', document.hidden);
  if (document.hidden) audio.suspend(); else audio.resume();
  if (document.hidden || !store.user) return;
  if (Date.now() - store.lastRefresh > 60000) await store.refresh().catch(() => {});
  store.flush();
  updateBadge();
  if (ui.tab === 'board') refreshBoard();
  if (ui.tab === 'me') checkPush();
});

store.addEventListener('change', (ev) => {
  const d = ev.detail;
  if (d && d.type === 'rejected') { toast(d.message); audio.play('deny'); return; }
  if (!ui.booted) return;
  if (d === 'sync' || d === 'synced' || d === 'offline') { updateSyncLine(); return; }
  if (d === 'board') { if (ui.tab === 'board') patchBoard(true); return; }
  if (d === 'tick' || d === 'refresh') { if (ui.tab === 'today') patchToday(); else render(); if (ui.sheet?.type === 'day' || ui.sheet?.type === 'habit') refreshSheet(); return; }
  render();
});

// ---------- boot ----------
function showLogin(error = '', busy = false) {
  tabbarEl.hidden = true;
  main.innerHTML = V.login({ error, busy });
  if (!busy && !error) $('input[name="email"]')?.focus();
}
async function startApp(user) {
  ui.booted = true;
  try { await store.start(user); }
  catch (err) { toast(ruleMessage(err) || err.message || 'Couldn\'t load your data.'); }
  const sp = store.settings?.prefs || {};
  if (!hadDevicePrefs && (sp.world || sp.look)) {
    if (WORLD_IDS.includes(sp.world)) device.world = sp.world;
    if (LOOKS.some(l => l.id === sp.look)) device.look = sp.look;
    writeDevicePrefs(device); applyDevicePrefs(device); buildBackdrop(bk, lookId(device)); audio.setLook(lookId(device));
  }
  render();
  if (ui.tab === 'today') introDial();
  if (ui.tab === 'board') refreshBoard();
  if (tutorialDue(store)) setTimeout(startTutorial, 350);
  checkPush();
  if (!DEMO && pushCapable() && !cachedKey()) backend.pushPublicKey().then(rememberKey).catch(() => {});
}

// ---------- board ----------
function refreshBoard() {
  const b = store.boardRows();
  if (!b || Date.now() - b.at > 15000) store.loadBoard();
  // safety net: if the list is still empty a few seconds later, draw or load it again
  clearTimeout(refreshBoard.t);
  refreshBoard.t = setTimeout(() => {
    if (ui.tab !== 'board' || !$('.lb-skel')) return;
    if (store.boardRows()) patchBoard(); else if (!store.boardLoading) store.loadBoard();
  }, 4000);
}
function patchBoard(animate) {
  const el = $('#board-list');
  if (!el) return;
  const tpl = document.createElement('div');
  tpl.innerHTML = V.boardList(ctx());
  if (el.innerHTML === tpl.innerHTML) return;
  el.replaceChildren(...tpl.childNodes);
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.animate([{ opacity: .35 }, { opacity: 1 }], { duration: 240, easing: 'ease-out' });
  }
}

// ---------- reminders (web push) ----------
const REMIND_DEFAULT = { remind_morning: '12:00', remind_evening: '17:00', remind_last_call: '23:30' };
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
const pushCapable = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const cachedKey = () => { try { return localStorage.getItem('1440:vapid'); } catch { return null; } };
const rememberKey = (k) => { try { localStorage.setItem('1440:vapid', k); } catch {} return k; };
function keyBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
function sameKey(sub, b64) {
  const k = sub.options?.applicationServerKey;
  if (!k) return true;
  const a = new Uint8Array(k), b = keyBytes(b64);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
function saveSub(sub) {
  const j = sub.toJSON();
  return backend.savePush({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
}
function setPush(state) {
  if (ui.push === state) return;
  ui.push = state;
  const el = $('#reminders');
  if (el) { const tpl = document.createElement('div'); tpl.innerHTML = V.remindersBlock(ctx()); el.replaceWith(tpl.firstElementChild); }
  tut?.refresh?.();
}
async function checkPush() {
  if (!pushCapable()) return setPush(isIOS && !standalone ? 'install' : 'unsupported');
  if (DEMO || ui.push === 'busy') return;   // the demo pretends; it never asks the browser
  if (Notification.permission === 'denied') return setPush('denied');
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    const on = !!sub && Notification.permission === 'granted';
    setPush(on ? 'on' : 'off');
    // keep the server in step with this phone (e.g. after logging in to another account here)
    if (on && !ui.pushSynced) { ui.pushSynced = true; saveSub(sub).catch(() => { ui.pushSynced = false; }); }
  } catch { /* leave as is */ }
}
async function enablePush() {
  if (ui.push === 'busy') return false;
  if (!pushCapable()) { toast(isIOS && !standalone ? 'Open 1440 from your Home Screen icon first.' : 'This browser can\'t show reminders.'); return false; }
  if (DEMO) { setPush('on'); toast('Reminders on (demo)'); audio.play('cleared'); fx.haptic(); return true; }
  const asking = Notification.requestPermission();   // must happen right inside the tap
  setPush('busy');
  try {
    const perm = await asking;
    if (perm !== 'granted') {
      setPush(perm === 'denied' ? 'denied' : 'off');
      if (perm === 'denied') toast('Notifications are blocked. Turn them on in Settings → Notifications → 1440.');
      return false;
    }
    const key = cachedKey() || rememberKey(await backend.pushPublicKey());
    const reg = await Promise.race([navigator.serviceWorker.ready,
      new Promise((_, no) => setTimeout(() => no(new Error('the app\'s background worker isn\'t running. Close and reopen 1440, then try again.')), 8000))]);
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, key)) { await sub.unsubscribe().catch(() => {}); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    await saveSub(sub);
    ui.pushSynced = true;
    setPush('on'); lastBadge = null; updateBadge();
    toast('Reminders on. Tap "Send a test" to try one.'); audio.play('cleared'); fx.haptic();
    return true;
  } catch (err) {
    setPush('off');
    toast(isNetworkError(err) ? 'You\'re offline. Connect and try again.' : (ruleMessage(err) || `Couldn't turn on reminders: ${err.message || err}`));
    return false;
  }
}
async function disablePush({ quiet = false } = {}) {
  if (!DEMO) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await backend.removePush(sub.endpoint).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
    } catch { /* nothing to undo */ }
  }
  ui.pushSynced = false;
  setPush('off');
  if ('clearAppBadge' in navigator) navigator.clearAppBadge().catch(() => {});
  if (!quiet) { toast('Reminders off on this phone'); fx.haptic(); }
}

// the Home Screen icon shows how many quests are left today
let lastBadge = null;
function updateBadge() {
  if (DEMO || !('setAppBadge' in navigator) || !store.settings || !('Notification' in window) || Notification.permission !== 'granted') return;
  const left = store.history().perDay.get(store.today())?.missed.length || 0;
  if (left === lastBadge) return;
  lastBadge = left;
  (left > 0 ? navigator.setAppBadge(left) : navigator.clearAppBadge()).catch(() => {});
}

// ---------- switching worlds ----------
function switchTo() {
  writeDevicePrefs(device);
  const id = lookId(device);
  audio.play('switch'); fx.haptic(2);
  audio.setLook(id);
  lookTransition(() => { applyDevicePrefs(device); buildBackdrop(bk, id); render(); if (ui.tab === 'today') introDial(); });
  if (store.settings && !DEMO) store.updateSettings({ prefs: { ...(store.settings.prefs || {}), world: device.world, look: device.look } }).catch(() => {});
}

// ---------- tutorial ----------
let tut = null;
function startTutorial() {
  if (tut) return;
  closeSheet();
  tut = openTutorial({
    store, device, audio, fx,
    setWorld: (id) => actions.world(id),
    addStarter: async (i) => guard(() => store.addHabit({ ...STARTERS[i] })),
    saveName: (name) => store.updateSettings({ display_name: name }).catch(() => {}),
    enablePush: () => enablePush(),
    pushState: () => ui.push,
    onClose: () => {
      tut = null;
      if (ui.tab !== 'today') actions.tab('today'); else { render(); introDial(); }
      const r = $('#hero')?.getBoundingClientRect();
      if (r) setTimeout(() => fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 30, spread: 1.8 }), 200);
      audio.play('cleared');
    },
  });
}
async function boot() {
  const user = await backend.getUser().catch(() => null);
  if (!user) { showLogin(); return; }
  await startApp(user);
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
boot();
