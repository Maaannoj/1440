// 1440 · backends. The app talks to one of these:
//  • SupabaseBackend — your real data
//  • DemoBackend     — fake history in memory (open the app with ?demo)
import { addDays, evaluate, isActive, nowIn, clock, ALL_DAYS } from './logic.js';

export const DEFAULT_HABITS = [
  { name: 'Brush teeth',      emoji: '🪥', section: 'morning', kind: 'check', xp: 5 },
  { name: 'Bath',             emoji: '🚿', section: 'morning', kind: 'check', xp: 5 },
  { name: 'Supplements',      emoji: '💊', section: 'morning', kind: 'check', xp: 5 },
  { name: 'Eat 2 meals',      emoji: '🍽️', section: 'day',     kind: 'count', target: 2,  unit: 'meals', xp: 10 },
  { name: 'Eat 1 fruit',      emoji: '🍎', section: 'day',     kind: 'check', xp: 10 },
  { name: 'Walk',             emoji: '🚶', section: 'day',     kind: 'check', xp: 10, auto_steps: true },
  { name: 'Work out',         emoji: '🏋️', section: 'day',     kind: 'timer', target: 15, unit: 'min', xp: 25 },
  { name: 'Read',             emoji: '📖', section: 'day',     kind: 'timer', target: 30, unit: 'min', xp: 25 },
  { name: 'Talk to parents',  emoji: '👪', section: 'day',     kind: 'check', xp: 10 },
  { name: 'Talk to a friend', emoji: '💬', section: 'day',     kind: 'people', xp: 10 },
  { name: 'Face wash',        emoji: '🧼', section: 'night',   kind: 'check', xp: 5 },
  { name: 'No nail biting',   emoji: '✋', section: 'night',   kind: 'avoid', xp: 25 },
].map((h, i) => ({ target: 1, unit: null, auto_steps: false, days: ALL_DAYS, ...h, sort_order: i }));

// One-tap ideas shown to accounts with few quests. Nothing is added unless the person taps it.
export const STARTERS = [
  { name: 'Drink water',     emoji: '💧', section: 'day',     kind: 'count',  target: 8,  unit: 'glasses', xp: 10 },
  { name: 'Walk',            emoji: '🚶', section: 'day',     kind: 'check',  xp: 10 },
  { name: 'Work out',        emoji: '🏋️', section: 'day',     kind: 'timer',  target: 20, unit: 'min', xp: 25 },
  { name: 'Read',            emoji: '📖', section: 'day',     kind: 'timer',  target: 20, unit: 'min', xp: 25 },
  { name: 'Meditate',        emoji: '🧘', section: 'morning', kind: 'timer',  target: 10, unit: 'min', xp: 10 },
  { name: 'Brush teeth',     emoji: '🪥', section: 'morning', kind: 'check',  xp: 5 },
  { name: 'Supplements',     emoji: '💊', section: 'morning', kind: 'check',  xp: 5 },
  { name: 'Eat a fruit',     emoji: '🍎', section: 'day',     kind: 'check',  xp: 10 },
  { name: 'Call home',       emoji: '👪', section: 'day',     kind: 'check',  xp: 10 },
  { name: 'Talk to a friend',emoji: '💬', section: 'day',     kind: 'people', xp: 10 },
  { name: 'Journal',         emoji: '✍️', section: 'night',   kind: 'check',  xp: 10 },
  { name: 'No junk food',    emoji: '🍟', section: 'night',   kind: 'avoid',  xp: 25 },
  { name: 'In bed by 12',    emoji: '🛏️', section: 'night',   kind: 'check',  xp: 10 },
].map(h => ({ target: 1, unit: null, auto_steps: false, days: ALL_DAYS, ...h }));

export const DEFAULT_SETTINGS = {
  tz: 'Asia/Kolkata',
  remind_morning: '12:00',
  remind_evening: '17:00',
  remind_last_call: '23:30',
  shields_enabled: true,
  prefs: { seeded: false },
};

