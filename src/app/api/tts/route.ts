// Voix HD ElevenLabs (Premium) : synthèse côté serveur — la clé ne quitte jamais
// le PC. Renvoie l'audio (mp3) prêt à jouer.
import { getSettings } from "@/lib/brain/settings";
import { hasPremium } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Première voix du compte, résolue une fois puis gardée en mémoire. */
let defaultVoiceCache: string | null = null;

async function resolveVoiceId(key: string, wanted: string): Promise<string | null> {
  const id = wanted.trim();
  if (id) return id;
  if (defaultVoiceCache) return defaultVoiceCache;
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": key }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { voices?: { voice_id?: string; language?: string }[] };
    const fr = (j.voices ?? []).find((v) => (v.language ?? "").toLowerCase().startsWith("fr") && v.voice_id);
    const first = fr ?? (j.voices ?? []).find((v) => v.voice_id);
    if (first?.voice_id) {
      defaultVoiceCache = first.voice_id;
      return defaultVoiceCache;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const s = await getSettings();
  if (!hasPremium(s)) return Response.json({ error: "La voix HD ElevenLabs est réservée à l'édition Premium." }, { status: 403 });
  const key = s.elevenKey.trim();
  if (!key) return Response.json({ error: "Clé ElevenLabs manquante." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (!text) return Response.json({ error: "Texte vide." }, { status: 400 });
  const voiceId = await resolveVoiceId(key, s.elevenVoiceId);
  if (!voiceId) return Response.json({ error: "Aucune voix disponible sur ce compte ElevenLabs." }, { status: 400 });
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      const detail = r.status === 401 ? "clé invalide" : r.status === 402 || r.status === 429 ? "quota épuisé" : "erreur ElevenLabs";
      return Response.json({ error: `Synthèse impossible : ${detail}.` }, { status: 400 });
    }
    // Audio mis en tampon (petit mp3) : jamais de flux à moitié consommé si le client part.
    const audio = await r.arrayBuffer();
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "ElevenLabs injoignable (réseau)." }, { status: 502 });
  }
}
