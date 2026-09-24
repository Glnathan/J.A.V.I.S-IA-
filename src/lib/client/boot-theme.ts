// Original J.A.R.V.I.S. boot theme: an epic hard-rock / orchestral cue synthesized live with the
// Web Audio API (arc-reactor power-up, impact, power-chord riff, brass swell, heroic finale).
// No audio file and no copyrighted material: everything below is an original composition.
import { parseYouTubeId, THUNDERSTRUCK_ID, THUNDERSTRUCK_IDS, youTubeLabel } from "@/lib/youtube";
import { createMusicDock, type MusicHandle } from "./music-dock";
import { getAudioContext } from "./sounds";
import { playYouTube } from "./youtube-embed";

export type { MusicHandle } from "./music-dock";

const BPM = 160;
const BEAT = 60 / BPM;
const EIGHTH = BEAT / 2;
const IMPACT = 1.8;
const RIFF = IMPACT + BEAT;
const FINAL = RIFF + 24 * EIGHTH;
const LAST = FINAL + 4 * EIGHTH;

/** Key moments of the theme (seconds), used to sync the boot animation. */
export const THEME_TIMING = { impact: IMPACT, riff: RIFF, final: LAST, end: LAST + 2.7 } as const;

const F = {
  C3: 130.81,
  D3: 146.83,
  E2: 82.41,
  E3: 164.81,
  Fs3: 185.0,
  G2: 98.0,
  G3: 196.0,
  Gs3: 207.65,
  A2: 110.0,
  A3: 220.0,
  B2: 123.47,
  B3: 246.94,
  E4: 329.63,
  B4: 493.88,
  E5: 659.25,
};

function distortionCurve(amount: number) {
  const n = 2048;
  const curve = new Float32Array(n);
  const deg = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * deg) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

