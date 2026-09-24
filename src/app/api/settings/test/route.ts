import { resolveAI, shortReason, streamChat } from "@/lib/brain/llm";
import { getSettings } from "@/lib/brain/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 40;

export async function POST() {
  const s = await getSettings();
  const ai = resolveAI(s);
  if (!ai) {
    return Response.json({
      ok: false,
      message: "Aucune IA n'est configurée. Choisissez un fournisseur et saisissez une clé (ou utilisez Ollama en local).",
    });
  }
  try {
    let out = "";
    for await (const chunk of streamChat(
      ai,
      "Tu es J.A.R.V.I.S. Réponds en français, en une seule phrase courte.",
      [{ role: "user", content: "Test de connexion : confirme que tu es opérationnel." }],
      AbortSignal.timeout(30000),
    )) {
      out += chunk;
      if (out.length > 300) break;
    }
    return Response.json({ ok: true, message: out.trim() || "Connexion établie.", provider: ai.label, model: ai.model });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return Response.json({ ok: false, message: `${shortReason(raw)}. Détail : ${raw.slice(0, 200)}` });
  }
}
