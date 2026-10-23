// 1440 · worlds. Each world is its own little game: its own Today art (the "hero"),
// layout, words, particles, backdrop and music. Colours and layout live in worlds.css.
// The hero reacts to progress through three hooks the app patches in place on every tick:
//   --prog (0–1), data-mood (sleepy/sad/idle/happy/ecstatic) and [data-slot] (one per quest).
import { addDays, rankFor, RANKS } from './logic.js';

export const WORLDS = [
  { id: 'cyberpunk', name: 'Cyberpunk',   icon: '🌆', line: 'Neon HUD, glitch and combos. Ten colour styles.' },
  { id: 'bloom',     name: 'Bloom',       icon: '🌸', line: 'A cute garden. Every quest opens a petal.' },
  { id: 'pixel',     name: 'Pixel Quest', icon: '🗡️', line: '8-bit RPG. A little knight, chests and gold.' },
  { id: 'cozy',      name: 'Cozy Desk',   icon: '☕', line: 'Lo-fi room, rain on the window, sticky notes.' },
  { id: 'deep',      name: 'Deep Sea',    icon: '🐠', line: 'The water rises as you finish quests.' },
  { id: 'orbit',     name: 'Orbit',       icon: '🪐', line: 'Mission control. Your quests are moons.' },
  { id: 'zen',       name: 'Zen',         icon: '🎋', line: 'Ink, paper and one brush-stroke circle.' },
  { id: 'comic',     name: 'Comic',       icon: '💥', line: 'Pop-art panels. POW on every tick.' },
  { id: 'notebook',  name: 'Notebook',    icon: '📓', line: 'A bullet journal with doodles and tape.' },
  { id: 'pet',       name: 'Pet',         icon: '🐣', line: 'Mochi the chick grows with your streak.' },
];
export const WORLD_IDS = WORLDS.map(w => w.id);
export const worldOf = (id) => WORLDS.find(w => w.id === id) || WORLDS[0];

// ---------- words ----------
const SAY = {
  pet: {
    sleepy: 'Yawn… Mochi is still waking up. One quest?',
    sad: 'Mochi missed you yesterday. Let\'s make today count.',
    idle: 'Mochi is ready. What are we doing first?',
    happy: 'We\'re on a roll! Mochi is dancing.',
    ecstatic: 'Perfect day!! Mochi is the happiest chick alive.',
  },
  comic: {
    sleepy: 'Rise and shine, hero!',
    sad: 'Yesterday was rough. Today we fight back!',
    idle: 'Let\'s go, hero!',
    happy: 'Halfway there! Keep swinging!',
    ecstatic: 'DAY SAVED!',
  },
  zen: {
    sleepy: 'Begin with one breath.',
    sad: 'Yesterday has passed. Begin again.',
    idle: 'One thing at a time.',
    happy: 'Steady. Keep going.',
    ecstatic: 'The circle is complete.',
  },
};
const WORDS = {
  cyberpunk: { cleared: (s) => `${s} cleared`, level: 'Level up', perfect: 'Perfect day', quests: 'Quests' },
  bloom:     { cleared: (s) => `${s} in full bloom`, level: 'Your garden grew', perfect: 'Full bloom', quests: 'Petals' },
  pixel:     { cleared: (s) => `${s} cleared!`, level: 'Level up!', perfect: 'Quest complete!', quests: 'Chests' },
  cozy:      { cleared: (s) => `${s}, done`, level: 'Level up', perfect: 'Perfect day', quests: 'Done' },
  deep:      { cleared: (s) => `${s} cleared`, level: 'Deeper dive', perfect: 'Perfect dive', quests: 'Pearls' },
  orbit:     { cleared: (s) => `${s} complete`, level: 'New orbit', perfect: 'Mission complete', quests: 'Moons' },
  zen:       { cleared: (s) => `${s} complete`, level: 'Growth', perfect: 'Perfect day', quests: 'Stones' },
  comic:     { cleared: (s) => `${s} cleared!`, level: 'Level up!', perfect: 'Kapow! Perfect day', quests: 'Power' },
  notebook:  { cleared: (s) => `${s} ✓ done`, level: 'Level up!', perfect: 'Perfect day ✓', quests: 'Done' },
  pet:       { cleared: (s) => `${s} done ♥`, level: 'Mochi grew!', perfect: 'Mochi is overjoyed', quests: 'Hearts' },
};
export const words = (id) => WORDS[id] || WORDS.cyberpunk;

