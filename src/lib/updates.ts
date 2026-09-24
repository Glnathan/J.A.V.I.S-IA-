// Mises à jour J.A.R.V.I.S. : consultation des releases GitHub + installation silencieuse (Premium).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { APP_VERSION } from "@/lib/version";
import { dataDir } from "@/lib/runtime";

const REPO = "Glnathan/J.A.V.I.S-IA-";
const API = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface UpdateCheck {
  current: string;
  /** Dernière version publiée, si plus récente que l'actuelle. */
  latest: string | null;
  url: string | null;
  downloadUrl: string | null;
  notes: string | null;
}

const versionNumber = (v: string) =>
  v
    .replace(/^v/, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);

function isNewer(candidate: string, current: string): boolean {
  const a = versionNumber(candidate);
  const b = versionNumber(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/** Compare la version installée à la dernière release GitHub (null si à jour ou injoignable). */
export async function checkUpdate(): Promise<UpdateCheck> {
  const out: UpdateCheck = { current: APP_VERSION, latest: null, url: null, downloadUrl: null, notes: null };
  try {
    const r = await fetch(API, {
      headers: { "User-Agent": "jarvis-update", Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return out;
    const j = (await r.json()) as {
      tag_name?: string;
      html_url?: string;
      body?: string;
      assets?: { name: string; browser_download_url: string }[];
    };
    const tag = (j.tag_name ?? "").trim();
    if (!tag || !isNewer(tag, APP_VERSION)) return out;
    const asset = (j.assets ?? []).find((a) => /^JARVIS-Setup-.*\.exe$/i.test(a.name));
    out.latest = tag.replace(/^v/, "");
    out.url = j.html_url ?? null;
    out.notes = (j.body ?? "").slice(0, 600) || null;
    out.downloadUrl = asset?.browser_download_url ?? null;
    return out;
  } catch {
    return out;
  }
}

/**
 * Télécharge l'installateur de la mise à jour et programme son installation silencieuse :
 * un script attend l'arrêt de J.A.R.V.I.S. (demandé par l'interface), exécute le setup en mode /S,
 * relance J.A.R.V.I.S. puis s'efface. Réservé à l'édition Premium.
 */
export async function downloadAndInstall(url: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const dest = path.join(dataDir(), "mise-a-jour.exe");
    const res = await fetch(url, { signal: AbortSignal.timeout(300000) });
    if (!res.ok || !res.body) return { ok: false, error: `Téléchargement impossible (HTTP ${res.status})` };
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    const script = path.join(dataDir(), "maj-jarvis.cmd");
    fs.writeFileSync(
      script,
      [
        "@echo off",
        "rem Attente de l'arrêt de J.A.R.V.I.S. (l'interface appelle /api/desktop/quit juste après)",
        "ping -n 16 127.0.0.1 >nul",
        'powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like \'*Programs\\JARVIS*\' } | Stop-Process -Force" >nul 2>&1',
        `"%APPDATA%\\JARVIS\\mise-a-jour.exe" /S`,
        "ping -n 8 127.0.0.1 >nul",
        'start "" "%LOCALAPPDATA%\\Programs\\JARVIS\\JARVIS.exe"',
        `del "%~f0"`,
      ].join("\r\n"),
      { encoding: "ascii" },
    );
    const child = spawn("cmd.exe", ["/c", script], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" };
  }
}