export function playBootTheme(volume = 0.8): MusicHandle | null {
  const ctx = getAudioContext();
  if (!ctx) return null;
  const t0 = ctx.currentTime + 0.06;
  const at = (s: number) => t0 + s;

  const master = ctx.createGain();
  master.gain.value = Math.max(0.0001, Math.min(1, volume));
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  master.connect(comp);
  comp.connect(ctx.destination);

  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 2.4, 2.6);
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.3;
  verb.connect(verbOut);
  verbOut.connect(master);

  const noise = noiseBuffer(ctx, 2);

  const env = (g: GainNode, t: number, peak: number, attack: number, hold: number, release: number) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    if (hold > 0) g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  };

  const osc = (type: OscillatorType, freq: number, t: number, dur: number, dest: AudioNode, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const sendTo = (node: AudioNode, amount: number) => {
    const s = ctx.createGain();
    s.gain.value = amount;
    node.connect(s);
    s.connect(verb);
  };

  const noiseHit = (t: number, dur: number, type: BiquadFilterType, freq: number, peak: number, send = 0) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    env(g, t, peak, 0.002, 0, dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    if (send > 0) sendTo(g, send);
    src.start(t, Math.random() * 1.2, dur + 0.05);
  };

  // ─── Drums ───────────────────────────────────────────────────────────
  const kick = (t: number, peak = 0.95) => {
    const g = ctx.createGain();
    env(g, t, peak, 0.002, 0.02, 0.32);
    g.connect(master);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.45);
    noiseHit(t, 0.02, "highpass", 3000, 0.12);
  };
  const snare = (t: number, peak = 0.4) => {
    noiseHit(t, 0.17, "highpass", 1400, peak, 0.35);
    const g = ctx.createGain();
    env(g, t, peak * 0.5, 0.002, 0, 0.09);
    g.connect(master);
    osc("triangle", 185, t, 0.1, g);
  };
  const hat = (t: number, peak = 0.06) => noiseHit(t, 0.045, "highpass", 7800, peak);
  const crash = (t: number, dur = 1.9, peak = 0.24) => noiseHit(t, dur, "highpass", 4800, peak, 0.5);
  const boom = (t: number, peak = 0.85) => {
    const g = ctx.createGain();
    env(g, t, peak, 0.004, 0.05, 1.7);
    g.connect(master);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(75, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 1.5);
    o.connect(g);
    o.start(t);
    o.stop(t + 1.9);
    noiseHit(t, 0.9, "lowpass", 400, 0.35, 0.6);
  };

  // ─── Distorted guitars ───────────────────────────────────────────────
  const guitarBus = (cutoff: number, level: number) => {
    const input = ctx.createGain();
    input.gain.value = 3;
    const shaper = ctx.createWaveShaper();
    shaper.curve = distortionCurve(80);
    shaper.oversample = "4x";
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 75;
    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1300;
    mid.Q.value = 0.9;
    mid.gain.value = 4;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = cutoff;
    const out = ctx.createGain();
    out.gain.value = level;
    input.connect(shaper);
    shaper.connect(hp);
    hp.connect(mid);
    mid.connect(lp);
    lp.connect(out);
    out.connect(master);
    sendTo(out, 0.12);
    return input;
  };
  const muted = guitarBus(950, 0.2);
  const open = guitarBus(4200, 0.16);

  const power = (bus: AudioNode, t: number, root: number, dur: number, ring = false, vel = 1) => {
    const g = ctx.createGain();
    const peak = 0.22 * vel;
    if (ring) env(g, t, peak, 0.005, 0.15, dur);
    else env(g, t, peak, 0.005, Math.max(0, dur - 0.06), 0.05);
    g.connect(bus);
    for (const mult of [1, 1.4983, 2]) for (const det of [-8, 8]) osc("sawtooth", root * mult, t, dur + (ring ? 0.2 : 0.06), g, det);
  };

  // ─── Brass / strings pad ─────────────────────────────────────────────
  const pad = (t: number, notes: number[], dur: number, peak = 0.028) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.1);
    g.gain.setValueAtTime(peak, t + Math.max(0.11, dur - 0.1));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(700, t);
    lp.frequency.linearRampToValueAtTime(2400, t + 0.35);
    g.connect(lp);
    lp.connect(master);
    sendTo(lp, 0.5);
    for (const f of notes) for (const det of [-10, 10]) osc("sawtooth", f, t, dur + 0.4, g, det);
  };

  // 1. Arc reactor power-up (0 → impact)
  {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at(0));
    g.gain.exponentialRampToValueAtTime(0.09, at(IMPACT - 0.05));
    g.gain.linearRampToValueAtTime(0.0001, at(IMPACT));
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(250, at(0));
    lp.frequency.exponentialRampToValueAtTime(6000, at(IMPACT));
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(55, at(0));
    o.frequency.exponentialRampToValueAtTime(880, at(IMPACT));
    o.connect(lp);
    lp.connect(g);
    g.connect(master);
    o.start(at(0));
    o.stop(at(IMPACT) + 0.05);

    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, at(0));
    bp.frequency.exponentialRampToValueAtTime(7000, at(IMPACT));
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, at(0));
    ng.gain.exponentialRampToValueAtTime(0.16, at(IMPACT - 0.03));
    ng.gain.linearRampToValueAtTime(0.0001, at(IMPACT));
    src.connect(bp);
    bp.connect(ng);
    ng.connect(master);
    src.start(at(0));
    src.stop(at(IMPACT) + 0.05);

    const hum = ctx.createGain();
    env(hum, at(0), 0.06, 0.3, IMPACT - 0.4, 0.2);
    hum.connect(master);
    osc("sine", 55, at(0), IMPACT, hum);
    osc("sine", 110, at(0), IMPACT, hum, 4);

    [0.25, 0.55, 0.85, 1.1, 1.3, 1.45, 1.57, 1.67].forEach((s, i) => {
      const bg = ctx.createGain();
      env(bg, at(s), 0.035, 0.003, 0.02, 0.05);
      bg.connect(master);
      osc("sine", 1320 + i * 110, at(s), 0.08, bg);
    });
  }

  // 2. Impact
  boom(at(IMPACT));
  kick(at(IMPACT));
  crash(at(IMPACT), 2.2, 0.28);
  power(open, at(IMPACT), F.E2, BEAT * 0.95, true, 1.1);
  pad(at(IMPACT), [F.E3, F.G3, F.B3, F.E4], BEAT + 8 * EIGHTH - 0.05, 0.03);

  // 3. Riff (3 bars, original)
  const riff: [number, number, number, boolean][] = [
    [0, F.E2, 1, false], [1, F.E2, 1, false], [2, F.E2, 1, false], [3, F.G2, 2, true], [5, F.A2, 1, true], [6, F.E2, 1, false], [7, F.E2, 1, false],
    [8, F.E2, 1, false], [9, F.E2, 1, false], [10, F.E2, 1, false], [11, F.D3, 2, true], [13, F.C3, 1, true], [14, F.D3, 2, true],
    [16, F.E2, 1, false], [17, F.E2, 1, false], [18, F.E2, 1, false], [19, F.G2, 2, true], [21, F.A2, 1, true], [22, F.B2, 2, true],
  ];
  for (const [e, root, len, isOpen] of riff) {
    power(isOpen ? open : muted, at(RIFF + e * EIGHTH), root, isOpen ? len * EIGHTH * 0.95 : EIGHTH * 0.7);
  }
  for (let bar = 0; bar < 3; bar++) {
    const b = RIFF + bar * 8 * EIGHTH;
    for (let e = 0; e < 8; e++) hat(at(b + e * EIGHTH), e % 2 === 0 ? 0.07 : 0.045);
    [0, 3, 4].forEach((e) => kick(at(b + e * EIGHTH), 0.85));
    [2, 6].forEach((e) => snare(at(b + e * EIGHTH)));
  }
  [6.5, 7, 7.5].forEach((e) => snare(at(RIFF + (16 + e) * EIGHTH), 0.3));
  crash(at(RIFF + 8 * EIGHTH), 1.2, 0.16);
  crash(at(RIFF + 16 * EIGHTH), 1.2, 0.16);
  pad(at(RIFF + 8 * EIGHTH), [F.C3, F.E3, F.G3], 3 * EIGHTH);
  pad(at(RIFF + 11 * EIGHTH), [F.D3, F.Fs3, F.A3], 5 * EIGHTH);
  pad(at(RIFF + 16 * EIGHTH), [F.E3, F.G3, F.B3], 8 * EIGHTH);

  // 4. Heroic finale: C – D – E
  const finale: [number, number, number[]][] = [
    [at(FINAL), F.C3, [F.C3, F.E3, F.G3]],
    [at(FINAL + 2 * EIGHTH), F.D3, [F.D3, F.Fs3, F.A3]],
  ];
  for (const [t, root, notes] of finale) {
    power(open, t, root, 2 * EIGHTH * 0.92, false, 1.1);
    kick(t);
    crash(t, 0.9, 0.18);
    pad(t, notes, 2 * EIGHTH - 0.02, 0.032);
  }
  const hitE = at(LAST);
  power(open, hitE, F.E2, 2.6, true, 1.2);
  power(open, hitE, F.E3, 2.4, true, 0.6);
  boom(hitE);
  kick(hitE);
  crash(hitE, 2.6, 0.3);
  pad(hitE, [F.E3, F.Gs3, F.B3, F.E4], 2.1, 0.034);
  const shimmer = ctx.createGain();
  env(shimmer, hitE, 0.02, 0.4, 0.6, 1.6);
  shimmer.connect(master);
  sendTo(shimmer, 0.8);
  osc("sine", F.B4, hitE, 2.7, shimmer);
  osc("sine", F.E5, hitE, 2.7, shimmer, 3);

  let stopped = false;
  const baseGain = Math.max(0.0001, Math.min(1, volume));
  const cleanup = () => {
    stopped = true;
    try {
      comp.disconnect();
    } catch {
      /* already disconnected */
    }
  };
  const timer = setTimeout(cleanup, (THEME_TIMING.end + 0.8) * 1000);
  return {
    kind: "theme",
    ready: Promise.resolve(true),
    getTitle: () => "Thème J.A.R.V.I.S.",
    duck(on: boolean) {
      if (stopped) return;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(on ? baseGain * 0.35 : baseGain, now + 0.25);
    },
    stop(fade = 0.4) {
      if (stopped) return;
      stopped = true;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.0001, now + fade);
      clearTimeout(timer);
      setTimeout(cleanup, fade * 1000 + 150);
    },
    release() {
      /* the theme ends naturally */
    },
  };
}

