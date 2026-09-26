import { shortReason } from "@/lib/brain/llm";
import { getSettings } from "@/lib/brain/settings";
import { isSuspectTranscript, resolveSTT, type ResolvedSTT } from "@/lib/brain/stt";
import { localSttStatus, startLocalInstall, transcribeLocal } from "@/lib/brain/sttLocal";
import { hasPremium } from "@/lib/premium";
import { touchActivity } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

/** État du moteur de transcription 100% locale (installation, disponibilité). */
export async function GET(req: Request) {
  const action = new URL(req.url).searchParams.get("action") ?? "";
  if (action !== "local-status") return Response.json({ error: "Action inconnue." }, { status: 400 });
  return Response.json(localSttStatus());
}

/** Installation du moteur local (Premium, version PC). */
export async function PUT(req: Request) {
  touchActivity();
  const action = new URL(req.url).searchParams.get("action") ?? "";
  if (action !== "local-install") return Response.json({ error: "Action inconnue." }, { status: 400 });
  const s = await getSettings();
  if (!hasPremium(s)) return Response.json({ error: "La transcription 100% locale est réservée à l'édition Premium." }, { status: 403 });
  const r = startLocalInstall();
  return Response.json(r, { status: r.started ? 200 : 400 });
}

/** Transcription cloud (Groq/OpenAI) — chemin historique. */
async function transcribeCloud(stt: ResolvedSTT, userName: string, buf: Buffer, type: string, providerLabel: string) {
  const ext = type.includes("webm") ? "webm" : type.includes("ogg") ? "ogg" : type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("mpeg") ? "mp3" : "wav";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: type || "audio/wav" }), `jarvis.${ext}`);
  form.append("model", stt.model);
  form.append("language", "fr");
  form.append("response_format", "json");
  form.append("temperature", "0");
  form.append("prompt", `Jarvis. ${userName}`.trim());
  try {
    const r = await fetch(stt.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${stt.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return Response.json({ error: `Transcription impossible (${shortReason(`HTTP ${r.status} ${detail}`)}).` }, { status: 502 });
    }
    const j = (await r.json()) as { text?: string };
    const text = (j.text ?? "").replace(/\s+/g, " ").trim();
    return Response.json({ text, suspect: isSuspectTranscript(text), provider: providerLabel });
  } catch (e) {
    return Response.json({ error: `Service de transcription injoignable (${shortReason(e instanceof Error ? e.message : String(e))}).` }, { status: 502 });
  }
}

export async function POST(req: Request) {
  touchActivity();
  const s = await getSettings();
  const stt = resolveSTT(s);
  const type = (req.headers.get("content-type") || "audio/wav").split(";")[0].trim().toLowerCase();
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > MAX_BYTES) return Response.json({ error: "Enregistrement trop long." }, { status: 413 });

  // Transcription 100% locale (Premium) : l'audio ne quitte jamais le PC.
  if (s.sttEngine === "local" && hasPremium(s)) {
    if (buf.length < 2000) return Response.json({ text: "", suspect: true });
    try {
      const text = await transcribeLocal(buf);
      return Response.json({ text, suspect: isSuspectTranscript(text), provider: "Locale" });
    } catch (e) {
      // Repli cloud si le moteur local échoue (le service n'est jamais perdu).
      if (stt)
        return transcribeCloud(stt, s.userName, buf, type, `Locale → ${stt.label}`);
      return Response.json({ error: `Transcription locale impossible : ${e instanceof Error ? e.message : String(e)}` }, { status: 502 });
    }
  }

  if (!stt) {
    return Response.json(
      { error: "Moteur Whisper non configuré : ajoutez une clé Groq (gratuite) ou OpenAI dans Paramètres → Voix & micro." },
      { status: 400 },
    );
  }
  if (buf.length < 2000) return Response.json({ text: "", suspect: true });
  return transcribeCloud(stt, s.userName, buf, type, stt.label);
}
