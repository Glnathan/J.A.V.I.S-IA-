// Whitelisted PC control. Only works when J.A.R.V.I.S. runs directly on the user's computer
// (Windows, macOS, or Linux with a desktop session). No arbitrary command can be executed.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

type Platform = "win32" | "darwin" | "linux";

export interface AppDef {
  names: string[];
  label: string;
  cmd: Partial<Record<Platform, string>>;
  web?: string;
  /** Prioritaire sur le site web du même nom (« ouvre deezer » lance l'application, pas deezer.com). */
  preferred?: boolean;
}

export function pcControlAvailable(): boolean {
  if (process.env.JARVIS_PC_CONTROL === "false") return false;
  if (process.platform === "win32" || process.platform === "darwin") return true;
  return process.platform === "linux" && Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
}

export const PC_APPS: AppDef[] = [
  { names: ["calculatrice", "calculette", "calculator", "calcul"], label: "la calculatrice", cmd: { win32: 'start "" calc', darwin: "open -a Calculator", linux: "gnome-calculator || kcalc || xcalc" } },
  { names: ["bloc notes", "bloc note", "notepad", "editeur de texte", "blocnote"], label: "le bloc-notes", cmd: { win32: 'start "" notepad', darwin: "open -a TextEdit", linux: "gedit || kate || mousepad || xed" } },
  { names: ["explorateur", "explorateur de fichiers", "explorateur windows", "gestionnaire de fichiers", "finder", "fichiers", "mes fichiers"], label: "l'explorateur de fichiers", cmd: { win32: 'start "" explorer', darwin: "open ~", linux: "xdg-open ~" } },
  { names: ["paint"], label: "Paint", cmd: { win32: 'start "" mspaint' } },
  { names: ["terminal", "invite de commande", "invite de commandes", "cmd", "powershell", "console"], label: "le terminal", cmd: { win32: 'start "" cmd', darwin: "open -a Terminal", linux: "x-terminal-emulator || gnome-terminal || konsole" } },
  { names: ["parametres", "reglages", "parametres windows", "preferences systeme", "reglages systeme"], label: "les paramètres", cmd: { win32: 'start "" ms-settings:', darwin: "open -b com.apple.systempreferences", linux: "gnome-control-center" } },
  { names: ["panneau de configuration"], label: "le panneau de configuration", cmd: { win32: 'start "" control' } },
  { names: ["gestionnaire des taches", "gestionnaire de taches", "moniteur d activite", "task manager", "moniteur systeme"], label: "le gestionnaire des tâches", cmd: { win32: 'start "" taskmgr', darwin: 'open -a "Activity Monitor"', linux: "gnome-system-monitor" } },
  { names: ["word", "microsoft word"], label: "Word", cmd: { win32: 'start "" winword', darwin: 'open -a "Microsoft Word"' }, web: "https://www.office.com/launch/word" },
  { names: ["excel", "microsoft excel"], label: "Excel", cmd: { win32: 'start "" excel', darwin: 'open -a "Microsoft Excel"' }, web: "https://www.office.com/launch/excel" },
  { names: ["powerpoint", "power point"], label: "PowerPoint", cmd: { win32: 'start "" powerpnt', darwin: 'open -a "Microsoft PowerPoint"' }, web: "https://www.office.com/launch/powerpoint" },
  { names: ["vs code", "vscode", "visual studio code"], label: "Visual Studio Code", cmd: { win32: "code", darwin: 'open -a "Visual Studio Code"', linux: "code" } },
  { names: ["chrome", "google chrome"], label: "Google Chrome", cmd: { win32: 'start "" chrome', darwin: 'open -a "Google Chrome"', linux: "google-chrome || chromium || chromium-browser" } },
  { names: ["firefox", "mozilla firefox"], label: "Firefox", cmd: { win32: 'start "" firefox', darwin: "open -a Firefox", linux: "firefox" } },
  { names: ["edge", "microsoft edge"], label: "Microsoft Edge", cmd: { win32: 'start "" msedge', darwin: 'open -a "Microsoft Edge"', linux: "microsoft-edge" } },
  { names: ["camera", "appareil photo", "webcam"], label: "l'appareil photo", cmd: { win32: 'start "" microsoft.windows.camera:', darwin: 'open -a "Photo Booth"', linux: "cheese" } },
  { names: ["capture d ecran", "outil capture", "capture"], label: "l'outil de capture", cmd: { win32: 'start "" ms-screenclip:', darwin: "open -a Screenshot" } },
  { names: ["application spotify", "appli spotify", "logiciel spotify"], label: "Spotify", cmd: { win32: 'start "" spotify:', darwin: "open -a Spotify", linux: "spotify" }, web: "https://open.spotify.com" },
  { names: ["deezer", "application deezer", "appli deezer", "logiciel deezer"], label: "Deezer", cmd: { win32: 'start "" "shell:appsFolder\\Deezer.62021768415AF_q7m17pa7q8kj0!Deezer.Music"', darwin: 'open -a "Deezer"' }, web: "https://www.deezer.com", preferred: true },
  { names: ["application discord", "appli discord", "logiciel discord"], label: "Discord", cmd: { win32: 'start "" discord:', darwin: "open -a Discord", linux: "discord" }, web: "https://discord.com/app" },
  { names: ["application steam", "appli steam", "logiciel steam"], label: "Steam", cmd: { win32: 'start "" steam:', darwin: "open -a Steam", linux: "steam" }, web: "https://store.steampowered.com" },
];

