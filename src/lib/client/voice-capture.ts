// Microphone capture with voice-activity detection (VAD), producing 16 kHz WAV segments for the
// server-side Whisper engine (/api/stt). Works in every modern browser: Chrome, Edge, Firefox, Safari, Brave.

export interface CaptureOptions {
  onSegment: (wav: Blob, seconds: number) => void;
  onLevel?: (level: number) => void;
  onSpeechStart?: () => void;
  /** Silence (ms) that ends an utterance. */
  silenceMs?: number;
  /** Maximum utterance length (ms). */
  maxMs?: number;
  /** Minimum amount of speech (ms) for a segment to be sent. */
  minSpeechMs?: number;
}

const WORKLET = `class JarvisCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1024); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.buf[this.n++] = ch[i];
        if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice(0)); this.n = 0; }
      }
    }
    return true;
  }
}
registerProcessor("jarvis-capture", JarvisCapture);`;

export class VoiceCapture {
  /** While paused (JARVIS speaking), nothing is recorded. */
  paused = false;
  mode: "single" | "continuous" = "single";
  hasSpeech = false;
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private rate = 48000;
  private noise = 0.008;
  private pre: Float32Array[] = [];
  private preLen = 0;
  private seg: Float32Array[] | null = null;
  private segLen = 0;
  private speechMs = 0;
  private quietMs = 0;
  private stopped = false;

  constructor(private readonly opts: CaptureOptions) {}

  async start(mode: "single" | "continuous"): Promise<void> {
    try {
      await this.open(mode);
    } catch (error) {
      // Release the device even if AudioContext or the worklet failed to start.
      this.stop();
      throw error;
    }
  }

  private async open(mode: "single" | "continuous"): Promise<void> {
    this.mode = mode;
    if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("Micro indisponible"), { name: "NotSupportedError" });
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.stream = stream;
    if (this.stopped) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) throw new Error("Web Audio indisponible");
    const ctx = new C();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();
    this.rate = ctx.sampleRate;
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    try {
      await ctx.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (this.stopped) {
      this.stop();
      return;
    }
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "jarvis-capture");
    node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onFrame(e.data);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
    this.node = node;
  }

  private onFrame(frame: Float32Array) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / frame.length);
    const ms = (frame.length / this.rate) * 1000;
    if (this.stopped) return;
    this.opts.onLevel?.(Math.min(1, rms * 7));
    if (this.paused) {
      this.pre = [];
      this.preLen = 0;
      this.seg = null;
      return;
    }
    const threshold = Math.max(0.012, this.noise * 3);
    const loud = rms > threshold;
    if (!this.seg) {
      if (!loud) this.noise = this.noise * 0.97 + rms * 0.03;
      this.pre.push(frame);
      this.preLen += frame.length;
      while (this.pre.length > 1 && this.preLen - this.pre[0].length > this.rate * 0.4) this.preLen -= this.pre.shift()!.length;
      if (loud) {
        this.seg = this.pre;
        this.segLen = this.preLen;
        this.pre = [];
        this.preLen = 0;
        this.speechMs = ms;
        this.quietMs = 0;
        this.hasSpeech = true;
        this.opts.onSpeechStart?.();
      }
      return;
    }
    this.seg.push(frame);
    this.segLen += frame.length;
    if (loud) {
      this.speechMs += ms;
      this.quietMs = 0;
    } else this.quietMs += ms;
    const total = (this.segLen / this.rate) * 1000;
    if (this.quietMs >= (this.opts.silenceMs ?? 900) || total >= (this.opts.maxMs ?? 12000)) this.finish();
  }

  /** Ends the current utterance now. Returns true if some speech was sent. */
  flush(): boolean {
    if (!this.seg) return false;
    return this.finish();
  }

  private finish(): boolean {
    const seg = this.seg;
    const len = this.segLen;
    this.seg = null;
    this.segLen = 0;
    if (!seg || this.speechMs < (this.opts.minSpeechMs ?? 250)) return false;
    this.opts.onSegment(encodeWav(seg, len, this.rate), len / this.rate);
    if (this.mode === "single") this.stop();
    return true;
  }

  stop(): void {
    if (this.stopped && !this.stream && !this.ctx) return;
    this.stopped = true;
    try {
      if (this.node) {
        this.node.port.onmessage = null;
        this.node.disconnect();
      }
    } catch {
      /* already disconnected */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.ctx && this.ctx.state !== "closed") void this.ctx.close().catch(() => undefined);
    this.node = null;
    this.stream = null;
    this.ctx = null;
    this.opts.onLevel?.(0);
  }
}

function encodeWav(chunks: Float32Array[], length: number, inRate: number): Blob {
  const data = new Float32Array(length);
  let off = 0;
  for (const c of chunks) {
    data.set(c, off);
    off += c.length;
  }
  const outRate = inRate > 16000 ? 16000 : inRate;
  const ratio = inRate / outRate;
  const outLen = Math.floor(length / ratio);
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let s = 0;
    for (let j = start; j < end; j++) s += data[j];
    const v = Math.max(-1, Math.min(1, s / (end - start)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buf);
  const str = (o: number, t: string) => {
    for (let i = 0; i < t.length; i++) view.setUint8(o + i, t.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Blob([buf], { type: "audio/wav" });
}

export async function transcribe(wav: Blob): Promise<{ text: string; suspect: boolean }> {
  const r = await fetch("/api/stt", { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav });
  const j = (await r.json().catch(() => ({}))) as { text?: string; suspect?: boolean; error?: string };
  if (!r.ok) throw new Error(j.error ?? `Transcription impossible (${r.status}).`);
  return { text: (j.text ?? "").trim(), suspect: Boolean(j.suspect) };
}
