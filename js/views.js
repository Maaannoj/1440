// 1440 · views. Each function returns HTML for one screen, part or sheet.
// Elements that change on a tick carry data-key so the app can patch them in place.
import { addDays, dow, habitRate, overallRate, progressOf, rankFor, RANKS, AVOID_CONFIRM_MINUTE, SHIELD_MAX, ALL_DAYS } from './logic.js';
import { LOOKS } from './themes.js';
import { TRACKS } from './audio.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n).toLocaleString('en-IN');
const pct = (r) => (r == null ? '–' : Math.round(r * 100) + '%');
const pad2 = (n) => String(n).padStart(2, '0');
export const SECTION = { morning: 'Morning', day: 'Day', night: 'Night' };
const SECTIONS = ['morning', 'day', 'night'];
const KIND = {
  check:  ['Tick', 'Done or not done.'],
  count:  ['Count', 'Do it a set number of times, like 2 meals.'],
  timer:  ['Timer', 'Earn the tick by timing it, like 30 minutes of reading.'],
  avoid:  ['Avoid', 'Something to stop. Confirm a clean day each night after 8 PM.'],
  people: ['People', 'Log who you connected with.'],
};
const WEEK = [1, 2, 3, 4, 5, 6, 0];
const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtDay(day, opts) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(day + 'T00:00:00Z'));
}
export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${pad2(m)} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ':' + pad2(m) : m) + ':' + pad2(r);
}
export function clockText(now) { return `${pad2(Math.floor(now.minutes / 60))}:${pad2(now.minutes % 60)}`; }
export function dateText(day, now) {
  const d = fmtDay(day, { weekday: 'short' }).toUpperCase();
  return `${d} ${day.slice(8, 10)}.${day.slice(5, 7)} // ${clockText(now)}`;
}
function scheduleText(h) {
  const days = h.days?.length ? h.days : ALL_DAYS;
  if (days.length === 7) return 'Every day';
  const set = new Set(days);
  if (days.length === 5 && [1, 2, 3, 4, 5].every(d => set.has(d))) return 'Weekdays';
  if (days.length === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return WEEK.filter(d => set.has(d)).map(d => DAY_SHORT[d]).join(', ');
}
const kindText = (h) => KIND[h.kind][0] + (h.kind === 'count' ? ' ×' + h.target : h.kind === 'timer' ? ' ' + h.target + ' min' : '');

// ---------- icons ----------
export const icon = {
  today: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  log: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>',
  quests: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.5 6 .8-4.4 4.1 1.1 6L12 16.5 6.7 19.4l1.1-6L3.4 9.3l6-.8z"/></svg>',
  me: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l7.8 4.5v9L12 20.8l-7.8-4.5v-9z"/><circle cx="12" cy="11.5" r="2.6"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14.5l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg>',
};
export const TABS = [['today', 'Today'], ['log', 'Log'], ['quests', 'Quests'], ['me', 'Me']];
export function tabbar(active) {
  const i = TABS.findIndex(t => t[0] === active);
  return `<i class="tab-ind" id="tab-ind" style="transform:translateX(${i * 100}%)"></i>` + TABS.map(([id, label]) =>
    `<button class="tab${active === id ? ' is-active' : ''}" data-act="tab:${id}" aria-label="${label}"${active === id ? ' aria-current="page"' : ''}>${icon[id]}<span>${label}</span></button>`).join('');
}

// ---------- HUD ----------
const HEX = '<svg class="badge-hex" viewBox="0 0 56 56" aria-hidden="true"><polygon points="28,3 49.6,15.5 49.6,40.5 28,53 6.4,40.5 6.4,15.5"/></svg>';
export function hudData(ctx) {
  const h = ctx.history;
  const lvl = h.level;
  return {
    level: lvl.level, rank: rankFor(lvl.level).name, xp: lvl.xp, next: lvl.next, pct: lvl.pct,
    streak: h.perfect.current, shields: h.bank, shieldsOn: ctx.shieldsOn,
  };
}
export function hud(ctx) {
  const d = hudData(ctx);
  return `
  <header class="hud">
    <button class="badge" data-act="tab:me" aria-label="Level ${d.level}, ${d.rank}">
      <span class="badge-orbit"></span>${HEX}<span class="badge-n" id="hud-lv">${pad2(d.level)}</span>
    </button>
    <div class="hud-mid">
      <div class="hud-rank"><span class="hud-rank-name" id="hud-rank">${d.rank}</span><span class="hud-lvl" id="hud-lvl">LVL ${d.level}</span></div>
      <div class="xpbar"><i class="xpbar-fill" id="hud-xpfill" style="transform:scaleX(${d.pct.toFixed(4)})"></i><span class="xpbar-shine"></span></div>
      <div class="hud-xp"><b id="hud-xp">${num(d.xp)}</b> / <span id="hud-next">${num(d.next)}</span> XP</div>
    </div>
    <div class="hud-stats">
      <span class="hud-stat fire" title="Perfect streak"><em class="emo" aria-hidden="true">🔥</em><b id="hud-streak">${d.streak}</b></span>
      ${d.shieldsOn ? `<span class="hud-stat shield" title="Streak shields"><em class="emo" aria-hidden="true">🛡️</em><b id="hud-shields">${d.shields}</b></span>` : ''}
    </div>
  </header>
  <div class="strip" aria-hidden="true"><i class="strip-run"></i><span class="strip-text">SYS://1440 ▓▓▓▓▓▓▓▓▓▓▓░░░░ UPLINK OK · SYNC 100% · NODE MUM-1 · PERFECT STREAK ${d.streak} · RANK ${d.rank.toUpperCase()} · EVERY MINUTE COUNTS</span></div>`;
}

// ---------- dial ----------
const DIAL = { c: 120, rSeg: 98, rTime: 80 };
export function timeArc(minutesNow) {
  const { c, rTime } = DIAL;
  const C = 2 * Math.PI * rTime;
  const left = Math.max(0, 1 - minutesNow / 1440);
  const a = (1 - left) * 2 * Math.PI - Math.PI / 2;
  return { dash: `${(C * left).toFixed(2)} ${C.toFixed(2)}`, offset: (-C * (1 - left)).toFixed(2), x: (c + rTime * Math.cos(a)).toFixed(2), y: (c + rTime * Math.sin(a)).toFixed(2) };
}
export function dialState(ctx) {
  const day = ctx.now.day;
  const habits = ctx.store.habitsForDay(day);
  let done = 0, part = 0;
  for (const h of habits) {
    const e = ctx.entry(h.id);
    if (e?.done) done++; else if ((e?.value || 0) > 0) part++;
  }
  return { total: habits.length, done, part };
}
function segments(total, done = 0, part = 0) {
  const { c, rSeg } = DIAL;
  const C = 2 * Math.PI * rSeg;
  const n = Math.max(1, total);
  const gap = n > 1 ? Math.min(6, C / n * .25) : 0;
  const len = C / n - gap;
  let out = '';
  for (let i = 0; i < n; i++) {
    out += `<circle class="seg${i < done ? ' on' : i < done + part ? ' part' : ''}" cx="${c}" cy="${c}" r="${rSeg}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-(i * C / n) - gap / 2).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
  }
  return out;
}
function dial(ctx, s) {
  const { c, rTime } = DIAL;
  const t = timeArc(ctx.now.minutes);
  const left = 1440 - ctx.now.minutes;
  return `
  <div class="dial" id="dial" role="img" aria-label="${left} minutes left today, ${s.done} of ${s.total} quests done">
    <div class="dial-l dial-ticks"></div>
    <div class="dial-l dial-dash"></div>
    <div class="dial-l dial-sweep"></div>
    <svg class="dial-l dial-svg" viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <linearGradient id="g-neon" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF35CF"/><stop offset="1" stop-color="#33F2FF"/></linearGradient>
        <linearGradient id="g-holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8FF3FF"/><stop offset=".5" stop-color="#C79BFF"/><stop offset="1" stop-color="#FF9AE6"/></linearGradient>
        <linearGradient id="g-vapor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF71CE"/><stop offset=".5" stop-color="#B967FF"/><stop offset="1" stop-color="#01CDFE"/></linearGradient>
        <linearGradient id="g-chrome" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".48" stop-color="#9AA5B3"/><stop offset=".52" stop-color="#E9EEF3"/><stop offset="1" stop-color="#7D8896"/></linearGradient>
      </defs>
      <g class="segs" id="segs" data-total="${s.total}">${segments(s.total, s.done, s.part)}</g>
      <circle class="time-track" cx="${c}" cy="${c}" r="${rTime}"/>
      <circle class="time-ring" id="time-ring" cx="${c}" cy="${c}" r="${rTime}" stroke-dasharray="${t.dash}" stroke-dashoffset="${t.offset}" transform="rotate(-90 ${c} ${c})"/>
      <circle class="time-dot" id="time-dot" cx="${t.x}" cy="${t.y}" r="4"/>
    </svg>
    <div class="dial-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="dial-c"><span class="dial-min glitch" id="dial-min" data-text="${left}">${left}</span><span class="dial-lbl">Minutes left</span></div>
  </div>`;
}

// ---------- quests (Today) ----------
function boxSvg(h, e, locked) {
  const done = !!e?.done;
  if (done) {
    return `<svg viewBox="0 0 34 34" aria-hidden="true"><rect class="fill" x="1" y="1" width="32" height="32"/><path class="chk" d="M9 17.5l5.5 5.5L25.5 11"/></svg>`;
  }
  const glyph = h.kind === 'timer' ? '<path class="glyph" d="M13 10.5v13l10.5-6.5z"/>'
    : h.kind === 'people' ? '<path class="glyph-line" d="M17 11v12M11 17h12"/>'
    : h.kind === 'count' && (e?.value || 0) > 0 ? `<text x="17" y="21.5" text-anchor="middle" class="glyph" style="font:700 13px var(--f-mono),monospace">${e.value}</text>`
    : locked ? '<path class="glyph-line" d="M12.5 16v-2.5a4.5 4.5 0 0 1 9 0V16M11 16h12v8H11z"/>' : '';
  return `<svg viewBox="0 0 34 34" aria-hidden="true"><rect class="frame" x="1" y="1" width="32" height="32"/>${glyph}</svg>`;
}
function questSub(h, e, stat, ctx) {
  const parts = [`<span class="q-xp">+${h.xp} XP</span>`];
  const v = e?.value || 0;
  if (h.kind === 'count') parts.push(`<span class="mini"><i style="transform:scaleX(${Math.min(1, v / h.target).toFixed(3)})"></i></span><span>${v}/${h.target}</span>`);
  if (h.kind === 'timer') {
    const live = ctx.timer && ctx.timer.habit_id === h.id;
    const shown = live ? Math.min(h.target * 60, ctx.timerSeconds) : v * 60;
    parts.push(`<span class="mini"><i style="transform:scaleX(${Math.min(1, shown / 60 / h.target).toFixed(3)})"></i></span><span${live ? ' data-live="row-timer"' : ''}>${live ? fmtClock(shown) : v + '/' + h.target + ' min'}</span>`);
  }
  if (h.kind === 'avoid' && !e?.done) parts.push(`<span>${ctx.now.minutes < AVOID_CONFIRM_MINUTE ? 'Confirm after 8 PM' : 'Clean today? Tap'}</span>`);
  if (h.kind === 'people' && e?.done && e.meta?.who?.length) parts.push(`<span>${esc(e.meta.who.join(', '))}</span>`);
  if (stat && stat.current >= 2) parts.push(`<span>🔥${stat.current}</span>`);
  return parts.join('');
}
export function questRow(h, ctx, i) {
  const e = ctx.entry(h.id);
  const stat = ctx.history.habitStats.get(h.id);
  const done = !!e?.done;
  const locked = h.kind === 'avoid' && !done && ctx.now.minutes < AVOID_CONFIRM_MINUTE;
  const live = ctx.timer && ctx.timer.habit_id === h.id;
  const cls = ['q', done && 'is-done', locked && 'is-locked', live && 'is-live'].filter(Boolean).join(' ');
  return `<button class="${cls}" data-key="${h.id}" data-act="tick:${h.id}" style="--i:${i}" aria-label="${esc(h.name)}${done ? ', done' : ''}">
    <span class="q-emo"><em class="emo" aria-hidden="true">${esc(h.emoji || '◆')}</em></span>
    <span class="q-txt"><span class="q-name">${esc(h.name)}</span><span class="q-sub">${questSub(h, e, stat, ctx)}</span></span>
    <span class="q-box">${boxSvg(h, e, locked)}</span>
  </button>`;
}
export function questsHtml(ctx) {
  const day = ctx.now.day;
  const habits = ctx.store.habitsForDay(day);
  let i = 0;
  return SECTIONS.map(sec => {
    const list = habits.filter(h => h.section === sec);
    if (!list.length) return '';
    const d = list.filter(h => ctx.entry(h.id)?.done).length;
    const start = i; i += list.length;
    if (d === list.length && !ctx.ui.expanded.has(sec)) {
      return `<section class="sec" data-key="clr-${sec}" aria-label="${SECTION[sec]} cleared">
        <button class="cleared" data-act="expand:${sec}">${SECTION[sec]} <b>${d}/${list.length}</b> cleared
          <span class="cl-emos" aria-hidden="true">${list.slice(0, 5).map((h, k) => `<em class="emo" style="--i:${k}">${esc(h.emoji || '◆')}</em>`).join('')}</span></button>
      </section>`;
    }
    return `<section class="sec" data-key="sec-${sec}" data-deep aria-label="${SECTION[sec]}">
      <h2 class="sec-head" data-key="head-${sec}"><span>${sec === 'day' ? 'Day quests' : SECTION[sec]}</span><span class="sec-n">${d}/${list.length}</span></h2>
      ${list.map((h, k) => questRow(h, ctx, start + k)).join('')}
    </section>`;
  }).join('') || `<div class="block" data-key="empty"><p class="block-text">No quests scheduled today.</p><div class="sheet-actions"><button class="btn" data-act="habit-add">Add a quest</button></div></div>`;
}

// ---------- Today ----------
export function today(ctx) {
  const s = dialState(ctx);
  return `
  ${hud(ctx)}
  <section class="core">
    <div class="core-top">
      <p class="core-date" id="core-date">${dateText(ctx.now.day, ctx.now)}</p>
      <button class="music-btn" data-act="toggle:music" aria-pressed="${!!ctx.device.music}" aria-label="Music"><i></i><i></i><i></i><i></i></button>
    </div>
    ${dial(ctx, s)}
    <div class="core-row"><span class="core-q">Quests <b id="core-done">${s.done}</b>/<span id="core-total">${s.total}</span></span><span class="combo" id="combo" aria-live="polite"></span></div>
  </section>
  <div class="quests" id="quests">${questsHtml(ctx)}</div>
  ${syncLine(ctx)}`;
}
export function syncLine(ctx) {
  const n = ctx.store.outbox.length;
  if (!n) return '<p class="hint center" id="sync-line" hidden></p>';
  const what = `${n} change${n === 1 ? '' : 's'}`;
  return `<p class="hint center" id="sync-line">${ctx.store.online ? `Saving ${what}…` : `Offline. ${what} will sync when you're back online.`}</p>`;
}

// ---------- Log ----------
function cell(x, day, today) {
  const r = 15, C = 2 * Math.PI * r;
  const n = Number(day.slice(8));
  if (!x || x.scheduled.length === 0) return `<span class="cell is-empty${day > today ? ' is-future' : ''}"><span class="cell-n">${n}</span></span>`;
  const cls = ['cell'];
  if (x.isToday) cls.push('is-today');
  if (x.perfect && !x.isToday) cls.push('is-perfect');
  if (!x.isToday && x.score === 0) cls.push('is-zero');
  const arc = x.perfect && !x.isToday ? '' :
    `<circle cx="18" cy="18" r="${r}" class="cell-arc" stroke-dasharray="${(x.score * C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 18 18)"/>`;
  return `<button class="${cls.join(' ')}" data-act="day:${day}" aria-label="${fmtDay(day, { day: 'numeric', month: 'long' })}: ${x.done.length} of ${x.scheduled.length} done${x.shielded ? ', shield used' : ''}">
    <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="${r}" class="cell-track"/>${arc}</svg>
    <span class="cell-n">${n}</span>${x.shielded ? '<span class="cell-shield" aria-hidden="true"></span>' : ''}</button>`;
}
export function log(ctx) {
  const { history, now, ui } = ctx;
  const today = now.day;
  const month = ui.calMonth || today.slice(0, 7);
  const first = month + '-01';
  const lead = (dow(first) + 6) % 7;
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cell" aria-hidden="true"></span>');
  for (let d = first; d.slice(0, 7) === month; d = addDays(d, 1)) cells.push(cell(history.perDay.get(d), d, today));
  const startMonth = (history.start || today).slice(0, 7);
  const prevMonth = addDays(first, -1).slice(0, 7);
  const nextMonth = addDays(first, 32).slice(0, 7);
  return `
  ${hud(ctx)}
  <div class="page-head"><h1 class="page-title"><span class="glitch" data-text="Log">Log</span></h1></div>
  <section class="tiles" aria-label="Summary">
    <div class="tile"><span class="tile-n">${history.perfectDays}</span><span class="tile-l">Perfect days</span></div>
    <div class="tile"><span class="tile-n">${history.perfect.best}</span><span class="tile-l">Best perfect streak</span></div>
    <div class="tile"><span class="tile-n">${pct(overallRate(history, today, 30))}</span><span class="tile-l">Done, last 30 days</span></div>
  </section>
  <section class="month" aria-label="${fmtDay(first, { month: 'long', year: 'numeric' })}">
    <div class="month-head">
      <button class="icon-btn" data-act="month:${prevMonth}" aria-label="Previous month"${prevMonth < startMonth ? ' disabled' : ''}>${icon.prev}</button>
      <h2>${fmtDay(first, { month: 'long', year: 'numeric' })}</h2>
      <button class="icon-btn" data-act="month:${nextMonth}" aria-label="Next month"${month >= today.slice(0, 7) ? ' disabled' : ''}>${icon.next}</button>
    </div>
    <div class="weekdays" aria-hidden="true">${WEEK.map(d => `<span>${DAY_LETTER[d]}</span>`).join('')}</div>
    <div class="cal">${cells.join('')}</div>
  </section>
  <section class="legend" aria-label="Legend">
    <span><i class="lg lg-perfect"></i>Perfect</span><span><i class="lg lg-part"></i>Partly done</span><span><i class="lg lg-zero"></i>Nothing done</span>
    ${ctx.shieldsOn ? '<span><i class="lg lg-shield"></i>Shield used</span>' : ''}
  </section>`;
}

export function daySheet(ctx, day) {
  const { store, history } = ctx;
  const x = history.perDay.get(day);
  if (!x) return '';
  const order = { morning: 0, day: 1, night: 2 };
  const rows = x.scheduled.map(id => store.habit(id)).filter(Boolean)
    .sort((a, b) => order[a.section] - order[b.section] || a.sort_order - b.sort_order)
    .map(h => {
      const e = x.entries.get(h.id);
      const done = !!e?.done;
      let extra = '';
      if (h.kind === 'count' || h.kind === 'timer') extra = `${e?.value || 0} of ${h.target}${h.kind === 'timer' ? ' min' : ''}`;
      if (h.kind === 'people' && e?.meta?.who?.length) extra = 'With ' + esc(e.meta.who.join(', '));
      const state = done ? 'is-done' : x.isToday ? 'is-open' : 'is-miss';
      return `<li class="dl-row ${state}"><span class="dl-mark" aria-hidden="true">${done ? '✓' : x.isToday ? '·' : '✕'}</span>
        <span class="dl-name">${esc(h.emoji || '')} ${esc(h.name)}${extra ? `<span class="dl-extra">${extra}</span>` : ''}<span class="visually-hidden">, ${done ? 'done' : x.isToday ? 'not yet' : 'missed'}</span></span></li>`;
    }).join('');
  const xp = x.xp + (x.perfect ? 50 : 0);
  return `
    <h2 class="sheet-title">${fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
    <p class="sheet-sub">${x.done.length} of ${x.scheduled.length} done. ${num(xp)} XP earned${x.perfect ? '. Perfect day' : ''}.</p>
    ${x.isToday ? '<p class="note">Today is still in progress.</p>' : ''}
    ${x.shielded ? '<p class="note note-s">A shield protected your streaks on this day. The misses still count here.</p>' : ''}
    <ul class="dl">${rows}</ul>
    <div class="sheet-actions"><button class="btn btn-quiet" data-act="sheet-close">Close</button></div>`;
}

// ---------- Quests (habit list) ----------
export function quests(ctx) {
  const { store, history, now, ui } = ctx;
  const active = store.activeHabits();
  const archived = store.habits.filter(h => h.archived_on);
  const groups = SECTIONS.map(sec => {
    const list = active.filter(h => h.section === sec);
    if (!list.length) return '';
    return `<section class="sec"><h2 class="sec-head"><span>${SECTION[sec]}</span><span class="sec-n">${list.length}</span></h2>
      ${list.map((h, i) => {
        const st = history.habitStats.get(h.id);
        if (ui.reorder) {
          return `<div class="q is-list" style="--i:${i}">
            <span class="q-emo"><em class="emo" aria-hidden="true">${esc(h.emoji || '◆')}</em></span>
            <span class="q-txt"><span class="q-name">${esc(h.name)}</span></span>
            <span class="move">
              <button class="icon-btn" data-act="move-up:${h.id}" aria-label="Move ${esc(h.name)} up"${i === 0 ? ' disabled' : ''}>${icon.up}</button>
              <button class="icon-btn" data-act="move-down:${h.id}" aria-label="Move ${esc(h.name)} down"${i === list.length - 1 ? ' disabled' : ''}>${icon.down}</button>
            </span></div>`;
        }
        return `<button class="q is-list" data-act="habit:${h.id}" style="--i:${i}">
          <span class="q-emo"><em class="emo" aria-hidden="true">${esc(h.emoji || '◆')}</em></span>
          <span class="q-txt"><span class="q-name">${esc(h.name)}</span><span class="q-sub"><span class="q-xp">+${h.xp} XP</span><span>${scheduleText(h)}</span><span>${kindText(h)}</span></span></span>
          <span class="q-rate"><b>${pct(habitRate(history, h.id, now.day, 30))}</b><span>${st?.current >= 2 ? '🔥' + st.current : '30 days'}</span></span>
        </button>`;
      }).join('')}</section>`;
  }).join('');
  return `
  ${hud(ctx)}
  <div class="page-head">
    <h1 class="page-title"><span class="glitch" data-text="Quests">Quests</span></h1>
    <div class="page-actions">
      ${active.length > 1 ? `<button class="chip-btn" data-act="reorder">${ui.reorder ? 'Done' : 'Reorder'}</button>` : ''}
      ${ui.reorder ? '' : '<button class="chip-btn is-strong" data-act="habit-add">Add</button>'}
    </div>
  </div>
  <div class="list">${groups || '<div class="block"><p class="block-text">No quests yet.</p><div class="sheet-actions"><button class="btn" data-act="habit-add">Add a quest</button></div></div>'}</div>
  ${archived.length ? `<section class="archived">
    <button class="link" data-act="archived">${ui.showArchived ? 'Hide' : 'Show'} archived quests (${archived.length})</button>
    ${ui.showArchived ? archived.map((h, i) => `<button class="q is-list" data-act="habit:${h.id}" style="--i:${i}">
      <span class="q-emo"><em class="emo" aria-hidden="true">${esc(h.emoji || '◆')}</em></span>
      <span class="q-txt"><span class="q-name">${esc(h.name)}</span><span class="q-sub"><span>Archived ${fmtDay(h.archived_on, { day: 'numeric', month: 'short', year: 'numeric' })}</span></span></span><span></span>
    </button>`).join('') : ''}</section>` : ''}`;
}

export function habitSheet(ctx, id) {
  const { store, history, now } = ctx;
  const h = store.habit(id);
  if (!h) return '';
  const st = history.habitStats.get(id) || { current: 0, best: 0, done: 0, scheduled: 0 };
  const weeks = 18;
  const thisMonday = addDays(now.day, -((dow(now.day) + 6) % 7));
  const startDay = addDays(thisMonday, -7 * (weeks - 1));
  let dots = '';
  for (let w = 0; w < weeks; w++) {
    for (let r = 0; r < 7; r++) {
      const d = addDays(startDay, w * 7 + r);
      const x = history.perDay.get(d);
      let cls = 'dot';
      if (d > now.day) cls += ' is-future';
      else if (x && x.scheduled.includes(id)) cls += x.done.includes(id) ? ' is-done' : x.isToday ? ' is-open' : ' is-miss';
      else cls += ' is-off';
      dots += `<i class="${cls}" style="grid-column:${w + 1};grid-row:${r + 1}"></i>`;
    }
  }
  return `
    <h2 class="sheet-title"><em class="emo" aria-hidden="true">${esc(h.emoji || '◆')}</em>${esc(h.name)}</h2>
    <p class="sheet-sub">${scheduleText(h)}. ${kindText(h)}. ${h.xp} XP.${h.archived_on ? ' Archived.' : ''}</p>
    <dl class="kv">
      <div><dt>Current streak</dt><dd>${st.current}</dd></div>
      <div><dt>Best streak</dt><dd>${st.best}</dd></div>
      <div><dt>Last 7 days</dt><dd>${pct(habitRate(history, id, now.day, 7))}</dd></div>
      <div><dt>Last 30 days</dt><dd>${pct(habitRate(history, id, now.day, 30))}</dd></div>
      <div><dt>All time</dt><dd>${pct(st.scheduled ? st.done / st.scheduled : null)}</dd></div>
      <div><dt>Times done</dt><dd>${num(st.done)}</dd></div>
    </dl>
    <div class="heat" aria-label="Last 18 weeks: lit squares are days done, faded squares are misses">
      <div class="heat-days" aria-hidden="true">${WEEK.map(d => `<span>${DAY_LETTER[d]}</span>`).join('')}</div>
      <div class="heat-grid">${dots}</div>
    </div>
    <div class="sheet-actions">
      ${h.archived_on ? `<button class="btn" data-act="restore:${id}">Restore quest</button>` : `<button class="btn" data-act="edit:${id}">Edit quest</button>`}
      <button class="btn btn-quiet" data-act="sheet-close">Close</button>
    </div>`;
}

export function habitForm(ctx, id) {
  const h = id ? ctx.store.habit(id) : null;
  const v = h || { name: '', emoji: '', section: 'day', kind: 'check', target: 1, xp: 10, days: ALL_DAYS };
  const days = new Set(v.days?.length ? v.days : ALL_DAYS);
  const seg = (name, value, options) => `<div class="seg" role="radiogroup">${options.map(([val, label]) =>
    `<label><input type="radio" name="${name}" value="${val}"${String(value) === String(val) ? ' checked' : ''}><span>${label}</span></label>`).join('')}</div>`;
  const canDelete = h && h.start_date >= ctx.now.day;
  const showTarget = v.kind === 'count' || v.kind === 'timer';
  return `
  <form data-form="habit" data-id="${id || ''}" novalidate>
    <h2 class="sheet-title">${h ? 'Edit quest' : 'New quest'}</h2>
    <div class="field-row">
      <label class="field field-emoji"><span>Emoji</span><input id="f-emoji" name="emoji" value="${esc(v.emoji || '')}" maxlength="4" autocomplete="off"></label>
      <label class="field"><span>Name</span><input id="f-name" name="name" value="${esc(v.name)}" maxlength="60" required autocomplete="off" placeholder="Drink water"></label>
    </div>
    <fieldset class="field"><legend>When</legend>${seg('section', v.section, [['morning', 'Morning'], ['day', 'Day'], ['night', 'Night']])}</fieldset>
    <fieldset class="field"><legend>Type</legend>${seg('kind', v.kind, Object.entries(KIND).map(([k, [label]]) => [k, label]))}
      <p class="hint" data-kind-hint>${KIND[v.kind][1]}</p></fieldset>
    <label class="field" data-target-field${showTarget ? '' : ' hidden'}><span data-target-label>${v.kind === 'timer' ? 'Minutes' : 'Times a day'}</span>
      <input id="f-target" name="target" type="number" inputmode="numeric" min="1" max="600" value="${showTarget ? v.target : 2}"></label>
    <fieldset class="field"><legend>Difficulty</legend>${seg('xp', [5, 10, 25].includes(v.xp) ? v.xp : 10, [[5, 'Easy 5 XP'], [10, 'Medium 10 XP'], [25, 'Hard 25 XP']])}</fieldset>
    <fieldset class="field"><legend>Days</legend>
      <div class="days">${WEEK.map(d => `<label><input type="checkbox" name="days" value="${d}"${days.has(d) ? ' checked' : ''}><span title="${DAY_SHORT[d]}">${DAY_LETTER[d]}</span></label>`).join('')}</div></fieldset>
    <p class="form-error" data-error role="alert"></p>
    <div class="sheet-actions">
      <button class="btn" type="submit">${h ? 'Save quest' : 'Add quest'}</button>
      ${h ? (canDelete ? `<button class="btn btn-outline" type="button" data-act="delete:${id}">Delete quest</button>`
        : `<button class="btn btn-quiet" type="button" data-act="archive:${id}">Archive quest</button><p class="hint center">Archiving stops it from tomorrow on. Its history stays in your log.</p>`) : ''}
      <button class="btn btn-quiet" type="button" data-act="sheet-close">Cancel</button>
    </div>
  </form>`;
}
export function kindHint(kind) { return KIND[kind][1]; }

export function confirmSheet({ title, text, yes, act, danger }) {
  return `<h2 class="sheet-title">${esc(title)}</h2><p class="sheet-sub">${esc(text)}</p>
    <div class="sheet-actions"><button class="btn${danger ? ' btn-outline' : ''}" data-act="${act}">${esc(yes)}</button>
    <button class="btn btn-quiet" data-act="sheet-close">Cancel</button></div>`;
}

// ---------- timer & people ----------
export function timerSheet(ctx, id) {
  const h = ctx.store.habit(id);
  const e = ctx.entry(id);
  const running = ctx.timer && ctx.timer.habit_id === id;
  const secs = running ? Math.min(h.target * 60, ctx.timerSeconds) : (e?.value || 0) * 60;
  const done = !!e?.done;
  const frac = Math.min(1, secs / 60 / h.target);
  const r = 70, C = 2 * Math.PI * r;
  return `
    <h2 class="sheet-title"><em class="emo" aria-hidden="true">${esc(h.emoji || '◆')}</em>${esc(h.name)}</h2>
    <p class="sheet-sub">${done ? `Done today. +${h.xp} XP earned.` : `Run the timer for ${h.target} minutes to earn the tick.`}</p>
    <div class="timer${running ? ' is-running' : ''}">
      <div class="timer-spin"></div>
      <svg viewBox="0 0 160 160" aria-hidden="true"><circle cx="80" cy="80" r="${r}" class="timer-track"/>
        <circle id="timer-arc" cx="80" cy="80" r="${r}" class="timer-arc"${frac > 0 ? '' : ' opacity="0"'} stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}" data-c="${C.toFixed(2)}" data-target="${h.target}" transform="rotate(-90 80 80)"/></svg>
      <div class="timer-center"><span class="timer-n" id="timer-n">${fmtClock(secs)}</span><span class="timer-l">of ${h.target}:00</span></div>
    </div>
    <div class="sheet-actions">
      ${done ? '' : running ? `<button class="btn" data-act="timer-pause:${id}">Pause</button>` : `<button class="btn" data-act="timer-start:${id}">${secs > 0 ? 'Resume' : 'Start'}</button>`}
      ${done || running ? '' : `<button class="btn btn-quiet" data-act="timer-add:${id}">Forgot to start it? Add 5 minutes</button>`}
      ${e?.value && !running ? `<button class="btn btn-quiet" data-act="timer-reset:${id}">Reset to 0</button>` : ''}
      <button class="btn btn-quiet" data-act="sheet-close">Close</button>
    </div>
    ${e?.meta?.manual ? `<p class="hint center">${e.meta.manual} of these minutes were added by hand.</p>` : ''}`;
}

export function peopleSheet(ctx, id) {
  const h = ctx.store.habit(id);
  const e = ctx.entry(id);
  const recent = [];
  const seen = new Set();
  const all = [...ctx.store.entries.values()].filter(x => x.habit_id === id && x.meta?.who?.length).sort((a, b) => b.day.localeCompare(a.day));
  for (const x of all) for (const w of x.meta.who) if (!seen.has(w.toLowerCase())) { seen.add(w.toLowerCase()); recent.push(w); }
  const chosen = new Set((e?.meta?.who || []).map(w => w.toLowerCase()));
  return `
  <form data-form="people" data-id="${id}">
    <h2 class="sheet-title"><em class="emo" aria-hidden="true">${esc(h.emoji || '◆')}</em>${esc(h.name)}</h2>
    <p class="sheet-sub">Who did you talk to today?</p>
    ${recent.length ? `<div class="chips">${recent.slice(0, 12).map((w, i) =>
      `<label class="chip"><input type="checkbox" id="who-${i}" name="who" value="${esc(w)}"${chosen.has(w.toLowerCase()) ? ' checked' : ''}><span>${esc(w)}</span></label>`).join('')}</div>` : ''}
    <label class="field"><span>${recent.length ? 'Someone else' : 'Name'}</span><input id="f-who" name="new" autocomplete="off" maxlength="40" placeholder="Name"></label>
    <p class="form-error" data-error role="alert"></p>
    <div class="sheet-actions">
      <button class="btn" type="submit">Log it</button>
      ${e?.done ? `<button class="btn btn-quiet" type="button" data-act="people-clear:${id}">Mark as not done</button>` : ''}
      <button class="btn btn-quiet" type="button" data-act="sheet-close">Cancel</button>
    </div>
  </form>`;
}

// ---------- Me ----------
export function me(ctx) {
  const { history, store, ui, device } = ctx;
  const lvl = history.level;
  const rank = rankFor(lvl.level);
  const s = store.settings || {};
  const ranks = RANKS.map((r, i) => {
    const nextMin = RANKS[i + 1]?.min;
    const now = r === rank, past = lvl.level >= (nextMin ?? Infinity);
    return `<div class="rank${now ? ' is-now' : past ? ' is-past' : ''}"><span>${r.name}</span><small>${nextMin ? `Level ${r.min}–${nextMin - 1}` : `Level ${r.min}+`}${!now && !past ? ' 🔒' : ''}</small></div>`;
  }).join('');
  const slots = Array.from({ length: SHIELD_MAX }, (_, i) => `<span class="shield-slot${i < history.bank ? ' is-full' : ''}"><em class="emo" aria-hidden="true">🛡️</em></span>`).join('');
  return `
  <section class="me-head">
    <div class="me-badge"><span class="badge-orbit"></span>${HEX}<span class="badge-n">${pad2(lvl.level)}</span></div>
    <h1 class="me-rank"><span class="glitch" data-text="${rank.name}">${rank.name}</span></h1>
    <p class="me-sub">Level ${lvl.level}. ${num(lvl.xp)} XP earned in total.</p>
    <div class="xpbar"><i class="xpbar-fill" style="transform:scaleX(${lvl.pct.toFixed(4)})"></i><span class="xpbar-shine"></span></div>
    <p class="me-sub">${num(lvl.next - lvl.xp)} XP to level ${lvl.level + 1}. Every quest pays its XP, and a perfect day adds 50.</p>
  </section>

  <section class="block"><h2 class="block-title">Ranks</h2><div class="ranks">${ranks}</div></section>

  <section class="block"><h2 class="block-title">Streak shields</h2>
    ${ctx.shieldsOn ? `<div class="shield-row">${slots}</div>
      <p class="hint">Earn one for every 7 perfect days, up to ${SHIELD_MAX}. On a day with a miss, a shield keeps your streaks alive, but the miss still shows in your log. Next shield in ${history.nextShieldIn} perfect day${history.nextShieldIn === 1 ? '' : 's'}.</p>`
      : '<p class="hint">Shields are off. Every miss breaks the streak.</p>'}
  </section>

  <section class="block"><h2 class="block-title">Theme</h2>
    <div class="looks">${LOOKS.map(l => `
      <button class="look-card${device.look === l.id ? ' is-on' : ''}" data-look="${l.id}" data-act="look:${l.id}" aria-pressed="${device.look === l.id}">
        <span class="lc-prev" aria-hidden="true"><i class="lc-ring"></i><i class="lc-bar b1"><i></i></i><i class="lc-bar b2"><i></i></i><i class="lc-bar b3"><i></i></i></span>
        <span class="lc-name">${l.name}</span><span class="lc-line">${l.line}</span>
        ${device.look === l.id ? '<span class="lc-on">On</span>' : ''}
      </button>`).join('')}</div>
  </section>

  <section class="block"><h2 class="block-title">Effects</h2>
    <div class="switch-row"><div><b>Sound effects</b><span>Ticks, combos, cleared sections and level-ups, in your theme's sound.</span></div>
      <button class="sw" role="switch" aria-checked="${device.sound}" aria-label="Sound effects" data-act="toggle:sound"></button></div>
    <div class="switch-row"><div><b>Music</b><span>Every theme has its own track, made live on your phone.</span>
      <p class="now-playing">♪ ${esc((TRACKS[device.look] || TRACKS.redline).name)}</p></div>
      <button class="sw" role="switch" aria-checked="${!!device.music}" aria-label="Music" data-act="toggle:music"></button></div>
    <p class="hint">Sound follows your ring/silent switch. If you hear nothing, flip it to ring.</p>
    <div class="switch-row"><div><b>Calm mode</b><span>Freezes the background and idle motion to save battery. Rewards still play.</span></div>
      <button class="sw" role="switch" aria-checked="${device.calm}" aria-label="Calm mode" data-act="toggle:calm"></button></div>
  </section>

  <section class="block"><h2 class="block-title">Reminders</h2>
    <ul class="plain"><li>${fmtTime(s.remind_morning)}</li><li>${fmtTime(s.remind_evening)}</li><li>${fmtTime(s.remind_last_call)}, last call if anything is left</li></ul>
    <p class="hint">Notifications switch on in Drop 3.</p>
  </section>

  <section class="block"><h2 class="block-title">Account</h2>
    <p class="block-text">${esc(store.user?.email || '')}</p>
    <div class="sheet-actions">
      <button class="btn btn-quiet" data-act="password">Change password</button>
      <button class="btn btn-quiet btn-danger" data-act="logout">Log out</button>
    </div>
  </section>
  <p class="foot">1440${ui.demo ? ' · demo data' : ''}</p>`;
}

export function passwordSheet() {
  return `
  <form data-form="password" novalidate>
    <h2 class="sheet-title">Change password</h2>
    <p class="sheet-sub">Use at least 8 characters. A long phrase is easiest to remember.</p>
    <label class="field"><span>New password</span><input id="f-pw" name="pw" type="password" autocomplete="new-password" minlength="8" required></label>
    <label class="field"><span>Type it again</span><input id="f-pw2" name="pw2" type="password" autocomplete="new-password" minlength="8" required></label>
    <p class="form-error" data-error role="alert"></p>
    <div class="sheet-actions"><button class="btn" type="submit">Change password</button><button class="btn btn-quiet" type="button" data-act="sheet-close">Cancel</button></div>
  </form>`;
}

// ---------- login ----------
export function login({ error = '', busy = false } = {}) {
  return `
  <main class="login">
    <div class="login-mark dial" aria-hidden="true">
      <div class="dial-l dial-ticks"></div><div class="dial-l dial-dash"></div><div class="dial-l dial-sweep"></div>
      <div class="dial-c"><span class="dial-min glitch" data-text="1440">1440</span></div>
    </div>
    <h1 class="login-title">Log in</h1>
    <form data-form="login" novalidate>
      <label class="field"><span>Email</span><input id="f-email" name="email" type="email" autocomplete="username" inputmode="email" required></label>
      <label class="field"><span>Password</span><input id="f-password" name="password" type="password" autocomplete="current-password" required></label>
      <p class="form-error" role="alert">${esc(error)}</p>
      <button class="btn" type="submit"${busy ? ' disabled' : ''}>${busy ? 'Logging in…' : 'Log in'}</button>
    </form>
  </main>`;
}
export function needsConnection() {
  return `<main class="login"><h1 class="login-title">Connect to finish setup</h1>
    <p class="hint center">1440 needs the internet once to load your quests. After that it works offline.</p>
    <button class="btn" data-act="retry">Try again</button></main>`;
}
