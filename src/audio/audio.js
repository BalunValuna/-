/**
 * Procedural audio of The Long Road, carried over unchanged from the previous version at the
 * player's request (sound design is out of scope for this rewrite): engine worklet, menu music,
 * radio stations, one-shot effects and ambience are all synthesised with WebAudio.
 * Only identifiers were renamed; the signal chains and parameters are the original ones.
 */
/* eslint-disable */
import { Vector3 } from 'three';

var ENGINE_WORKLET_SOURCE = `
class Reso {
constructor(){ this.x1=0; this.x2=0; this.y1=0; this.y2=0; this.set(100, 5, 44100); }
set(f, q, sr){
  const w = 2*Math.PI*Math.min(f, sr*0.45)/sr, a = Math.sin(w)/(2*q), c = Math.cos(w);
  const a0 = 1 + a;
  this.b0 = a/a0; this.b1 = 0; this.b2 = -a/a0; this.a1 = -2*c/a0; this.a2 = (1-a)/a0;
}
run(x){
  const y = this.b0*x + this.b1*this.x1 + this.b2*this.x2 - this.a1*this.y1 - this.a2*this.y2;
  this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
  return y;
}
}
class EngineProc extends AudioWorkletProcessor {
constructor(){
  super();
  this.p = { rpm: 0, throttle: 0, load: 0, running: 0, crank: 0, crankStrength: 1, misfire: 0, damage: 0, cyl: 8 };
  this.s = { rpm: 0, throttle: 0, run: 0, crank: 0 };
  this.phase = 0; this.lastQ = 0; this.env = 0; this.envN = 0; this.amp = 0;
  this.r1 = new Reso(); this.r2 = new Reso(); this.r3 = new Reso(); this.r4 = new Reso();
  this.lp = 0; this.lp2 = 0; this.hp = 0; this.noiseLp = 0;
  this.crankPh = 0; this.whine = 0; this.tick = 0; this.knock = 0;
  // cross-plane V8: slightly uneven pulses give the burble
  this.cylAmp = [1, 0.9, 1.07, 0.95, 1.03, 0.91, 1.08, 0.96];
  this.port.onmessage = (e) => Object.assign(this.p, e.data);
}
process(inputs, outputs){
  const out = outputs[0][0];
  if (!out) return true;
  const sr = sampleRate, p = this.p, s = this.s;
  const k = 1 - Math.exp(-1 / (sr * 0.03));
  const kf = 1 - Math.exp(-1 / (sr * 0.004));
  for (let i = 0; i < out.length; i++) {
    s.rpm += (p.rpm - s.rpm) * kf;
    s.throttle += (p.throttle - s.throttle) * k;
    s.run += ((p.running ? 1 : 0) - s.run) * k * 0.5;
    s.crank += ((p.crank ? 1 : 0) - s.crank) * k;
    let y = 0;
    const rpm = Math.max(s.rpm, 1);
    if (i === 0) {
      const f0 = 38 + rpm * 0.012;
      this.r1.set(f0 * 2.1, 3.5, sr);
      this.r2.set(f0 * 5.3 + s.throttle * 90, 4, sr);
      this.r3.set(760 + rpm * 0.05, 2.2, sr);
      this.r4.set(95 + rpm * 0.018, 6, sr);
    }
    // --- combustion
    if (s.run > 0.001) {
      const cyc = rpm / 120;
      this.phase += cyc / sr;
      if (this.phase >= 1) this.phase -= 1;
      const n = p.cyl || 8;
      const q = Math.floor(this.phase * n);
      if (q !== this.lastQ) {
        this.lastQ = q;
        const mis = Math.random() < p.misfire * 0.35;
        const a = (0.55 + 0.65 * s.throttle + 0.2 * p.load) * this.cylAmp[q % 8] * (0.85 + Math.random() * 0.3);
        this.env = mis ? 0.04 : a;
        this.envN = mis ? 0 : a;
        if (mis && Math.random() < 0.3) this.env = 1.8;
        if (p.damage > 0.2 && Math.random() < p.damage * 0.5) this.knock = 0.6 * p.damage;
      }
      const decay = Math.exp(-1 / (sr * (0.0022 + 0.0035 * (1 - s.throttle) + 600 / (rpm * 1000))));
      this.env *= decay;
      this.envN *= Math.exp(-1 / (sr * 0.006));
      const imp = this.env;
      const noise = (Math.random() * 2 - 1);
      this.noiseLp += (noise - this.noiseLp) * (0.12 + s.throttle * 0.3);
      const exc = imp * (0.7 + 0.3 * noise) + this.envN * this.noiseLp * 0.6;
      y += this.r1.run(exc) * 2.2 + this.r2.run(exc) * 1.2 + this.r3.run(exc) * 0.5 * (0.3 + s.throttle) + this.r4.run(exc) * 2.6;
      // intake hiss and valvetrain tick
      y += noise * 0.012 * (s.throttle * 1.5 + rpm / 7000);
      this.tick += rpm / 60 / sr;
      if (this.tick >= 1) { this.tick -= 1; this.knock = Math.max(this.knock, 0.02 + rpm / 60000); }
      this.knock *= Math.exp(-1 / (sr * 0.0015));
      y += this.knock * (Math.random() * 2 - 1);
      y *= s.run;
    }
    // --- starter motor
    if (s.crank > 0.001) {
      const cs = Math.max(0.15, p.crankStrength);
      this.crankPh += (4.2 * cs) / sr;
      if (this.crankPh >= 1) this.crankPh -= 1;
      const comp = Math.pow(Math.sin(this.crankPh * Math.PI), 6);
      this.whine += (180 + 120 * cs - comp * 60) / sr;
      if (this.whine >= 1) this.whine -= 1;
      const w = (this.whine * 2 - 1) * 0.16 + Math.sin(this.whine * Math.PI * 4) * 0.08;
      const chug = comp * 0.5 * (Math.random() * 0.4 + 0.8);
      y += (w * (0.4 + 0.6 * (1 - comp)) + this.r4.run(chug * 0.4) * 2 + chug * 0.25 * (Math.random() * 2 - 1)) * s.crank * cs;
    }
    // soft saturation for growl
    const drive = 1.4 + s.throttle * 2.2;
    y = Math.tanh(y * drive) / Math.tanh(drive);
    this.hp += (y - this.hp) * 0.0035;
    out[i] = (y - this.hp) * 0.55;
  }
  return true;
}
}
registerProcessor('engine-proc', EngineProc);
`;
var midiToHz = (B) => 440 * Math.pow(2, (B - 69) / 12),
  Instruments = class {
    constructor(A, I) {
      this.ctx = A;
      this.noise = I;
    }
    ctx;
    noise;
    ks = new Map();
    g(A, I, g, C, Q, i = 0, E = 0) {
      let t = this.ctx.createGain();
      return (
        t.gain.setValueAtTime(1e-4, I),
        t.gain.linearRampToValueAtTime(Q, I + g),
        i > 0
          ? (t.gain.setTargetAtTime(Q * 0.7, I + g, C * 0.3),
            t.gain.setValueAtTime(Q * 0.7, I + g + i),
            t.gain.exponentialRampToValueAtTime(1e-4, I + g + i + E))
          : t.gain.exponentialRampToValueAtTime(1e-4, I + g + C),
        t.connect(A),
        t
      );
    }
    osc(A, I, g, C, Q, i = 0) {
      let E = this.ctx.createOscillator();
      return (
        (E.type = A),
        (E.frequency.value = I),
        (E.detune.value = i),
        E.connect(Q),
        E.start(g),
        E.stop(g + C + 0.1),
        E
      );
    }
    pad(A, I, g, C, Q = 0.05, i = 1400) {
      let E = this.ctx.createBiquadFilter();
      ((E.type = "lowpass"),
        E.frequency.setValueAtTime(i * 0.6, I),
        E.frequency.linearRampToValueAtTime(i, I + C * 0.5),
        E.frequency.linearRampToValueAtTime(i * 0.7, I + C));
      let t = this.g(A, I, C * 0.25, C, Q, C * 0.55, C * 0.35);
      E.connect(t);
      for (let o of g) for (let e of [-7, 7]) this.osc("sawtooth", midiToHz(o), I, C * 1.2, E, e);
    }
    arp(A, I, g, C, Q = 0.04, i = "square") {
      let E = this.ctx.createBiquadFilter();
      ((E.type = "lowpass"),
        E.frequency.setValueAtTime(3200, I),
        E.frequency.exponentialRampToValueAtTime(600, I + C));
      let t = this.g(A, I, 0.005, C, Q);
      (E.connect(t), this.osc(i, midiToHz(g), I, C, E));
    }
    bass(A, I, g, C, Q = 0.18) {
      let i = this.ctx.createBiquadFilter();
      ((i.type = "lowpass"), (i.frequency.value = 700));
      let E = this.g(A, I, 0.01, C, Q);
      (i.connect(E), this.osc("triangle", midiToHz(g), I, C, i), this.osc("sine", midiToHz(g - 12), I, C, E));
    }
    upright(A, I, g, C, Q = 0.22) {
      let i = this.ctx.createBiquadFilter();
      ((i.type = "lowpass"),
        i.frequency.setValueAtTime(1200, I),
        i.frequency.exponentialRampToValueAtTime(300, I + 0.3));
      let E = this.g(A, I, 0.008, C * 1.2, Q);
      (i.connect(E), this.osc("triangle", midiToHz(g), I, C * 1.2, i));
    }
    epiano(A, I, g, C, Q = 0.05) {
      for (let i of g) {
        let E = this.ctx.createOscillator(),
          t = this.ctx.createOscillator(),
          o = this.ctx.createGain();
        ((E.frequency.value = midiToHz(i)),
          (t.frequency.value = midiToHz(i) * 1),
          o.gain.setValueAtTime(midiToHz(i) * 2.2, I),
          o.gain.exponentialRampToValueAtTime(midiToHz(i) * 0.2, I + 0.6),
          t.connect(o).connect(E.frequency));
        let e = this.g(A, I, 0.004, C, Q);
        (E.connect(e), E.start(I), t.start(I), E.stop(I + C + 0.1), t.stop(I + C + 0.1));
      }
    }
    pluck(A, I, g, C = 0.25, Q = 1) {
      let i = this.ks.get(g);
      if (!i) {
        let o = this.ctx.sampleRate,
          e = Math.floor(o * 2.4);
        i = this.ctx.createBuffer(1, e, o);
        let s = i.getChannelData(0),
          a = Math.max(2, Math.round(o / midiToHz(g))),
          n = new Float32Array(a);
        for (let D = 0; D < a; D++) n[D] = (Math.random() * 2 - 1) * (0.6 + 0.4 * Math.sin((D / a) * Math.PI));
        let r = 0,
          c = 0,
          h = 0.996 - Math.max(0, (g - 60) * 4e-4);
        for (let D = 0; D < e; D++) {
          let l = n[r],
            U = n[(r + 1) % a],
            S = (l + U) * 0.5 * h;
          ((n[r] = S), (s[D] = l * 0.8 + c * 0.2), (c = l), (r = (r + 1) % a));
        }
        this.ks.set(g, i);
      }
      let E = this.ctx.createBufferSource();
      ((E.buffer = i), (E.playbackRate.value = Q));
      let t = this.ctx.createGain();
      ((t.gain.value = C), E.connect(t).connect(A), E.start(I), E.stop(I + 2.4));
    }
    noiseHit(A, I, g, C, Q, i, E) {
      let t = this.ctx.createBufferSource();
      t.buffer = this.noise;
      let o = this.ctx.createBiquadFilter();
      ((o.type = g), (o.frequency.value = C), (o.Q.value = Q));
      let e = this.g(A, I, 0.002, i, E);
      (t.connect(o).connect(e), t.start(I, Math.random()), t.stop(I + i + 0.05));
    }
    kick(A, I, g = 0.5) {
      let C = this.ctx.createOscillator();
      (C.frequency.setValueAtTime(130, I), C.frequency.exponentialRampToValueAtTime(45, I + 0.12));
      let Q = this.g(A, I, 0.002, 0.28, g);
      (C.connect(Q), C.start(I), C.stop(I + 0.35));
    }
    snare(A, I, g = 0.18) {
      this.noiseHit(A, I, "bandpass", 1900, 0.8, 0.16, g);
      let C = this.ctx.createOscillator();
      C.frequency.value = 190;
      let Q = this.g(A, I, 0.002, 0.08, g * 0.6);
      (C.connect(Q), C.start(I), C.stop(I + 0.12));
    }
    hat(A, I, g = 0.06, C = !1) {
      this.noiseHit(A, I, "highpass", 7500, 0.5, C ? 0.2 : 0.035, g);
    }
    brush(A, I, g = 0.08) {
      this.noiseHit(A, I, "bandpass", 3500, 0.6, 0.18, g);
    }
    ride(A, I, g = 0.05) {
      this.noiseHit(A, I, "bandpass", 6e3, 3, 0.5, g);
      for (let C of [1, 1.47, 2.11]) {
        let Q = this.ctx.createOscillator();
        Q.frequency.value = 3200 * C;
        let i = this.g(A, I, 0.001, 0.4, g * 0.08);
        (Q.connect(i), Q.start(I), Q.stop(I + 0.5));
      }
    }
    beep(A, I, g, C, Q = 0.1) {
      let i = this.g(A, I, 0.005, C, Q);
      this.osc("sine", g, I, C, i);
    }
    voice(A, I, g, C, Q = 0.12) {
      let i = this.ctx.createOscillator();
      ((i.type = "sawtooth"), i.frequency.setValueAtTime(g, I), i.frequency.linearRampToValueAtTime(g * 0.92, I + C));
      let E = this.ctx.createBiquadFilter();
      ((E.type = "bandpass"), (E.frequency.value = 650 + Math.random() * 300), (E.Q.value = 8));
      let t = this.ctx.createBiquadFilter();
      ((t.type = "bandpass"), (t.frequency.value = 1100 + Math.random() * 900), (t.Q.value = 10));
      let o = this.g(A, I, 0.02, C, Q);
      (i.connect(E).connect(o), i.connect(t).connect(o), i.start(I), i.stop(I + C + 0.1));
    }
  },
  CHORDS = {
    Am: [57, 60, 64],
    F: [53, 57, 60],
    C: [48, 52, 55],
    G: [55, 59, 62],
    Dm: [50, 53, 57],
    E: [52, 56, 59],
    Em: [52, 55, 59],
    D: [50, 54, 57],
  };
