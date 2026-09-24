// Python plugin system: JARVIS keeps a persistent Python worker (python/jarvis_bridge.py) that
// loads every .py file of the plugins folder and answers the commands they declare.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { dataDir, pluginsDir, resourcesDir } from "@/lib/runtime";
import type { PluginInfo, PythonStatus } from "@/lib/types";

interface PyCmd {
  command: string;
  args: string[];
  version: string;
  origin: "env" | "system" | "embedded";
}

export interface PluginOutput {
  plugin: string;
  text: string;
  open: { url: string; label: string }[];
  timer: { seconds: number; label: string } | null;
  list: { title: string; items: string[] } | null;
  error?: string;
}

type Msg = Record<string, unknown>;

const g = globalThis as typeof globalThis & {
  __jarvisPython?: { cmd: PyCmd | null; at: number };
  __jarvisWorker?: PythonWorker | null;
  __jarvisWorkerStarting?: Promise<PythonWorker | null> | null;
};

function probe(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    const finish = (v: string | null) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const p = spawn(command, [...args, "-c", "import sys;print('%d.%d.%d' % sys.version_info[:3])"], { windowsHide: true });
      const timer = setTimeout(() => {
        try {
          p.kill();
        } catch {
          /* ignore */
        }
        finish(null);
      }, 8000);
      p.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
      p.on("error", () => {
        clearTimeout(timer);
        finish(null);
      });
      p.on("close", (code) => {
        clearTimeout(timer);
        const v = out.trim();
        finish(code === 0 && /^3\.\d+\.\d+$/.test(v) ? v : null);
      });
    } catch {
      finish(null);
    }
  });
}

/** Finds a usable Python 3.8+ (JARVIS_PYTHON, system Python, then the embedded one of the PC version). */
export async function detectPython(force = false): Promise<PyCmd | null> {
  const cached = g.__jarvisPython;
  if (cached && !force && Date.now() - cached.at < 10 * 60000) return cached.cmd;
  const candidates: Omit<PyCmd, "version">[] = [];
  if (process.env.JARVIS_PYTHON) candidates.push({ command: process.env.JARVIS_PYTHON, args: [], origin: "env" });
  if (process.platform === "win32") candidates.push({ command: "py", args: ["-3"], origin: "system" });
  candidates.push({ command: "python3", args: [], origin: "system" }, { command: "python", args: [], origin: "system" });
  if (process.env.JARVIS_PYTHON_EMBED) candidates.push({ command: process.env.JARVIS_PYTHON_EMBED, args: [], origin: "embedded" });
  let found: PyCmd | null = null;
  for (const c of candidates) {
    const v = await probe(c.command, c.args);
    if (v && Number(v.split(".")[1]) >= 8) {
      found = { ...c, version: v };
      break;
    }
  }
  g.__jarvisPython = { cmd: found, at: Date.now() };
  return found;
}

class PythonWorker {
  private readonly proc: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, { resolve: (m: Msg) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private nextId = 1;
  alive = true;

  constructor(py: PyCmd) {
    const dir = pluginsDir();
    fs.mkdirSync(dir, { recursive: true });
    const bridge = path.join(resourcesDir(), "python", "jarvis_bridge.py");
    this.proc = spawn(py.command, [...py.args, "-u", bridge], {
      cwd: dir,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
        PYTHONDONTWRITEBYTECODE: "1",
        JARVIS_PLUGINS_DIR: dir,
        JARVIS_DATA_DIR: dataDir(),
      },
    });
    readline.createInterface({ input: this.proc.stdout }).on("line", (line) => this.onLine(line));
    this.proc.stderr.on("data", (d: Buffer) => {
      const t = d.toString("utf8").trim();
      if (t) console.log(`[plugins] ${t}`);
    });
    this.proc.stdin.on("error", () => undefined);
    this.proc.on("error", (e) => this.shutdown(e));
    this.proc.on("exit", (code) => this.shutdown(new Error(`Python s'est arrêté (code ${code ?? "?"})`)));
  }

  private onLine(line: string) {
    let msg: Msg;
    try {
      msg = JSON.parse(line) as Msg;
    } catch {
      return;
    }
    const id = typeof msg.id === "number" ? msg.id : -1;
    const p = this.pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    this.pending.delete(id);
    p.resolve(msg);
  }

  private shutdown(err: Error) {
    this.alive = false;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    if (g.__jarvisWorker === this) g.__jarvisWorker = null;
  }