// ─── Active music registry: one track at a time, lowered while JARVIS speaks or listens ───
let active: MusicHandle | null = null;
let duckWanted = false;

function track(h: MusicHandle | null): MusicHandle | null {
  active = h;
  if (h && duckWanted) h.duck?.(true);
  return h;
}

export function stopActiveMusic(fade = 0.5): void {
  const h = active;
  active = null;
  h?.stop(fade);
}

export function duckActiveMusic(on: boolean): void {
  duckWanted = on;
  active?.duck?.(on);
}

export interface MusicOptions {
  volume: number;
  /** Cache-buster of the user's audio file. */
  version?: string;
  /** Original file name of the user's audio file. */
  name?: string;
  /** YouTube link (kind "youtube"). */
  url?: string;
  /** Start offset in seconds. */
  start?: number;
  /** Seconds before the final fade-out (0 = whole track). */
  duration?: number;
  title?: string;
}

// ─── User's own audio file (e.g. a track they own) ─────────────────────
let preloaded: HTMLAudioElement | null = null;

export function preloadCustomBootMusic(version: string): void {
  if (typeof Audio === "undefined") return;
  const src = `/api/boot-music?v=${encodeURIComponent(version)}`;
  if (preloaded && preloaded.dataset.src === src) return;
  const a = new Audio();
  a.preload = "auto";
  a.src = src;
  a.dataset.src = src;
  preloaded = a;
}

