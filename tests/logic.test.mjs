import assert from 'node:assert/strict';
import { levelFromXP, computeHistory, nowIn, addDays, isActive, habitRate, evaluate } from '../js/logic.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('PASS', name); };

t('levels', () => {
  assert.equal(levelFromXP(0).level, 1);
  assert.equal(levelFromXP(249).level, 1);
  assert.equal(levelFromXP(250).level, 2);
  assert.equal(levelFromXP(749).level, 2);
  assert.equal(levelFromXP(750).level, 3);
  assert.equal(levelFromXP(1500).level, 4);
  assert.equal(levelFromXP(1500).need, 1000);
});

t('IST midnight boundary', () => {
  assert.deepEqual(nowIn('Asia/Kolkata', new Date('2026-10-23T18:29:30Z')).day, '2026-10-23');
  assert.equal(nowIn('Asia/Kolkata', new Date('2026-10-23T18:29:30Z')).minutes, 23 * 60 + 59);
  assert.equal(nowIn('Asia/Kolkata', new Date('2026-10-23T18:31:00Z')).day, '2026-10-24');
  assert.equal(nowIn('Asia/Kolkata', new Date('2026-10-23T18:31:00Z')).minutes, 1);
});

t('schedule by weekday', () => {
  const h = { start_date: '2026-10-01', archived_on: null, days: [1, 2, 3, 4, 5] }; // weekdays
  assert.equal(isActive(h, '2026-10-24'), false); // Saturday
  assert.equal(isActive(h, '2026-10-23'), true);  // Friday
  assert.equal(isActive({ ...h, archived_on: '2026-10-23' }, '2026-10-23'), false);
  assert.equal(isActive(h, '2026-09-30'), false);
});

const mk = (id, extra = {}) => ({ id, start_date: '2026-10-01', archived_on: null, days: [0,1,2,3,4,5,6], target: 1, xp: 10, ...extra });
const e = (h, day, value) => ({ habit_id: h.id, day, value, ...evaluate(h, value) });

t('streaks and perfect days, no shields', () => {
  const A = mk('A'), B = mk('B');
  const entries = [];
  for (let i = 0; i < 3; i++) { const d = addDays('2026-10-01', i); entries.push(e(A, d, 1), e(B, d, 1)); }
  entries.push(e(A, '2026-10-04', 0), e(B, '2026-10-04', 1)); // A missed on day 4
  entries.push(e(A, '2026-10-05', 1));                         // today: A done, B not yet
  const h = computeHistory({ habits: [A, B], entries, days: [], today: '2026-10-05', shieldsEnabled: false });
  assert.equal(h.perfectDays, 3);
  assert.equal(h.perfect.current, 0);
  assert.equal(h.perfect.best, 3);
  assert.equal(h.habitStats.get('A').current, 1);     // reset by the miss, +1 today
  assert.equal(h.habitStats.get('B').current, 4);     // 4 days, today not done yet
  assert.equal(h.habitStats.get('B').atRisk, true);
  assert.equal(h.totalXP, 3 * (20 + 50) + 10 + 10);  // 3 perfect days + day4 B + today A
  assert.equal(h.perDay.get('2026-10-04').missed.join(), 'A');
});

t('a shield is earned after 7 perfect days and saves the streak on the next miss', () => {
  const A = mk('A'), B = mk('B');
  const entries = [];
  for (let i = 0; i < 7; i++) { const d = addDays('2026-10-01', i); entries.push(e(A, d, 1), e(B, d, 1)); }
  entries.push(e(A, '2026-10-08', 0), e(B, '2026-10-08', 1)); // miss → shield used
  entries.push(e(A, '2026-10-09', 1), e(B, '2026-10-09', 1)); // perfect again
  const h = computeHistory({ habits: [A, B], entries, days: [], today: '2026-10-10', shieldsEnabled: true });
  assert.equal(h.perDay.get('2026-10-08').shielded, true);
  assert.equal(h.shieldsUsed, 1);
  assert.equal(h.bank, 0);
  assert.equal(h.habitStats.get('A').current, 8);   // 7 + (shielded day keeps it) + 1
  assert.equal(h.perfect.current, 8);               // the shielded day neither breaks nor adds
  assert.equal(h.perfectDays, 8);
  assert.equal(h.nextShieldIn, 6);

  const strict = computeHistory({ habits: [A, B], entries, days: [], today: '2026-10-10', shieldsEnabled: false });
  assert.equal(strict.habitStats.get('A').current, 1);
  assert.equal(strict.perfect.current, 1);
});

t('shields cap at 3', () => {
  const A = mk('A');
  const entries = [];
  for (let i = 0; i < 35; i++) entries.push(e(A, addDays('2026-10-01', i), 1));
  const h = computeHistory({ habits: [A], entries, days: [], today: addDays('2026-10-01', 35), shieldsEnabled: true });
  assert.equal(h.shieldsEarned, 5);
  assert.equal(h.bank, 3);
});

t('sealed days use the recorded rows, not today\'s schedule', () => {
  const A = mk('A', { days: [1, 2, 3, 4, 5] }); // schedule later changed to weekdays
  const sat = '2026-10-03';                      // was recorded as a miss when it was daily
  const h = computeHistory({
    habits: [A], entries: [e(A, sat, 0)], days: [{ day: sat, sealed_at: 'x' }],
    today: '2026-10-05', shieldsEnabled: false,
  });
  assert.deepEqual(h.perDay.get(sat).missed, ['A']);
  assert.deepEqual(h.perDay.get('2026-10-04').scheduled, []); // unsealed Sunday: not scheduled
});

t('habit rate ignores today until done', () => {
  const A = mk('A');
  const entries = [e(A, '2026-10-01', 1), e(A, '2026-10-02', 0)];
  const h = computeHistory({ habits: [A], entries, days: [], today: '2026-10-03', shieldsEnabled: false });
  assert.equal(habitRate(h, 'A', '2026-10-03', 7), 0.5);
});

t('habits starting later do not create misses before they existed', () => {
  const A = mk('A'), B = mk('B', { start_date: '2026-10-03' });
  const entries = [e(A, '2026-10-01', 1), e(A, '2026-10-02', 1), e(A, '2026-10-03', 1), e(B, '2026-10-03', 1)];
  const h = computeHistory({ habits: [A, B], entries, days: [], today: '2026-10-04', shieldsEnabled: false });
  assert.equal(h.perfectDays, 3);
});

console.log(`\n${n} logic tests passed`);