export const FOLDERS: { names: string[]; label: string; dir: string }[] = [
  { names: ["telechargements", "telechargement", "downloads"], label: "Téléchargements", dir: "Downloads" },
  { names: ["documents", "mes documents"], label: "Documents", dir: "Documents" },
  { names: ["bureau", "desktop"], label: "Bureau", dir: "Desktop" },
  { names: ["images", "photos", "mes images", "mes photos"], label: "Images", dir: "Pictures" },
  { names: ["musique", "ma musique"], label: "Musique", dir: "Music" },
  { names: ["videos", "mes videos"], label: "Vidéos", dir: "Videos" },
];

function matchLongest<T extends { names: string[] }>(list: T[], folded: string): T | null {
  let best: T | null = null;
  let bestLen = 0;
  const target = ` ${folded.trim()} `;
  for (const item of list) {
    for (const n of item.names) {
      if (n.length > bestLen && target.includes(` ${n} `)) {
        best = item;
        bestLen = n.length;
      }
    }
  }
  return best;
}

export const findApp = (folded: string) => matchLongest(PC_APPS, folded);
export const findFolder = (folded: string) => matchLongest(FOLDERS, folded);

function run(cmd: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: { ok: boolean; error?: string }) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    try {
      const child = spawn(cmd, { shell: true, detached: true, stdio: "ignore", windowsHide: true });
      child.on("error", (e) => done({ ok: false, error: e.message }));
      child.on("exit", (code) => done(code === 0 || code === null ? { ok: true } : { ok: false, error: `code ${code}` }));
      child.unref();
      setTimeout(() => done({ ok: true }), 1500);
    } catch (e) {
      done({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}

export async function launchApp(app: AppDef): Promise<{ ok: boolean; supported: boolean; error?: string }> {
  const cmd = app.cmd[process.platform as Platform];
  if (!cmd) return { ok: false, supported: false };
  const r = await run(cmd);
  return { ...r, supported: true };
}

export async function openFolder(dir: string): Promise<{ ok: boolean; error?: string }> {
  const real = process.platform === "darwin" && dir === "Videos" ? "Movies" : dir;
  const full = path.join(os.homedir(), real);
  const cmd =
    process.platform === "win32" ? `start "" explorer "${full}"` : process.platform === "darwin" ? `open "${full}"` : `xdg-open "${full}"`;
  return run(cmd);
}

export async function lockPc(): Promise<{ ok: boolean; error?: string }> {
  const cmd =
    process.platform === "win32"
      ? "rundll32.exe user32.dll,LockWorkStation"
      : process.platform === "darwin"
        ? "pmset displaysleepnow"
        : "loginctl lock-session || xdg-screensaver lock";
  return run(cmd);
}

/** Opens any folder (e.g. the Python plugins folder) in the system file explorer. */
export async function openPath(full: string): Promise<{ ok: boolean; error?: string }> {
  const safe = full.replace(/"/g, "");
  const cmd =
    process.platform === "win32" ? `start "" explorer "${safe}"` : process.platform === "darwin" ? `open "${safe}"` : `xdg-open "${safe}"`;
  return run(cmd);
}
