// Synthesized HUD sound effects (Web Audio, no asset files).

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  to?: number;
}

function tone(freq: number, dur: number, opts: ToneOpts = {}) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, t0);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  const peak = opts.gain ?? 0.06;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const sfx = {
  unlock() {
    ac();
  },
  boot() {
    tone(90, 1.3, { type: "sawtooth", gain: 0.025, to: 720 });
    tone(440, 0.35, { delay: 1.15, gain: 0.05 });
    tone(660, 0.4, { delay: 1.3, gain: 0.05 });
    tone(880, 0.9, { delay: 1.45, gain: 0.05 });
  },
  listen() {
    tone(880, 0.09, { gain: 0.05 });
    tone(1320, 0.12, { delay: 0.08, gain: 0.05 });
  },
  stop() {
    tone(1320, 0.08, { gain: 0.04 });
    tone(880, 0.12, { delay: 0.07, gain: 0.04 });
  },
  send() {
    tone(620, 0.06, { type: "triangle", gain: 0.04 });
  },
  wake() {
    tone(660, 0.08, { gain: 0.05 });
    tone(990, 0.1, { delay: 0.07, gain: 0.05 });
    tone(1320, 0.14, { delay: 0.14, gain: 0.05 });
  },
  alarm() {
    for (let i = 0; i < 6; i++) {
      tone(1046, 0.16, { type: "square", gain: 0.045, delay: i * 0.32 });
      tone(1318, 0.12, { type: "square", gain: 0.035, delay: i * 0.32 + 0.16 });
    }
  },
  success() {
    tone(523, 0.1, { gain: 0.05 });
    tone(784, 0.2, { delay: 0.1, gain: 0.05 });
  },
  error() {
    tone(240, 0.25, { type: "sawtooth", gain: 0.035, to: 110 });
  },
  alert() {
    for (let i = 0; i < 3; i++) tone(700, 0.35, { type: "sawtooth", gain: 0.035, delay: i * 0.45, to: 1100 });
  },
  party() {
    [523, 659, 784, 1046, 784, 659, 523, 659, 784, 1046, 1318].forEach((n, i) => tone(n, 0.14, { type: "square", gain: 0.03, delay: i * 0.12 }));
  },
};

/** Shared AudioContext (created/resumed on demand). */
export function getAudioContext(): AudioContext | null {
  return ac();
}
