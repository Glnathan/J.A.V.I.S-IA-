// Sauvegardes J.A.R.V.I.S. (édition Premium) : copie complète du dossier de données.
// Sauvegarde quotidienne automatique (voir instrumentation.ts) + sauvegarde et
// restauration manuelles depuis Paramètres → Premium. Restauration par script :
// le serveur doit être arrêté pour remplacer la base, puis JARVIS est relancé.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dataDir, isDesktop } from "@/lib/runtime";

const KEEP = 7;
/** Dossiers/fichiers exclus de la sauvegarde (volumineux, jetables ou dangereux à écraser). */
const EXCLUDED_DIRS = new Set(["sauvegardes", "logs", "navigateur-chrome", "node_modules"]);
const EXCLUDED_EXT = [".exe", ".cmd", ".bat", ".zip", ".7z"];

export interface BackupInfo {
  id: string;
  createdAt: number;
  /** Taille totale en octets. */
  size: number;
}

export function backupsDir(): string {
  const dir = path.join(dataDir(), "sauvegardes");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dirSize(dir: string): number {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) total += dirSize(p);
    else {
      try {
        total += fs.statSync(p).size;
      } catch {
        /* fichier disparu pendant le calcul */
      }
    }
  }
  return total;
}

/** Sauvegardes existantes, de la plus récente à la plus ancienne. */
export function listBackups(): BackupInfo[] {
  return fs
    .readdirSync(backupsDir(), { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^jarvis-\d{8}-\d{6}$/.test(e.name))
    .map((e) => {
      const stat = fs.statSync(path.join(backupsDir(), e.name));
      return { id: e.name, createdAt: stat.mtimeMs, size: dirSize(path.join(backupsDir(), e.name)) };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Crée une sauvegarde complète du dossier de données, puis supprime les plus vieilles (garder KEEP). */
export function createBackup(): BackupInfo {
  const stamp = new Date();
  const id = `jarvis-${[
    stamp.getFullYear(),
    String(stamp.getMonth() + 1).padStart(2, "0"),
    String(stamp.getDate()).padStart(2, "0"),
  ].join("")}-${[String(stamp.getHours()).padStart(2, "0"), String(stamp.getMinutes()).padStart(2, "0"), String(stamp.getSeconds()).padStart(2, "0")].join("")}`;
  const dest = path.join(backupsDir(), id);
  fs.mkdirSync(dest, { recursive: true });

  for (const e of fs.readdirSync(dataDir(), { withFileTypes: true })) {
    if (EXCLUDED_DIRS.has(e.name)) continue;
    if (e.isFile() && EXCLUDED_EXT.some((ext) => e.name.toLowerCase().endsWith(ext))) continue;
    const src = path.join(dataDir(), e.name);
    try {
      fs.cpSync(src, path.join(dest, e.name), { recursive: true });
    } catch (err) {
      console.error(`[jarvis] Sauvegarde : ${e.name} ignoré (${err instanceof Error ? err.message : "erreur"})`);
    }
  }

  const backups = listBackups();
  for (const old of backups.slice(KEEP)) {
    try {
      fs.rmSync(path.join(backupsDir(), old.id), { recursive: true, force: true });
    } catch {
      /* suppression best-effort */
    }
  }
  const info = listBackups().find((b) => b.id === id);
  if (!info) throw new Error("Sauvegarde introuvable après création");
  return info;
}

/**
 * Programme la restauration : un script attend l'arrêt de J.A.R.V.I.S. (demandé par
 * l'interface juste après), recopie la sauvegarde dans le dossier de données, relance
 * JARVIS puis s'efface. Comme la mise à jour automatique (maj-jarvis.cmd).
 */
export function restoreBackup(id: string): { ok: boolean; error?: string } {
  if (!/^jarvis-\d{8}-\d{6}$/.test(id)) return { ok: false, error: "Sauvegarde inconnue." };
  const src = path.join(backupsDir(), id);
  if (!fs.existsSync(src)) return { ok: false, error: "Sauvegarde introuvable." };
  if (!isDesktop()) return { ok: false, error: "La restauration n'est disponible que sur la version PC installée." };

  const target = dataDir();
  const script = path.join(target, "restaurer-jarvis.cmd");
  fs.writeFileSync(
    script,
    [
      "@echo off",
      "rem Attente de l'arret de J.A.R.V.I.S. (l'interface appelle /api/desktop/quit juste apres)",
      "ping -n 16 127.0.0.1 >nul",
      'powershell.exe -NoProfile -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like \'*Programs\\JARVIS*\' } | Stop-Process -Force" >nul 2>&1',
      'powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -in \'chrome.exe\',\'msedge.exe\' -and $_.CommandLine -like \'*--app=http://127.0.0.1:3777*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1',
      `robocopy "${src}" "${target}" /E /NFL /NDL /NJH /NJS /NP >nul`,
      "ping -n 8 127.0.0.1 >nul",
      'start "" "%LOCALAPPDATA%\\Programs\\JARVIS\\JARVIS.exe"',
      "del \"%~f0\"",
    ].join("\r\n"),
    { encoding: "ascii" },
  );
  const child = spawn("cmd.exe", ["/c", script], { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
  return { ok: true };
}
