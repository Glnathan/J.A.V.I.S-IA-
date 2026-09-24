import { shortReason } from "@/lib/brain/llm";
import { getSettings } from "@/lib/brain/settings";
import { isSuspectTranscript, resolveSTT } from "@/lib/brain/stt";
import { touchActivity } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: Request) {
  touchActivity();
  const s = await getSettings();
  const stt = resolveSTT(s);
  if (!stt) {
    return Response.json(
      { error: "Moteur Whisper non configuré : ajoutez une clé Groq (gratuite) ou OpenAI dans Paramètres → Voix & micro." },
      { status: 400 },
    );
  }
  const type = (req.headers.get("content-type") || "audio/wav").split(";")[0].trim().toLowerCase();
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > MAX_BYTES) return Response.json({ error: "Enregistrement trop long." }, { status: 413 });
  if (buf.length < 2000) return Response.json({ text: "", suspect: true });

  const ext = type.includes("webm") ? "webm" : type.includes("ogg") ? "ogg" : type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("mpeg") ? "mp3" : "wav";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: type || "audio/wav" }), `jarvis.${ext}`);
  form.append("model", stt.model);
  form.append("language", "fr");
  form.append("response_format", "json");
  form.append("temperature", "0");
  form.append("prompt", `Jarvis. ${s.userName}`.trim());

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
    return Response.json({ text, suspect: isSuspectTranscript(text), provider: stt.label });
  } catch (e) {
    return Response.json({ error: `Service de transcription injoignable (${shortReason(e instanceof Error ? e.message : String(e))}).` }, { status: 502 });
  }
}
