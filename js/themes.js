// 1440 · themes. A *world* (worlds.js) is the whole game; Cyberpunk also has ten colour
// *looks*. The root element carries both: data-world="bloom" and data-look="bloom",
// or data-world="cyberpunk" and data-look="neon". Music, backdrop and styles key off data-look.
import { WORLD_IDS, worldBackdrop, injectWorldCss } from './worlds.js';

export const LOOKS = [
  { id: 'redline',   name: 'Redline',   line: 'Black and red. Sharp edges, heartbeat glow.' },
  { id: 'overdrive', name: 'Overdrive', line: 'Hazard yellow and cyan. Radar sweeps.' },
  { id: 'neon',      name: 'Neon',      line: 'Magenta glow over a moving grid floor.' },
  { id: 'terminal',  name: 'Terminal',  line: 'Green phosphor, falling code, old-monitor flicker.' },
  { id: 'hologram',  name: 'Hologram',  line: 'Iridescent rings drifting over deep navy.' },
  { id: 'vapor',     name: 'Vapor',     line: 'Pastel sunset, striped sun, endless grid.' },
  { id: 'toxic',     name: 'Toxic',     line: 'Acid green and violet. Bubbling hazard.' },
  { id: 'arctic',    name: 'Arctic',    line: 'Bright lab white, signal orange, falling snow.' },
  { id: 'ronin',     name: 'Ronin',     line: 'Gold on black under a blood moon and rain.' },
  { id: 'chrome',    name: 'Chrome',    line: 'Liquid silver, electric blue, light sweeps.' },
];
export const DEFAULT_LOOK = 'redline';

