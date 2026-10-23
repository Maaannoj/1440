// 1440 · audio. Everything is synthesized live with Web Audio — no music or sound files.
// Each theme has its own track and its own voice for sound effects, in the track's key.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const CHORD = { m: [0, 3, 7], M: [0, 4, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], 7: [0, 4, 7, 10], sus: [0, 5, 7], p5: [0, 3, 5, 7, 10] };

// ---------- the ten tracks ----------
// root: MIDI note of the bass key. prog: [semitones from root, chord] per bar.
// patterns are 16 steps: x = hit, o = octave up (bass), - = rest.
export const TRACKS = {
  redline: { name: 'Red Signal', bpm: 100, root: 45, prog: [[0, 'm7'], [-4, 'M7'], [3, 'M'], [-2, 'M']],
    bass: 'x-xxx-xxx-xxx-xo', arp: { pat: [0, 1, 2, 3, 2, 1, 0, 1], rate: 16, oct: 24, wave: 'square', cut: 2400 },
    pad: { wave: 'sawtooth', cut: 1100 }, kick: 'x---x---x---x---', snare: '----x-------x---', hat: '--x---x---x---x-', sfx: { wave: 'square', oct: 24 } },
  overdrive: { name: 'Hazard Run', bpm: 124, root: 40, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']],
    bass: 'xoxoxoxoxoxoxoxo', arp: { pat: [0, 1, 2, 1, 3, 1, 2, 1], rate: 16, oct: 24, wave: 'square', cut: 3200 },
    pad: null, kick: 'x---x---x---x---', snare: '----x-------x---', hat: 'xxxxxxxxxxxxxxxx', sfx: { wave: 'square', oct: 26 } },
  neon: { name: 'Pink Haze', bpm: 96, root: 42, prog: [[0, 'm7'], [-4, 'M7'], [3, 'M7'], [-2, 'M']],
    bass: 'x--x--x-x--x--x-', arp: { pat: [0, 2, 1, 3, 2, 1], rate: 8, oct: 24, wave: 'triangle', cut: 2600, echo: true },
    pad: { wave: 'sawtooth', cut: 1500 }, kick: 'x-------x-------', snare: '----x-------x---', hat: '--x---x---x---x-', bigSnare: true, sfx: { wave: 'triangle', oct: 29 } },
  terminal: { name: 'Root Access', bpm: 88, root: 38, prog: [[0, 'm'], [0, 'm'], [-4, 'M'], [-2, 'M']],
    bass: 'x-------x--x----', arp: { pat: [0, null, 2, 1, null, 3, null, 2], rate: 16, oct: 36, wave: 'square', cut: 4000, crush: true },
    pad: null, kick: 'x-----x---x-----', snare: '--------x-------', hat: 'x-x-xx-x-x-x-xx-', sfx: { wave: 'square', oct: 31, crush: true } },
  hologram: { name: 'Glass Orbit', bpm: 72, root: 50, gain: 2.6, prog: [[0, 'M7'], [-3, 'm7'], [-7, 'M7'], [-5, 'sus']],
    bass: 'x-------x-------', arp: { pat: [0, 1, 2, 3, 2, 1], rate: 8, oct: 24, wave: 'bell', cut: 6000, echo: true },
    pad: { wave: 'triangle', cut: 2200 }, kick: 'x-------x-------', snare: '----------------', hat: '----x-------x---', softKick: true, sfx: { wave: 'bell', oct: 26 } },
  vapor: { name: 'Mall After Dark', bpm: 84, root: 39, prog: [[0, 'M7'], [-3, 'm7'], [2, 'm7'], [7, '7']],
    bass: 'x---x-x-x---x-x-', arp: { pat: [0, 1, 2, 3], rate: 8, oct: 24, wave: 'triangle', cut: 2200, echo: true },
    pad: { wave: 'triangle', cut: 1800 }, kick: 'x-------x-------', snare: '----x-------x---', hat: '--x---x---x---x-', bigSnare: true, sfx: { wave: 'triangle', oct: 27 } },
  toxic: { name: 'Acid Bloom', bpm: 132, root: 43, prog: [[0, 'm'], [0, 'm'], [-4, 'M'], [-2, 'M']],
    bass: 'xxoxxoxxxoxxoxxx', acid: true, arp: { pat: [0, null, 1, null, 2, null, 1, 3], rate: 16, oct: 24, wave: 'sawtooth', cut: 2000 },
    pad: null, kick: 'x---x---x---x---', snare: '----x-------x---', hat: '--x---x---x---x-', sfx: { wave: 'sawtooth', oct: 24 } },
  arctic: { name: 'Whiteout', bpm: 112, root: 47, prog: [[0, 'm'], [-4, 'M'], [-9, 'M'], [-2, 'M']],
    bass: '--x---x---x---x-', arp: { pat: [0, null, null, 2, null, null, 1, null], rate: 16, oct: 36, wave: 'bell', cut: 7000, echo: true },
    pad: { wave: 'sine', cut: 3000 }, kick: 'x---x---x---x---', snare: '----------------', hat: '--x---x---x---xx', sfx: { wave: 'bell', oct: 31 } },
  ronin: { name: 'Steel Rain', bpm: 86, root: 38, prog: [[0, 'p5'], [0, 'p5'], [-2, 'M'], [-4, 'M']],
    bass: 'x-----x-x-------', arp: { pat: [0, 2, 1, 3, 4, 3, 1, 2], rate: 8, oct: 24, wave: 'pluck', cut: 3500 },
    pad: { wave: 'sawtooth', cut: 700 }, kick: 'x--x--x-x-------', snare: '------------x---', hat: '----------------', taiko: true, sfx: { wave: 'pluck', oct: 26 } },
  chrome: { name: 'Mirror Engine', bpm: 118, root: 37, prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']],
    bass: 'x-xx-x-xx-x-xx-x', arp: { pat: [0, 2, 1, 2, 0, 3, 1, 2], rate: 16, oct: 24, wave: 'square', cut: 2800, echo: true },
    pad: { wave: 'sawtooth', cut: 1300 }, kick: 'x---x---x---x---', snare: '----x-------x--x', hat: 'x-xxx-xxx-xxx-xx', sfx: { wave: 'square', oct: 27 } },
};