function playCustomBootMusic(o: MusicOptions): MusicHandle | null {
  preloadCustomBootMusic(o.version ?? "");
  const a = preloaded;
  if (!a) return null;
  const base = Math.max(0, Math.min(1, o.volume));
  const startAt = Math.max(0, o.start ?? 0);
  const duration = Math.max(0, o.duration ?? 0);
  const title = (o.name ?? "").replace(/\.[a-z0-9]{2,4}$/i, "") || o.title || "Musique de démarrage";
  const timers: ReturnType<typeof setTimeout>[] = [];
  const intervals: ReturnType<typeof setInterval>[] = [];
  let stopped = false;
  let started = false;
  let ducked = false;
  let fading = false;
  let settle: (ok: boolean) => void = () => undefined;
  const ready = new Promise<boolean>((resolve) => {
    let done = false;
    settle = (ok) => {
      if (!done) {
        done = true;
        resolve(ok);
      }
    };
  });
  const target = () => (ducked ? base * 0.3 : base);
  const dock = createMusicDock(title, () => handle.stop(0.6), false);

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    settle(false);
    timers.forEach(clearTimeout);
    intervals.forEach(clearInterval);
    a.removeEventListener("playing", onPlaying);
    a.removeEventListener("ended", cleanup);
    a.removeEventListener("error", cleanup);
    a.pause();
    dock.remove();
  };
  const onPlaying = () => {
    if (started || stopped) return;
    started = true;
    settle(true);
    const t0 = Date.now();
    if (duration > 0) timers.push(setTimeout(() => handle.stop(3), duration * 1000));
    intervals.push(
      setInterval(() => {
        if (duration > 0) dock.setProgress((Date.now() - t0) / (duration * 1000));
        else if (a.duration > 0) dock.setProgress(a.currentTime / a.duration);
      }, 500),
    );
  };
  a.addEventListener("playing", onPlaying);
  a.addEventListener("ended", cleanup);
  a.addEventListener("error", cleanup);
  a.volume = target();
  const seek = () => {
    try {
      a.currentTime = startAt;
    } catch {
      /* not seekable yet */
    }
  };
  if (a.readyState >= 1) seek();
  else a.addEventListener("loadedmetadata", seek, { once: true });
  void a.play().catch(() => cleanup());
  timers.push(
    setTimeout(() => {
      if (!started) cleanup();
    }, 8000),
  );

  const handle: MusicHandle = {
    kind: "custom",
    ready,
    getTitle: () => title,
    duck(on) {
      ducked = on;
      if (!stopped && !fading) a.volume = target();
    },
    release() {
      /* the duration timer ends the music */
    },
    stop(fade = 0.5) {
      if (stopped || fading) return;
      if (!started || fade <= 0) {
        cleanup();
        return;
      }
      fading = true;
      const from = a.volume;
      const steps = Math.max(1, Math.round((fade * 1000) / 50));
      let i = 0;
      const t = setInterval(() => {
        i++;
        a.volume = Math.max(0, from * (1 - i / steps));
        if (i >= steps) {
          clearInterval(t);
          cleanup();
        }
      }, 50);
      intervals.push(t);
    },
  };
  return handle;
}

/** Starts the boot music ("youtube" | "custom" | "theme"); returns null for "off". Stops the previous track. */
export function startBootMusic(kind: string, o: MusicOptions): MusicHandle | null {
  stopActiveMusic(0.3);
  if (kind === "custom") return track(playCustomBootMusic(o));
  if (kind === "youtube") {
    const id = parseYouTubeId(o.url ?? "");
    if (id) {
      // Thunderstruck gets official fallback versions if the main video refuses or stalls.
      const ids = id === THUNDERSTRUCK_ID ? [...THUNDERSTRUCK_IDS] : [id];
      return track(
        playYouTube({ ids, start: o.start ?? 0, duration: o.duration ?? 0, volume: o.volume, title: o.title || youTubeLabel(o.url ?? "") }),
      );
    }
    return track(playBootTheme(o.volume));
  }
  if (kind === "theme") return track(playBootTheme(o.volume));
  return null;
}