function radioStations() {
  return [
    {
      freq: 89.3,
      name: "Пустыня FM",
      bpm: 104,
      beats: 4,
      bar: (B, A, I, g, C, Q) => {
        let i = Math.floor(g / 8) % 3,
          t = (i === 1 ? [CHORDS.Am, CHORDS.F, CHORDS.Dm, CHORDS.E] : [CHORDS.Am, CHORDS.F, CHORDS.C, CHORDS.G])[g % 4];
        B.pad(
          A,
          I,
          t.map((e) => e + 12),
          C * 4,
          0.022,
          1600,
        );
        let o = i !== 2 || g % 8 > 3;
        for (let e = 0; e < 16; e++) {
          let s = I + (e * C) / 4;
          ((i !== 2 || e % 2 === 0) &&
            B.arp(A, s, t[(e + (g % 2)) % 3] + (e % 8 < 4 ? 24 : 12) + (Q() < 0.08 ? 7 : 0), C / 3, 0.022),
            o &&
              ((e % 8 === 0 || (e === 10 && Q() < 0.5)) && B.kick(A, s, 0.4),
              e % 8 === 4 && B.snare(A, s, 0.13),
              e % 2 === 0 && B.hat(A, s, 0.035, e % 8 === 6)),
            e % 2 === 0 && B.bass(A, s, t[0] - 12, C / 2.2, 0.13));
        }
      },
    },
    {
      freq: 94.2,
      name: "Радио \xABДорожник\xBB",
      bpm: 96,
      beats: 4,
      bar: (B, A, I, g, C, Q) => {
        let i = Math.floor(g / 8) % 2,
          t = (i ? [CHORDS.Em, CHORDS.C, CHORDS.G, CHORDS.D] : [CHORDS.G, CHORDS.C, CHORDS.D, CHORDS.G])[g % 4],
          o = [t[0] - 12, t[0], t[1], t[2], t[0] + 12, t[1] + 12];
        for (let e of [0, 2, 2.5, 3])
          o.forEach((s, a) => B.pluck(A, I + e * C + a * 0.012, s, e === 0 ? 0.13 : 0.09));
        for (let e = 0; e < 4; e++) B.upright(A, I + e * C, (e % 2 ? t[2] : t[0]) - 24, C * 0.9, 0.2);
        if ((B.brush(A, I + C, 0.07), B.brush(A, I + C * 3, 0.07), i && Q() < 0.7)) {
          let e = [67, 69, 71, 74, 76, 79];
          for (let s = 0; s < 4; s++) Q() < 0.6 && B.pluck(A, I + s * C + C / 2, e[Math.floor(Q() * e.length)], 0.12);
        }
      },
    },
    {
      freq: 99.7,
      name: "Джаз 99.7",
      bpm: 118,
      beats: 4,
      bar: (B, A, I, g, C, Q) => {
        let E = [
            [48, 51, 55, 58],
            [53, 57, 60, 63],
            [46, 50, 53, 57],
            [55, 59, 62, 65],
          ][g % 4],
          t = C * 0.66;
        for (let e = 0; e < 4; e++) {
          let s = [E[0], E[1], E[2], E[3] - 1][e] - 12;
          (B.upright(A, I + e * C, s + (Q() < 0.2 ? 2 : 0), C * 0.95, 0.22),
            B.ride(A, I + e * C, 0.04),
            e % 2 === 1 && B.ride(A, I + e * C + t, 0.03));
        }
        let o = [0, 1.66, 2.66, 3.33].filter(() => Q() < 0.55);
        for (let e of o)
          B.epiano(
            A,
            I + e * C,
            E.map((s) => s + 12),
            C * 1.2,
            0.028,
          );
        g % 4 === 3 && B.hat(A, I + C * 3.66, 0.03);
      },
    },
    {
      freq: 103.5,
      name: "Кочевник",
      bpm: 62,
      beats: 4,
      bar: (B, A, I, g, C, Q) => {
        let E = [50, 53, 48, 55][Math.floor(g / 2) % 4];
        (g % 2 === 0 && B.pad(A, I, [E, E + 7, E + 14, E + 15], C * 8, 0.018, 900), B.bass(A, I, 38, C * 4, 0.08));
        let t = [62, 64, 65, 67, 69, 72, 74];
        for (let o = 0; o < 8; o++)
          Q() < 0.3 && B.pluck(A, I + (o * C) / 2, t[Math.floor(Q() * t.length)] + (Q() < 0.3 ? 12 : 0), 0.1, 1);
      },
    },
    {
      freq: 106.1,
      name: "—",
      bpm: 60,
      beats: 4,
      bar: (B, A, I, g, C, Q) => {
        if (g % 4 === 0) {
          for (let E = 0; E < 3; E++) B.beep(A, I + E * 0.4, 1100, 0.25, 0.06);
          return;
        }
        let i = Math.floor(Q() * 10);
        for (let E = 0; E < 4; E++) B.voice(A, I + E * C * 0.9, 140 + (i + E) * 4, 0.45, 0.1);
        B.beep(A, I + C * 3.7, 700 + i * 40, 0.1, 0.03);
      },
    },
  ];
}
var Radio = class {
    constructor(A, I, g, C) {
      this.ctx = A;
      ((this.inst = new Instruments(A, g)), (this.stationBus = A.createGain()));
      let Q = A.createBiquadFilter();
      ((Q.type = "highpass"), (Q.frequency.value = 220));
      let i = A.createBiquadFilter();
      ((i.type = "lowpass"), (i.frequency.value = 4800));
      let E = A.createWaveShaper(),
        t = new Float32Array(1024);
      for (let e = 0; e < 1024; e++) {
        let s = (e / 1023) * 2 - 1;
        t[e] = Math.tanh(s * 1.6) / Math.tanh(1.6);
      }
      ((E.curve = t),
        (this.staticSrc = A.createBufferSource()),
        (this.staticSrc.buffer = g),
        (this.staticSrc.loop = !0));
      let o = A.createBiquadFilter();
      ((o.type = "bandpass"),
        (o.frequency.value = 2200),
        (o.Q.value = 0.5),
        (this.staticGain = A.createGain()),
        (this.staticGain.gain.value = 0),
        this.staticSrc.connect(o).connect(this.staticGain),
        this.staticSrc.start(),
        (this.out = A.createGain()),
        (this.out.gain.value = 0),
        (this.muff = A.createBiquadFilter()),
        (this.muff.type = "lowpass"),
        (this.muff.frequency.value = 2e4),
        (this.panner = C(1.5)),
        this.stationBus.connect(Q).connect(i).connect(E).connect(this.out),
        this.staticGain.connect(this.out),
        this.out.connect(this.muff).connect(this.panner).connect(I));
    }
    ctx;
    on = !1;
    freq = 94.2;
    list = radioStations();
    inst;
    stationBus;
    staticSrc;
    staticGain;
    out;
    muff;
    panner;
    cur = null;
    nextBar = 0;
    barN = 0;
    seed = 1;
    signal = 0;
    stationName = "";
    power = 0;
    setPos(A, I) {
      let g = this.ctx.currentTime;
      (this.panner.positionX &&
        (this.panner.positionX.setTargetAtTime(A.x, g, 0.02),
        this.panner.positionY.setTargetAtTime(A.y, g, 0.02),
        this.panner.positionZ.setTargetAtTime(A.z, g, 0.02)),
        this.muff.frequency.setTargetAtTime(I ? 2e4 : 1300, g, 0.1));
    }
    update(A) {
      let I = this.ctx;
      this.power += ((this.on ? 1 : 0) - this.power) * Math.min(1, A * 6);
      let g = null,
        C = 0;
      for (let E of this.list) {
        let t = Math.max(0, 1 - Math.abs(this.freq - E.freq) / 0.35);
        t > C && ((C = t), (g = E));
      }
      ((this.signal = C), (this.stationName = g && C > 0.3 ? g.name : ""));
      let Q = I.currentTime;
      if (
        (this.out.gain.setTargetAtTime(this.power * 0.9, Q, 0.05),
        this.stationBus.gain.setTargetAtTime(Math.pow(C, 0.7), Q, 0.08),
        this.staticGain.gain.setTargetAtTime((1 - C) * 0.09 + (Math.random() < 0.02 ? 0.05 : 0), Q, 0.05),
        !this.on || this.power < 0.01)
      ) {
        this.cur = null;
        return;
      }
      if (
        (g !== this.cur &&
          ((this.cur = C > 0.02 ? g : null), (this.nextBar = Q + 0.05), (this.barN = Math.floor(Math.random() * 16))),
        !this.cur)
      )
        return;
      let i = 60 / this.cur.bpm;
      for (; this.nextBar < Q + 0.35;) {
        let E = (this.seed = (this.seed * 16807) % 2147483647),
          t = () => (E = (E * 16807) % 2147483647) / 2147483647;
        (this.cur.bar(this.inst, this.stationBus, this.nextBar, this.barN, i, t),
          (this.nextBar += i * this.cur.beats),
          this.barN++);
      }
    }
    get stations() {
      return this.list.map((A) => ({ freq: A.freq, name: A.name }));
    }
  },
  MenuMusic = class {
    constructor(A, I, g) {
      this.ctx = A;
      ((this.inst = new Instruments(A, g)), (this.bus = A.createGain()), (this.bus.gain.value = 0));
      let C = A.createConvolver(),
        Q = A.sampleRate * 3,
        i = A.createBuffer(2, Q, A.sampleRate);
      for (let t = 0; t < 2; t++) {
        let o = i.getChannelData(t);
        for (let e = 0; e < Q; e++) o[e] = (Math.random() * 2 - 1) * Math.pow(1 - e / Q, 2.5) * 0.4;
      }
      C.buffer = i;
      let E = A.createGain();
      ((E.gain.value = 0.45), this.bus.connect(I), this.bus.connect(C).connect(E).connect(I));
    }
    ctx;
    inst;
    bus;
    next = 0;
    bar = 0;
    playing = !1;
    start() {
      this.playing ||
        ((this.playing = !0),
        (this.next = this.ctx.currentTime + 0.2),
        this.bus.gain.cancelScheduledValues(this.ctx.currentTime),
        this.bus.gain.setTargetAtTime(0.9, this.ctx.currentTime, 1.5));
    }
    stop() {
      this.playing && ((this.playing = !1), this.bus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.8));
    }
    update() {
      if (!this.playing) return;
      let A = 60 / 68,
        I = this.ctx.currentTime;
      for (; this.next < I + 0.4;) {
        let C = [
            [45, 52, 57, 60, 64],
            [41, 48, 53, 57, 60],
            [43, 50, 55, 59, 62],
            [40, 47, 52, 56, 59],
          ][this.bar % 4],
          Q = this.next;
        if (
          (this.inst.pad(this.bus, Q, [C[1], C[2], C[3]], A * 4, 0.012, 800),
          [0, 2, 3, 4, 3, 2, 4, 1].forEach((E, t) =>
            this.inst.pluck(this.bus, Q + (t * A) / 2, C[E], 0.16 - (t % 2) * 0.04),
          ),
          this.bar % 8 >= 4 && Math.random() < 0.8)
        ) {
          let E = [69, 72, 71, 67, 64, 67, 69];
          this.inst.pluck(
            this.bus,
            Q + A * (1 + Math.floor(Math.random() * 3)),
            E[Math.floor(Math.random() * E.length)] + 12,
            0.1,
            1,
          );
        }
        ((this.next += A * 4), this.bar++);
      }
    }
  };
