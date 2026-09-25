import { getSettings } from "@/lib/brain/settings";
import { createBackup, listBackups, restoreBackup } from "@/lib/backup";
import { hasPremium } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liste des sauvegardes (la création et la restauration sont réservées à l'édition Premium). */
export async function GET() {
  const s = await getSettings();
  const backups = listBackups();
  return Response.json({
    premium: hasPremium(s),
    backups,
    lastAt: backups[0]?.createdAt ?? null,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; id?: string };
  const s = await getSettings();
  if (!hasPremium(s))
    return Response.json({ error: "Les sauvegardes sont réservées à l'édition Premium." }, { status: 403 });
  if (body.action === "create") {
    try {
      return Response.json(createBackup());
    } catch (e) {
      return Response.json({ error: e instanceof Error ? e.message : "Échec de la sauvegarde." }, { status: 500 });
    }
  }
  if (body.action === "restore") {
    const r = restoreBackup(body.id ?? "");
    return Response.json(r, { status: r.ok ? 200 : 400 });
  }
  return Response.json({ error: "Action inconnue." }, { status: 400 });
}
