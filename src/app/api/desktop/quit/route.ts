import { isDesktop } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isDesktop()) {
    return Response.json({ ok: false, error: "Disponible uniquement dans la version PC de JARVIS." }, { status: 400 });
  }
  console.log("[jarvis] Arrêt demandé depuis l'interface.");
  setTimeout(() => process.exit(0), 700);
  return Response.json({ ok: true });
}
