// 1440 · pure logic: dates, schedules, streaks, shields, XP.
// No DOM, no network — everything here is deterministic and unit-tested.

export const XP_PERFECT_BONUS = 50;
export const SHIELD_EVERY = 7;   // perfect days per shield
export const SHIELD_MAX = 3;     // shields you can hold at once
export const AVOID_CONFIRM_MINUTE = 20 * 60; // "clean day" can be confirmed from 8 PM
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// ---------- clock (overridable for demo/testing) ----------
let clockOffsetMs = 0;
export const clock = {
  now: () => Date.now() + clockOffsetMs,
  date: () => new Date(Date.now() + clockOffsetMs),
  setNow(iso) { clockOffsetMs = Date.parse(iso) - Date.now(); },
};

// ---------- dates ----------
const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return fmtCache.get(tz);
}

/** Local day ('YYYY-MM-DD') and minute-of-day in a time zone. */
export function nowIn(tz, date = clock.date()) {
  const p = {};
  for (const part of fmt(tz).formatToParts(date)) p[part.type] = part.value;
  const minutes = (Number(p.hour) % 24) * 60 + Number(p.minute);
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    minutes,
    seconds: minutes * 60 + Number(p.second),
  };
}

export function addDays(day, n) {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dow(day) { return new Date(day + 'T00:00:00Z').getUTCDay(); }
export function diffDays(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}
export function monthKey(day) { return day.slice(0, 7); }

// ---------- habits ----------
export function isActive(h, day) {
  if (h.start_date > day) return false;
  if (h.archived_on && h.archived_on <= day) return false;
  return (h.days && h.days.length ? h.days : ALL_DAYS).includes(dow(day));
}

export function sortHabits(habits) {
  const order = { morning: 0, day: 1, night: 2 };
  return [...habits].sort((a, b) =>
    (order[a.section] - order[b.section]) || (a.sort_order - b.sort_order) ||
    a.name.localeCompare(b.name));
}

/** What a value means for a habit: done flag and XP, same rule as the database. */
export function evaluate(habit, value) {
  const done = value >= habit.target;
  return { done, xp: done ? habit.xp : 0, target: habit.target };
}

/** Fraction of a habit completed (0–1), for rings. */
export function progressOf(habit, entry) {
  if (!entry) return 0;
  if (entry.done) return 1;
  return Math.max(0, Math.min(1, (entry.value || 0) / (habit.target || 1)));
}

// ---------- levels ----------
// Reaching level n takes 125·n·(n−1) XP in total: 250 for L2, 750 for L3, 1500 for L4…
export function levelFromXP(xp) {
  let n = 1;
  while (125 * (n + 1) * n <= xp) n++;
  const base = 125 * n * (n - 1);
  const next = 125 * (n + 1) * n;
  return { level: n, xp, base, next, into: xp - base, need: next - base, pct: (xp - base) / (next - base) };
}

// ---------- ranks ----------
export const RANKS = [
  { min: 1,  name: 'Rookie' },
  { min: 3,  name: 'Runner' },
  { min: 6,  name: 'Operator' },
  { min: 10, name: 'Phantom' },
  { min: 15, name: 'Legend' },
];
export function rankFor(level) {
  let r = RANKS[0];
  for (const x of RANKS) if (level >= x.min) r = x;
  return r;
}

// ---------- history: per-day results, streaks, shields, XP ----------
/**
 * habits:  [{id, start_date, archived_on, days, target, xp, ...}]
 * entries: [{habit_id, day, value, done, xp, meta}]
 * days:    [{day, sealed_at, closed_at, mood, ...}]
 * today:   'YYYY-MM-DD'
 */
export function computeHistory({ habits, entries, days, today, shieldsEnabled = false }) {
  const habitById = new Map(habits.map(h => [h.id, h]));
  const byDay = new Map();
  for (const e of entries) {
    if (!byDay.has(e.day)) byDay.set(e.day, new Map());
    byDay.get(e.day).set(e.habit_id, e);
  }
  const dayRows = new Map(days.map(d => [d.day, d]));

  let start = null;
  for (const h of habits) if (!start || h.start_date < start) start = h.start_date;
  for (const e of entries) if (!start || e.day < start) start = e.day;

  const perDay = new Map();
  const hs = new Map(habits.map(h => [h.id, { current: 0, best: 0, done: 0, scheduled: 0 }]));
  const perfect = { current: 0, best: 0 };
  let bank = 0, perfectDays = 0, totalXP = 0, shieldsUsed = 0, shieldsEarned = 0;

  const info = (day) => {
    const row = dayRows.get(day);
    const sealed = !!row?.sealed_at;
    const ents = byDay.get(day) || new Map();
    const ids = new Set();
    // A sealed day's rows are the permanent record; otherwise use the schedule.
    if (!sealed) for (const h of habits) if (isActive(h, day)) ids.add(h.id);
    for (const id of ents.keys()) if (habitById.has(id)) ids.add(id);
    const scheduled = [...ids];
    const done = scheduled.filter(id => ents.get(id)?.done);
    const missed = scheduled.filter(id => !ents.get(id)?.done);
    let xp = 0;
    for (const id of scheduled) xp += ents.get(id)?.xp || 0;
    const perfectDay = scheduled.length > 0 && missed.length === 0;
    return {
      day, scheduled, done, missed, xp, sealed,
      closed: !!row?.closed_at, row, entries: ents,
      perfect: perfectDay,
      score: scheduled.length ? done.length / scheduled.length : null,
      shielded: false,
    };
  };

  if (start) {
    for (let d = start; d < today; d = addDays(d, 1)) {
      const x = info(d);
      if (!x.perfect && x.missed.length > 0 && shieldsEnabled && bank > 0) {
        bank--; shieldsUsed++; x.shielded = true;
      }
      for (const id of x.scheduled) {
        const s = hs.get(id);
        if (!s) continue;
        s.scheduled++;
        if (x.done.includes(id)) { s.current++; s.done++; if (s.current > s.best) s.best = s.current; }
        else if (!x.shielded) s.current = 0;
      }
      if (x.perfect) {
        perfect.current++; perfectDays++;
        if (perfect.current > perfect.best) perfect.best = perfect.current;
        if (shieldsEnabled && perfectDays % SHIELD_EVERY === 0) {
          shieldsEarned++;
          if (bank < SHIELD_MAX) bank++;
        }
      } else if (x.scheduled.length > 0 && !x.shielded) {
        perfect.current = 0;
      }
      totalXP += x.xp + (x.perfect ? XP_PERFECT_BONUS : 0);
      perDay.set(d, x);
    }
  }

  // Today is still in progress: it can add to streaks but can't break them yet.
  const t = info(today);
  t.isToday = true;
  totalXP += t.xp + (t.perfect ? XP_PERFECT_BONUS : 0);
  perDay.set(today, t);

  const habitStats = new Map();
  for (const h of habits) {
    const s = hs.get(h.id);
    const schedToday = t.scheduled.includes(h.id);
    const doneToday = t.done.includes(h.id);
    const current = s.current + (doneToday ? 1 : 0);
    habitStats.set(h.id, {
      current,
      best: Math.max(s.best, current),
      atRisk: schedToday && !doneToday && s.current > 0,
      done: s.done + (doneToday ? 1 : 0),
      scheduled: s.scheduled + (doneToday ? 1 : 0),
    });
  }

  const perfectNow = perfect.current + (t.perfect ? 1 : 0);
  const perfectTotal = perfectDays + (t.perfect ? 1 : 0);
  return {
    perDay,
    habitStats,
    perfect: { current: perfectNow, best: Math.max(perfect.best, perfectNow) },
    perfectDays: perfectTotal,
    bank, shieldsUsed, shieldsEarned,
    nextShieldIn: SHIELD_EVERY - (perfectTotal % SHIELD_EVERY),
    totalXP,
    level: levelFromXP(totalXP),
    start,
  };
}

/** Share of scheduled days a habit was done in the last n days (today counts only once done). */
export function habitRate(history, habitId, today, n) {
  let sched = 0, done = 0;
  for (let i = 0; i < n; i++) {
    const d = addDays(today, -i);
    const x = history.perDay.get(d);
    if (!x) continue;
    if (!x.scheduled.includes(habitId)) continue;
    const isDone = x.done.includes(habitId);
    if (x.isToday && !isDone) continue;
    sched++;
    if (isDone) done++;
  }
  return sched ? done / sched : null;
}

/** Day score over the last n finished days, plus today if perfect. */
export function overallRate(history, today, n) {
  let sched = 0, done = 0;
  for (let i = 0; i < n; i++) {
    const x = history.perDay.get(addDays(today, -i));
    if (!x || (x.isToday && !x.perfect)) continue;
    sched += x.scheduled.length; done += x.done.length;
  }
  return sched ? done / sched : null;
}