// quest check-box shape per world (drawn in views.js)
export const BOX_SHAPE = {
  cyberpunk: 'square', bloom: 'circle', pixel: 'pixel', cozy: 'hand', deep: 'circle',
  orbit: 'circle', zen: 'circle', comic: 'star', notebook: 'hand', pet: 'heart',
};
// tick particles: text glyphs, or null to use the world's CSS shapes
export const GLYPHS = {
  bloom: ['✿', '❀', '✿', '•'], cozy: ['★', '✓', '•'], orbit: ['✦', '✧', '·'], comic: ['★', '✸', '✦'],
  notebook: ['★', '✓', '✎', '♡'], pet: ['♥', '♡', '♥', '✦'],
};
export const COMIC_WORDS = ['POW!', 'BAM!', 'ZAP!', 'WHAM!', 'BOOM!', 'KRAK!'];

// ---------- state ----------
export function heroState(ctx, s) {
  const left = 1440 - ctx.now.minutes;
  const prog = s.total ? s.done / s.total : 0;
  return { ...s, left, prog, t: ctx.now.minutes / 1440, mood: moodOf(ctx, s, prog), minutes: ctx.now.minutes };
}
function moodOf(ctx, s, prog) {
  if (!s.total) return 'idle';
  if (s.done === s.total) return 'ecstatic';
  if (prog >= .5) return 'happy';
  if (s.done === 0) {
    const y = ctx.history.perDay.get(addDays(ctx.now.day, -1));
    if (y && y.missed.length && !y.shielded) return 'sad';
    if (ctx.now.minutes < 600) return 'sleepy';
  }
  return 'idle';
}
const slotCls = (i, st) => (i < st.done ? ' on' : i < st.done + st.part ? ' part' : '');
function phaseOf(minutes) {
  if (minutes >= 360 && minutes < 1080) return 'day';
  if ((minutes >= 1080 && minutes < 1200) || (minutes >= 300 && minutes < 360)) return 'dusk';
  return 'night';
}
function seeded(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ---------- heroes ----------
const HEROES = {
  bloom(st) {
    const n = st.total;
    const w = n ? Math.max(16, Math.min(44, (2 * Math.PI * 46 / n) * 1.3)) : 0;
    let petals = '';
    for (let i = 0; i < n; i++) petals += `<i class="bl-petal${slotCls(i, st)}" data-slot="${i}" style="--a:${(360 / n * i).toFixed(1)}deg;--w:${w.toFixed(0)}px"></i>`;
    return `<div class="bl-scene">
      <div class="bl-plant">
        <i class="bl-stem"></i><i class="bl-leaf l1"></i><i class="bl-leaf l2"></i>
        <div class="bl-flower">${petals || '<i class="bl-bud"></i>'}
          <div class="bl-center"><b id="dial-min">${st.left}</b><small>min left</small></div>
          <i class="bl-spark s1">✦</i><i class="bl-spark s2">✧</i><i class="bl-spark s3">✦</i>
        </div>
      </div>
      <i class="bl-ground"></i>
    </div>`;
  },

  pixel(st) {
    const n = st.total;
    let chests = '';
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 50 : 6 + 88 * i / (n - 1);
      chests += `<i class="px-chest${slotCls(i, st)}" data-slot="${i}" style="left:${x.toFixed(1)}%"><i class="px-coin"></i></i>`;
    }
    return `<div class="px-scene" id="px-scene" data-phase="${phaseOf(st.minutes)}">
      <div class="px-sky"><i class="px-sun"></i><i class="px-moon"></i><i class="px-stars"></i><i class="px-cloud c1"></i><i class="px-cloud c2"></i></div>
      <i class="px-hills"></i>
      <div class="px-path">${chests}<i class="px-knight"><i class="px-k f1"></i><i class="px-k f2"></i></i></div>
      <i class="px-ground"></i>
      <div class="px-box"><b id="dial-min">${st.left}</b><span>min left</span></div>
    </div>`;
  },

  cozy(st) {
    const r = seeded(17);
    let rain = '', bokeh = '', tally = '';
    for (let i = 0; i < 16; i++) rain += `<i style="left:${(r() * 100).toFixed(1)}%;animation-duration:${(.55 + r() * .5).toFixed(2)}s;animation-delay:-${(r() * 1.2).toFixed(2)}s"></i>`;
    const hues = ['#FFB65C', '#FF7F6E', '#8FC1E3', '#FFE08A', '#C9A0FF'];
    for (let i = 0; i < 10; i++) bokeh += `<i style="left:${(r() * 92).toFixed(1)}%;top:${(40 + r() * 50).toFixed(1)}%;--c:${hues[i % 5]};width:${(8 + r() * 14).toFixed(0)}px;animation-delay:-${(r() * 4).toFixed(2)}s"></i>`;
    for (let i = 0; i < st.total; i++) tally += `<i class="cz-box${slotCls(i, st)}" data-slot="${i}"></i>`;
    return `<div class="cz-scene">
      <div class="cz-window"><div class="cz-city">${bokeh}</div><div class="cz-rain">${rain}</div><i class="cz-bar-v"></i><i class="cz-bar-h"></i></div>
      <i class="cz-lamp"></i>
      <div class="cz-card"><i class="cz-pin"></i><b id="dial-min">${st.left}</b><small>minutes left today</small><div class="cz-tally">${tally}</div></div>
      <div class="cz-mug"><em class="emo" aria-hidden="true">☕</em><i class="cz-steam s1"></i><i class="cz-steam s2"></i><i class="cz-steam s3"></i></div>
    </div>`;
  },

  deep(st) {
    const r = seeded(29);
    let bolts = '', bubbles = '', pearls = '';
    for (let i = 0; i < 8; i++) bolts += `<i class="ds-bolt" style="--a:${i * 45 + 22.5}deg"></i>`;
    for (let i = 0; i < 7; i++) bubbles += `<i class="ds-bub" style="left:${(12 + r() * 76).toFixed(1)}%;--s:${(5 + r() * 9).toFixed(0)}px;animation-duration:${(3 + r() * 3).toFixed(2)}s;animation-delay:-${(r() * 5).toFixed(2)}s"></i>`;
    for (let i = 0; i < st.total; i++) pearls += `<i class="ds-pearl${slotCls(i, st)}" data-slot="${i}"></i>`;
    return `<div class="ds-scene">
      <div class="ds-port">
        <div class="ds-glass">
          <i class="ds-ray r1"></i><i class="ds-ray r2"></i>
          <div class="ds-water"><svg class="ds-wave" viewBox="0 0 400 24" preserveAspectRatio="none" aria-hidden="true"><path d="M0 12 Q25 2 50 12 T100 12 T150 12 T200 12 T250 12 T300 12 T350 12 T400 12 V24 H0Z"/></svg><i class="ds-deep"></i></div>
          <em class="emo ds-fish f1" aria-hidden="true">🐠</em><em class="emo ds-fish f2" aria-hidden="true">🐟</em>
          ${bubbles}
          <div class="ds-read"><b id="dial-min">${st.left}</b><small>minutes left</small></div>
          <i class="ds-shine"></i>
        </div>
        ${bolts}
      </div>
      <div class="ds-pearls">${pearls}</div>
    </div>`;
  },

  orbit(st) {
    const n = st.total;
    const caps = [4, 5, 99];
    const radii = [84, 112, 140];
    const rings = [[], [], []];
    for (let i = 0, k = 0; i < n; i++) { while (rings[k].length >= caps[k]) k++; rings[k].push(i); }
    const ringHtml = rings.map((ids, k) => {
      if (!ids.length && k > 0) return '';
      const moons = ids.map((i, j) => `<i class="or-moon${slotCls(i, st)}" data-slot="${i}" style="--a:${(360 / ids.length * j + k * 23).toFixed(1)}deg"></i>`).join('');
      return `<div class="or-ring r${k}" style="--R:${radii[k]}px"><i class="or-path"></i>${moons}</div>`;
    }).join('');
    return `<div class="or-scene"><div class="or-sys">${ringHtml}
      <div class="or-planet"><i class="or-saturn"></i><div class="or-read"><b id="dial-min">${st.left}</b><small>min left</small></div></div>
      <i class="or-ship" aria-hidden="true">🛰️</i>
    </div></div>`;
  },

  zen(st) {
    const D = 'M104 210.6 A92 92 0 1 1 151.5 206.5';
    let stones = '';
    for (let i = 0; i < st.total; i++) stones += `<i class="zn-stone${slotCls(i, st)}" data-slot="${i}" style="--r:${(i * 47) % 360}deg"></i>`;
    const off = (100 - Math.max(.02, st.prog) * 100).toFixed(2);
    return `<div class="zn-scene">
      <div class="zn-circle">
        <svg class="zn-enso" viewBox="0 0 240 240" aria-hidden="true">
          <defs><filter id="zn-ink" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" result="n"/>
            <feDisplacementMap in="SourceGraphic" in2="n" scale="8" xChannelSelector="R" yChannelSelector="G"/></filter></defs>
          <path class="zn-track" d="${D}"/>
          <path class="zn-brush" data-dash pathLength="100" d="${D}" style="stroke-dashoffset:${off}"/>
          <path class="zn-brush thin" data-dash pathLength="100" d="${D}" style="stroke-dashoffset:${off}"/>
        </svg>
        <div class="zn-read"><b id="dial-min">${st.left}</b><small>minutes remain</small></div>
      </div>
      <div class="zn-stones">${stones}</div>
      <p class="zn-say" id="hero-say">${SAY.zen[st.mood]}</p>
    </div>`;
  },

  comic(st) {
    let cells = '';
    for (let i = 0; i < st.total; i++) cells += `<i class="cm-cell${slotCls(i, st)}" data-slot="${i}"></i>`;
    return `<div class="cm-scene"><div class="cm-panel">
      <i class="cm-lines"></i><i class="cm-dots"></i>
      <div class="cm-burst"><i class="cm-star back"></i><i class="cm-star front"></i>
        <div class="cm-read"><b id="dial-min">${st.left}</b><small>minutes left!</small></div></div>
      <div class="cm-bubble" id="hero-say">${SAY.comic[st.mood]}</div>
      <div class="cm-meter"><span>Power</span><div class="cm-cells">${cells}</div></div>
    </div></div>`;
  },

  notebook(st, ctx) {
    let boxes = '';
    for (let i = 0; i < st.total; i++) boxes += `<i class="nb-box${slotCls(i, st)}" data-slot="${i}"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="nb-sq" d="M3 4 L21 3.2 L20.6 21 L3.6 20.4 Z"/><path class="nb-ck" pathLength="1" d="M6 12.5 L10 17 L19.5 5"/></svg></i>`;
    const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ctx.now.day + 'T00:00:00Z'));
    return `<div class="nb-scene">
      <i class="nb-tape t1"></i><i class="nb-tape t2"></i>
      <p class="nb-date">${date}</p>
      <svg class="nb-under" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path d="M2 8 C40 2 80 12 120 6 S180 4 198 8"/></svg>
      <div class="nb-ring">
        <svg viewBox="0 0 220 150" aria-hidden="true"><path class="nb-circle" pathLength="1" d="M40 78 C30 30 190 22 196 74 C202 128 44 138 30 90 C24 62 70 40 116 42"/></svg>
        <div class="nb-read"><b id="dial-min">${st.left}</b><small>minutes left</small></div>
      </div>
      <div class="nb-track"><span>today:</span>${boxes}</div>
      <i class="nb-doodle d1">★</i><i class="nb-doodle d2">♡</i><i class="nb-doodle d3">↝</i>
    </div>`;
  },

  pet(st, ctx) {
    let hearts = '';
    for (let i = 0; i < st.total; i++) hearts += `<i class="pt-heart${slotCls(i, st)}" data-slot="${i}"></i>`;
    const tier = Math.max(0, RANKS.indexOf(rankFor(ctx.history.level.level)));
    return `<div class="pt-scene">
      <i class="pt-sun"></i><i class="pt-cloud c1"></i><i class="pt-cloud c2"></i><i class="pt-hill"></i>
      <div class="pt-bubble" id="hero-say">${SAY.pet[st.mood]}</div>
      <div class="pt-pet" id="pt-pet" style="--grow:${(.86 + tier * .08).toFixed(2)}">
        <div class="pt-body"><i class="pt-tuft"></i><i class="pt-wing l"></i><i class="pt-wing r"></i>
          <i class="pt-eye l"></i><i class="pt-eye r"></i><i class="pt-cheek l"></i><i class="pt-cheek r"></i><i class="pt-beak"></i><i class="pt-tear"></i></div>
        <i class="pt-feet"></i>
        <i class="pt-z z1">z</i><i class="pt-z z2">Z</i>
        <i class="pt-spark s1">✦</i><i class="pt-spark s2">✦</i><i class="pt-spark s3">✧</i>
      </div>
      <i class="pt-shadow"></i>
      <div class="pt-hearts">${hearts}</div>
      <p class="pt-time"><b id="dial-min">${st.left}</b> minutes left today</p>
    </div>`;
  },
};

