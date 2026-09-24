// Server-side speech-to-text (Whisper) — used when the browser's own speech recognition is
// unavailable or unreliable (Firefox, Brave, Edge outages…). Works in every browser.
import { aiKeysOf, type SettingsRow } from "./settings";

export type SttProvider = "groq" | "openai";

const PROVIDERS: Record<SttProvider, { url: string; model: string; env: string[]; label: string }> = {
  groq: {
    url: "https://api.groq.com/openai/v1/audio/transcriptions",
    model: "whisper-large-v3-turbo",
    env: ["GROQ_API_KEY"],
    label: "Groq Whisper",
  },
  openai: {
    url: "https://api.openai.com/v1/audio/transcriptions",
    model: "gpt-4o-mini-transcribe",
    env: ["OPENAI_API_KEY"],
    label: "OpenAI",
  },
};

export interface ResolvedSTT {
  provider: SttProvider;
  label: string;
  url: string;
  model: string;
  apiKey: string;
  origin: "settings" | "ai" | "env";
}

/** Key priority: dedicated Whisper key → AI key of the same provider → environment variable. */
export function resolveSTT(s: SettingsRow): ResolvedSTT | null {
  const provider: SttProvider = s.sttProvider === "openai" ? "openai" : "groq";
  const p = PROVIDERS[provider];
  const base = { provider, label: p.label, url: p.url, model: p.model };
  if (s.sttApiKey.trim()) return { ...base, apiKey: s.sttApiKey.trim(), origin: "settings" };
  if (s.aiProvider === provider && s.aiApiKey.trim()) return { ...base, apiKey: s.aiApiKey.trim(), origin: "ai" };
  const perProvider = aiKeysOf(s)[provider];
  if (perProvider) return { ...base, apiKey: perProvider, origin: "ai" };
  for (const k of p.env) {
    const v = process.env[k]?.trim();
    if (v) return { ...base, apiKey: v, origin: "env" };
  }
  return null;
}

// Whisper sometimes "hears" these sentences in noise or silence.
const SUSPECT = [
  /sous[- ]?titr/i,
  /amara\.org/i,
  /merci d'avoir regard/i,
  /abonnez[- ]vous/i,
  /radio[- ]canada/i,
  /^\W*merci( beaucoup)?\W*$/i,
  /^\W*(musique|applaudissements|rires|silence)\W*$/i,
  /^[\s.…,!?-]*$/,
];

export function isSuspectTranscript(text: string): boolean {
  return SUSPECT.some((re) => re.test(text));
}
