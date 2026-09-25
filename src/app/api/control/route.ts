import { getSettings } from "@/lib/brain/settings";
import { runControl, type ControlAction } from "@/lib/brain/control";
import { hasPremium } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Exécution d'une action de contrôle confirmée par l'utilisateur (édition Premium, version PC). */
export async function POST(req: Request) {
  const s = await getSettings();
  if (!hasPremium(s)) return Response.json({ error: "La prise de contrôle est réservée à l'édition Premium." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { action?: ControlAction };
  const a = body.action;
  if (!a || !["click", "dblclick", "type", "key"].includes(a.kind))
    return Response.json({ error: "Action inconnue." }, { status: 400 });
  const r = await runControl(a);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
