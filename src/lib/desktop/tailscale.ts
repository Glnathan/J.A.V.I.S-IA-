// Tailscale CLI helpers (PC version): status, MagicDNS name, HTTPS certificates and `tailscale serve`.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface TailscaleInfo {
  installed: boolean;
  running: boolean;
  loggedIn: boolean;
  backendState: string;
  dnsName: string | null;
  ips: string[];
  httpsEnabled: boolean;
  serving: boolean;
  httpsUrl: string | null;
  error?: string;
}

function candidates(): string[] {
  const list: string[] = [];
  if (process.platform === "win32") {
    for (const base of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA].filter(Boolean) as string[]) {
      list.push(path.join(/* turbopackIgnore: true */ base, "Tailscale", "tailscale.exe"));
    }
    list.push("tailscale.exe");
  } else if (process.platform === "darwin") {
    list.push("/Applications/Tailscale.app/Contents/MacOS/Tailscale", "/usr/local/bin/tailscale", "/opt/homebrew/bin/tailscale", "tailscale");
  } else list.push("/usr/bin/tailscale", "/usr/local/bin/tailscale", "tailscale");
  return list;
}

let resolved: string | null | undefined;

export function tailscaleBinary(): string | null {
  // Cache seulement les détections réussies : une installation de Tailscale après le démarrage
  // de JARVIS doit être détectée sans redémarrage.
  if (typeof resolved === "string") return resolved;
  resolved = null;
  for (const c of candidates()) {
    if (path.isAbsolute(c)) {
      if (fs.existsSync(c)) {
        resolved = c;
        break;
      }
    } else resolved = resolved ?? c; // bare name: rely on PATH (checked when run)
  }
  return resolved;
}

function run(args: string[], timeoutMs = 10000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const bin = tailscaleBinary();
    if (!bin) {
      resolve({ code: 127, stdout: "", stderr: "tailscale introuvable" });
      return;
    }
    execFile(bin, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const code = err && typeof (err as { code?: unknown }).code === "number" ? ((err as { code: number }).code as number) : err ? 1 : 0;
      if (err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        resolved = null;
        resolve({ code: 127, stdout: "", stderr: "tailscale introuvable" });
        return;
      }
      resolve({ code, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

interface StatusJson {
  BackendState?: string;
  Self?: { DNSName?: string; TailscaleIPs?: string[] };
  CertDomains?: string[];
  MagicDNSSuffix?: string;
}

export async function tailscaleInfo(port: number): Promise<TailscaleInfo> {
  const base: TailscaleInfo = {
    installed: false,
    running: false,
    loggedIn: false,
    backendState: "",
    dnsName: null,
    ips: [],
    httpsEnabled: false,
    serving: false,
    httpsUrl: null,
  };
  const st = await run(["status", "--json"]);
  if (st.code === 127) return base;
  base.installed = true;
  if (!st.stdout.trim()) return { ...base, error: st.stderr.trim() || "Tailscale ne répond pas (est-il démarré ?)" };
  let j: StatusJson;
  try {
    j = JSON.parse(st.stdout) as StatusJson;
  } catch {
    return { ...base, error: "Réponse Tailscale illisible" };
  }
  base.backendState = j.BackendState ?? "";
  base.running = base.backendState === "Running";
  base.loggedIn = base.backendState !== "NeedsLogin" && base.backendState !== "NoState";
  base.dnsName = j.Self?.DNSName ? j.Self.DNSName.replace(/\.$/, "") : null;
  base.ips = (j.Self?.TailscaleIPs ?? []).filter((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip));
  base.httpsEnabled = Array.isArray(j.CertDomains) && j.CertDomains.length > 0;
  if (base.dnsName && base.httpsEnabled) base.httpsUrl = `https://${base.dnsName}/`;
  if (base.running) {
    const sv = await run(["serve", "status", "--json"]);
    base.serving = sv.code === 0 && sv.stdout.includes(`127.0.0.1:${port}`);
  }
  return base;
}

/** Publishes JARVIS (http://127.0.0.1:port) as https://<machine>.<tailnet>.ts.net through `tailscale serve`. */
export async function tailscaleServe(port: number, on: boolean): Promise<{ ok: boolean; message: string }> {
  const r = on ? await run(["serve", "--bg", `http://127.0.0.1:${port}`], 20000) : await run(["serve", "reset"], 20000);
  if (r.code === 0) {
    return { ok: true, message: on ? "Tailscale publie désormais JARVIS en HTTPS sur votre réseau privé." : "Publication Tailscale arrêtée." };
  }
  const detail = (r.stderr || r.stdout).trim().split("\n").slice(-2).join(" ").slice(0, 240);
  if (/needs login|NeedsLogin|not logged in/i.test(detail)) return { ok: false, message: "Connectez-vous d'abord à Tailscale sur ce PC (icône Tailscale → Se connecter)." };
  if (/HTTPS|cert|MagicDNS/i.test(detail)) return { ok: false, message: `Activez HTTPS et MagicDNS dans la console Tailscale (étape 2). Détail : ${detail}` };
  return { ok: false, message: detail || `tailscale a renvoyé le code ${r.code}` };
}
