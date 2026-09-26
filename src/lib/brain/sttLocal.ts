// Transcription 100% locale (Premium, version PC) : environnement Python dédié et
// persistant dans %APPDATA%\JARVIS\stt-local — survit aux mises à jour de JARVIS.
// Installation en 4 étapes (une seule fois, ~1 Go) puis Whisper tourne hors ligne :
// l'audio ne quitte jamais le PC.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { dataDir, isDesktop } from "@/lib/runtime";

const PY_VERSION = "3.12.10";
const PY_ZIP = `https://www.python.org/ftp/python/${PY_VERSION}/python-${PY_VERSION}-embed-amd64.zip`;
const GET_PIP = "https://bootstrap.pypa.io/get-pip.py";

export function sttLocalDir(): string {
  return path.join(dataDir(), "stt-local");
}
function pythonExe(): string {
  return path.join(sttLocalDir(), "python", "python.exe");
}
function modelsDir(): string {
  return path.join(sttLocalDir(), "models");
}
function workerScript(): string {
  return path.join(process.env.JARVIS_RESOURCES_DIR || process.cwd(), "python", "stt_worker.py");
}

/** Moteur installé (marqueur posé à la fin de l'installation). */
export function sttLocalInstalled(): boolean {
  if (!isDesktop()) return false;
  try {
    return fs.existsSync(path.join(sttLocalDir(), "installed.json"));
  } catch {
    return false;
  }
}

// ─── Installation (tâche de fond, état consultable par l'interface) ──────────

export interface InstallState {
  phase: "idle" | "python" | "pip" | "whisper" | "model" | "done" | "error";
  log: string[];
  error?: string;
  startedAt?: number;
}
const install: InstallState = { phase: "idle", log: [] };

export function localSttStatus(): InstallState & { installed: boolean } {
  return { ...install, log: install.log.slice(-6), installed: sttLocalInstalled() };
}

function say(line: string): void {
  install.log.push(line);
  if (install.log.length > 60) install.log.splice(0, install.log.length - 60);
  console.log(`[stt-local] ${line}`);
}

function run(cmd: string, args: string[], timeoutMs: number, env?: Record<string, string>): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true, env: { ...process.env, ...env } });
    let out = "";
    child.stdout?.on("data", (d: Buffer) => (out += d.toString("utf8")));
    child.stderr?.on("data", (d: Buffer) => (out += d.toString("utf8")));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ code: 1, out: String(e) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out: out.slice(-1500) });
    });
  });
}

async function download(url: string, dest: string): Promise<void> {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`Téléchargement impossible (HTTP ${r.status}) : ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
}

/** Lance l'installation (Premium, version PC). Retourne immédiatement. */
export function startLocalInstall(): { started: boolean; error?: string } {
  if (!isDesktop()) return { started: false, error: "La transcription locale nécessite la version PC installée." };
  if (install.phase !== "idle" && install.phase !== "error" && install.phase !== "done")
    return { started: false, error: "Installation déjà en cours." };
  if (sttLocalInstalled()) return { started: true };
  install.phase = "python";
  install.error = undefined;
  install.startedAt = Date.now();
  install.log = [];
  void (async () => {
    try {
      const dir = sttLocalDir();
      fs.mkdirSync(dir, { recursive: true });
      fs.mkdirSync(modelsDir(), { recursive: true });
      // 1. Python embarqué dédié (persistant, indépendant des mises à jour)
      if (!fs.existsSync(pythonExe())) {
        say("Téléchargement de Python…");
        const zip = path.join(dir, "python-embed.zip");
        await download(PY_ZIP, zip);
        const r = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${path.join(dir, "python").replace(/'/g, "''")}' -Force`], 120000);
        if (r.code !== 0 || !fs.existsSync(pythonExe())) throw new Error(`Extraction Python impossible : ${r.out.slice(-200)}`);
        fs.unlinkSync(zip);
      }
      // 2. Activation de site-packages (distribution embarquée) + pip
      const pth = path.join(path.dirname(pythonExe()), `python${PY_VERSION.split(".").slice(0, 2).join("")}._pth`);
      fs.writeFileSync(pth, `python${PY_VERSION.split(".").slice(0, 2).join("")}.zip\n.\nLib\\site-packages\nimport site\n`);
      if (!fs.existsSync(path.join(dir, "get-pip.py"))) await download(GET_PIP, path.join(dir, "get-pip.py"));
      say("Installation de pip…");
      const pip = await run(pythonExe(), [path.join(dir, "get-pip.py"), "--no-warn-script-location"], 300000);
      if (pip.code !== 0) throw new Error(`pip indisponible : ${pip.out.slice(-200)}`);
      // 3. faster-whisper
      install.phase = "whisper";
      say("Installation de Whisper (~300 Mo)…");
      const w = await run(pythonExe(), ["-m", "pip", "install", "--no-warn-script-location", "faster-whisper"], 900000);
      if (w.code !== 0) throw new Error(`Installation de Whisper échouée : ${w.out.slice(-300)}`);
      // 4. Téléchargement du modèle (premier lancement, ensuite 100% hors ligne)
      install.phase = "model";
      say("Téléchargement du modèle (~460 Mo)…");
      const warm = await run(
        pythonExe(),
        ["-u", workerScript(), "--warmup"],
        1200000,
        { JARVIS_STT_MODELS: modelsDir(), TRANSFORMERS_OFFLINE: "0", HF_HUB_OFFLINE: "0" },
      );
      if (warm.code !== 0 || !warm.out.includes('"ready"')) throw new Error(`Chargement du modèle échoué : ${warm.out.slice(-300)}`);
      fs.writeFileSync(path.join(dir, "installed.json"), JSON.stringify({ at: Date.now(), model: "small" }, null, 2));
      install.phase = "done";
      say("Moteur local prêt.");
    } catch (e) {
      install.phase = "error";
      install.error = e instanceof Error ? e.message : String(e);
      say(`Erreur : ${install.error}`);
    }
  })();
  return { started: true };
}

