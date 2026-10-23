// 1440 · themes ("looks"). Colours and fonts live in styles.css under [data-look];
// this file names them, builds each look's animated backdrop, and stores the choice.

export const LOOKS = [
  { id: 'redline',   name: 'Redline',   line: 'Black and red. Sharp edges, heartbeat glow.' },
  { id: 'overdrive', name: 'Overdrive', line: 'Hazard yellow and cyan. Radar sweeps.' },
  { id: 'neon',      name: 'Neon',      line: 'Magenta glow over a moving grid floor.' },
  { id: 'terminal',  name: 'Terminal',  line: 'Green phosphor, falling code, old-monitor flicker.' },
  { id: 'hologram',  name: 'Hologram',  line: 'Iridescent rings drifting over deep navy.' },
];
export const DEFAULT_LOOK = 'redline';

const KEY = '1440:device';
export function readDevicePrefs() {
  try { return { look: DEFAULT_LOOK, sound: false, calm: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; }
  catch { return { look: DEFAULT_LOOK, sound: false, calm: false }; }
}
export function writeDevicePrefs(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

export function applyDevicePrefs(p) {
  const root = document.documentElement;
  root.dataset.look = LOOKS.some(l => l.id === p.look) ? p.look : DEFAULT_LOOK;
  root.dataset.calm = p.calm ? '1' : '0';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#000000';
}

// Each backdrop uses only transform and opacity animations, so the phone's GPU
// does all the moving and scrolling stays smooth.
export function buildBackdrop(el, look) {
  if (el.dataset.built === look) return;
  el.dataset.built = look;
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
