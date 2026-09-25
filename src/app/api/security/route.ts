// Scan de sécurité (Premium, version PC) : processus actifs + démarrage Windows.
import { getSettings } from "@/lib/brain/settings";
import { runSecurityScan } from "@/lib/brain/security";
import { hasPremium } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const s = await getSettings();
  if (!hasPremium(s)) return Response.json({ error: "Le scan de sécurité est réservé à l'édition Premium." }, { status: 403 });
  const r = await runSecurityScan();
  if (!r) return Response.json({ error: "PowerShell indisponible." }, { status: 500 });
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
