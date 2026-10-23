// 1440 · local-first store.
// Ticks apply instantly on the phone, are cached, and sync in the background.
import { computeHistory, evaluate, nowIn, sortHabits, isActive } from './logic.js';
import { DEFAULT_SETTINGS, isNetworkError, ruleMessage } from './backend.js';

const key = (habitId, day) => habitId + '|' + day;

export class Store extends EventTarget {
  constructor(backend, { cachePrefix = '1440' } = {}) {
    super();
    this.backend = backend;
    this.cachePrefix = cachePrefix;
    this.user = null;
    this.settings = null;
    this.habits = [];
    this.entries = new Map();
    this.days = new Map();
    this.outbox = [];
    this.syncing = false;
    this.online = true;
    this.lastRefresh = 0;
    this._history = null;
  }

  // ---------- basics ----------
  get tz() { return this.settings?.tz || DEFAULT_SETTINGS.tz; }
  now() { return nowIn(this.tz); }
  today() { return this.now().day; }
  habit(id) { return this.habits.find(h => h.id === id); }
  entry(habitId, day) { return this.entries.get(key(habitId, day)); }
  activeHabits() { return sortHabits(this.habits.filter(h => !h.archived_on)); }
  habitsForDay(day) {
    return sortHabits(this.habits.filter(h => isActive(h, day) || this.entries.has(key(h.id, day))));
  }
  history() {
    if (!this._history || this._history.today !== this.today()) {
      this._history = computeHistory({
        habits: this.habits,
        entries: [...this.entries.values()],
        days: [...this.days.values()],
        today: this.today(),
        shieldsEnabled: !!this.settings?.shields_enabled,
      });
      this._history.today = this.today();
    }
    return this._history;
  }
  emit(reason) {
    this._history = null;
    this.dispatchEvent(new CustomEvent('change', { detail: reason }));
  }

