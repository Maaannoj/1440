// 1440 · first-login tutorial. Seven short steps; shown once to new accounts, replayable from Me.
import { STARTERS } from './backend.js';
import { RANKS } from './logic.js';
import { worldOf } from './worlds.js';
import { worldCards, esc } from './views.js';

const STEPS = ['welcome', 'world', 'quests', 'tick', 'level', 'board', 'ready'];
const doneKey = (uid) => `1440:tut:${uid}`;

export function shouldShow(store) {
  try { if (localStorage.getItem(doneKey(store.user?.id)) === 'done') return false; } catch {}
  const t = store.settings?.prefs?.tutorial;
  if (t === 'pending') return true;
  if (t === 'done') return false;
  return store.settings && store.habits.length === 0;   // older empty accounts
}

/**
 * api: { store, device, setWorld(id), addStarter(i) → Promise<bool>, saveName(name), enablePush(), pushState(), audio, fx, onClose() }
 */
export function openTutorial(api) {
  const root = document.createElement('div');
  root.className = 'tut';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Welcome to 1440');
  document.body.appendChild(root);
  document.body.classList.add('has-tut');
  let step = 0, practiced = false;
  let boardName = api.store.settings?.display_name || '';
  const added = new Set(api.store.habits.map(h => h.name.toLowerCase()));

  const left = () => 1440 - api.store.now().minutes;

  function body() {
    const id = STEPS[step];
    if (id === 'welcome') return `
      <div class="tut-art tut-count"><b id="tut-count">1440</b><small>minutes in a day</small></div>
      <h2 class="tut-title">Welcome to 1440</h2>
      <p class="tut-text">Every day has 1440 minutes. 1440 counts down what's left of today, and helps you spend it on the things you said matter.</p>`;
    if (id === 'world') return `
      <h2 class="tut-title">Pick your world</h2>
      <p class="tut-text">Each world has its own look, sounds and music. Tap one to try it. You can switch any time in Me.</p>
      ${worldCards(api.device.world, 'tut-world')}`;
    if (id === 'quests') {
      const list = STARTERS.map((s, i) => ({ s, i }));
      return `
      <h2 class="tut-title">Add your quests</h2>
      <p class="tut-text">Quests are the things you want to do every day. Tap a few to add them. You can make your own and edit everything later.</p>
      <div class="starter-grid tut-starters">${list.map(({ s, i }) => {
        const on = added.has(s.name.toLowerCase());
        return `<button class="starter${on ? ' is-added' : ''}" data-act="tut-starter:${i}" aria-pressed="${on}">
          <em class="emo" aria-hidden="true" style="--i:${i}">${s.emoji}</em>
          <span class="starter-txt"><b>${esc(s.name)}</b><small>${s.kind === 'timer' ? s.target + ' min' : s.kind === 'count' ? '×' + s.target : s.kind === 'avoid' ? 'Avoid' : s.kind === 'people' ? 'People' : 'Tick'} · ${s.xp} XP</small></span>
          <span class="starter-plus" aria-hidden="true">${on ? '✓' : '+'}</span></button>`;
      }).join('')}</div>
      <p class="tut-count-line">${added.size ? `${added.size} quest${added.size === 1 ? '' : 's'} added` : 'Most people start with 3 to 6.'}</p>`;
    }
    if (id === 'tick') return `
      <h2 class="tut-title">Tick it before midnight</h2>
      <p class="tut-text">When you've done a quest, tap it. Try this one.</p>
      <div class="quests tut-practice"><section class="sec">
        <button class="q${practiced ? ' is-done' : ''}" data-act="tut-practice" style="--i:0">
          <span class="q-emo"><em class="emo" aria-hidden="true">💧</em></span>
          <span class="q-txt"><span class="q-name">Practice quest</span><span class="q-sub"><span class="q-xp">+10 XP</span><span>${practiced ? 'Nice. That\'s it.' : 'Tap me'}</span></span></span>
          <span class="q-box"><svg viewBox="0 0 34 34" aria-hidden="true">${practiced ? '<circle class="fill" cx="17" cy="17" r="15.5"/><path class="chk" d="M9 17.5l5.5 5.5L25.5 11"/>' : '<circle class="frame" cx="17" cy="17" r="15.5"/>'}</svg></span>
        </button></section></div>
      <div class="tut-rule"><b>The one rule</b><span>Anything not ticked by midnight counts as missed, for good. You can't go back and fix yesterday, so tick as you go.</span></div>`;
    if (id === 'level') return `
      <h2 class="tut-title">Level up</h2>
      <div class="tut-xp"><div class="xpbar"><i class="xpbar-fill" id="tut-xpfill" style="transform:scaleX(0)"></i></div>
        <div class="tut-ranks">${RANKS.map((r, i) => `<span class="${i === 0 ? 'is-now' : ''}">${r.name}</span>`).join('')}</div></div>
      <ul class="tut-list">
        <li><em class="emo" aria-hidden="true">⭐</em><span><b>XP</b> Every quest pays XP. Finish everything for a perfect day and get 50 more.</span></li>
        <li><em class="emo" aria-hidden="true">🔥</em><span><b>Streaks</b> Perfect days in a row build your streak.</span></li>
        <li><em class="emo" aria-hidden="true">🛡️</em><span><b>Shields</b> Every 7 perfect days earns a shield. It saves your streak from one bad day.</span></li>
      </ul>`;
    if (id === 'board') return `
      <h2 class="tut-title">The board</h2>
      <p class="tut-text">Everyone on 1440 shows up on the Board, ranked by XP each week. Friends only see your name, level and XP. Never your quests.</p>
      <div class="tut-podium" aria-hidden="true">
        <span class="tp p2"><em class="emo">🥈</em><i></i></span><span class="tp p1"><em class="emo">🥇</em><i></i></span><span class="tp p3"><em class="emo">🥉</em><i></i></span>
      </div>
      <label class="field tut-name"><span>Your name on the board</span>
        <input id="tut-name" maxlength="20" autocomplete="nickname" placeholder="Your name" value="${esc(boardName)}"></label>`;
    const push = api.pushState();
    const pushRow = push === 'install' || push === 'unsupported' ? ''
      : `<div class="switch-row"><div><b>Reminders</b><span>${push === 'denied' ? 'Blocked. Turn on in Settings → Notifications → 1440.' : 'At 12 PM, 5 PM and 11:30 PM, only if something is left.'}</span></div>
          <button class="sw" role="switch" aria-checked="${push === 'on'}" aria-label="Reminders" data-act="tut-push"${push === 'on' || push === 'busy' || push === 'denied' ? ' disabled' : ''}></button></div>`;
    return `
      <div class="tut-art"><em class="emo tut-big" aria-hidden="true">${worldOf(api.device.world).icon}</em></div>
      <h2 class="tut-title">You're set</h2>
      <p class="tut-text">Log shows every day you've played. Me has your rank, your world, and these switches.</p>
      <div class="block tut-switches">
        <div class="switch-row"><div><b>Sound effects</b><span>Ticks, combos and level-ups.</span></div>
          <button class="sw" role="switch" aria-checked="${api.device.sound}" aria-label="Sound effects" data-act="toggle:sound"></button></div>
        <div class="switch-row"><div><b>Music</b><span>Your world's own track.</span></div>
          <button class="sw" role="switch" aria-checked="${!!api.device.music}" aria-label="Music" data-act="toggle:music"></button></div>
        ${pushRow}
      </div>`;
  }

  function render(dir = 1) {
    const last = step === STEPS.length - 1;
    const nextLabel = last ? 'Start my day'
      : STEPS[step] === 'world' ? `Continue with ${worldOf(api.device.world).name}`
      : STEPS[step] === 'quests' && !added.size ? 'Skip for now'
      : STEPS[step] === 'board' && !boardName.trim() ? 'Skip for now' : 'Next';
    root.innerHTML = `
      <div class="tut-top">
        ${step > 0 ? '<button class="tut-link" data-act="tut-back">Back</button>' : '<span></span>'}
        <span class="tut-step">${step + 1} of ${STEPS.length}</span>
        ${last ? '<span></span>' : '<button class="tut-link" data-act="tut-skip">Skip</button>'}
      </div>
      <div class="tut-body" id="tut-body">${body()}</div>
      <div class="tut-foot">
        <div class="tut-dots" aria-hidden="true">${STEPS.map((_, i) => `<i class="${i === step ? 'is-on' : i < step ? 'is-past' : ''}"></i>`).join('')}</div>
        <button class="btn" data-act="tut-next">${nextLabel}</button>
      </div>`;
    const b = root.querySelector('#tut-body');
    b.scrollTop = 0;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      b.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.9,.2,1)' });
    }
    if (STEPS[step] === 'welcome') countDown();
    if (STEPS[step] === 'level') setTimeout(() => {
      const f = root.querySelector('#tut-xpfill'); if (f) f.style.transform = 'scaleX(.72)';
      root.querySelectorAll('.tut-ranks span').forEach((el, i) => setTimeout(() => el.classList.add('is-lit'), 300 + i * 160));
    }, 120);
  }

  function countDown() {
    const el = root.querySelector('#tut-count');
    if (!el) return;
    const target = left();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = target; return; }
    const t0 = performance.now(), dur = 1500;
    const tick = (t) => {
      if (!el.isConnected) return;
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(1440 - (1440 - target) * e);
      if (k < 1) requestAnimationFrame(tick);
    };
    setTimeout(() => requestAnimationFrame(tick), 450);
  }

  function saveName() {
    const n = boardName.trim().replace(/\s+/g, ' ');
    if (n && Array.from(n).length <= 20 && n !== (api.store.settings?.display_name || '')) api.saveName(n);
  }

  function close() {
    if (STEPS[step] === 'board') saveName();
    try { localStorage.setItem(doneKey(api.store.user?.id), 'done'); } catch {}
    const prefs = api.store.settings?.prefs || {};
    if (api.store.settings && prefs.tutorial !== 'done') api.store.updateSettings({ prefs: { ...prefs, tutorial: 'done', world: api.device.world } }).catch(() => {});
    document.removeEventListener('click', onClick, true);
    document.body.classList.remove('has-tut');
    root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in' }).onfinish = () => root.remove();
    api.onClose();
  }

  async function onClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const [name, ...rest] = el.dataset.act.split(':');
    const arg = rest.join(':');
    if (name === 'toggle') return;          // handled by the app (sound / music switches)
    ev.preventDefault(); ev.stopPropagation();
    if (name === 'tut-push') { api.enablePush(); return; }
    if (name === 'tut-next') {
      api.audio.play('tab'); api.fx.haptic();
      if (STEPS[step] === 'board') saveName();
      if (step === STEPS.length - 1) { close(); return; }
      step++; render(1);
    } else if (name === 'tut-back') { step = Math.max(0, step - 1); render(-1); api.audio.play('tab'); }
    else if (name === 'tut-skip') { close(); }
    else if (name === 'tut-world') {
      api.setWorld(arg);
      setTimeout(() => render(0), 300);
    } else if (name === 'tut-starter') {
      const s = STARTERS[Number(arg)];
      if (!s || added.has(s.name.toLowerCase()) || el.classList.contains('is-adding')) return;
      el.classList.add('is-adding');
      const r = el.getBoundingClientRect();
      const ok = await api.addStarter(Number(arg));
      if (ok) {
        added.add(s.name.toLowerCase());
        api.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 12 });
        api.audio.play('cleared'); api.fx.haptic();
      }
      render(0);
    } else if (name === 'tut-practice') {
      if (practiced) return;
      practiced = true;
      const box = el.querySelector('.q-box').getBoundingClientRect();
      render(0);
      const row = root.querySelector('.tut-practice .q');
      api.fx.flash(row); api.fx.pop(row?.querySelector('.q-emo .emo'));
      api.fx.burst(box.left + box.width / 2, box.top + box.height / 2);
      api.fx.floatText(box.left + box.width / 2, box.top - 12, '+10 XP');
      api.audio.play('tick'); api.fx.haptic();
    }
  }
  document.addEventListener('click', onClick, true);
  root.addEventListener('input', (ev) => {
    if (ev.target.id !== 'tut-name') return;
    boardName = ev.target.value;
    const btn = root.querySelector('[data-act="tut-next"]');
    if (btn) btn.textContent = boardName.trim() ? 'Next' : 'Skip for now';
  });
  render(0);
  return { close, refresh: () => { if (STEPS[step] === 'ready') render(0); } };
}