var OscillatorEngine = class {
    constructor(A, I, g) {
      this.ctx = A;
      ((this.out = A.createGain()), (this.out.gain.value = 0.55));
      let C = A.createWaveShaper(),
        Q = new Float32Array(2048);
      for (let e = 0; e < 2048; e++) {
        let s = (e / 2047) * 2 - 1;
        Q[e] = Math.tanh(s * 2.2);
      }
      C.curve = Q;
      let i = (e, s) => {
        let a = A.createOscillator();
        ((a.type = e), (a.frequency.value = 20));
        let n = A.createGain();
        return ((n.gain.value = s), a.connect(n).connect(C), a.start(), [a, n]);
      };
      (([this.fire, this.gFire] = i("sawtooth", 0.5)),
        ([this.sub, this.gSub] = i("square", 0.22)),
        ([this.harm, this.gHarm] = i("triangle", 0.12)));
      let E = A.createBufferSource();
      ((E.buffer = g),
        (E.loop = !0),
        (this.noiseFilt = A.createBiquadFilter()),
        (this.noiseFilt.type = "bandpass"),
        (this.noiseFilt.frequency.value = 300),
        (this.noiseFilt.Q.value = 0.8),
        (this.noiseGain = A.createGain()),
        (this.noiseGain.gain.value = 0),
        E.connect(this.noiseFilt).connect(this.noiseGain).connect(C));
      let t = A.createGain();
      ((t.gain.value = 0.35),
        this.fire.connect(t).connect(this.noiseGain.gain),
        E.start(),
        (this.starter = A.createOscillator()),
        (this.starter.type = "sawtooth"),
        (this.starter.frequency.value = 700),
        (this.gStarter = A.createGain()),
        (this.gStarter.gain.value = 0));
      let o = A.createBiquadFilter();
      ((o.type = "bandpass"),
        (o.frequency.value = 900),
        (o.Q.value = 2),
        this.starter.connect(o).connect(this.gStarter).connect(this.out),
        this.starter.start(),
        C.connect(this.out).connect(I));
    }
    ctx;
    fire;
    sub;
    harm;
    gFire;
    gSub;
    gHarm;
    noiseGain;
    noiseFilt;
    starter;
    gStarter;
    out;
    set(A) {
      let I = this.ctx.currentTime,
        g = Math.max(A.rpm, 1),
        C = g / 15,
        Q = 1 + (Math.random() - 0.5) * (0.03 + A.misfire * 0.25 + A.damage * 0.08);
      (this.fire.frequency.setTargetAtTime(C * Q, I, 0.03),
        this.sub.frequency.setTargetAtTime(C * 0.5, I, 0.03),
        this.harm.frequency.setTargetAtTime(C * 2.01, I, 0.03));
      let i = Math.max(A.throttle, A.load);
      (this.gFire.gain.setTargetAtTime(0.35 + i * 0.35, I, 0.05),
        this.gHarm.gain.setTargetAtTime(0.06 + i * 0.16 + (g / 6e3) * 0.1, I, 0.05),
        this.noiseFilt.frequency.setTargetAtTime(180 + g * 0.12 + i * 400, I, 0.05),
        this.noiseGain.gain.setTargetAtTime(A.running ? 0.25 + i * 0.35 : A.cranking ? 0.2 : 0, I, 0.05),
        this.gStarter.gain.setTargetAtTime(A.cranking ? 0.1 * (0.4 + A.crankStrength) : 0, I, 0.03),
        this.starter.frequency.setTargetAtTime(420 + A.crankStrength * 480, I, 0.1));
    }
    dispose() {
      try {
        (this.out.disconnect(), this.fire.stop(), this.sub.stop(), this.harm.stop(), this.starter.stop());
      } catch {}
    }
  },
  WorkletEngine = class {
    constructor(A, I, g) {
      this.a = A;
      if (
        ((this.lp = I.createBiquadFilter()),
        (this.lp.type = "lowpass"),
        (this.lp.frequency.value = 5e3),
        (this.shelf = I.createBiquadFilter()),
        (this.shelf.type = "lowshelf"),
        (this.shelf.frequency.value = 180),
        (this.gain = I.createGain()),
        (this.gain.gain.value = 0),
        (this.panner = A.makePanner(3)),
        this.lp.connect(this.shelf).connect(this.gain).connect(this.panner).connect(g),
        A.workletReady)
      )
        try {
          ((this.node = new AudioWorkletNode(I, "engine-proc", { numberOfInputs: 0, outputChannelCount: [1] })),
            this.node.connect(this.lp));
        } catch {
          this.node = null;
        }
      this.node || (this.osc = new OscillatorEngine(I, this.lp, A.noiseBuffer));
    }
    a;
    node = null;
    osc = null;
    lp;
    shelf;
    gain;
    panner;
    set(A) {
      this.node
        ? this.node.port.postMessage({
            rpm: A.rpm,
            throttle: A.throttle,
            load: A.load,
            running: A.running ? 1 : 0,
            crank: A.cranking ? 1 : 0,
            crankStrength: A.crankStrength,
            misfire: A.misfire,
            damage: A.damage,
          })
        : this.osc?.set(A);
      let I = this.a.ctx.currentTime,
        g = A.running || A.cranking;
      (this.gain.gain.setTargetAtTime(g ? (A.inside ? 1.05 : 1.3) : 0, I, 0.08),
        this.lp.frequency.setTargetAtTime(A.inside ? 1400 + A.throttle * 1600 : 3500 + A.throttle * 4500, I, 0.1),
        this.shelf.gain.setTargetAtTime(A.inside ? 5 : 0, I, 0.2),
        this.a.placePanner(this.panner, A.pos));
    }
    dispose() {
      try {
        (this.node?.disconnect(), this.gain.disconnect());
      } catch {}
      this.osc?.dispose();
    }
  },
  AudioSystem = class {
    ctx = null;
    workletReady = !1;
    master;
    comp;
    buses = {};
    world;
    reverb;
    reverbSend;
    noise;
    get noiseBuffer() {
      return this.brown;
    }
    brown;
    vols = { master: 0.8, sfx: 0.9, ambient: 0.8, radio: 0.7, music: 0.6, engine: 0.9 };
    radio;
    menu = null;
    amb = {};
    loops = {};
    hornNodes = null;
    pourT = 0;
    pumpT = 0;
    cricketT = 0;
    birdT = 20;
    listenerPos = new Vector3();
    insideCar = !1;
    voices = 0;
    paused = !1;
    initialized = !1;
    get ready() {
      return this.initialized;
    }
    async init() {
      if (this.ctx) {
        this.ctx.state !== "running" && (await this.ctx.resume().catch(() => {}));
        return;
      }
      let A = window.AudioContext || window.webkitAudioContext;
      if (!A) return;
      let I = new A({ latencyHint: "interactive" });
      ((this.ctx = I),
        (this.comp = I.createDynamicsCompressor()),
        (this.comp.threshold.value = -14),
        (this.comp.knee.value = 10),
        (this.comp.ratio.value = 5),
        (this.comp.attack.value = 0.004),
        (this.comp.release.value = 0.25),
        (this.master = I.createGain()),
        this.master.connect(this.comp).connect(I.destination),
        (this.world = I.createGain()),
        this.world.connect(this.master));
      for (let g of ["sfx", "ambient", "radio", "engine"])
        ((this.buses[g] = I.createGain()), this.buses[g].connect(this.world));
      ((this.buses.music = I.createGain()),
        this.buses.music.connect(this.master),
        (this.buses.ui = I.createGain()),
        this.buses.ui.connect(this.master),
        (this.noise = this.makeNoise(2.5, "white")),
        (this.brown = this.makeNoise(4, "brown")),
        (this.reverb = I.createConvolver()),
        (this.reverb.buffer = this.makeIR(2.4, 2.2)),
        (this.reverbSend = I.createGain()),
        (this.reverbSend.gain.value = 0.5),
        this.reverbSend.connect(this.reverb).connect(this.buses.sfx));
      for (let g of [
        "data:text/javascript;charset=utf-8," + encodeURIComponent(ENGINE_WORKLET_SOURCE),
        URL.createObjectURL(new Blob([ENGINE_WORKLET_SOURCE], { type: "application/javascript" })),
      ])
        try {
          (await I.audioWorklet.addModule(g), (this.workletReady = !0));
          break;
        } catch {}
      (this.workletReady || console.warn("engine worklet unavailable, using oscillator engine"),
        (this.radio = new Radio(I, this.buses.radio, this.noise, (g) => this.makePanner(g))),
        this.startAmbient(),
        (this.initialized = !0),
        this.applyVolumes(),
        I.state !== "running" && (await I.resume().catch(() => {})));
    }
    makeNoise(A, I) {
      let g = this.ctx,
        C = Math.floor(g.sampleRate * A),
        Q = g.createBuffer(1, C, g.sampleRate),
        i = Q.getChannelData(0),
        E = 0;
      for (let t = 0; t < C; t++) {
        let o = Math.random() * 2 - 1;
        I === "white" ? (i[t] = o) : ((E = (E + 0.02 * o) / 1.02), (i[t] = E * 3.5));
      }
      return Q;
    }
    makeIR(A, I) {
      let g = this.ctx,
        C = Math.floor(g.sampleRate * A),
        Q = g.createBuffer(2, C, g.sampleRate);
      for (let i = 0; i < 2; i++) {
        let E = Q.getChannelData(i);
        for (let t = 0; t < C; t++) {
          let o = t / C,
            e = t > g.sampleRate * 0.09 && t < g.sampleRate * 0.1 ? 0.6 : 0;
          E[t] = ((Math.random() * 2 - 1) * Math.pow(1 - o, I) + e * (Math.random() * 2 - 1)) * 0.6;
        }
      }
      return Q;
    }
    makePanner(A = 2.5) {
      let I = this.ctx.createPanner();
      return (
        (I.panningModel = "HRTF"),
        (I.distanceModel = "inverse"),
        (I.refDistance = A),
        (I.rolloffFactor = 1.1),
        (I.maxDistance = 600),
        I
      );
    }
    placePanner(A, I) {
      let g = this.ctx.currentTime;
      A.positionX
        ? (A.positionX.setTargetAtTime(I.x, g, 0.02),
          A.positionY.setTargetAtTime(I.y, g, 0.02),
          A.positionZ.setTargetAtTime(I.z, g, 0.02))
        : A.setPosition(I.x, I.y, I.z);
    }
    setVolumes(A) {
      (Object.assign(this.vols, A), this.applyVolumes());
    }
    applyVolumes() {
      if (!this.ctx) return;
      let A = this.ctx.currentTime,
        I = this.vols;
      (this.master.gain.setTargetAtTime(I.master, A, 0.05),
        this.buses.sfx.gain.setTargetAtTime(I.sfx, A, 0.05),
        this.buses.ambient.gain.setTargetAtTime(I.ambient * 0.9, A, 0.05),
        this.buses.radio.gain.setTargetAtTime(I.radio, A, 0.05),
        this.buses.music.gain.setTargetAtTime(I.music * 0.7, A, 0.05),
        this.buses.engine.gain.setTargetAtTime(I.engine * 0.8, A, 0.05),
        this.buses.ui.gain.setTargetAtTime(I.sfx * 0.6, A, 0.05));
    }
    setPaused(A) {
      ((this.paused = A), this.ctx && this.world.gain.setTargetAtTime(A ? 0 : 1, this.ctx.currentTime, 0.12));
    }
    duck(A, I) {
      if (!this.ctx) return;
      let g = this.ctx.currentTime;
      (this.world.gain.cancelScheduledValues(g),
        this.world.gain.setValueAtTime(this.world.gain.value, g),
        this.world.gain.linearRampToValueAtTime(1 - A, g + 0.05),
        this.world.gain.linearRampToValueAtTime(1, g + I));
    }
    setListener(A, I, g) {
      if (!this.initialized) return;
      this.listenerPos.copy(A);
      let C = this.ctx.listener,
        Q = this.ctx.currentTime;
      C.positionX
        ? (C.positionX.setTargetAtTime(A.x, Q, 0.02),
          C.positionY.setTargetAtTime(A.y, Q, 0.02),
          C.positionZ.setTargetAtTime(A.z, Q, 0.02),
          C.forwardX.setTargetAtTime(I.x, Q, 0.02),
          C.forwardY.setTargetAtTime(I.y, Q, 0.02),
          C.forwardZ.setTargetAtTime(I.z, Q, 0.02),
          C.upX.setTargetAtTime(g.x, Q, 0.02),
          C.upY.setTargetAtTime(g.y, Q, 0.02),
          C.upZ.setTargetAtTime(g.z, Q, 0.02))
        : (C.setPosition(A.x, A.y, A.z), C.setOrientation(I.x, I.y, I.z, g.x, g.y, g.z));
    }
    out(A, I, g, C = 0) {
      let Q = this.ctx,
        i = Q.createGain();
      i.gain.value = A?.volume ?? 1;
      let E = i;
      if (A?.muffled) {
        let t = Q.createBiquadFilter();
        ((t.type = "lowpass"), (t.frequency.value = 900), i.connect(t), (E = t));
      }
      if (A?.pos) {
        let t = this.makePanner(2.5);
        (this.placePanner(t, A.pos), E.connect(t), (E = t));
      }
      if ((E.connect(I), C > 0)) {
        let t = Q.createGain();
        ((t.gain.value = C), E.connect(t).connect(this.reverbSend), setTimeout(() => t.disconnect(), (g + 3) * 1e3));
      }
      return (
        this.voices++,
        setTimeout(
          () => {
            try {
              (i.disconnect(), E.disconnect());
            } catch {}
            this.voices--;
          },
          (g + 0.3 + (A?.delay ?? 0)) * 1e3,
        ),
        i
      );
    }
    env(A, I, g, C, Q = 1, i = "exp") {
      (A.gain.setValueAtTime(1e-4, I),
        A.gain.linearRampToValueAtTime(Q, I + g),
        i === "exp"
          ? A.gain.exponentialRampToValueAtTime(1e-4, I + g + C)
          : A.gain.linearRampToValueAtTime(1e-4, I + g + C));
    }
    burst(A, I, g) {
      let C = this.ctx,
        Q = C.createBufferSource();
      ((Q.buffer = g.brown ? this.brown : this.noise), (Q.playbackRate.value = g.rate ?? 1));
      let i = C.createBiquadFilter();
      ((i.type = g.type ?? "bandpass"),
        i.frequency.setValueAtTime(g.f, I),
        g.f2 && i.frequency.exponentialRampToValueAtTime(Math.max(20, g.f2), I + (g.a ?? 0.002) + g.d),
        (i.Q.value = g.q ?? 1));
      let E = C.createGain();
      (this.env(E, I, g.a ?? 0.002, g.d, g.g ?? 1),
        Q.connect(i).connect(E).connect(A),
        Q.start(I, Math.random() * 1.5),
        Q.stop(I + (g.a ?? 0.002) + g.d + 0.05));
    }
    tone(A, I, g) {
      let C = this.ctx,
        Q = C.createOscillator();
      ((Q.type = g.type ?? "sine"),
        Q.frequency.setValueAtTime(g.f, I),
        g.f2 && Q.frequency.exponentialRampToValueAtTime(Math.max(10, g.f2), I + (g.a ?? 0.003) + g.d),
        g.detune && (Q.detune.value = g.detune));
      let i = C.createGain();
      (this.env(i, I, g.a ?? 0.003, g.d, g.g ?? 1),
        Q.connect(i).connect(A),
        Q.start(I),
        Q.stop(I + (g.a ?? 0.003) + g.d + 0.05));
    }
    modal(A, I, g, C, Q, i = 0.3) {
      C.forEach((E, t) =>
        this.tone(A, I, {
          f: g * E * (1 + (Math.random() - 0.5) * 0.02),
          d: Q / (1 + t * 0.6),
          g: i / (1 + t * 0.7),
          a: 0.001,
        }),
      );
    }
    play(A, I = {}) {
      if (!this.initialized || this.voices > 40) return;
      let g = this.ctx,
        C = g.currentTime + (I.delay ?? 0) + 0.005,
        Q = Math.random,
        i = I.pitch ?? 1,
        E = A.startsWith("ui_"),
        t = E ? this.buses.ui : this.buses.sfx;
      !E && I.pos && I.muffled === void 0 && (I.muffled = this.insideCar && this.listenerPos.distanceTo(I.pos) > 2.2);
      let o = (e, s = 0) => this.out(I, t, e, s);
      switch (A) {
        case "door_open": {
          let e = o(0.9);
          (this.burst(e, C, { type: "highpass", f: 2500, d: 0.03, g: 0.6 }),
            this.tone(e, C + 0.05, { type: "sawtooth", f: 520 * i, f2: 380, a: 0.08, d: 0.35, g: 0.025 }),
            this.burst(e, C + 0.02, { f: 900, q: 6, a: 0.05, d: 0.4, g: 0.12 }));
          break;
        }
        case "door_close":
        case "trunk_close":
        case "hood_close": {
          let e = A !== "door_close" ? 1.2 : 1,
            s = o(0.8);
          (this.tone(s, C, { f: 85 * e * i, f2: 50, d: 0.25, g: 0.9 }),
            this.burst(s, C, { type: "lowpass", f: 900, d: 0.18, g: 0.9 }),
            this.modal(s, C, 180 * i, [1, 2.3, 3.9], 0.25, 0.12),
            this.burst(s, C + 0.06, { type: "highpass", f: 3e3, d: 0.025, g: 0.4 }));
          break;
        }
        case "hood_open":
        case "trunk_open": {
          let e = o(1);
          (this.burst(e, C, { type: "highpass", f: 2200, d: 0.03, g: 0.5 }),
            this.tone(e, C + 0.02, { type: "triangle", f: 300, f2: 180, a: 0.2, d: 0.5, g: 0.04 }),
            this.burst(e, C + 0.1, { f: 600, q: 3, a: 0.15, d: 0.4, g: 0.12 }));
          break;
        }
        case "latch":
        case "click":
        case "switch":
        case "key_turn":
        case "cap_open":
        case "cap_close":
        case "battery_click": {
          let e = o(0.3);
          (this.burst(e, C, { type: "highpass", f: A === "key_turn" ? 2600 : 3200, d: 0.018, g: 0.7 }),
            this.tone(e, C, { type: "square", f: 1800 * i, d: 0.012, g: 0.05 }),
            A === "key_turn" && this.modal(e, C + 0.02, 2200, [1, 1.7, 2.4], 0.15, 0.04),
            A === "cap_open" && this.burst(e, C + 0.03, { f: 1200, q: 2, d: 0.12, g: 0.2 }));
          break;
        }
        case "starter_fail": {
          let e = o(0.8);
          for (let s = 0; s < 3; s++) this.burst(e, C + s * 0.18, { type: "highpass", f: 1800, d: 0.03, g: 0.7 });
          break;
        }
        case "pickup":
        case "zip":
        case "paper": {
          let e = o(0.4);
          A === "zip"
            ? this.burst(e, C, { f: 3e3, f2: 5e3, q: 1.5, a: 0.02, d: 0.12, g: 0.3 })
            : this.burst(e, C, { f: A === "paper" ? 4e3 : 1400, q: 0.8, a: 0.01, d: 0.12, g: 0.45 });
          break;
        }
        case "drop":
        case "throw":
        case "swing": {
          let e = o(0.5);
          this.burst(e, C, {
            f: 700,
            f2: A === "swing" ? 1800 : 300,
            q: 1,
            a: 0.04,
            d: 0.2,
            g: A === "swing" ? 0.35 : 0.2,
          });
          break;
        }
        case "impact_metal":
        case "wrench_clank":
        case "melee_hit": {
          let e = o(1.2),
            s = (200 + Q() * 400) * i;
          (this.modal(e, C, s, [1, 2.76, 5.4, 8.9], 0.5 + Q() * 0.4, 0.28),
            this.burst(e, C, { type: "highpass", f: 1500, d: 0.05, g: 0.5 }),
            this.tone(e, C, { f: 90, f2: 50, d: 0.12, g: 0.5 }));
          break;
        }
        case "impact_wood": {
          let e = o(0.6);
          (this.tone(e, C, { f: (180 + Q() * 80) * i, f2: 120, d: 0.12, g: 0.7 }),
            this.burst(e, C, { f: 700 + Q() * 400, q: 3, d: 0.1, g: 0.6 }));
          break;
        }
        case "impact_soft":
        case "flesh_hit":
        case "land": {
          let e = o(0.5);
          (this.tone(e, C, { f: 110 * i, f2: 55, d: 0.14, g: 0.7 }),
            this.burst(e, C, { type: "lowpass", f: A === "flesh_hit" ? 1400 : 700, d: 0.12, g: 0.7 }));
          break;
        }
        case "impact_plastic": {
          let e = o(0.4);
          (this.burst(e, C, { f: 1600 + Q() * 800, q: 4, d: 0.07, g: 0.6 }),
            this.tone(e, C, { f: 400 * i, f2: 250, d: 0.06, g: 0.3 }));
          break;
        }
        case "impact_glass":
        case "glass_break": {
          let e = o(1.5);
          this.burst(e, C, { type: "highpass", f: 3e3, d: A === "glass_break" ? 0.5 : 0.05, g: 0.6 });
          for (let s = 0; s < (A === "glass_break" ? 14 : 3); s++)
            this.modal(e, C + Q() * (A === "glass_break" ? 0.6 : 0.05), 2e3 + Q() * 4e3, [1, 2.2], 0.2, 0.05);
          break;
        }
        case "footstep_sand":
        case "footstep_asphalt":
        case "footstep_concrete":
        case "footstep_wood":
        case "footstep_metal": {
          let e = o(0.4),
            s = 0.8 + Q() * 0.4;
          A === "footstep_sand"
            ? (this.burst(e, C, { f: 900 * s, q: 0.7, a: 0.012, d: 0.12, g: 0.55 }),
              this.burst(e, C + 0.03, { type: "highpass", f: 3500, a: 0.01, d: 0.07, g: 0.15 }))
            : A === "footstep_wood"
              ? (this.tone(e, C, { f: 120 * s, f2: 80, d: 0.09, g: 0.6 }),
                this.burst(e, C, { f: 500 * s, q: 3, d: 0.06, g: 0.4 }))
              : A === "footstep_metal"
                ? (this.modal(e, C, 300 * s, [1, 2.6, 4.1], 0.2, 0.12),
                  this.burst(e, C, { type: "highpass", f: 2e3, d: 0.03, g: 0.3 }))
                : (this.burst(e, C, { f: 1600 * s, q: 1.1, d: 0.05, g: 0.45 }),
                  this.tone(e, C, { f: 90, f2: 60, d: 0.05, g: 0.3 }));
          break;
        }
        case "eat": {
          let e = o(1.3);
          for (let s = 0; s < 4; s++)
            this.burst(e, C + s * 0.28 + Q() * 0.05, { f: 1200 + Q() * 800, q: 1.5, a: 0.02, d: 0.08, g: 0.35 });
          break;
        }
        case "drink":
        case "gulp": {
          let e = o(1.2),
            s = A === "gulp" ? 1 : 3;
          for (let a = 0; a < s; a++)
            (this.tone(e, C + a * 0.35, { f: 180, f2: 420, a: 0.02, d: 0.12, g: 0.4 }),
              this.burst(e, C + a * 0.35, { f: 500, q: 5, d: 0.1, g: 0.2 }));
          break;
        }
        case "gunshot": {
          let e = o(2.5, 0.9);
          (this.burst(e, C, { type: "highpass", f: 800, d: 0.06, g: 1.4 }),
            this.burst(e, C, { type: "lowpass", f: 2400, f2: 300, d: 0.35, g: 1.2 }),
            this.tone(e, C, { f: 160, f2: 40, d: 0.3, g: 1.2 }),
            this.burst(e, C + 0.001, { f: 4e3, q: 2, d: 0.02, g: 0.8 }));
          break;
        }
        case "reload":
        case "revolver_cock": {
          let e = o(0.8);
          (this.modal(e, C, 1800, [1, 1.6], 0.08, 0.1),
            this.burst(e, C + 0.25, { type: "highpass", f: 2500, d: 0.03, g: 0.4 }),
            this.modal(e, C + 0.45, 1600, [1, 1.9], 0.1, 0.12));
          break;
        }
        case "empty_click": {
          let e = o(0.3);
          this.burst(e, C, { type: "highpass", f: 3e3, d: 0.015, g: 0.6 });
          break;
        }
        case "explosion": {
          let e = o(5, 1.2);
          (this.burst(e, C, { type: "lowpass", f: 3e3, f2: 120, a: 0.004, d: 2.5, g: 1.6, brown: !1 }),
            this.burst(e, C, { type: "lowpass", f: 400, f2: 60, a: 0.01, d: 3.8, g: 1.8, brown: !0 }),
            this.tone(e, C, { f: 70, f2: 22, d: 1.5, g: 1.6 }));
          for (let s = 0; s < 10; s++)
            this.burst(e, C + 0.2 + Q() * 1.5, { f: 600 + Q() * 2e3, q: 2, d: 0.05, g: 0.3 });
          break;
        }
        case "thunder": {
          let e = o(7, 0.6),
            s = 0.2 + Q() * 0.3;
          (this.burst(e, C + s, { type: "lowpass", f: 900, f2: 90, a: 0.05, d: 4.5, g: 1.4, brown: !0 }),
            this.burst(e, C + s + 0.4, { type: "lowpass", f: 300, f2: 60, a: 0.6, d: 4, g: 1.2, brown: !0 }));
          break;
        }
        case "crash_light":
        case "crash_heavy": {
          let e = A === "crash_heavy",
            s = o(2, 0.3);
          if (
            (this.tone(s, C, { f: e ? 60 : 90, f2: 30, d: e ? 0.5 : 0.25, g: 1.3 }),
            this.burst(s, C, { type: "lowpass", f: 1800, d: e ? 0.6 : 0.25, g: 1.1 }),
            this.modal(s, C, 150 + Q() * 100, [1, 2.4, 3.7, 5.3], e ? 1.2 : 0.6, 0.3),
            e)
          )
            for (let a = 0; a < 8; a++) this.modal(s, C + Q() * 0.5, 800 + Q() * 3e3, [1, 2.1], 0.2, 0.06);
          break;
        }
        case "bolt_loosen":
        case "bolt_tighten":
        case "ratchet": {
          let e = o(1),
            s = A === "ratchet" ? 6 : 4;
          for (let a = 0; a < s; a++)
            (this.burst(e, C + a * 0.09, { type: "highpass", f: 2800, d: 0.02, g: 0.5 }),
              this.modal(e, C + a * 0.09, 1400 + a * 30, [1, 1.8], 0.06, 0.05));
          A !== "ratchet" && this.modal(e, C + s * 0.09 + 0.05, 900, [1, 2.7], 0.3, 0.12);
          break;
        }
        case "crate_break": {
          let e = o(1.2, 0.2);
          for (let s = 0; s < 6; s++)
            (this.tone(e, C + Q() * 0.15, { f: 150 + Q() * 200, f2: 90, d: 0.1, g: 0.5 }),
              this.burst(e, C + Q() * 0.2, { f: 800 + Q() * 1500, q: 3, d: 0.08, g: 0.4 }));
          break;
        }
        case "rabbit_squeal":
        case "rabbit_attack":
        case "rabbit_die": {
          let e = o(1),
            s = (A === "rabbit_attack" ? 1500 : A === "rabbit_die" ? 1100 : 1900) * (0.85 + Q() * 0.3),
            a = A === "rabbit_die" ? 1 : 2 + Math.floor(Q() * 3);
          for (let n = 0; n < a; n++) {
            let r = C + n * 0.09;
            (this.tone(e, r, {
              type: "sawtooth",
              f: s,
              f2: s * (A === "rabbit_die" ? 0.4 : 1.35),
              a: 0.01,
              d: A === "rabbit_die" ? 0.5 : 0.07,
              g: 0.08,
            }),
              this.burst(e, r, { f: s * 1.5, q: 6, d: 0.07, g: 0.25 }));
          }
          break;
        }
        case "husk_growl":
        case "husk_attack":
        case "husk_die": {
          let e = o(1.8, 0.2),
            s = A === "husk_die" ? 1.4 : A === "husk_attack" ? 0.5 : 0.9,
            a = g.createOscillator();
          ((a.type = "sawtooth"),
            a.frequency.setValueAtTime(70 + Q() * 30, C),
            a.frequency.linearRampToValueAtTime(A === "husk_die" ? 40 : 90, C + s));
          let n = g.createBiquadFilter();
          ((n.type = "bandpass"), (n.frequency.value = 500), (n.Q.value = 5));
          let r = g.createBiquadFilter();
          ((r.type = "bandpass"), (r.frequency.value = 1100), (r.Q.value = 7));
          let c = g.createGain();
          (this.env(c, C, 0.08, s, 0.6),
            a.connect(n).connect(c),
            a.connect(r).connect(c),
            c.connect(e),
            this.burst(e, C, { f: 700, q: 2, a: 0.1, d: s, g: 0.25 }),
            a.start(C),
            a.stop(C + s + 0.2));
          break;
        }
        case "hurt": {
          let e = o(0.6);
          (this.tone(e, C, { f: 130, f2: 70, d: 0.25, g: 0.8 }),
            this.burst(e, C, { type: "lowpass", f: 900, d: 0.15, g: 0.6 }));
          break;
        }
        case "death": {
          let e = o(3);
          (this.tone(e, C, { f: 90, f2: 30, a: 0.05, d: 2.5, g: 0.6 }),
            this.burst(e, C, { type: "lowpass", f: 500, f2: 80, a: 0.2, d: 2.5, g: 0.5, brown: !0 }));
          break;
        }
        case "heartbeat": {
          let e = o(1);
          (this.tone(e, C, { f: 60, f2: 40, d: 0.12, g: 0.9 }),
            this.tone(e, C + 0.22, { f: 55, f2: 38, d: 0.14, g: 0.7 }));
          break;
        }
        case "ui_hover": {
          let e = o(0.2);
          this.tone(e, C, { f: 1800, d: 0.03, g: 0.06 });
          break;
        }
        case "ui_click":
        case "ui_open": {
          let e = o(0.3);
          (this.tone(e, C, { f: 900, f2: 1300, d: 0.05, g: 0.12 }),
            this.burst(e, C, { type: "highpass", f: 4e3, d: 0.015, g: 0.2 }));
          break;
        }
        case "ui_back": {
          let e = o(0.3);
          this.tone(e, C, { f: 1100, f2: 700, d: 0.06, g: 0.12 });
          break;
        }
        case "notify": {
          let e = o(0.8);
          (this.tone(e, C, { type: "triangle", f: 880, d: 0.25, g: 0.12 }),
            this.tone(e, C + 0.09, { type: "triangle", f: 1320, d: 0.35, g: 0.1 }));
          break;
        }
        case "coins": {
          let e = o(0.8);
          for (let s = 0; s < 4; s++)
            this.modal(e, C + s * 0.07 + Q() * 0.03, 3e3 + Q() * 1500, [1, 1.5, 2.3], 0.15, 0.06);
          break;
        }
        case "mine_beep": {
          let e = o(0.5);
          (this.tone(e, C, { type: "square", f: 2400, d: 0.08, g: 0.15 }),
            this.tone(e, C + 0.14, { type: "square", f: 2400, d: 0.08, g: 0.15 }));
          break;
        }
        case "tire_pop": {
          let e = o(1);
          (this.burst(e, C, { type: "lowpass", f: 2500, f2: 300, d: 0.4, g: 1.2 }),
            this.tone(e, C, { f: 120, f2: 40, d: 0.2, g: 0.8 }));
          break;
        }
        case "backfire": {
          let e = o(1.2, 0.5);
          (this.burst(e, C, { type: "lowpass", f: 1800, f2: 200, d: 0.18, g: 1.2 }),
            this.tone(e, C, { f: 110, f2: 45, d: 0.15, g: 1 }));
          break;
        }
        case "shift": {
          let e = o(0.4);
          (this.burst(e, C, { f: 900, q: 3, d: 0.05, g: 0.25 }), this.modal(e, C + 0.05, 600, [1, 2.2], 0.08, 0.06));
          break;
        }
        case "bell": {
          let e = o(2);
          this.modal(e, C, 660, [1, 2, 2.76, 5.4], 1.5, 0.2);
          break;
        }
        case "sleep": {
          let e = o(3);
          (this.tone(e, C, { type: "triangle", f: 440, a: 0.8, d: 2, g: 0.06 }),
            this.tone(e, C + 0.3, { type: "triangle", f: 330, a: 0.8, d: 2, g: 0.05 }));
          break;
        }
        default: {
          let e = o(0.3);
          this.burst(e, C, { f: 1e3, d: 0.05, g: 0.3 });
        }
      }
    }
    loopSrc(A, I, g, C, Q, i, E = !1) {
      let t = this.ctx,
        o = t.createBufferSource();
      ((o.buffer = I), (o.loop = !0));
      let e = t.createBiquadFilter();
      ((e.type = g), (e.frequency.value = C), (e.Q.value = Q));
      let s = t.createGain();
      ((s.gain.value = 0), o.connect(e).connect(s));
      let a;
      (E ? ((a = this.makePanner(3)), s.connect(a).connect(i)) : s.connect(i), o.start(0, Math.random() * 2));
      let n = { src: o, filt: e, gain: s, panner: a };
      return ((this.loops[A] = n), n);
    }
    startPour() {
      this.pourT = 0.25;
    }
    stopPour() {
      this.pourT = 0;
    }
    pumpLoop(A) {
      A && (this.pumpT = 0.25);
    }
    startAmbient() {
      let A = this.ctx,
        I = (g, C, Q, i, E) => {
          let t = A.createBufferSource();
          ((t.buffer = C), (t.loop = !0));
          let o = A.createBiquadFilter();
          ((o.type = Q), (o.frequency.value = i), (o.Q.value = E));
          let e = A.createGain();
          ((e.gain.value = 0),
            t.connect(o).connect(e).connect(this.buses.ambient),
            t.start(0, Math.random() * 3),
            (this.amb[g] = { src: t, filt: o, gain: e }));
        };
      (I("wind", this.brown, "bandpass", 380, 0.6),
        I("gust", this.noise, "bandpass", 900, 2.5),
        I("rush", this.noise, "lowpass", 900, 0.5),
        I("storm", this.noise, "bandpass", 1200, 0.4),
        I("rain", this.noise, "highpass", 2500, 0.5),
        I("roof", this.brown, "lowpass", 600, 0.7),
        I("road", this.brown, "lowpass", 220, 0.7),
        I("gravel", this.noise, "bandpass", 700, 0.9),
        I("skid", this.noise, "bandpass", 1400, 6),
        I("pour", this.noise, "bandpass", 700, 8),
        I("pump", this.brown, "bandpass", 220, 4));
    }
    windPh = 0;
    setAmbient(A, I) {
      if (!this.initialized) return;
      let g = this.ctx.currentTime,
        C = this.amb;
      this.windPh += I;
      let Q = 0.6 + 0.4 * Math.sin(this.windPh * 0.33) * Math.sin(this.windPh * 0.11 + 1),
        i = A.insideBuilding ? 0.35 : 1,
        E = A.insideCar ? 0.3 : 1,
        t = Math.min(1, A.wind / 14);
      (C.wind.gain.gain.setTargetAtTime((0.08 + t * 0.5) * Q * i * E, g, 0.5),
        C.wind.filt.frequency.setTargetAtTime(260 + t * 500 + Q * 120, g, 0.5),
        C.gust.gain.gain.setTargetAtTime(Math.max(0, t - 0.3) * 0.12 * Q * i * E, g, 0.4),
        C.gust.filt.frequency.setTargetAtTime(600 + Q * 900, g, 0.3));
      let o = Math.min(1, A.carSpeed / 38);
      if (
        (C.rush.gain.gain.setTargetAtTime(o * o * (A.insideCar ? 0.35 : 0.9), g, 0.2),
        C.rush.filt.frequency.setTargetAtTime(A.insideCar ? 500 + o * 500 : 1200 + o * 2500, g, 0.2),
        C.storm.gain.gain.setTargetAtTime(A.sand * 0.55 * (A.insideCar || A.insideBuilding ? 0.45 : 1), g, 1),
        C.rain.gain.gain.setTargetAtTime(A.rain * 0.35 * (A.insideCar || A.insideBuilding ? 0.3 : 1), g, 1),
        C.roof.gain.gain.setTargetAtTime(A.rain * (A.insideCar || A.insideBuilding ? 0.5 : 0), g, 1),
        (this.pourT -= I),
        (this.pumpT -= I),
        C.pour.gain.gain.setTargetAtTime(this.pourT > 0 ? 0.35 : 0, g, 0.05),
        C.pour.filt.frequency.setTargetAtTime(500 + Math.sin(this.windPh * 23) * 150 + Math.random() * 200, g, 0.02),
        C.pump.gain.gain.setTargetAtTime(this.pumpT > 0 ? 0.3 : 0, g, 0.08),
        A.night > 0.4 && A.sand < 0.2 && A.rain < 0.2 && !A.insideCar)
      ) {
        if (((this.cricketT -= I), this.cricketT <= 0)) {
          this.cricketT = 0.3 + Math.random() * 1.2;
          let e = this.out({ volume: 0.05 * A.night * i }, this.buses.ambient, 1),
            s = 4200 + Math.random() * 900,
            a = g + Math.random() * 0.1,
            n = this.ctx.createStereoPanner();
          ((n.pan.value = Math.random() * 2 - 1), n.connect(e));
          for (let r = 0; r < 3 + Math.floor(Math.random() * 4); r++)
            this.tone(n, a + r * 0.045, { f: s, d: 0.025, g: 1, a: 0.004 });
        }
      } else if (A.night < 0.2 && A.sand < 0.2 && !A.insideCar && ((this.birdT -= I), this.birdT <= 0)) {
        this.birdT = 25 + Math.random() * 50;
        let e = this.out({ volume: 0.06 }, this.buses.ambient, 2, 0.6),
          s = g;
        (this.tone(e, s, { type: "sawtooth", f: 2400, f2: 1300, a: 0.05, d: 0.9, g: 0.08 }),
          this.burst(e, s, { f: 2e3, q: 8, a: 0.05, d: 0.8, g: 0.15 }));
      }
    }
    setCar(A) {
      if (!this.initialized) return;
      let I = this.ctx.currentTime,
        g = this.amb,
        C = A ? Math.min(1, Math.abs(A.speed) / 35) : 0,
        Q = A?.inside ? 1 : A ? 0.5 : 0;
      if (
        (g.road.gain.gain.setTargetAtTime(C * (1 - A.sand * 0.6) * 0.5 * Q, I, 0.1),
        g.road.filt.frequency.setTargetAtTime(140 + C * 260, I, 0.1),
        g.gravel.gain.gain.setTargetAtTime(C * (A?.sand ?? 0) * 0.35 * Q + (A?.bumps ?? 0) * 0.2 * Q, I, 0.1),
        g.gravel.filt.frequency.setTargetAtTime(500 + C * 600 + Math.random() * 200, I, 0.05),
        g.skid.gain.gain.setTargetAtTime((A?.skid ?? 0) * (1 - (A?.sand ?? 0)) * 0.35 * Q, I, 0.05),
        g.skid.filt.frequency.setTargetAtTime(1100 + Math.random() * 500, I, 0.03),
        A?.horn && !this.hornNodes)
      ) {
        let i = this.ctx.createGain();
        ((i.gain.value = 0), i.gain.setTargetAtTime(0.18, I, 0.01));
        let E = this.ctx.createBiquadFilter();
        ((E.type = "bandpass"), (E.frequency.value = 900), (E.Q.value = 1.2));
        let t = [415, 523].map((e) => {
            let s = this.ctx.createOscillator();
            return ((s.type = "sawtooth"), (s.frequency.value = e), s.connect(E), s.start(), s);
          }),
          o = this.makePanner(4);
        (this.placePanner(o, A.pos),
          E.connect(i).connect(o).connect(this.buses.sfx),
          (this.hornNodes = { osc: t, gain: i }));
      } else if (!A?.horn && this.hornNodes) {
        let i = this.hornNodes;
        (i.gain.gain.setTargetAtTime(0, I, 0.02),
          setTimeout(() => i.osc.forEach((E) => E.stop()), 200),
          (this.hornNodes = null));
      }
    }
    createEngine() {
      return this.initialized ? new WorkletEngine(this, this.ctx, this.buses.engine) : null;
    }
    playMenuMusic() {
      this.initialized &&
        (this.menu || (this.menu = new MenuMusic(this.ctx, this.buses.music, this.noise)), this.menu.start());
    }
    stopMenuMusic() {
      this.menu?.stop();
    }
    update(A) {
      this.initialized && (this.radio?.update(A), this.menu?.update());
    }
  };

export { AudioSystem };
