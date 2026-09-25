// Ouverture native d'un site (version PC) : contourne le bloqueur de pop-ups du
// navigateur pour les commandes vocales (« ouvre YouTube »). Réservé au JARVIS
// installé — la version web publique refuse toujours.
import { spawn } from "node:child_process";
import { isDesktop } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isDesktop()) return Response.json({ error: "Réservé à la version PC installée." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  const url = typeof body.url === "string" ? body.url.trim() : "";
  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    parsed = null;
  }
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:") || url.length > 2000)
    return Response.json({ error: "Adresse invalide." }, { status: 400 });
  const safe = parsed.toString().replace(/'/g, "''");
  const code = await new Promise<number>((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Start-Process -FilePath '${safe}'`], {
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore"],
    });
    const timer = setTimeout(() => child.kill(), 8000);
    child.on("close", (c) => {
      clearTimeout(timer);
      resolve(c ?? 1);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(1);
    });
  });
  return code === 0 ? Response.json({ ok: true }) : Response.json({ error: "Ouverture impossible." }, { status: 500 });
}