  // ---------- cache ----------
  get cacheKey() { return `${this.cachePrefix}:cache:${this.user?.id}`; }
  get outboxKey() { return `${this.cachePrefix}:outbox:${this.user?.id}`; }
  hydrate() {
    try {
      const c = JSON.parse(localStorage.getItem(this.cacheKey) || 'null');
      if (c) {
        this.settings = c.settings;
        this.habits = c.habits || [];
        this.entries = new Map((c.entries || []).map(e => [key(e.habit_id, e.day), e]));
        this.days = new Map((c.days || []).map(d => [d.day, d]));
      }
      this.outbox = JSON.parse(localStorage.getItem(this.outboxKey) || '[]');
      for (const op of this.outbox) this.#applyLocal(op);
    } catch { /* storage unavailable — fine, we'll load from the server */ }
    return !!this.settings;
  }
  persist() {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify({
        settings: this.settings, habits: this.habits,
        entries: [...this.entries.values()], days: [...this.days.values()],
      }));
      localStorage.setItem(this.outboxKey, JSON.stringify(this.outbox));
    } catch { /* ignore */ }
  }
  clearLocal() {
    try { localStorage.removeItem(this.cacheKey); localStorage.removeItem(this.outboxKey); } catch {}
  }

  // ---------- server ----------
  async start(user) {
    this.user = user;
    const cached = this.hydrate();
    if (cached) this.emit('hydrate');
    await this.refresh();
    await this.#ensureSetup();
    this.flush();
  }

  async refresh() {
    try {
      const data = await this.backend.loadAll();
      const sig = JSON.stringify([data.settings, data.habits, data.days.length, data.entries.length,
        data.entries.reduce((m, e) => (e.updated_at > m ? e.updated_at : m), ''), data.entries.reduce((n, e) => n + e.value, 0)]);
      if (sig === this.sig && !this.outbox.length) { this.online = true; this.lastRefresh = Date.now(); return; }
      this.sig = sig;
      this.settings = data.settings;
      this.habits = data.habits;
      this.entries = new Map(data.entries.map(e => [key(e.habit_id, e.day), e]));
      this.days = new Map(data.days.map(d => [d.day, d]));
      for (const op of this.outbox) this.#applyLocal(op);
      this.online = true;
      this.lastRefresh = Date.now();
      this.persist();
      this.emit('refresh');
    } catch (err) {
      if (isNetworkError(err)) { this.online = false; this.emit('offline'); }
      else throw err;
    }
  }

  async #ensureSetup() {
    if (!this.online) return;
    // A new account gets its own settings and no quests. Existing accounts are left as they are.
    if (!this.settings) {
      let tz = DEFAULT_SETTINGS.tz;
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch {}
      this.settings = await this.backend.createSettings({ ...DEFAULT_SETTINGS, tz, prefs: { seeded: true } });
    }
    this.persist();
    this.emit('setup');
  }

  // ---------- ticks ----------
  /** Set today's value for a habit. Applies instantly; syncs in the background. */
  setEntry(habitId, day, value, meta) {
    const h = this.habit(habitId);
    if (!h) return null;
    const prev = this.entry(habitId, day);
    const op = {
      habit_id: habitId, day, value: Math.max(0, Math.round(value)),
      meta: meta ?? prev?.meta ?? {}, at: Date.now(),
    };
    this.outbox = this.outbox.filter(o => !(o.habit_id === habitId && o.day === day));
    this.outbox.push(op);
    this.#applyLocal(op);
    this.persist();
    this.emit('tick');
    this.flush();
    return prev ? { value: prev.value, meta: prev.meta } : { value: 0, meta: {} };
  }

  #applyLocal(op) {
    const h = this.habit(op.habit_id);
    if (!h) return;
    const prev = this.entry(op.habit_id, op.day) || {};
    this.entries.set(key(op.habit_id, op.day), {
      ...prev, user_id: this.user?.id, habit_id: op.habit_id, day: op.day,
      value: op.value, meta: op.meta, ...evaluate(h, op.value), pending: true,
    });
  }

  async flush() {
    if (this.syncing || this.outbox.length === 0) return;
    this.syncing = true;
    this.emit('sync');
    try {
      while (this.outbox.length) {
        const op = this.outbox[0];
        try {
          const row = await this.backend.upsertEntry(op);
          // only clear if nothing newer was queued for the same habit/day meanwhile
          const latest = this.outbox.find(o => o.habit_id === op.habit_id && o.day === op.day);
          if (latest === op) {
            this.outbox.shift();
            this.entries.set(key(row.habit_id, row.day), row);
          } else {
            this.outbox = this.outbox.filter(o => o !== op);
          }
          this.online = true;
        } catch (err) {
          if (isNetworkError(err)) { this.online = false; break; }
          // The database refused it (day closed, etc.): drop it and restore the server's version.
          this.outbox = this.outbox.filter(o => o !== op);
          this.emit({ type: 'rejected', message: ruleMessage(err) || err.message, op });
          this.sig = null; // local state differs from the server now, so reload it in full
          await this.refresh().catch(() => {});
        }
        this.persist();
      }
    } finally {
      this.syncing = false;
      this.persist();
      this.emit('synced');
    }
  }

  // ---------- habits (need a connection) ----------
  async addHabit(fields) {
    const sameSection = this.habits.filter(h => h.section === fields.section);
    const sort_order = sameSection.reduce((m, h) => Math.max(m, h.sort_order), -1) + 1;
    const [made] = await this.backend.insertHabits([{ ...fields, sort_order }]);
    this.habits.push(made);
    this.persist(); this.emit('habits');
    return made;
  }
  async updateHabit(id, patch) {
    const row = await this.backend.updateHabit(id, patch);
    this.habits = this.habits.map(h => (h.id === id ? row : h));
    this.persist(); this.emit('habits');
    return row;
  }
  async archiveHabit(id) { return this.updateHabit(id, { archived_on: this.today() }); }
  async restoreHabit(id) { return this.updateHabit(id, { archived_on: null }); }
  async deleteHabit(id) {
    await this.backend.deleteHabit(id);
    this.habits = this.habits.filter(h => h.id !== id);
    for (const k of [...this.entries.keys()]) if (k.startsWith(id + '|')) this.entries.delete(k);
    this.outbox = this.outbox.filter(o => o.habit_id !== id);
    this.persist(); this.emit('habits');
  }
  async moveHabit(id, dir) {
    const h = this.habit(id);
    const list = this.activeHabits().filter(x => x.section === h.section);
    const i = list.findIndex(x => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const order = list.map(x => x.id);
    [order[i], order[j]] = [order[j], order[i]];
    // renumber the section so ties can't happen
    const changes = order.map((hid, idx) => [hid, idx]).filter(([hid, idx]) => this.habit(hid).sort_order !== idx);
    for (const [hid, idx] of changes) this.habit(hid).sort_order = idx;
    this.emit('habits');
    await Promise.all(changes.map(([hid, idx]) => this.backend.updateHabit(hid, { sort_order: idx })));
    this.persist();
  }
  async updateSettings(patch) {
    this.settings = await this.backend.updateSettings(this.user.id, patch);
    this.persist(); this.emit('settings');
  }
}