export const audio = {
  sfxOn: true,
  musicOn: false,
  look: 'redline',
  ctx: null,
  playing: false,

  // ---------- graph ----------
  ensure() {
    if (this.ctx) return this.ctx;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch {}
    return this.build(new C());
  },
  build(ctx) {
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = .004; comp.release.value = .2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = .9; this.master.connect(comp);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = .8; this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.master);
    // reverb
    this.reverb = ctx.createConvolver();
    // the reverb tail is built just after the first sound, off the tap, so the first tick never stutters
    const makeIR = () => {
      const len = Math.floor(ctx.sampleRate * 2.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      const k = Math.exp(-4.2 / len);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let a = 1; for (let i = 0; i < len; i++) { d[i] = (Math.random() * 2 - 1) * a; a *= k; } }
      this.reverb.buffer = ir;
    };
    if (typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext) makeIR();
    else setTimeout(makeIR, 120);
    this.revOut = ctx.createGain(); this.revOut.gain.value = .32;
    this.reverb.connect(this.revOut); this.revOut.connect(this.master);
    // echo
    this.delay = ctx.createDelay(1.5); this.delayFb = ctx.createGain(); this.delayFb.gain.value = .38;
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
    this.delay.connect(dl); dl.connect(this.delayFb); this.delayFb.connect(this.delay); dl.connect(this.master);
    // shared noise
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
    // bit crusher curve
    this.crushCurve = new Float32Array(256).map((_, i) => Math.round(((i / 255) * 2 - 1) * 6) / 6);
    return ctx;
  },
  /** Call from any tap: browsers only allow sound after the person interacts. */
  wake() { const ctx = this.ctx; if (ctx && ctx.state !== 'running' && ctx.resume && !(ctx instanceof (window.OfflineAudioContext || Object))) ctx.resume().catch(() => {}); },
  unlock() {
    const ctx = this.ensure();
    if (!ctx) return;
    this.wake();
    if (this.musicOn && !this.playing) this.startMusic();
  },
  suspend() { if (this.ctx && this.ctx.state === 'running' && this.ctx.suspend) this.ctx.suspend().catch(() => {}); },
  resume() { if (this.musicOn || this.sfxOn) this.wake(); },

  // ---------- instruments ----------
  env(g, t, a, peak, d, sus = 0.0001) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(sus, 0.0001), t + a + d);
  },
  voice(out, t, freq, dur, { wave = 'square', vol = .1, cut = 3000, q = 1, attack = .005, crush = false, rev = .2, echo = 0, fenv = 0 } = {}) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cut, t); f.Q.value = q;
    if (fenv) { f.frequency.setValueAtTime(cut * fenv, t); f.frequency.exponentialRampToValueAtTime(cut, t + dur * .6); }
    let src = [];
    if (wave === 'bell') {
      const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain();
      c.type = 'sine'; m.type = 'sine'; c.frequency.value = freq; m.frequency.value = freq * 3.5;
      mg.gain.setValueAtTime(freq * 2.2, t); mg.gain.exponentialRampToValueAtTime(freq * .05, t + dur);
      m.connect(mg); mg.connect(c.frequency); src = [c, m]; c.connect(f);
    } else if (wave === 'pluck') {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator();
      o.type = 'triangle'; o2.type = 'sawtooth'; o.frequency.value = freq; o2.frequency.value = freq * 2.003;
      const g2 = ctx.createGain(); g2.gain.value = .25; o2.connect(g2); g2.connect(f); o.connect(f); src = [o, o2];
      f.frequency.setValueAtTime(cut * 2, t); f.frequency.exponentialRampToValueAtTime(300, t + dur);
    } else {
      const o = ctx.createOscillator(); o.type = wave; o.frequency.value = freq; o.connect(f); src = [o];
    }
    let tail = f;
    if (crush) { const ws = ctx.createWaveShaper(); ws.curve = this.crushCurve; f.connect(ws); tail = ws; }
    tail.connect(g); g.connect(out);
    if (rev) { const s = ctx.createGain(); s.gain.value = rev; g.connect(s); s.connect(this.reverb); }
    if (echo) { const s = ctx.createGain(); s.gain.value = echo; g.connect(s); s.connect(this.delay); }
    this.env(g, t, attack, vol, dur);
    for (const s of src) { s.start(t); s.stop(t + attack + dur + .05); }
    return src[0];
  },
  noiseHit(out, t, { vol = .2, hp = 6000, dur = .05, bp = 0, rev = 0 } = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = bp ? 'bandpass' : 'highpass'; f.frequency.value = bp || hp;
    const g = ctx.createGain();
    s.connect(f); f.connect(g); g.connect(out);
    if (rev) { const r = ctx.createGain(); r.gain.value = rev; g.connect(r); r.connect(this.reverb); }
    this.env(g, t, .002, vol, dur);
    s.start(t, Math.random() * .5); s.stop(t + dur + .05);
  },
  kick(out, t, { vol = .9, from = 150, to = 42, dur = .32 } = {}) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + .11);
    o.connect(g); g.connect(out); this.env(g, t, .003, vol, dur); o.start(t); o.stop(t + dur + .05);
  },

  // ---------- sound effects ----------
  play(name, n = 1) {
    if (!this.sfxOn) return;
    const ctx = this.ensure();
    if (!ctx) return;
    this.wake();
    const tr = TRACKS[this.look] || TRACKS.redline;
    const base = tr.root + tr.sfx.oct, w = tr.sfx.wave, crush = !!tr.sfx.crush;
    const t = ctx.currentTime + .005, out = this.sfxBus;
    const v = (semi, at, dur, o = {}) => this.voice(out, t + at, mtof(base + semi), dur, { wave: w, crush, vol: .09, cut: 5000, rev: .15, ...o });
    switch (name) {
      case 'tick': v(7, 0, .07); v(12, .055, .12, { vol: .1 }); this.noiseHit(out, t, { vol: .05, hp: 7000, dur: .03 }); break;
      case 'untick': v(7, 0, .08, { vol: .06 }); v(0, .06, .12, { vol: .05 }); break;
      case 'step': v(3 + (n % 5) * 2, 0, .06, { vol: .06 }); break;
      case 'combo': { const s = Math.min(n, 8) * 2; v(7 + s, 0, .06); v(12 + s, .05, .06); v(19 + s, .1, .14, { vol: .1 }); break; }
      case 'cleared': [0, 4, 7, 12].forEach((s, i) => v(s, i * .07, .22, { vol: .08, rev: .35 })); break;
      case 'level':
        this.kick(out, t, { vol: .5, from: 120, to: 35, dur: .6 });
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => v(s, i * .07, .3, { vol: .08, rev: .4, echo: .2 }));
        this.noiseHit(out, t, { vol: .08, bp: 3000, dur: .8, rev: .4 });
        break;
      case 'perfect':
        [0, 4, 7, 11, 14].forEach((s, i) => this.voice(out, t + i * .04, mtof(base + s - 12), 1.4, { wave: 'triangle', vol: .06, attack: .05, rev: .6, cut: 4000 }));
        [12, 16, 19, 24].forEach((s, i) => v(s, .3 + i * .09, .25, { vol: .07, echo: .25, rev: .3 }));
        break;
      case 'deny': this.voice(out, t, mtof(base - 24), .16, { wave: 'sawtooth', vol: .07, cut: 900 }); this.voice(out, t + .1, mtof(base - 25), .16, { wave: 'sawtooth', vol: .06, cut: 900 }); break;
      case 'switch': {
        const o = this.voice(out, t, mtof(base - 12), .45, { wave: 'sawtooth', vol: .06, cut: 2500, rev: .3 });
        if (o) { o.frequency.setValueAtTime(mtof(base - 12), t); o.frequency.exponentialRampToValueAtTime(mtof(base + 12), t + .4); }
        this.noiseHit(out, t, { vol: .06, bp: 1500, dur: .4 });
        break;
      }
      case 'tab': v(12, 0, .03, { vol: .035, rev: 0 }); break;
      case 'open': this.noiseHit(out, t, { vol: .035, bp: 900, dur: .18 }); v(5, 0, .05, { vol: .03, rev: 0 }); break;
    }
  },

  // ---------- music ----------
  setLook(look) {
    if (look === this.look) return;
    this.look = look;
    if (this.playing) { this.stopMusic(true); setTimeout(() => this.musicOn && this.startMusic(), 420); }
  },
  track() { return TRACKS[this.look] || TRACKS.redline; },
  startMusic() {
    const ctx = this.ensure();
    if (!ctx || this.playing) return;
    this.wake();
    this.playing = true;
    const tr = this.track();
    this.stepDur = 60 / tr.bpm / 4;
    this.delay.delayTime.value = this.stepDur * 3;
    this.step = 0;
    this.nextTime = ctx.currentTime + .08;
    const g = this.musicBus.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(Math.max(g.value, 0.0001), ctx.currentTime);
    g.linearRampToValueAtTime(.42 * (tr.gain || 1), ctx.currentTime + 1.6);
    clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 25);
  },
  stopMusic(quick = false) {
    if (!this.ctx) return;
    this.playing = false;
    clearInterval(this.timer);
    const g = this.musicBus.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + (quick ? .35 : .9));
  },
  schedule() {
    const ctx = this.ctx;
    if (!this.playing || ctx.state !== 'running') return;
    const tr = this.track();
    while (this.nextTime < ctx.currentTime + .14) {
      this.playStep(tr, this.step, this.nextTime);
      this.nextTime += this.stepDur;
      this.step = (this.step + 1) % (16 * tr.prog.length);
    }
  },
  playStep(tr, step, t) {
    const out = this.musicBus;
    const bar = Math.floor(step / 16), s = step % 16;
    const [off, q] = tr.prog[bar];
    const chord = CHORD[q];
    const root = tr.root + off;
    const sd = this.stepDur;
    // drums
    if (tr.kick[s] === 'x') {
      if (tr.taiko) this.kick(out, t, { vol: .8, from: 110, to: 55, dur: .5 });
      else if (tr.softKick) this.kick(out, t, { vol: .3, from: 90, to: 40, dur: .5 });
      else this.kick(out, t, { vol: .75 });
    }
    if (tr.snare[s] === 'x') {
      this.noiseHit(out, t, { vol: .22, bp: 1800, dur: tr.bigSnare ? .3 : .16, rev: tr.bigSnare ? .7 : .25 });
      this.voice(out, t, 190, .08, { wave: 'triangle', vol: .12, cut: 2000, rev: 0 });
    }
    if (tr.hat[s] === 'x') this.noiseHit(out, t, { vol: s % 4 === 2 ? .07 : .04, hp: 8000, dur: s % 4 === 2 ? .09 : .04 });
    // bass
    const b = tr.bass[s];
    if (b === 'x' || b === 'o') {
      const f = mtof(root - 12 + (b === 'o' ? 12 : 0));
      if (tr.acid) this.voice(out, t, f, sd * 1.6, { wave: 'sawtooth', vol: .16, cut: 380 + (s % 8) * 220, q: 11, fenv: 3.2, rev: 0 });
      else this.voice(out, t, f, sd * 1.8, { wave: 'sawtooth', vol: .15, cut: 520, q: 2, fenv: 2.4, rev: 0 });
    }
    // pad: one chord per bar
    if (tr.pad && s === 0) {
      const bd = sd * 16;
      for (const iv of chord.slice(0, 4)) {
        for (const det of [-6, 6]) {
          const o = this.voice(out, t, mtof(root + 12 + iv), bd * .9, { wave: tr.pad.wave, vol: .022, cut: tr.pad.cut, attack: bd * .25, rev: .5 });
          if (o) o.detune.value = det;
        }
      }
    }
    // arp
    const a = tr.arp, every = a.rate === 8 ? 2 : 1;
    if (s % every === 0) {
      const idx = a.pat[(s / every) % a.pat.length];
      if (idx != null) {
        const iv = chord[idx % chord.length] + 12 * Math.floor(idx / chord.length);
        this.voice(out, t, mtof(root + a.oct + iv), sd * every * .9, {
          wave: a.wave, vol: a.wave === 'bell' ? .05 : a.wave === 'pluck' ? .07 : .045, cut: a.cut, crush: a.crush,
          rev: .25, echo: a.echo ? .3 : 0,
        });
      }
    }
  },
};
