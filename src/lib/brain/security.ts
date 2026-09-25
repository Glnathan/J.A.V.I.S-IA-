// Scan de sécurité (Premium, version PC) : analyse PowerShell native — processus
// actifs exécutés depuis des dossiers à risque, entrées de démarrage suspects
// (registre Run). Rapport consulté, rien n'est supprimé sans vous.
import { spawn } from "node:child_process";
import { isDesktop } from "@/lib/runtime";

export interface ScanReport {
  ok: boolean;
  totalProcesses: number;
  /** Processus exécutés depuis Temp / Downloads / Public (nom|chemin). */
  processes: string[];
  /** Entrées de démarrage du registre pointant vers des dossiers à risque (nom|commande). */
  startups: string[];
  error?: string;
}

const SCRIPT = String.raw`$out = [ordered]@{ total = (Get-Process).Count; processes = @(); startups = @() }
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.ExecutablePath -and ("$($_.ExecutablePath)" -match '(?i)(\\temp\\|\\downloads\\|\\public\\)') } | ForEach-Object { $out.processes += ($_.Name + '|' + $_.ExecutablePath) }
$keys = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run'
foreach ($k in $keys) {
  if (Test-Path $k) {
    (Get-ItemProperty $k).PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' -and ("$($_.Value)" -match '(?i)(\\temp\\|\\downloads\\|\\public\\)') } | ForEach-Object { $out.startups += ($_.Name + '|' + "$($_.Value)") }
  }
}
$out | ConvertTo-Json -Compress`;

/** Analyse le système (Premium, version PC). null = PowerShell indisponible. */
export async function runSecurityScan(): Promise<ScanReport | null> {
  if (!isDesktop()) return { ok: false, totalProcesses: 0, processes: [], startups: [], error: "La version PC installée est requise." };
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", SCRIPT], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), 20000);
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const j = JSON.parse(out) as { total?: number; processes?: string[]; startups?: string[] };
        resolve({
          ok: true,
          totalProcesses: Number(j.total) || 0,
          processes: Array.isArray(j.processes) ? j.processes.slice(0, 10) : [],
          startups: Array.isArray(j.startups) ? j.startups.slice(0, 10) : [],
        });
      } catch {
        resolve({ ok: false, totalProcesses: 0, processes: [], startups: [], error: (err || out || "Analyse impossible").slice(0, 200) });
      }
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

/** Résumé parlé du rapport. */
export function scanSummary(r: ScanReport): string {
  const nb = r.processes.length + r.startups.length;
  if (!r.ok) return `L'analyse a échoué : ${r.error ?? "erreur inconnue"}.`;
  if (nb === 0)
    return `Aucune anomalie détectée : ${r.totalProcesses} processus en cours, aucun ne s'exécute depuis un dossier à risque, et le démarrage de Windows est propre.`;
  const details = [
    r.processes.length ? `${r.processes.length} processus depuis un dossier à risque (${r.processes.map((p) => p.split("|")[0]).join(", ")})` : "",
    r.startups.length ? `${r.startups.length} entrée(s) de démarrage suspecte(s) (${r.startups.map((s) => s.split("|")[0]).join(", ")})` : "",
  ].filter(Boolean);
  return `Attention : ${details.join(" et ")}. Rien n'a été supprimé — les détails sont dans Paramètres → Sécurité, à vérifier avant tout nettoyage.`;
}