const KEY = '1440:device';
const DEFAULTS = { v: 2, world: 'cyberpunk', look: DEFAULT_LOOK, sound: true, music: false, calm: false };
export function readDevicePrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (saved.v !== 2) { saved.v = 2; saved.sound = true; }   // sound effects are on by default from v2
    return { ...DEFAULTS, ...saved };
  } catch { return { ...DEFAULTS }; }
}
export function writeDevicePrefs(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

/** The id that styles, backdrop and music key off. */
export function lookId(p) {
  const world = WORLD_IDS.includes(p.world) ? p.world : 'cyberpunk';
  if (world !== 'cyberpunk') return world;
  return LOOKS.some(l => l.id === p.look) ? p.look : DEFAULT_LOOK;
}
export function applyDevicePrefs(p) {
  const root = document.documentElement;
  injectWorldCss();
  root.dataset.world = WORLD_IDS.includes(p.world) ? p.world : 'cyberpunk';
  root.dataset.look = lookId(p);
  root.dataset.calm = p.calm ? '1' : '0';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#000000';
}

// Each backdrop uses only transform and opacity animations, so the phone's GPU
// does all the moving and scrolling stays smooth.
export function buildBackdrop(el, look) {
  if (el.dataset.built === look) return;
  el.dataset.built = look;
  if (WORLD_IDS.includes(look)) { el.innerHTML = worldBackdrop(look); return; }
  if (look === 'redline') {
    el.innerHTML = `
      <div class="bk-glow"></div>
      <div class="bk-lines"></div>
      <div class="bk-slice s1"></div><div class="bk-slice s2"></div><div class="bk-slice s3"></div>
      <div class="bk-scan"></div>`;
  } else if (look === 'overdrive') {
    el.innerHTML = `<div class="bk-grid"></div><div class="bk-glow"></div><div class="bk-scan"></div>`;
  } else if (look === 'neon') {
    el.innerHTML = `
      <div class="bk-orb o1"></div><div class="bk-orb o2"></div>
      <div class="bk-floor"><div class="bk-floor-v"></div><div class="bk-floor-h"><i></i></div></div>`;
  } else if (look === 'terminal') {
    let cols = '';
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const chars = '0123456789ABCDEF';
    for (let c = 0; c < 20; c++) {
      let s = '';
      for (let k = 0; k < 60; k++) s += chars[Math.floor(r() * 16)];
      cols += `<div class="bk-rain" style="left:${(c * 5.2).toFixed(1)}%"><span style="animation-duration:${(6 + r() * 8).toFixed(2)}s;animation-delay:-${(r() * 8).toFixed(2)}s">${s}${s}</span></div>`;
    }
    el.innerHTML = `<div class="bk-glow"></div>${cols}`;
  } else if (look === 'hologram') {
    let stars = '';
    let seed = 11;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      stars += `<i class="bk-star" style="left:${(r() * 100).toFixed(1)}%;top:${(r() * 100).toFixed(1)}%;animation-delay:-${(r() * 4).toFixed(2)}s;animation-duration:${(2.5 + r() * 3).toFixed(2)}s"></i>`;
    }
    el.innerHTML = `<div class="bk-ring r1"></div><div class="bk-ring r2"></div><div class="bk-glow"></div>${stars}`;
  } else if (look === 'vapor') {
    el.innerHTML = `
      <div class="bk-sky"></div><div class="bk-sun"></div>
      <div class="bk-floor"><div class="bk-floor-v"></div><div class="bk-floor-h"><i></i></div></div>`;
  } else if (look === 'toxic') {
    let bubbles = '';
    let seed = 3;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 18; i++) {
      const size = 6 + r() * 22;
      bubbles += `<i class="bk-bubble" style="left:${(r() * 100).toFixed(1)}%;width:${size.toFixed(0)}px;height:${size.toFixed(0)}px;animation-duration:${(7 + r() * 9).toFixed(2)}s;animation-delay:-${(r() * 14).toFixed(2)}s"></i>`;
    }
    el.innerHTML = `<div class="bk-glow"></div><div class="bk-hazard">☣</div>${bubbles}`;
  } else if (look === 'arctic') {
    let flakes = '';
    let seed = 5;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 34; i++) {
      const size = 2 + r() * 4;
      flakes += `<i class="bk-flake" style="left:${(r() * 100).toFixed(1)}%;width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;animation-duration:${(9 + r() * 10).toFixed(2)}s;animation-delay:-${(r() * 18).toFixed(2)}s;--dx:${((r() - .5) * 80).toFixed(0)}px"></i>`;
    }
    el.innerHTML = `<div class="bk-grid"></div><div class="bk-glow"></div>${flakes}`;
  } else if (look === 'ronin') {
    let rain = '';
    let seed = 9;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      rain += `<i class="bk-drop" style="left:${(r() * 120 - 10).toFixed(1)}%;height:${(40 + r() * 70).toFixed(0)}px;animation-duration:${(.7 + r() * .6).toFixed(2)}s;animation-delay:-${(r() * 2).toFixed(2)}s;opacity:${(.15 + r() * .35).toFixed(2)}"></i>`;
    }
    el.innerHTML = `<div class="bk-moon"></div><div class="bk-glow"></div>${rain}`;
  } else if (look === 'chrome') {
    el.innerHTML = `<div class="bk-mesh"></div><div class="bk-glow"></div><div class="bk-sheen"></div><div class="bk-sheen s2"></div>`;
  }
}

/** Short glitch wipe used when switching looks. */
export function lookTransition(swap) {
  const fx = document.createElement('div');
  fx.className = 'look-wipe';
  fx.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
  document.body.appendChild(fx);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const bars = [...fx.children];
  const dur = reduce ? 1 : 520;
  bars.forEach((b, i) => b.animate([
    { transform: 'scaleX(0)', transformOrigin: i % 2 ? 'right' : 'left' },
    { transform: 'scaleX(1)', offset: .45 },
    { transform: 'scaleX(1)', offset: .55 },
    { transform: 'scaleX(0)', transformOrigin: i % 2 ? 'left' : 'right' },
  ], { duration: dur, delay: i * 18, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'both' }));
  setTimeout(swap, reduce ? 0 : dur * 0.5);
  setTimeout(() => fx.remove(), dur + 140);
}
