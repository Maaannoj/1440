// 1440 · reward effects: particles, floating XP, overlays, sound, haptics.
// Every animation here moves only transform and opacity (GPU-composited),
// and every element removes itself when its animation ends.

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const look = () => document.documentElement.dataset.look || 'redline';
let layer = null;
function fxLayer() {
  if (!layer) { layer = document.createElement('div'); layer.className = 'fx'; document.body.appendChild(layer); }
  return layer;
}

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
export function reseed(n) { seed = n; }

// ---------- particles ----------
export function burst(x, y, { count = 20, spread = 1 } = {}) {
  if (reduce()) return;
  const L = fxLayer();
  const lk = look();
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = 'pt';
    if (lk === 'terminal') p.textContent = rnd() < .5 ? '1' : '0';
    if (i % 3 === 0) p.classList.add('pt-alt');
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    frag.appendChild(p);
    const a = rnd() * Math.PI * 2;
    const d = (44 + rnd() * 80) * spread;
    const rot = (rnd() - .5) * 540;
    p.animate([
      { transform: `translate(-50%,-50%) rotate(${a}rad) scale(1)`, opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) rotate(${rot}deg) scale(.2)`, opacity: 0 },
    ], { duration: 560 + rnd() * 340, easing: 'cubic-bezier(.12,.8,.3,1)', fill: 'forwards' }).onfinish = () => p.remove();
  }
  L.appendChild(frag);
  // shock ring
  const ring = document.createElement('i');
  ring.className = 'pt-ring';
  ring.style.left = x + 'px'; ring.style.top = y + 'px';
  L.appendChild(ring);
  ring.animate([
    { transform: 'translate(-50%,-50%) scale(.2)', opacity: .9 },
    { transform: 'translate(-50%,-50%) scale(2.6)', opacity: 0 },
  ], { duration: 520, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' }).onfinish = () => ring.remove();
}

export function floatText(x, y, text, cls = '') {
  const f = document.createElement('span');
  f.className = 'flt ' + cls;
  f.textContent = text;
  f.style.left = x + 'px'; f.style.top = y + 'px';
  fxLayer().appendChild(f);
  f.animate([
    { transform: 'translate(-50%, 0) scale(.5)', opacity: 0 },
    { transform: 'translate(-50%, -16px) scale(1.18)', opacity: 1, offset: .18 },
    { transform: 'translate(-50%, -24px) scale(1)', opacity: 1, offset: .4 },
    { transform: 'translate(-50%, -64px) scale(.96)', opacity: 0 },
  ], { duration: reduce() ? 900 : 1150, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).onfinish = () => f.remove();
}

export function pop(el, kind = 'spin') {
  if (!el || reduce()) return;
  const frames = kind === 'spin'
    ? [{ transform: 'scale(1) rotate(0)' }, { transform: 'scale(1.75) rotate(-20deg) translateY(-6px)', offset: .3 },
       { transform: 'scale(.88) rotate(372deg)', offset: .75 }, { transform: 'scale(1) rotate(360deg)' }]
    : [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' },
       { transform: 'translateX(-4px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }];
  el.animate(frames, { duration: kind === 'spin' ? 720 : 380, easing: kind === 'spin' ? 'cubic-bezier(.2,.9,.3,1.15)' : 'ease-out' });
}

export function flash(el) {
  if (!el || reduce()) return;
  const f = document.createElement('i');
  f.className = 'row-flash';
  el.appendChild(f);
  f.animate([{ opacity: .85 }, { opacity: 0 }], { duration: 520, easing: 'ease-out', fill: 'forwards' }).onfinish = () => f.remove();
}

export function badge(el, text) {
  if (!el) return;
  el.textContent = text;
  el.animate([
    { opacity: 0, transform: 'scale(.3) rotate(-10deg)' },
    { opacity: 1, transform: 'scale(1.3) rotate(4deg)', offset: .12 },
    { opacity: 1, transform: 'scale(1) rotate(0)', offset: .22 },
    { opacity: 1, transform: 'scale(1)', offset: .85 },
    { opacity: 0, transform: 'translateY(-8px)' },
  ], { duration: 2400, easing: 'cubic-bezier(.2,.9,.3,1.3)', fill: 'forwards' });
}

// ---------- big moments (queued so they never overlap) ----------
const queue = [];
let showing = false;
export function moment(opts) { queue.push(opts); if (!showing) next(); }
function next() {
  const o = queue.shift();
  if (!o) { showing = false; return; }
  showing = true;
  const ov = document.createElement('div');
  ov.className = 'ov ov-' + o.kind;
  ov.setAttribute('role', 'status');
  ov.innerHTML = `<div class="ov-bg"></div><div class="ov-rays"></div>
    <div class="ov-box">
      <div class="ov-k glitch" data-text="${o.title}">${o.title}</div>
      <div class="ov-n">${o.big}</div>
      ${o.sub ? `<div class="ov-sub">${o.sub}</div>` : ''}
      ${o.foot ? `<div class="ov-foot">${o.foot}</div>` : ''}
    </div>`;
  document.body.appendChild(ov);
  const dur = reduce() ? 1600 : 2600;
  const a = ov.animate([
    { opacity: 0 }, { opacity: 1, offset: .06 }, { opacity: 1, offset: .84 }, { opacity: 0 },
  ], { duration: dur, easing: 'linear', fill: 'forwards' });
  if (!reduce()) {
    ov.querySelector('.ov-box').animate([
      { transform: 'scale(2.3)', opacity: 0 }, { transform: 'scale(.93)', opacity: 1, offset: .12 },
      { transform: 'scale(1)', offset: .2 }, { transform: 'scale(1.05)' },
    ], { duration: dur, easing: 'cubic-bezier(.2,.9,.3,1.1)', fill: 'forwards' });
    ov.querySelector('.ov-rays').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(60deg)' }], { duration: dur, fill: 'forwards' });
    const r = ov.getBoundingClientRect();
    setTimeout(() => burst(r.width / 2, r.height * .44, { count: 34, spread: 2.2 }), dur * .1);
  }
  const done = () => { ov.remove(); next(); };
  a.onfinish = done;
  ov.addEventListener('click', () => { a.finish(); }, { once: true });
}

export function stamp(text) {
  if (reduce()) return;
  const s = document.createElement('div');
  s.className = 'stamp';
  s.innerHTML = `<span class="glitch" data-text="${text}">${text}</span>`;
  fxLayer().appendChild(s);
  s.animate([
    { transform: 'translate(-50%,-50%) scale(1.8) rotate(-4deg)', opacity: 0 },
    { transform: 'translate(-50%,-50%) scale(.95) rotate(-4deg)', opacity: 1, offset: .14 },
    { transform: 'translate(-50%,-50%) scale(1) rotate(-4deg)', opacity: 1, offset: .78 },
    { transform: 'translate(-50%,-60%) scale(1) rotate(-4deg)', opacity: 0 },
  ], { duration: 1500, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'forwards' }).onfinish = () => s.remove();
}

// ---------- haptics: on iOS 18+, toggling a switch input gives a light tap ----------
let hapticEl = null;
export function haptic(times = 1) {
  if (!hapticEl) hapticEl = document.getElementById('haptic');
  if (!hapticEl) return;
  for (let i = 0; i < times; i++) setTimeout(() => { try { hapticEl.click(); } catch {} }, i * 90);
}