/** A failed request that should be retried later (no connection). */
export function isNetworkError(err) {
  if (!err) return false;
  if (err.name === 'TypeError') return true;
  const msg = String(err.message || '');
  return !err.code && /fetch|load failed|network|timed? ?out|offline/i.test(msg);
}

/** Turn a database rule error into plain words. */
export function ruleMessage(err) {
  const m = String(err?.message || '');
  // the board/reminders SQL hasn't been run in Supabase yet
  if (err?.code === 'PGRST202' || err?.code === 'PGRST204' || /could not find the (function|'display_name' column)/i.test(m)) {
    return 'This needs the board and reminders setup in Supabase first.';
  }
  const i = m.indexOf('1440:');
  if (i < 0) return null;
  const text = m.slice(i + 5).trim().replace(/\d{4}-\d{2}-\d{2}/g, (d) =>
    new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(d + 'T00:00:00Z')));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ======================================================================
export class SupabaseBackend {
  constructor(url, key) {
    this.sb = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: '1440-auth', detectSessionInUrl: false },
    });
  }
  async getUser() {
    const { data } = await this.sb.auth.getSession();
    return data.session?.user ?? null;
  }
  onAuthChange(cb) { this.sb.auth.onAuthStateChange((_ev, session) => cb(session?.user ?? null)); }
  async signIn(email, password) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }
  async signOut() { await this.sb.auth.signOut(); }
  async updatePassword(password) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) throw error;
  }

  async #all(table, orderCols) {
    const out = [];
    for (let from = 0; ; from += 1000) {
      let q = this.sb.from(table).select('*');
      for (const c of orderCols) q = q.order(c, { ascending: true });
      const { data, error } = await q.range(from, from + 999);
      if (error) throw error;
      out.push(...data);
      if (data.length < 1000) break;
    }
    return out;
  }
  async loadAll() {
    const [settingsRows, habits, entries, days] = await Promise.all([
      this.#all('settings', ['user_id']),
      this.#all('habits', ['created_at', 'id']),
      this.#all('entries', ['day', 'habit_id']),
      this.#all('days', ['day']),
    ]);
    return { settings: settingsRows[0] ?? null, habits, entries, days };
  }
  async createSettings(values) {
    const { data, error } = await this.sb.from('settings').insert(values).select().single();
    if (error) throw error;
    return data;
  }
  async updateSettings(userId, patch) {
    const { data, error } = await this.sb.from('settings')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('user_id', userId).select().single();
    if (error) throw error;
    return data;
  }
  async insertHabits(rows) {
    const { data, error } = await this.sb.from('habits').insert(rows).select();
    if (error) throw error;
    return data;
  }
  async updateHabit(id, patch) {
    const { data, error } = await this.sb.from('habits').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  async deleteHabit(id) {
    const { data, error } = await this.sb.from('habits').delete().eq('id', id).select('id');
    if (error) throw error;
    if (!data.length) throw new Error('1440: this habit has history, so it can only be archived.');
  }
  async upsertEntry({ habit_id, day, value, meta }) {
    const { data, error } = await this.sb.from('entries')
      .upsert({ habit_id, day, value, meta }, { onConflict: 'habit_id,day' })
      .select().single();
    if (error) throw error;
    return data;
  }

  // ---------- board ----------
  async board() {
    const { data, error } = await this.sb.rpc('board');
    if (error) throw error;
    return data;
  }

  // ---------- reminders ----------
  async pushPublicKey() {
    const { data, error } = await this.sb.rpc('push_public_key');
    if (error) throw error;
    if (!data) throw new Error('1440: reminders aren\'t set up on the server yet.');
    return data;
  }
  async savePush({ endpoint, p256dh, auth }) {
    const { error } = await this.sb.rpc('save_push', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
    if (error) throw error;
  }
  async removePush(endpoint) {
    const { error } = await this.sb.from('push_subscriptions').delete().eq('endpoint', endpoint);
    if (error) throw error;
  }
  async sendTestPush() {
    const { data, error } = await this.sb.rpc('send_test_push');
    if (error) throw error;
    return data;
  }
  async testPushResult(id) {
    const { data, error } = await this.sb.rpc('push_test_result', { p_id: id });
    if (error) throw error;
    return data;
  }
}

// ======================================================================
// Demo: realistic fake history, same rules as the database.
export class DemoBackend {
  constructor({ days = 45, seed = 7, empty = false } = {}) {
    this.user = { id: empty ? 'demo-new-user' : 'demo-user', email: empty ? 'friend@example.com' : 'you@example.com' };
    this.signedIn = true;
    this.rand = mulberry32(seed);
    this.historyDays = days;
    if (empty) { this.settings = null; this.habits = []; this.entries = new Map(); this.days = new Map(); }
    else this.#build();
  }
  #today() { return nowIn(this.settings?.tz || DEFAULT_SETTINGS.tz).day; }
  #build() {
    const tz = DEFAULT_SETTINGS.tz;
    const today = nowIn(tz).day;
    const start = addDays(today, -this.historyDays);
    this.settings = {
      user_id: this.user.id, ...DEFAULT_SETTINGS, prefs: { seeded: true },
      created_at: new Date(Date.parse(start + 'T00:00:00Z')).toISOString(),
    };
    this.habits = DEFAULT_HABITS.map((h, i) => ({
      ...h, id: 'h' + i, user_id: this.user.id, start_date: start, archived_on: null,
      created_at: start + 'T00:00:00Z',
    }));
    this.entries = new Map();
    this.days = new Map();
    const skill = { 'Read': 0.55, 'Work out': 0.6, 'No nail biting': 0.5, 'Talk to a friend': 0.65, 'Eat 1 fruit': 0.7 };
    for (let d = start; d < today; d = addDays(d, 1)) {
      const age = (Date.parse(d) - Date.parse(start)) / (Date.parse(today) - Date.parse(start)); // improves over time
      const goodDay = this.rand() < 0.22 + age * 0.35;
      for (const h of this.habits) {
        if (!isActive(h, d)) continue;
        const p = goodDay ? 1 : Math.min(0.97, (skill[h.name] ?? 0.88) + age * 0.15);
        const ok = this.rand() < p;
        let value = ok ? h.target : (h.kind === 'count' || h.kind === 'timer') ? Math.floor(h.target * this.rand() * 0.8) : 0;
        const meta = {};
        if (ok && h.kind === 'people') meta.who = [['Rohan', 'Aisha', 'Kabir', 'Meera'][Math.floor(this.rand() * 4)]];
        this.entries.set(h.id + '|' + d, { user_id: this.user.id, habit_id: h.id, day: d, value, meta, ...evaluate(h, value) });
      }
      this.days.set(d, { user_id: this.user.id, day: d, sealed_at: d + 'T19:00:00Z', closed_at: null });
    }
    // a little progress already today
    for (const name of ['Brush teeth', 'Bath', 'Supplements']) {
      const h = this.habits.find(x => x.name === name);
      this.entries.set(h.id + '|' + today, { user_id: this.user.id, habit_id: h.id, day: today, value: 1, meta: {}, ...evaluate(h, 1) });
    }
    const meals = this.habits.find(x => x.kind === 'count');
    this.entries.set(meals.id + '|' + today, { user_id: this.user.id, habit_id: meals.id, day: today, value: 1, meta: {}, ...evaluate(meals, 1) });
  }
  async getUser() { return this.signedIn ? this.user : null; }
  onAuthChange() {}
  async signIn() { this.signedIn = true; return this.user; }
  async signOut() { this.signedIn = false; }
  async updatePassword(pw) { if (pw.length < 8) throw new Error('Password should be at least 8 characters.'); }
  async loadAll() {
    await delay(120);
    return {
      settings: this.settings ? structuredClone(this.settings) : null,
      habits: structuredClone(this.habits),
      entries: structuredClone([...this.entries.values()]),
      days: structuredClone([...this.days.values()]),
    };
  }
  async createSettings(v) { this.settings = { user_id: this.user.id, created_at: new Date(clock.now()).toISOString(), ...v }; return structuredClone(this.settings); }
  async updateSettings(_uid, patch) { Object.assign(this.settings, patch); return structuredClone(this.settings); }
  async insertHabits(rows) {
    const today = this.#today();
    const made = rows.map(r => ({
      id: 'h' + Math.random().toString(36).slice(2, 8), user_id: this.user.id, emoji: null, unit: null,
      target: 1, xp: 10, days: ALL_DAYS, auto_steps: false, sort_order: 0, archived_on: null, ...r,
      start_date: today, created_at: new Date(clock.now()).toISOString(),
    }));
    this.habits.push(...made);
    return structuredClone(made);
  }
  async updateHabit(id, patch) {
    await delay(60);
    const h = this.habits.find(x => x.id === id);
    const today = this.#today();
    const { start_date, ...rest } = patch;
    Object.assign(h, rest);
    if (h.archived_on && h.archived_on < today) h.archived_on = today;
    return structuredClone(h);
  }
  async deleteHabit(id) {
    const h = this.habits.find(x => x.id === id);
    if (!h || h.start_date < this.#today()) throw new Error('1440: this habit has history, so it can only be archived.');
    this.habits = this.habits.filter(x => x.id !== id);
    for (const k of [...this.entries.keys()]) if (k.startsWith(id + '|')) this.entries.delete(k);
  }
  async board() {
    await delay(260);
    if (this.offline) throw new TypeError('Load failed');
    const me = { name: this.settings?.display_name || 'Player', is_me: true, xp_total: 0, xp_week: 0 }; // the app fills in your own XP
    if (this.user.id === 'demo-new-user') return [me, { name: 'Manoj', is_me: false, xp_total: 2480, xp_week: 395 }];
    return [
      { name: 'Aisha', is_me: false, xp_total: 6120, xp_week: 610 },
      me,
      { name: 'Rohan', is_me: false, xp_total: 4350, xp_week: 455 },
      { name: 'Kabir', is_me: false, xp_total: 3980, xp_week: 520 },
      { name: 'Meera', is_me: false, xp_total: 2210, xp_week: 180 },
      { name: 'Player', is_me: false, xp_total: 140, xp_week: 140 },
    ];
  }
  async pushPublicKey() { return 'BDemoKeyOnlyNotRealBDemoKeyOnlyNotRealBDemoKeyOnlyNotRealBDemoKeyOnlyNotRealBDemoKe'; }
  async savePush() { await delay(120); this.pushSaved = true; }
  async removePush() { await delay(80); this.pushSaved = false; }
  async sendTestPush() { await delay(200); return 1; }
  async upsertEntry({ habit_id, day, value, meta }) {
    await delay(80);
    if (this.offline) { const e = new TypeError('Load failed'); throw e; }
    const tz = this.settings.tz;
    const today = nowIn(tz).day;
    const grace = nowIn(tz, new Date(clock.now() - 15 * 60000)).day;
    if (day !== today && day !== grace) throw Object.assign(new Error(`1440: ${day} is locked. Only today can be changed.`), { code: 'P0001' });
    if (this.days.get(day)?.closed_at || this.days.get(day)?.sealed_at) throw Object.assign(new Error(`1440: ${day} is already closed.`), { code: 'P0001' });
    const h = this.habits.find(x => x.id === habit_id);
    const row = { user_id: this.user.id, habit_id, day, value, meta: meta || {}, ...evaluate(h, value), done_at: null };
    this.entries.set(habit_id + '|' + day, row);
    return structuredClone(row);
  }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