/** Hero for a non-cyberpunk world. (Cyberpunk keeps its dial in views.js.) */
export function heroHtml(world, ctx, st) {
  const fn = HEROES[world];
  if (!fn) return '';
  return `<section class="hero hero-${world}" id="hero" data-total="${st.total}" data-mood="${st.mood}"
    style="--prog:${st.prog.toFixed(3)};--fill:${(.12 + .78 * st.prog).toFixed(3)};--t:${st.t.toFixed(4)}"
    role="img" aria-label="${st.left} minutes left today, ${st.done} of ${st.total} quests done">${fn(st, ctx)}</section>`;
}

/** Update a hero in place after a tick or a minute change (keeps its animations running). */
export function patchHero(world, hero, st) {
  hero.style.setProperty('--prog', st.prog.toFixed(3));
  hero.style.setProperty('--fill', (.12 + .78 * st.prog).toFixed(3));
  hero.style.setProperty('--t', st.t.toFixed(4));
  if (hero.dataset.mood !== st.mood) hero.dataset.mood = st.mood;
  hero.setAttribute('aria-label', `${st.left} minutes left today, ${st.done} of ${st.total} quests done`);
  hero.querySelectorAll('[data-slot]').forEach(el => {
    const i = Number(el.dataset.slot);
    el.classList.toggle('on', i < st.done);
    el.classList.toggle('part', i >= st.done && i < st.done + st.part);
  });
  const say = hero.querySelector('#hero-say');
  const lines = SAY[world];
  if (say && lines && say.textContent !== lines[st.mood]) say.textContent = lines[st.mood];
  const off = (100 - Math.max(.02, st.prog) * 100).toFixed(2);
  hero.querySelectorAll('[data-dash]').forEach(p => { p.style.strokeDashoffset = off; });
  const scene = hero.querySelector('#px-scene');
  if (scene) { const ph = phaseOf(st.minutes); if (scene.dataset.phase !== ph) scene.dataset.phase = ph; }
}

