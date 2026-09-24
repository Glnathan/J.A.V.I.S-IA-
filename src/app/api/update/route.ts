import { getSettings } from "@/lib/brain/settings";
import { hasPremium } from "@/lib/premium";
import { checkUpdate, downloadAndInstall } from "@/lib/updates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** État des mises à jour : version actuelle contre la dernière release GitHub. */
export async function GET() {
  return Response.json(await checkUpdate());
}

/** Installation silencieuse de la mise à jour — réservée à l'édition Premium. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "install") return Response.json({ error: "Action inconnue" }, { status: 400 });
  const s = await getSettings();
  if (!hasPremium(s)) return Response.json({ error: "Les mises à jour automatiques sont réservées à l'édition Premium." }, { status: 403 });
  const check = await checkUpdate();
  if (!check.downloadUrl)
    return Response.json({ error: "Aucune mise à jour téléchargeable (déjà à jour, ou installateur absent de la release GitHub)." }, { status: 400 });
  const r = await downloadAndInstall(check.downloadUrl);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
