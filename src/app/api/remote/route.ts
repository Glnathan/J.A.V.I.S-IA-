import os from "node:os";
import QRCode from "qrcode";
import { writeDesktopFiles } from "@/lib/desktop/profile";
import { tailscaleInfo, tailscaleServe, type TailscaleInfo } from "@/lib/desktop/tailscale";
import { getSettings } from "@/lib/brain/settings";
import { isValidPin, readRemoteConfig, setPin, writeRemoteConfig, type RemoteMode } from "@/lib/remote-config";
import { isDesktop, remoteSeenAt } from "@/lib/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface RemotePayload {
  desktop: boolean;
  mode: RemoteMode;
  pinSet: boolean;
  port: number;
  bind: string;
  restartNeeded: boolean;
  lanUrls: string[];
  tailscale: TailscaleInfo | null;
  url: string | null;
  qrSvg: string | null;
  remoteSeenAt: string | null;
}

function port(): number {
  return Number(process.env.PORT) || 3777;
}

function lanUrls(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal) out.push(`http://${ni.address}:${port()}`);
    }
  }
  return out;
}

async function payload(withTailscale = true): Promise<RemotePayload> {
  const cfg = readRemoteConfig();
  const desktop = isDesktop();
  const bind = process.env.JARVIS_BIND || "127.0.0.1";
  const ts = desktop && withTailscale ? await tailscaleInfo(port()) : null;
  const lans = desktop ? lanUrls() : [];
  const url = cfg.mode === "tailscale" ? (ts?.httpsUrl ?? null) : cfg.mode === "lan" ? (lans[0] ?? null) : null;
  let qrSvg: string | null = null;
  if (url) {
    try {
      qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, color: { dark: "#22d3ee", light: "#00000000" } });
    } catch {
      qrSvg = null;
    }
  }
  const seen = remoteSeenAt();
  return {
    desktop,
    mode: cfg.mode,
    pinSet: Boolean(cfg.pinHash),
    port: port(),
    bind,
    restartNeeded: desktop && cfg.mode === "lan" && bind !== "0.0.0.0",
    lanUrls: lans,
    tailscale: ts,
    url,
    qrSvg,
    remoteSeenAt: seen ? new Date(seen).toISOString() : null,
  };
}

export async function GET() {
  return Response.json(await payload());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; mode?: unknown; pin?: unknown; on?: unknown };
  if (body.action === "mode") {
    const mode = body.mode === "tailscale" || body.mode === "lan" ? body.mode : "off";
    writeRemoteConfig({ mode });
    if (isDesktop()) {
      try {
        writeDesktopFiles(await getSettings());
      } catch (e) {
        console.error("[jarvis] lanceur.json :", e);
      }
    }
    return Response.json(await payload(false));
  }
  if (body.action === "pin") {
    const pin = typeof body.pin === "string" ? body.pin.trim() : "";
    if (!isValidPin(pin)) return Response.json({ error: "Le code PIN doit contenir 4 à 8 chiffres." }, { status: 400 });
    if (/^(\d)\1+$/.test(pin) || pin === "1234" || pin === "123456" || pin === "0000") return Response.json({ error: "Choisissez un code moins évident." }, { status: 400 });
    setPin(pin);
    return Response.json(await payload(false));
  }
  if (body.action === "serve") {
    if (!isDesktop()) return Response.json({ ok: false, message: "Disponible uniquement dans la version PC." }, { status: 400 });
    const r = await tailscaleServe(port(), body.on !== false);
    return Response.json({ ...r, payload: await payload() });
  }
  return Response.json({ error: "Action inconnue" }, { status: 400 });
}
