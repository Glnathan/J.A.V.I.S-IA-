import { COOKIE, readRemoteConfig, signSession, verifyPin } from "@/lib/remote-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; until: number }>();
const MAX = 5;
const WINDOW = 10 * 60000;

function clientKey(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("host") || "?";
}

function isSecure(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  const host = (req.headers.get("host") ?? "").toLowerCase();
  return proto === "https" || /\.ts\.net(:\d+)?$/.test(host);
}

export async function POST(req: Request) {
  const key = clientKey(req);
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.count >= MAX && a.until > now) {
    return Response.json({ error: `Trop de tentatives. Réessayez dans ${Math.ceil((a.until - now) / 60000)} min.` }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { pin?: unknown };
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  const cfg = readRemoteConfig();
  if (cfg.mode === "off") return Response.json({ error: "Accès distant désactivé." }, { status: 403 });
  if (!cfg.pinHash) return Response.json({ error: "Aucun code PIN défini sur le PC (Paramètres → Mobile)." }, { status: 403 });
  if (!verifyPin(pin, cfg)) {
    const cur = a && a.until > now ? a : { count: 0, until: now + WINDOW };
    cur.count += 1;
    cur.until = now + WINDOW;
    attempts.set(key, cur);
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({ error: `Code incorrect (${Math.max(0, MAX - cur.count)} essai${MAX - cur.count > 1 ? "s" : ""} restant${MAX - cur.count > 1 ? "s" : ""}).` }, { status: 401 });
  }
  attempts.delete(key);
  const { token, maxAge } = signSession(cfg);
  const cookie = `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${isSecure(req) ? "; Secure" : ""}`;
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}

export async function DELETE(req: Request) {
  const cookie = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isSecure(req) ? "; Secure" : ""}`;
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
