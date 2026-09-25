// Text-to-speech helpers (Web Speech API).

export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

export function getVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!speechSupported()) return resolve([]);
    const synth = window.speechSynthesis;
    const now = synth.getVoices();
    if (now.length) return resolve(now);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(synth.getVoices());
    };
    synth.addEventListener("voiceschanged", finish, { once: true });
    setTimeout(finish, 2000);
  });
}

const PREFERRED = ["henri", "paul", "claude", "thomas", "remy", "rémy", "guillaume", "antoine", "jean", "google français", "google francais"];

/** Best French voice (male/natural voices first), or the user's choice. */
export function pickVoice(voices: SpeechSynthesisVoice[], preferred?: string): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  if (preferred) {
    const v = voices.find((x) => x.name === preferred);
    if (v) return v;
  }
  const fr = voices.filter((v) => v.lang?.toLowerCase().startsWith("fr"));
  const frFR = fr.filter((v) => v.lang.toLowerCase().replace("_", "-") === "fr-fr");
  const pool = frFR.length ? frFR : fr;
  if (!pool.length) return null;
  const scored = pool
    .map((v) => {
      const n = v.name.toLowerCase();
      let s = 0;
      PREFERRED.forEach((p, i) => {
        if (n.includes(p)) s = Math.max(s, 100 - i * 3);
      });
      if (n.includes("natural") || n.includes("online") || n.includes("neural")) s += 25;
      return { v, s };
    })
    .sort((a, b) => b.s - a.s);
  return scored[0].v;
}

export function cleanForSpeech(text: string): string {
  return text
    .replace(/\[\[[^\]]*\]\]/g, "")
    .replace(/```[\s\S]*?```/g, " (bloc de code) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/https?:\/\/\S+/g, "le lien")
    .replace(/J\.A\.R\.V\.I\.S\.?/g, "Jarvis")
    .replace(/°C/g, " degrés")
    .replace(/°/g, " degrés")
    .replace(/km\/h/g, " kilomètres heure")
    .replace(/(\d)\s?%/g, "$1 pour cent")
    .replace(/\bGo\b/g, "gigaoctets")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, "")
    .replace(/[«»"—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split into short utterances (Chrome stops long utterances after ~15 s). */
export function chunkText(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]+["»)]*\s*|[^.!?…]+$/g) ?? [text];
  const chunks: string[] = [];
  let cur = "";
  const push = (s: string) => {
    if ((cur ? `${cur} ${s}` : s).length <= max) cur = cur ? `${cur} ${s}` : s;
    else {
      if (cur) chunks.push(cur);
      cur = s;
    }
  };
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (s.length <= max) push(s);
    else {
      for (const part of s.split(/,\s+/)) {
        const p = part.trim();
        if (!p) continue;
        if (p.length <= max) push(p);
        else for (let i = 0; i < p.length; i += max) push(p.slice(i, i + max));
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export interface SpeakOptions {
  voice: SpeechSynthesisVoice | null;
  rate: number;
  pitch: number;
  volume?: number;
}

export interface SpeakerEvents {
  onStart?: () => void;
  onEnd?: () => void;
  onBoundary?: () => void;
}

export class Speaker {
  protected active = new Set<SpeechSynthesisUtterance>();
  protected timers = new Map<SpeechSynthesisUtterance, ReturnType<typeof setTimeout>>();
  protected events: SpeakerEvents = {};

  setEvents(e: SpeakerEvents) {
    this.events = e;
  }

  get speaking(): boolean {
    return this.active.size > 0;
  }

  speak(text: string, opts: SpeakOptions) {
    if (!speechSupported()) return;
    const clean = cleanForSpeech(text);
    if (!clean) return;
    const synth = window.speechSynthesis;
    if (synth.paused) synth.resume();
    for (const chunk of chunkText(clean)) {
      const u = new SpeechSynthesisUtterance(chunk);
      if (opts.voice) {
        u.voice = opts.voice;
        u.lang = opts.voice.lang;
      } else u.lang = "fr-FR";
      u.rate = opts.rate;
      u.pitch = opts.pitch;
      u.volume = opts.volume ?? 1;
      const done = () => this.finish(u);
      u.onstart = () => {
        const est = (chunk.length * 90) / Math.max(0.5, opts.rate) + 5000;
        this.timers.set(u, setTimeout(done, est));
        this.events.onStart?.();
      };
      u.onend = done;
      u.onerror = done;
      u.onboundary = () => this.events.onBoundary?.();
      this.active.add(u);
      synth.speak(u);
    }
    // Safety net: if the engine never starts, release the queue.
    setTimeout(() => {
      if (this.active.size && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) this.cancel();
    }, 4000);
  }

  private finish(u: SpeechSynthesisUtterance) {
    if (!this.active.delete(u)) return;
    const t = this.timers.get(u);
    if (t) clearTimeout(t);
    this.timers.delete(u);
    if (this.active.size === 0) this.events.onEnd?.();
  }

  cancel() {
    const was = this.active.size > 0;
    this.active.clear();
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    if (speechSupported()) window.speechSynthesis.cancel();
    if (was) this.events.onEnd?.();
  }
}

/**
 * Voix HD ElevenLabs (Premium) : le texte part au serveur JARVIS qui le
 * transforme en audio via la clé enregistrée (jamais exposée au navigateur).
 * Même interface que Speaker — remplacement direct.
 */
export class ElevenSpeaker extends Speaker {
  private audios = new Set<HTMLAudioElement>();
  private pending = 0;
  private token = 0;

  override get speaking(): boolean {
    return this.audios.size > 0 || this.pending > 0;
  }

  /** Fin d'écoute : plus aucun audio ni requête en vol. */
  private checkDone(): void {
    if (this.pending === 0 && this.audios.size === 0) this.events.onEnd?.();
  }

  override speak(text: string): void {
    const clean = cleanForSpeech(text).slice(0, 2000);
    if (!clean) return;
    this.token++;
    const mine = this.token;
    this.pending++;
    this.events.onStart?.();
    fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: clean }) })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        this.pending--;
        if (!blob || mine !== this.token) {
          this.checkDone();
          return;
        }
        const a = new Audio(URL.createObjectURL(blob));
        a.onended = () => this.doneAudio(a);
        a.onerror = () => this.doneAudio(a);
        this.audios.add(a);
        void a.play().catch(() => this.doneAudio(a));
      })
      .catch(() => {
        this.pending--;
        this.checkDone();
      });
  }

  private doneAudio(a: HTMLAudioElement) {
    this.audios.delete(a);
    this.checkDone();
  }

  override cancel(): void {
    const was = this.speaking;
    this.token++;
    this.pending = 0;
    this.audios.forEach((a) => a.pause());
    this.audios.clear();
    if (speechSupported()) window.speechSynthesis.cancel();
    if (was) this.events.onEnd?.();
  }
}