/** Extra flourish on the hero when a quest is completed. */
export function heroCelebrate(world, hero, slotIndex) {
  if (!hero || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const slot = hero.querySelector(`[data-slot="${slotIndex}"]`);
  if (slot && !(slot instanceof SVGElement)) {
    slot.animate([{ scale: '1' }, { scale: '1.7', offset: .35 }, { scale: '.9', offset: .7 }, { scale: '1' }], { duration: 650, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
  }
  const hop = (sel, frames, opts) => hero.querySelector(sel)?.animate(frames, opts);
  if (world === 'pet') hop('#pt-pet', [{ translate: '0 0' }, { translate: '0 -34px', offset: .35 }, { translate: '0 0', offset: .7 }, { translate: '0 -10px', offset: .85 }, { translate: '0 0' }], { duration: 760, easing: 'ease-out' });
  if (world === 'pixel') hop('.px-knight', [{ translate: '0 0' }, { translate: '0 -18px', offset: .4 }, { translate: '0 0' }], { duration: 420, easing: 'steps(6)' });
  if (world === 'deep') hop('.ds-water', [{ rotate: '0deg' }, { rotate: '-3deg', offset: .3 }, { rotate: '2deg', offset: .6 }, { rotate: '0deg' }], { duration: 900, easing: 'ease-in-out' });
  if (world === 'bloom') hop('.bl-plant', [{ rotate: '0deg' }, { rotate: '-5deg', offset: .3 }, { rotate: '4deg', offset: .6 }, { rotate: '0deg' }], { duration: 900, easing: 'ease-in-out' });
  if (world === 'comic') hop('.cm-burst', [{ scale: '1' }, { scale: '1.25', offset: .3 }, { scale: '.95', offset: .6 }, { scale: '1' }], { duration: 600, easing: 'cubic-bezier(.2,.9,.3,1.4)' });
  if (world === 'orbit') hop('.or-planet', [{ scale: '1' }, { scale: '1.1', offset: .3 }, { scale: '1' }], { duration: 600, easing: 'ease-out' });
}

// ---------- backdrops ----------
export function worldBackdrop(world) {
  const r = seeded(world.length * 977 + 13);
  const many = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');
  switch (world) {
    case 'bloom':
      return `<i class="wb-sky"></i><i class="wb-cloud c1"></i><i class="wb-cloud c2"></i>
        ${many(10, () => `<i class="wb-petal" style="left:${(r() * 100).toFixed(1)}%;animation-duration:${(9 + r() * 8).toFixed(2)}s;animation-delay:-${(r() * 14).toFixed(2)}s;--sx:${((r() - .5) * 120).toFixed(0)}px;--rot:${(r() * 720).toFixed(0)}deg"></i>`)}
        <i class="wb-hills"></i>`;
    case 'pixel':
      return `<i class="wb-sky"></i>${many(18, () => `<i class="wb-star" style="left:${(r() * 100).toFixed(1)}%;top:${(r() * 55).toFixed(1)}%;animation-delay:-${(r() * 3).toFixed(2)}s"></i>`)}
        <i class="wb-cloud c1"></i><i class="wb-cloud c2"></i><i class="wb-mtn"></i>`;
    case 'cozy':
      return `<i class="wb-wall"></i><i class="wb-glow"></i>${many(12, () => `<i class="wb-mote" style="left:${(r() * 100).toFixed(1)}%;top:${(r() * 100).toFixed(1)}%;animation-duration:${(8 + r() * 8).toFixed(2)}s;animation-delay:-${(r() * 8).toFixed(2)}s"></i>`)}<i class="wb-desk"></i>`;
    case 'deep':
      return `<i class="wb-sea"></i><i class="wb-ray r1"></i><i class="wb-ray r2"></i><i class="wb-ray r3"></i>
        ${many(14, () => `<i class="wb-bub" style="left:${(r() * 100).toFixed(1)}%;--s:${(4 + r() * 12).toFixed(0)}px;animation-duration:${(8 + r() * 9).toFixed(2)}s;animation-delay:-${(r() * 14).toFixed(2)}s"></i>`)}
        <i class="wb-weed w1"></i><i class="wb-weed w2"></i><i class="wb-weed w3"></i>`;
    case 'orbit':
      return `<i class="wb-space"></i><i class="wb-stars s1"></i><i class="wb-stars s2"></i><i class="wb-nebula"></i><i class="wb-shoot"></i>`;
    case 'zen':
      return `<i class="wb-paper"></i><i class="wb-sunzen"></i>${many(8, () => `<i class="wb-sakura" style="left:${(r() * 100).toFixed(1)}%;animation-duration:${(14 + r() * 10).toFixed(2)}s;animation-delay:-${(r() * 20).toFixed(2)}s;--sx:${((r() - .3) * 160).toFixed(0)}px"></i>`)}<i class="wb-mount"></i>`;
    case 'comic':
      return `<i class="wb-halftone"></i><i class="wb-band"></i><i class="wb-zip z1"></i><i class="wb-zip z2"></i>`;
    case 'notebook':
      return `<i class="wb-rules"></i><i class="wb-margin"></i><i class="wb-holes"></i><i class="wb-coffee"></i>`;
    case 'pet':
      return `<i class="wb-sky"></i><i class="wb-cloud c1"></i><i class="wb-cloud c2"></i>${many(7, () => `<i class="wb-heart" style="left:${(r() * 100).toFixed(1)}%;animation-duration:${(10 + r() * 8).toFixed(2)}s;animation-delay:-${(r() * 14).toFixed(2)}s">♥</i>`)}<i class="wb-grass"></i>`;
  }
  return '';
}

// ---------- the pixel knight (drawn with box-shadow pixels) ----------
const KNIGHT = {
  P: '#FF5470', H: '#D3DAE8', V: '#1B1F4B', B: '#3F6FD8', G: '#FFD23F', S: '#EEF2FA', L: '#2B2F66', K: '#4A2E1A',
};
const F1 = [
  '....PPP.....', '...HHHHH....', '..HHHHHHH...', '..HVVVVVH.S.', '..HHHHHHH.S.', '...HHHHH..S.',
  '..BBBBBBB.S.', '.BBBGGBBBGGG', '.BBBBBBBB.G.', '..BBBBBBB...', '..LL...LL...', '..LL...LL...', '.KKK...KKK..',
];
const F2 = F1.slice(0, 10).concat(['...LL.LL....', '...LL.LL....', '..KKK.KKK...']);
function sprite(rows, px) {
  const out = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (KNIGHT[ch]) out.push(`${x * px}px ${y * px}px 0 0 ${KNIGHT[ch]}`); }));
  return out.join(',');
}
let spriteInjected = false;
export function injectWorldCss() {
  if (spriteInjected) return;
  spriteInjected = true;
  const st = document.createElement('style');
  st.textContent = `.px-k.f1{box-shadow:${sprite(F1, 3)}}.px-k.f2{box-shadow:${sprite(F2, 3)}}`;
  document.head.appendChild(st);
}