// ─── Transcription (worker persistant, modèle chargé une seule fois) ─────────

interface Pending {
  resolve: (text: string) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
let worker: { proc: ChildProcessWithoutNullStreams; ready: boolean; pending: Map<number, Pending> } | null = null;
let nextId = 1;

function startWorker(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonExe(), ["-u", workerScript()], {
      windowsHide: true,
      env: { ...process.env, JARVIS_STT_MODELS: modelsDir(), HF_HUB_OFFLINE: "1", PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
    });
    const w = { proc, ready: false, pending: new Map<number, Pending>() };
    worker = w;
    let err = "";
    proc.stderr?.on("data", (d: Buffer) => (err += d.toString("utf8")));
    proc.on("error", (e) => {
      worker = null;
      reject(e instanceof Error ? e : new Error(String(e)));
    });
    proc.on("exit", () => {
      for (const [, p] of w.pending) {
        clearTimeout(p.timer);
        p.reject(new Error("Le moteur local s'est arrêté."));
      }
      w.pending.clear();
      if (worker === w) worker = null;
    });
    const rl = readline.createInterface({ input: proc.stdout });
    const boot = setTimeout(() => reject(new Error(`Le moteur local ne démarre pas. ${err.slice(-200)}`)), 60000);
    rl.on("line", (line) => {
      try {
        const j = JSON.parse(line) as { event?: string; id?: number; ok?: boolean; text?: string; error?: string };
        if (j.event === "ready") {
          w.ready = true;
          clearTimeout(boot);
          resolve();
          return;
        }
        if (j.event === "error") {
          clearTimeout(boot);
          worker = null;
          proc.kill();
          reject(new Error(j.error || "Le moteur local a échoué au démarrage."));
          return;
        }
        if (typeof j.id === "number") {
          const p = w.pending.get(j.id);
          if (!p) return;
          w.pending.delete(j.id);
          clearTimeout(p.timer);
          if (j.ok) p.resolve((j.text ?? "").replace(/\s+/g, " ").trim());
          else p.reject(new Error(j.error || "Transcription locale impossible."));
        }
      } catch {
        /* ligne non JSON ignorée */
      }
    });
  });
}

let workerBooting: Promise<void> | null = null;

/** Transcrit un WAV (PCM 16 kHz mono) entièrement sur le PC. */
export async function transcribeLocal(wav: Buffer): Promise<string> {
  if (!sttLocalInstalled()) throw new Error("Le moteur local n'est pas installé.");
  if (!worker) workerBooting = workerBooting ?? startWorker().finally(() => (workerBooting = null));
  await workerBooting;
  if (!worker) throw new Error("Le moteur local n'est pas disponible.");
  const w = worker;
  const id = nextId++;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      w.pending.delete(id);
      reject(new Error("Transcription locale trop lente (délai dépassé)."));
    }, 30000);
    w.pending.set(id, { resolve, reject, timer });
    const payload = JSON.stringify({ id, wav_b64: wav.toString("base64") }) + "\n";
    w.proc.stdin.write(payload, (e) => {
      if (e) {
        w.pending.delete(id);
        clearTimeout(timer);
        reject(new Error("Le moteur local ne répond plus."));
      }
    });
  });
}

/** Arrête le worker (appelé quand le moteur n'est plus utilisé). */
export function stopLocalWorker(): void {
  if (worker) {
    worker.proc.kill();
    worker = null;
  }
}