  request(payload: Msg, timeoutMs: number): Promise<Msg> {
    return new Promise((resolve, reject) => {
      if (!this.alive) {
        reject(new Error("Le moteur Python est arrêté"));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Délai dépassé : le plugin met trop de temps à répondre"));
        this.kill();
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc.stdin.write(`${JSON.stringify({ ...payload, id })}\n`, "utf8");
    });
  }

  kill() {
    this.alive = false;
    try {
      this.proc.kill();
    } catch {
      /* already stopped */
    }
  }
}

async function getWorker(): Promise<PythonWorker | null> {
  if (g.__jarvisWorker?.alive) return g.__jarvisWorker;
  if (!g.__jarvisWorkerStarting) {
    g.__jarvisWorkerStarting = (async () => {
      const py = await detectPython();
      if (!py) return null;
      const w = new PythonWorker(py);
      g.__jarvisWorker = w;
      return w;
    })().finally(() => {
      g.__jarvisWorkerStarting = null;
    });
  }
  return g.__jarvisWorkerStarting;
}

function pluginFiles(): string[] {
  try {
    return fs.readdirSync(pluginsDir()).filter((f) => f.endsWith(".py") && !f.startsWith("_") && !f.startsWith("."));
  } catch {
    return [];
  }
}

function labelFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function normalize(plugin: string, r: Msg): PluginOutput {
  const text = typeof r.texte === "string" ? r.texte.trim() : "";
  const open: { url: string; label: string }[] = [];
  const addOpen = (v: unknown) => {
    if (typeof v === "string" && /^https?:\/\//i.test(v)) open.push({ url: v, label: labelFor(v) });
  };
  if (Array.isArray(r.ouvrir)) r.ouvrir.forEach(addOpen);
  else addOpen(r.ouvrir);
  const seconds = typeof r.minuteur === "number" ? Math.round(r.minuteur) : 0;
  const timer = seconds > 0 ? { seconds: Math.min(86400, seconds), label: typeof r.nom_minuteur === "string" && r.nom_minuteur ? r.nom_minuteur : "Minuteur" } : null;
  const list = Array.isArray(r.liste) ? { title: typeof r.titre === "string" && r.titre ? r.titre : plugin, items: r.liste.map(String).slice(0, 60) } : null;
  return { plugin, text: text || (open.length || timer ? "C'est fait." : "Commande exécutée."), open, timer, list };
}

/** Asks the plugins whether one of them handles this sentence. Returns null when none does. */
export async function runPlugins(text: string, context: Record<string, unknown>): Promise<PluginOutput | null> {
  if (!text.trim() || pluginFiles().length === 0) return null;
  const worker = await getWorker();
  if (!worker) return null;
  let res: Msg;
  try {
    res = await worker.request({ type: "handle", text, context }, 25000);
  } catch (e) {
    console.error("[plugins]", e instanceof Error ? e.message : e);
    return null;
  }
  if (!res.handled) return null;
  const plugin = typeof res.plugin === "string" ? res.plugin : "Plugin";
  if (typeof res.error === "string") return { plugin, text: "", open: [], timer: null, list: null, error: res.error };
  return normalize(plugin, (res.result ?? {}) as Msg);
}

export async function listPlugins(force = false): Promise<{ dir: string; python: PythonStatus; plugins: PluginInfo[] }> {
  const dir = pluginsDir();
  const py = await detectPython(force);
  const python: PythonStatus = py ? { found: true, version: py.version, command: [py.command, ...py.args].join(" "), origin: py.origin } : { found: false };
  const files = pluginFiles();
  const offline = (): PluginInfo[] => files.map((f) => ({ file: f, name: f.replace(/\.py$/, ""), description: "", commands: [], error: null }));
  if (!py) return { dir, python, plugins: offline() };
  const worker = await getWorker();
  if (!worker) return { dir, python, plugins: offline() };
  const res = await worker.request({ type: "list" }, 20000);
  return { dir, python, plugins: Array.isArray(res.plugins) ? (res.plugins as PluginInfo[]) : offline() };
}

export async function reloadPlugins() {
  g.__jarvisWorker?.kill();
  g.__jarvisWorker = null;
  return listPlugins(true);
}

export function createPlugin(rawName: string): string {
  const display = rawName.trim().slice(0, 60) || "Mon plugin";
  let base = display
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  if (!base) base = "mon_plugin";
  if (/^\d/.test(base)) base = `plugin_${base}`;
  const dir = pluginsDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = `${base}.py`;
  const full = path.join(dir, file);
  if (fs.existsSync(full)) throw new Error(`Le fichier ${file} existe déjà.`);
  const trigger = `test ${base.replace(/_/g, " ")}`;
  const content = `# -*- coding: utf-8 -*-
"""Plugin JARVIS : ${display.replace(/"/g, "'")}. Modifiez-moi : les changements sont pris en compte immédiatement."""
from jarvis import Reponse, commande

NOM = "${display.replace(/"/g, "'")}"
DESCRIPTION = "Décrivez ici ce que fait votre plugin."


@commande("${trigger}", description="Commande d'essai")
def essai(req):
    # req.texte        -> la phrase prononcée
    # req.groupes      -> les valeurs capturées par les {accolades}
    # req.appellation  -> « monsieur », « madame »…
    return f"Le plugin ${display.replace(/"/g, "'").replace(/[{}]/g, "")} fonctionne, {req.appellation} !"
`;
  fs.writeFileSync(full, content, "utf8");
  return file;
}
