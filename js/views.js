// 1440 · views. Each function returns HTML for one screen or sheet.
import { addDays, dow, habitRate, overallRate, progressOf, AVOID_CONFIRM_MINUTE, SHIELD_MAX, ALL_DAYS } from './logic.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n) => Number(n).toLocaleString('en-IN');
const pct = (r) => (r == null ? '–' : Math.round(r * 100) + '%');
const SECTION = { morning: 'Morning', day: 'Day', night: 'Night' };
const KIND = {
  check:  ['Tick', 'Done or not done.'],
  count:  ['Count', 'Do it a set number of times, like 2 meals.'],
  timer:  ['Timer', 'Earn the tick by timing it, like 30 minutes of reading.'],
  avoid:  ['Avoid', 'Something to stop. Confirm a clean day each night after 8 PM.'],
  people: ['People', 'Log who you connected with.'],
};
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const DAY_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtDay(day, opts) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }).format(new Date(day + 'T00:00:00Z'));
}
export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${ap}`;
}
export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
}
function scheduleText(h) {
  const days = h.days?.length ? h.days : ALL_DAYS;
  if (days.length === 7) return 'Every day';
  const set = new Set(days);
  if (days.length === 5 && [1, 2, 3, 4, 5].every(d => set.has(d))) return 'Weekdays';
  if (days.length === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return WEEK.filter(d => set.has(d)).map(d => DAY_SHORT[d]).join(', ');
}

// ---------- icons ----------
export const icon = {
  today: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/></svg>',
  habits: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7h11M9 12h11M9 17h11"/><circle cx="4.5" cy="7" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="17" r="1.2"/></svg>',
  me: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true" class="i-shield"><path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6z"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14.5l6-6 6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg>',
};

export function tabbar(active) {
  const t = (id, label) =>
    `<button class="tab${active === id ? ' is-active' : ''}" data-act="tab:${id}" aria-label="${label}"${active === id ? ' aria-current="page"' : ''}>${icon[id]}<span>${label}</span></button>`;
  return t('today', 'Today') + t('calendar', 'Calendar') + t('habits', 'Habits') + t('me', 'Me');
}

// ---------- the dial ----------
const DIAL = { size: 248, c: 124, rTime: 116, rDone: 98 };
export function timeArc(minutesNow) {
  const { c, rTime } = DIAL;
  const C = 2 * Math.PI * rTime;
  const elapsed = Math.min(1, minutesNow / 1440);
  const a = elapsed * 2 * Math.PI - Math.PI / 2;
  return {
    dash: `${(C * (1 - elapsed)).toFixed(2)} ${C.toFixed(2)}`,
    offset: (-C * elapsed).toFixed(2),
    x: (c + rTime * Math.cos(a)).toFixed(2),
    y: (c + rTime * Math.sin(a)).toFixed(2),
  };
}
function dial({ minutesNow, progress, perfect }) {
  const { size, c, rTime, rDone } = DIAL;
  const Cd = 2 * Math.PI * rDone;
  const t = timeArc(minutesNow);
  const left = 1440 - minutesNow;
  return `
  <div class="dial${perfect ? ' is-perfect' : ''}" role="img" aria-label="${left} minutes left today, ${Math.round(progress * 100)}% of habits done">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="dial-time-track" cx="${c}" cy="${c}" r="${rTime}"/>
      <circle id="dial-time" class="dial-time" cx="${c}" cy="${c}" r="${rTime}" stroke-dasharray="${t.dash}" stroke-dashoffset="${t.offset}" transform="rotate(-90 ${c} ${c})"/>
      <circle id="dial-now" class="dial-now" cx="${t.x}" cy="${t.y}" r="4.5"/>
      <circle class="dial-done-track" cx="${c}" cy="${c}" r="${rDone}"/>
      <circle id="dial-done" class="dial-done" cx="${c}" cy="${c}" r="${rDone}"${progress > 0 ? '' : ' opacity="0"'} stroke-dasharray="${(Cd * progress).toFixed(2)} ${Cd.toFixed(2)}" data-len="${(Cd * progress).toFixed(2)}" data-c="${Cd.toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>
    </svg>
    <div class="dial-center">
      <span class="dial-min" id="dial-min">${left}</span>
      <span class="dial-label">minutes left</span>
    </div>
  </div>`;
}

// ---------- habit rows ----------
function tick({ frac, done, kind, locked }) {
  const r = 12.5, C = 2 * Math.PI * r;
  if (done) {
    return `<svg viewBox="0 0 32 32" class="tick is-done" aria-hidden="true"><circle cx="16" cy="16" r="14.5" class="tick-fill"/><path d="M10 16.5l4.2 4.2L22.5 12" class="tick-check"/></svg>`;
  }
  const glyph = kind === 'timer' ? '<path d="M13.6 11.6v8.8l7-4.4z" class="tick-glyph"/>'
    : kind === 'people' ? '<path d="M16 11.5v9M11.5 16h9" class="tick-glyph-line"/>' : '';
  return `<svg viewBox="0 0 32 32" class="tick${locked ? ' is-locked' : ''}" aria-hidden="true">
    <circle cx="16" cy="16" r="${r}" class="tick-track"/>
    ${frac > 0 ? `<circle cx="16" cy="16" r="${r}" class="tick-prog" stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 16 16)"/>` : ''}
    ${glyph}</svg>`;
}

function rowSub(h, e, stat, ctx) {
  const parts = [];
  const v = e?.value || 0;
  if (h.kind === 'count') parts.push(`${v} of ${h.target}${h.unit ? ' ' + esc(h.unit) : ''}`);
  if (h.kind === 'timer') {
    const live = ctx.timer && ctx.timer.habit_id === h.id;
    parts.push(live ? `<span data-live="row-timer">Timing ${fmtClock(ctx.timerSeconds)}</span> of ${h.target} min` : `${v} of ${h.target} min`);
  }
  if (h.kind === 'avoid') {
    if (e?.done) parts.push('Clean day');
    else if (ctx.now.minutes < AVOID_CONFIRM_MINUTE) parts.push('Confirm after 8 PM');
    else parts.push('Clean today? Tap to confirm');
  }
  if (h.kind === 'people') parts.push(e?.done && e.meta?.who?.length ? 'With ' + esc(e.meta.who.join(', ')) : 'Tap to log who');
  if (stat && stat.current >= 2) parts.push(`${stat.current}-day streak`);
  return parts.join(', ');
}

function habitRow(h, ctx) {
  const e = ctx.entry(h.id);
  const stat = ctx.history.habitStats.get(h.id);
  const done = !!e?.done;
  const locked = h.kind === 'avoid' && !done && ctx.now.minutes < AVOID_CONFIRM_MINUTE;
  const sub = rowSub(h, e, stat, ctx);
  const label = `${h.name}${done ? ', done' : ''}`;
  return `
  <button class="row${done ? ' is-done' : ''}${locked ? ' is-locked' : ''}${ctx.flash === h.id ? ' is-flash' : ''}" data-act="tick:${h.id}" aria-label="${esc(label)}">
    <span class="row-emoji" aria-hidden="true">${esc(h.emoji || '·')}</span>
    <span class="row-text">
      <span class="row-name">${esc(h.name)}</span>
      ${sub ? `<span class="row-sub">${sub}</span>` : ''}
    </span>
    <span class="row-ctl">${tick({ frac: progressOf(h, e), done, kind: h.kind, locked })}</span>
  </button>`;
}

// ---------- Today ----------
export function today(ctx) {
  const { store, history, now } = ctx;
  const day = now.day;
  const habits = store.habitsForDay(day);
  const x = history.perDay.get(day);
  const lvl = history.level;
  const progress = habits.length ? habits.reduce((s, h) => s + progressOf(h, ctx.entry(h.id)), 0) / habits.length : 0;
  const doneCount = x ? x.done.length : 0;

  const sections = ['morning', 'day', 'night'].map(sec => {
    const list = habits.filter(h => h.section === sec);
    if (!list.length) return '';
    const d = list.filter(h => ctx.entry(h.id)?.done).length;
    return `<section class="group" aria-label="${SECTION[sec]}">
      <h2 class="group-head"><span>${SECTION[sec]}</span><span class="group-count">${d} of ${list.length}</span></h2>
      ${list.map(h => habitRow(h, ctx)).join('')}
    </section>`;
  }).join('');

  const streak = history.perfect.current;
  return `
  <header class="top">
    <div>
      <h1 class="top-title">${fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h1>
      ${syncLine(ctx)}
    </div>
    <button class="lvl" data-act="tab:me" aria-label="Level ${lvl.level}, ${Math.round(lvl.pct * 100)}% to the next level">
      <span class="lvl-n">Level ${lvl.level}</span>
      <span class="lvl-bar"><i style="width:${(lvl.pct * 100).toFixed(1)}%"></i></span>
    </button>
  </header>
  <section class="hero">
    ${dial({ minutesNow: now.minutes, progress, perfect: x?.perfect })}
    <p class="hero-line"><strong>${doneCount} of ${habits.length}</strong> done${x?.perfect ? ', a perfect day' : ''}</p>
    <p class="hero-sub">${streak ? `Perfect streak: ${streak} day${streak === 1 ? '' : 's'}` : 'Finish every habit today to start a perfect streak'}${ctx.shieldsOn ? `<span class="shields" aria-label="${history.bank} shields saved">${icon.shield}${history.bank}</span>` : ''}</p>
  </section>
  ${habits.length ? `<div class="groups">${sections}</div>` : emptyToday()}`;
}

function emptyToday() {
  return `<div class="empty"><p>No habits scheduled today.</p><button class="btn" data-act="habit-add">Add a habit</button></div>`;
}

export function syncLine(ctx) {
  const n = ctx.store.outbox.length;
  if (!n) return '';
  const what = `${n} change${n === 1 ? '' : 's'}`;
  return `<p class="top-sub">${ctx.store.online ? `Saving ${what}…` : `Offline. ${what} will sync when you're back online.`}</p>`;
}

// ---------- Calendar ----------
function miniDial(x, day, today) {
  const r = 15, C = 2 * Math.PI * r;
  const n = Number(day.slice(8));
  if (!x || x.scheduled.length === 0) {
    return `<span class="cell is-empty${day > today ? ' is-future' : ''}"><span class="cell-n">${n}</span></span>`;
  }
  const cls = ['cell'];
  if (x.isToday) cls.push('is-today');
  if (x.perfect && !x.isToday) cls.push('is-perfect');
  if (x.shielded) cls.push('is-shielded');
  if (!x.isToday && x.score === 0) cls.push('is-zero');
  const arc = x.perfect && !x.isToday ? '' :
    `<circle cx="18" cy="18" r="${r}" class="cell-arc" stroke-dasharray="${(x.score * C).toFixed(2)} ${C.toFixed(2)}" transform="rotate(-90 18 18)"/>`;
  return `<button class="${cls.join(' ')}" data-act="day:${day}" aria-label="${fmtDay(day, { day: 'numeric', month: 'long' })}: ${x.done.length} of ${x.scheduled.length} done${x.shielded ? ', shield used' : ''}">
    <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="${r}" class="cell-track"/>${arc}</svg>
    <span class="cell-n">${n}</span>${x.shielded ? '<span class="cell-shield" aria-hidden="true"></span>' : ''}
  </button>`;
}

export function calendar(ctx) {
  const { history, now, ui } = ctx;
  const today = now.day;
  const month = ui.calMonth || today.slice(0, 7);
  const first = month + '-01';
  const lead = (dow(first) + 6) % 7; // Monday-first offset
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cell is-pad"></span>');
  for (let d = first; d.slice(0, 7) === month; d = addDays(d, 1)) cells.push(miniDial(history.perDay.get(d), d, today));
  const startMonth = (history.start || today).slice(0, 7);
  const prevMonth = addDays(first, -1).slice(0, 7);
  const nextMonth = addDays(first, 32).slice(0, 7);
  const rate30 = overallRate(history, today, 30);

  return `
  <header class="top"><div><h1 class="top-title">Calendar</h1></div></header>
  <section class="stats" aria-label="Summary">
    <div class="stat"><span class="stat-n">${history.perfectDays}</span><span class="stat-l">perfect days</span></div>
    <div class="stat"><span class="stat-n">${history.perfect.current}</span><span class="stat-l">perfect streak, best ${history.perfect.best}</span></div>
    <div class="stat"><span class="stat-n">${pct(rate30)}</span><span class="stat-l">done in the last 30 days</span></div>
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
    <span><i class="lg lg-perfect"></i>Perfect</span>
    <span><i class="lg lg-part"></i>Partly done</span>
    <span><i class="lg lg-zero"></i>Nothing done</span>
    ${ctx.shieldsOn ? `<span><i class="lg lg-shield"></i>Shield used</span>` : ''}
  </section>`;
}

export function daySheet(ctx, day) {
  const { store, history } = ctx;
  const x = history.perDay.get(day);
  if (!x) return '';
  const rows = x.scheduled.map(id => store.habit(id)).filter(Boolean)
    .sort((a, b) => ({ morning: 0, day: 1, night: 2 }[a.section] - { morning: 0, day: 1, night: 2 }[b.section]) || a.sort_order - b.sort_order)
    .map(h => {
      const e = x.entries.get(h.id);
      const done = !!e?.done;
      let extra = '';
      if (h.kind === 'count' || h.kind === 'timer') extra = `${e?.value || 0} of ${h.target}${h.kind === 'timer' ? ' min' : ''}`;
      if (h.kind === 'people' && e?.meta?.who?.length) extra = 'With ' + esc(e.meta.who.join(', '));
      return `<li class="dl-row ${done ? 'is-done' : x.isToday ? 'is-open' : 'is-miss'}">
        <span class="dl-mark" aria-hidden="true">${done ? '✓' : x.isToday ? '' : '✕'}</span>
        <span class="dl-name">${esc(h.emoji || '')} ${esc(h.name)}${extra ? `<span class="dl-extra">${extra}</span>` : ''}</span>
        <span class="visually-hidden">${done ? 'done' : x.isToday ? 'not yet' : 'missed'}</span>
      </li>`;
    }).join('');
  const xp = x.xp + (x.perfect ? 50 : 0);
  return `
    <h2 class="sheet-title">${fmtDay(day, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
    <p class="sheet-sub">${x.done.length} of ${x.scheduled.length} done, ${num(xp)} XP${x.perfect ? ', perfect day' : ''}</p>
    ${x.isToday ? '<p class="note">Today is still in progress.</p>' : ''}
    ${x.shielded ? `<p class="note note-gold">${icon.shield} A shield protected your streaks on this day. The misses still count here.</p>` : ''}
    <ul class="dl">${rows}</ul>
    <button class="btn btn-quiet" data-act="sheet-close">Close</button>`;
}

// ---------- Habits ----------
export function habits(ctx) {
  const { store, history, now, ui } = ctx;
  const active = store.activeHabits();
  const archived = store.habits.filter(h => h.archived_on);
  const groups = ['morning', 'day', 'night'].map(sec => {
    const list = active.filter(h => h.section === sec);
    if (!list.length) return '';
    return `<section class="group">
      <h2 class="group-head"><span>${SECTION[sec]}</span></h2>
      ${list.map((h, i) => {
        const rate = habitRate(history, h.id, now.day, 30);
        const st = history.habitStats.get(h.id);
        const sub = `${scheduleText(h)}, ${KIND[h.kind][0].toLowerCase()}${h.kind === 'count' ? ' ×' + h.target : h.kind === 'timer' ? ' ' + h.target + ' min' : ''}, ${h.xp} XP`;
        if (ui.reorder) {
          return `<div class="row row-static">
            <span class="row-emoji" aria-hidden="true">${esc(h.emoji || '·')}</span>
            <span class="row-text"><span class="row-name">${esc(h.name)}</span></span>
            <span class="row-move">
              <button class="icon-btn" data-act="move-up:${h.id}" aria-label="Move ${esc(h.name)} up"${i === 0 ? ' disabled' : ''}>${icon.up}</button>
              <button class="icon-btn" data-act="move-down:${h.id}" aria-label="Move ${esc(h.name)} down"${i === list.length - 1 ? ' disabled' : ''}>${icon.down}</button>
            </span>
          </div>`;
        }
        return `<button class="row" data-act="habit:${h.id}">
          <span class="row-emoji" aria-hidden="true">${esc(h.emoji || '·')}</span>
          <span class="row-text"><span class="row-name">${esc(h.name)}</span><span class="row-sub">${sub}</span></span>
          <span class="row-rate"><span class="rate-n">${pct(rate)}</span><span class="rate-l">${st?.current >= 2 ? st.current + ' days' : '30 days'}</span></span>
        </button>`;
      }).join('')}
    </section>`;
  }).join('');

  return `
  <header class="top">
    <div><h1 class="top-title">Habits</h1></div>
    <div class="top-actions">
      ${active.length > 1 ? `<button class="link" data-act="reorder">${ui.reorder ? 'Done' : 'Reorder'}</button>` : ''}
      ${ui.reorder ? '' : '<button class="link link-strong" data-act="habit-add">Add habit</button>'}
    </div>
  </header>
  <div class="groups">${groups || '<div class="empty"><p>No habits yet.</p><button class="btn" data-act="habit-add">Add a habit</button></div>'}</div>
  ${archived.length ? `
    <section class="archived">
      <button class="link" data-act="archived">${ui.showArchived ? 'Hide' : 'Show'} archived habits (${archived.length})</button>
      ${ui.showArchived ? archived.map(h => `<button class="row" data-act="habit:${h.id}">
        <span class="row-emoji" aria-hidden="true">${esc(h.emoji || '·')}</span>
        <span class="row-text"><span class="row-name">${esc(h.name)}</span><span class="row-sub">Archived on ${fmtDay(h.archived_on, { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
      </button>`).join('') : ''}
    </section>` : ''}`;
}

export function habitSheet(ctx, id) {
  const { store, history, now } = ctx;
  const h = store.habit(id);
  if (!h) return '';
  const st = history.habitStats.get(id) || { current: 0, best: 0, done: 0, scheduled: 0 };
  // last 18 weeks, Monday-first columns
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
  const allRate = st.scheduled ? st.done / st.scheduled : null;
  return `
    <h2 class="sheet-title">${esc(h.emoji || '')} ${esc(h.name)}</h2>
    <p class="sheet-sub">${scheduleText(h)}, ${KIND[h.kind][0].toLowerCase()}${h.kind === 'count' ? ' ×' + h.target : h.kind === 'timer' ? ' ' + h.target + ' min' : ''}, ${h.xp} XP${h.archived_on ? ', archived' : ''}</p>
    <dl class="kv">
      <div><dt>Current streak</dt><dd>${st.current} day${st.current === 1 ? '' : 's'}</dd></div>
      <div><dt>Best streak</dt><dd>${st.best} day${st.best === 1 ? '' : 's'}</dd></div>
      <div><dt>Last 7 days</dt><dd>${pct(habitRate(history, id, now.day, 7))}</dd></div>
      <div><dt>Last 30 days</dt><dd>${pct(habitRate(history, id, now.day, 30))}</dd></div>
      <div><dt>All time</dt><dd>${pct(allRate)}</dd></div>
      <div><dt>Times done</dt><dd>${num(st.done)}</dd></div>
    </dl>
    <div class="heat" aria-label="Last 18 weeks: filled dots are days done, red dots are misses">
      <div class="heat-days" aria-hidden="true">${WEEK.map(d => `<span>${DAY_LETTER[d]}</span>`).join('')}</div>
      <div class="heat-grid">${dots}</div>
    </div>
    <div class="sheet-actions">
      ${h.archived_on
        ? `<button class="btn" data-act="restore:${id}">Restore habit</button>`
        : `<button class="btn" data-act="edit:${id}">Edit habit</button>`}
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
  return `
  <form data-form="habit" data-id="${id || ''}" novalidate>
    <h2 class="sheet-title">${h ? 'Edit habit' : 'Add habit'}</h2>
    <div class="field-row">
      <label class="field field-emoji"><span>Emoji</span><input name="emoji" value="${esc(v.emoji || '')}" maxlength="4" autocomplete="off" aria-label="Emoji"></label>
      <label class="field"><span>Name</span><input name="name" value="${esc(v.name)}" maxlength="60" required autocomplete="off" placeholder="Drink water"></label>
    </div>
    <fieldset class="field"><legend>When</legend>${seg('section', v.section, [['morning', 'Morning'], ['day', 'Day'], ['night', 'Night']])}</fieldset>
    <fieldset class="field"><legend>Type</legend>${seg('kind', v.kind, Object.entries(KIND).map(([k, [label]]) => [k, label]))}
      <p class="hint" data-kind-hint>${KIND[v.kind][1]}</p></fieldset>
    <label class="field" data-target-field${v.kind === 'count' || v.kind === 'timer' ? '' : ' hidden'}>
      <span data-target-label>${v.kind === 'timer' ? 'Minutes' : 'Times a day'}</span>
      <input name="target" type="number" inputmode="numeric" min="1" max="600" value="${v.kind === 'count' || v.kind === 'timer' ? v.target : (v.kind === 'timer' ? 30 : 2)}">
    </label>
    <fieldset class="field"><legend>Difficulty</legend>${seg('xp', [5, 10, 25].includes(v.xp) ? v.xp : 10, [[5, 'Easy, 5 XP'], [10, 'Medium, 10 XP'], [25, 'Hard, 25 XP']])}</fieldset>
    <fieldset class="field"><legend>Days</legend>
      <div class="days">${WEEK.map(d => `<label><input type="checkbox" name="days" value="${d}"${days.has(d) ? ' checked' : ''}><span title="${DAY_SHORT[d]}">${DAY_LETTER[d]}</span></label>`).join('')}</div>
    </fieldset>
    <p class="form-error" data-error role="alert"></p>
    <div class="sheet-actions">
      <button class="btn" type="submit">${h ? 'Save habit' : 'Add habit'}</button>
      ${h ? (canDelete
        ? `<button class="btn btn-danger" type="button" data-act="delete:${id}">Delete habit</button>`
        : `<button class="btn btn-quiet" type="button" data-act="archive:${id}">Archive habit</button>
           <p class="hint">Archiving stops it from tomorrow on. Its history stays on your calendar.</p>`) : ''}
      <button class="btn btn-quiet" type="button" data-act="sheet-close">Cancel</button>
    </div>
  </form>`;
}

export function kindHint(kind) { return KIND[kind][1]; }

// ---------- Timer & People sheets ----------
export function timerSheet(ctx, id) {
  const h = ctx.store.habit(id);
  const e = ctx.entry(id);
  const running = ctx.timer && ctx.timer.habit_id === id;
  const secs = running ? ctx.timerSeconds : (e?.value || 0) * 60;
  const done = !!e?.done;
  const frac = Math.min(1, secs / 60 / h.target);
  const r = 70, C = 2 * Math.PI * r;
  return `
    <h2 class="sheet-title">${esc(h.emoji || '')} ${esc(h.name)}</h2>
    <p class="sheet-sub">${done ? `Done today. ${h.xp} XP earned.` : `Time ${h.target} minutes to earn the tick.`}</p>
    <div class="timer">
      <svg viewBox="0 0 160 160" aria-hidden="true">
        <circle cx="80" cy="80" r="${r}" class="timer-track"/>
        <circle id="timer-arc" cx="80" cy="80" r="${r}" class="timer-arc"${frac > 0 ? '' : ' opacity="0"'} stroke-dasharray="${(frac * C).toFixed(2)} ${C.toFixed(2)}" data-c="${C.toFixed(2)}" data-target="${h.target}" transform="rotate(-90 80 80)"/>
      </svg>
      <div class="timer-center"><span class="timer-n" id="timer-n">${fmtClock(secs)}</span><span class="timer-l">of ${h.target}:00</span></div>
    </div>
    <div class="sheet-actions">
      ${done ? '' : running
        ? `<button class="btn" data-act="timer-pause:${id}">Pause</button>`
        : `<button class="btn" data-act="timer-start:${id}">${secs > 0 ? 'Resume' : 'Start'}</button>`}
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
    <h2 class="sheet-title">${esc(h.emoji || '')} ${esc(h.name)}</h2>
    <p class="sheet-sub">Who did you talk to today?</p>
    ${recent.length ? `<div class="chips">${recent.slice(0, 12).map(w =>
      `<label class="chip"><input type="checkbox" name="who" value="${esc(w)}"${chosen.has(w.toLowerCase()) ? ' checked' : ''}><span>${esc(w)}</span></label>`).join('')}</div>` : ''}
    <label class="field"><span>${recent.length ? 'Someone else' : 'Name'}</span><input name="new" autocomplete="off" maxlength="40" placeholder="Name"></label>
    <p class="form-error" data-error role="alert"></p>
    <div class="sheet-actions">
      <button class="btn" type="submit">Save</button>
      ${e?.done ? `<button class="btn btn-quiet" type="button" data-act="people-clear:${id}">Mark as not done</button>` : ''}
      <button class="btn btn-quiet" type="button" data-act="sheet-close">Cancel</button>
    </div>
  </form>`;
}

// ---------- Me ----------
export function me(ctx) {
  const { history, store, ui } = ctx;
  const lvl = history.level;
  const s = store.settings || {};
  return `
  <header class="top"><div><h1 class="top-title">Me</h1></div></header>
  <section class="level" aria-label="Level">
    <div class="level-head">
      <span class="level-n">${lvl.level}</span>
      <span class="level-l">Level</span>
    </div>
    <div class="level-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${lvl.need}" aria-valuenow="${lvl.into}"><i style="width:${(lvl.pct * 100).toFixed(1)}%"></i></div>
    <p class="level-sub">${num(lvl.next - lvl.xp)} XP to level ${lvl.level + 1}. ${num(lvl.xp)} XP earned in total.</p>
    <p class="hint">Every habit earns its XP when you finish it. A perfect day adds 50.</p>
  </section>

  <section class="block">
    <h2 class="block-title">${icon.shield} Streak shields</h2>
    ${ctx.shieldsOn ? `
      <p class="block-big">${history.bank} of ${SHIELD_MAX} saved</p>
      <p class="hint">You earn one for every 7 perfect days. On your next day with a miss, a shield keeps your streaks alive. The miss still shows on your calendar. Next shield in ${history.nextShieldIn} perfect day${history.nextShieldIn === 1 ? '' : 's'}.</p>`
      : '<p class="hint">Shields are off. Every miss breaks the streak.</p>'}
  </section>

  <section class="block">
    <h2 class="block-title">Reminders</h2>
    <ul class="plain">
      <li>${fmtTime(s.remind_morning)}</li>
      <li>${fmtTime(s.remind_evening)}</li>
      <li>${fmtTime(s.remind_last_call)}, last call if anything is left</li>
    </ul>
    <p class="hint">Notifications switch on in Drop 3.</p>
  </section>

  <section class="block">
    <h2 class="block-title">Account</h2>
    <p class="block-text">${esc(store.user?.email || '')}</p>
    <div class="stack">
      <button class="btn btn-quiet" data-act="password">Change password</button>
      <button class="btn btn-quiet btn-danger" data-act="logout">Log out</button>
    </div>
  </section>
  <p class="foot">1440, Drop 1${ui.demo ? ' (demo data)' : ''}</p>`;
}

export function passwordSheet() {
  return `
  <form data-form="password" novalidate>
    <h2 class="sheet-title">Change password</h2>
    <p class="sheet-sub">Use at least 8 characters. A long phrase is easiest to remember.</p>
    <label class="field"><span>New password</span><input name="pw" type="password" autocomplete="new-password" minlength="8" required></label>
    <label class="field"><span>Type it again</span><input name="pw2" type="password" autocomplete="new-password" minlength="8" required></label>
    <p class="form-error" data-error role="alert"></p>
    <div class="sheet-actions">
      <button class="btn" type="submit">Change password</button>
      <button class="btn btn-quiet" type="button" data-act="sheet-close">Cancel</button>
    </div>
  </form>`;
}

// ---------- Login & setup ----------
export function login({ error = '', busy = false } = {}) {
  return `
  <main class="login">
    <div class="login-mark" aria-hidden="true">
      <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" class="mark-track"/><circle cx="60" cy="60" r="54" class="mark-arc" stroke-dasharray="250 340" transform="rotate(-90 60 60)"/></svg>
      <span>1440</span>
    </div>
    <h1 class="login-title">Log in to 1440</h1>
    <form data-form="login" novalidate>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" inputmode="email" required></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
      <p class="form-error" role="alert">${esc(error)}</p>
      <button class="btn" type="submit"${busy ? ' disabled' : ''}>${busy ? 'Logging in…' : 'Log in'}</button>
    </form>
  </main>`;
}

export function needsConnection() {
  return `<main class="login"><h1 class="login-title">Connect to finish setup</h1>
    <p class="hint center">1440 needs the internet once to load your habits. After that it works offline.</p>
    <button class="btn" data-act="retry">Try again</button></main>`;
}
