"use strict";
/**
 * J.A.R.V.I.S. — lanceur de la version PC.
 *
 * 1. démarre le serveur local (Next.js autonome + base PostgreSQL embarquée PGlite) ;
 * 2. ouvre JARVIS dans une fenêtre d'application Google Chrome ou Microsoft Edge
 *    (profil dédié, micro pré-autorisé, reconnaissance vocale et voix incluses).
 *
 * Usage : runtime\node.exe launcher\main.js [--no-browser] [--port=3777]
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const net = require("net");
const { spawn } = require("child_process");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(ROOT, "app");
const META = readJson(path.join(__dirname, "app.json"), { name: "JARVIS", version: "dev", port: 3777 });
const IS_WIN = process.platform === "win32";
const APPDATA =
  process.env.APPDATA ||
  (process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support") : path.join(os.homedir(), ".config"));
const DATA_DIR = process.env.JARVIS_DATA_DIR || path.join(APPDATA, "JARVIS");
const USER_DIR = process.env.JARVIS_USER_DIR || path.join(os.homedir(), "JARVIS");
const PLUGINS_DIR = process.env.JARVIS_PLUGINS_DIR || path.join(USER_DIR, "plugins");
const ARGS = process.argv.slice(2);
const NO_BROWSER = ARGS.includes("--no-browser");
const PORT_ARG = Number((ARGS.find((a) => a.startsWith("--port=")) || "").split("=")[1]);
const BASE_PORT = Number.isInteger(PORT_ARG) && PORT_ARG > 0 ? PORT_ARG : Number(META.port) || 3777;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// ─── Journal (%APPDATA%\JARVIS\logs\jarvis.log) ──────────────────────────
fs.mkdirSync(path.join(DATA_DIR, "logs"), { recursive: true });
const LOG_FILE = path.join(DATA_DIR, "logs", "jarvis.log");
try {
  if (fs.statSync(LOG_FILE).size > 5 * 1024 * 1024) fs.renameSync(LOG_FILE, `${LOG_FILE}.old`);
} catch {
  /* no log yet */
}
const logStream = fs.createWriteStream(LOG_FILE, { flags: "a" });
const safeJson = (v) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};
const fmt = (v) => (v instanceof Error ? v.stack || v.message : typeof v === "string" ? v : safeJson(v));
process.stdout.on("error", () => undefined);
process.stderr.on("error", () => undefined);
for (const level of ["log", "info", "warn", "error"]) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    logStream.write(`[${new Date().toISOString()}] ${level.toUpperCase()} ${args.map(fmt).join(" ")}\n`);
    try {
      original(...args);
    } catch {
      /* no console */
    }
  };
}

function showError(message) {
  console.error(message);
  if (!IS_WIN) return;
  try {
    const escaped = String(message).replace(/'/g, "''");
    spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-WindowStyle",
        "Hidden",
        "-Command",
        `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${escaped}', 'J.A.R.V.I.S.', 'OK', 'Error') | Out-Null`,
      ],
      { detached: true, stdio: "ignore", windowsHide: true },
    ).unref();
  } catch {
    /* ignore */
  }
}

// ─── Utilitaires réseau ──────────────────────────────────────────────────
function health(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 3000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
  });
}

function isFree(port, bind) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, bind);
  });
}

async function choosePort(bind) {
  // A previous JARVIS may still be shutting down (about a second): wait for its port to free up.
  for (let attempt = 0; attempt < 12; attempt++) {
    const h = await health(BASE_PORT);
    if (h && h.app === "jarvis") return { port: BASE_PORT, existing: true };
    if (await isFree(BASE_PORT, bind)) return { port: BASE_PORT, existing: false };
    await new Promise((r) => setTimeout(r, 500));
  }
  for (let p = BASE_PORT + 1; p < BASE_PORT + 10; p++) {
    const h = await health(p);
    if (h && h.app === "jarvis") return { port: p, existing: true };
    if (await isFree(p, bind)) return { port: p, existing: false };
  }
  throw new Error(`Aucun port libre entre ${BASE_PORT} et ${BASE_PORT + 9}.`);
}

// ─── Dossiers de l'utilisateur ───────────────────────────────────────────
function copyTree(src, dst, overwrite) {
  if (!fs.existsSync(src)) return;
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    if (path.basename(src) === "__pycache__") return;
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) copyTree(path.join(src, name), path.join(dst, name), overwrite);
  } else if (overwrite || !fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
  }
}

const USER_README = `J.A.R.V.I.S. — votre dossier personnel
=====================================

plugins\\        Vos plugins Python : chaque fichier .py ajoute des commandes vocales.
                Lisez plugins\\LISEZMOI.md, puis copiez _modele.py pour commencer.
code-source\\    (si l'option a été cochée) le code complet de JARVIS, à ouvrir avec
                Google Antigravity ou VS Code. Voir AGENTS.md et README.md.

Données internes (mémoire, tâches, réglages, journal) : ${DATA_DIR}
`;

function prepareUserFolders() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  const bundled = path.join(APP_DIR, "plugins");
  const marker = path.join(PLUGINS_DIR, ".exemples-installes");
  if (!fs.existsSync(marker)) {
    copyTree(bundled, PLUGINS_DIR, false);
    fs.writeFileSync(marker, new Date().toISOString());
  }
  for (const doc of ["LISEZMOI.md", "_modele.py"]) {
    const src = path.join(bundled, doc);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(PLUGINS_DIR, doc));
  }
  const readme = path.join(USER_DIR, "LISEZMOI.txt");
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, USER_README, "utf8");
}

// ─── Fenêtre d'application ───────────────────────────────────────────────
function browserCandidates() {
  const edge = [];
  const chrome = [];
  if (IS_WIN) {
    const bases = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA].filter(Boolean);
    for (const b of bases) chrome.push(path.join(b, "Google", "Chrome", "Application", "chrome.exe"));
    for (const b of bases) edge.push(path.join(b, "Microsoft", "Edge", "Application", "msedge.exe"));
  } else if (process.platform === "darwin") {
    chrome.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    edge.push("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge");
  } else {
    chrome.push("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser");
    edge.push("/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable");
  }
  return { edge, chrome };
}

/**
 * Browser for the JARVIS window. "auto" (default) = Google Chrome first: its speech recognition is
 * the most reliable (Edge's has had outages returning "network" errors), then Microsoft Edge.
 */
function findBrowser() {
  if (process.env.JARVIS_BROWSER && fs.existsSync(process.env.JARVIS_BROWSER)) return process.env.JARVIS_BROWSER;
  const pref = String(readJson(path.join(DATA_DIR, "lanceur.json"), {}).navigateur || "auto");
  const { edge, chrome } = browserCandidates();
  const order = pref === "edge" ? [...edge, ...chrome] : [...chrome, ...edge];
  return order.find((c) => fs.existsSync(c)) || null;
}

/** Pre-authorizes the microphone for JARVIS in its dedicated browser profile (no permission prompt to miss). */
function seedMicPermission(profileDir, port) {
  try {
    const prefFile = path.join(profileDir, "Default", "Preferences");
    let prefs = {};
    if (fs.existsSync(prefFile)) {
      try {
        prefs = JSON.parse(fs.readFileSync(prefFile, "utf8"));
      } catch {
        return false;
      }
    }
    prefs.profile = prefs.profile || {};
    prefs.profile.content_settings = prefs.profile.content_settings || {};
    const exceptions = (prefs.profile.content_settings.exceptions = prefs.profile.content_settings.exceptions || {});
    const mic = (exceptions.media_stream_mic = exceptions.media_stream_mic || {});
    const now = String((Date.now() + 11644473600000) * 1000); // Windows epoch, microseconds
    let changed = false;
    for (const host of ["127.0.0.1", "localhost"]) {
      const key = `http://${host}:${port},*`;
      if (!mic[key] || mic[key].setting !== 1) {
        mic[key] = { last_modified: now, setting: 1 };
        changed = true;
      }
    }
    if (changed) {
      fs.mkdirSync(path.dirname(prefFile), { recursive: true });
      fs.writeFileSync(prefFile, JSON.stringify(prefs));
    }
    return true;
  } catch (e) {
    console.warn("Pré-autorisation du micro impossible :", e && e.message);
    return false;
  }
}

function openDefault(url) {
  const [cmd, args] = IS_WIN ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } catch (e) {
    console.error("Impossible d'ouvrir le navigateur :", e);
  }
}

function openWindow(port) {
  const browser = findBrowser();
  if (!browser) {
    console.warn("Chrome/Edge introuvable : ouverture du navigateur par défaut.");
    openDefault(`http://127.0.0.1:${port}/`);
    return;
  }
  const isEdge = /msedge|microsoft-edge|Microsoft Edge/i.test(browser);
  const profileDir = path.join(DATA_DIR, isEdge ? "navigateur" : "navigateur-chrome");
  seedMicPermission(profileDir, port);
  const args = [
    `--app=http://127.0.0.1:${port}/?autostart=1`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1440,900",
    "--lang=fr-FR",
    "--disable-features=Translate",
  ];
  const child = spawn(browser, args, { detached: true, stdio: "ignore" });
  child.on("error", (e) => {
    console.error("Échec de l'ouverture de la fenêtre :", e.message);
    openDefault(`http://127.0.0.1:${port}/`);
  });
  child.unref();
  console.log(`Fenêtre JARVIS ouverte avec ${path.basename(browser)}.`);
}

// ─── Démarrage ───────────────────────────────────────────────────────────
async function main() {
  console.log(`──────── J.A.R.V.I.S. ${META.version} (${process.platform}, Node ${process.version}) ────────`);
  const prefs = readJson(path.join(DATA_DIR, "lanceur.json"), {});
  const acces = String(prefs.acces || "off");
  const bind = acces === "lan" ? "0.0.0.0" : "127.0.0.1";
  const { port, existing } = await choosePort(bind);
  if (existing) {
    console.log(`JARVIS fonctionne déjà sur le port ${port} : ouverture d'une nouvelle fenêtre.`);
    if (!NO_BROWSER) openWindow(port);
    setTimeout(() => process.exit(0), 1500);
    return;
  }

  prepareUserFolders();
  // Remote access (Paramètres → Mobile) : "lan" makes the server listen on every interface (PIN protected);
  // "tailscale" keeps 127.0.0.1 and lets `tailscale serve` publish JARVIS in HTTPS on the private network.
  if (acces === "lan") console.log("Accès Wi-Fi local activé : le serveur écoute sur toutes les interfaces (Windows peut demander une autorisation pare-feu pour node.exe).");
  const secretFile = path.join(DATA_DIR, "secret.key");
  let secret = "";
  try {
    secret = fs.readFileSync(secretFile, "utf8").trim();
  } catch {
    secret = "";
  }
  if (secret.length < 32) {
    secret = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(secretFile, secret);
  }
  Object.assign(process.env, {
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: bind,
    JARVIS_BIND: bind,
    JARVIS_SESSION_SECRET: secret,
    NEXT_TELEMETRY_DISABLED: "1",
    JARVIS_DESKTOP: "1",
    JARVIS_DB: "pglite",
    JARVIS_VERSION: String(META.version),
    JARVIS_DATA_DIR: DATA_DIR,
    JARVIS_USER_DIR: USER_DIR,
    JARVIS_PLUGINS_DIR: PLUGINS_DIR,
    JARVIS_RESOURCES_DIR: APP_DIR,
  });
  const embeddedPython = path.join(ROOT, "runtime", "python", IS_WIN ? "python.exe" : "bin/python3");
  if (fs.existsSync(embeddedPython)) process.env.JARVIS_PYTHON_EMBED = embeddedPython;

  const serverFile = path.join(APP_DIR, "server.js");
  if (!fs.existsSync(serverFile)) throw new Error(`Fichier introuvable : ${serverFile}. Réinstallez J.A.R.V.I.S.`);
  console.log(`Démarrage du serveur local sur http://127.0.0.1:${port} …`);
  require(serverFile);

  const started = Date.now();
  while (Date.now() - started < 120000) {
    const h = await health(port);
    if (h && h.ok) {
      console.log(`Serveur prêt en ${Date.now() - started} ms.`);
      if (!NO_BROWSER) openWindow(port);
      return;
    }
    if (h && h.app === "jarvis" && h.error) throw new Error(h.error);
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Le serveur local n'a pas démarré à temps (120 s).");
}

module.exports = { findBrowser, seedMicPermission, browserCandidates };

if (require.main === module) {
  process.on("uncaughtException", (e) => {
    const msg = String((e && e.message) || e);
    // Coupure de flux bénigne (client qui interrompt une musique, un téléchargement…) :
    // ne pas tuer tout JARVIS pour ça — le serveur continue de tourner.
    if (/Controller is already closed|The operation was aborted|AbortError|ERR_STREAM_PREMATURE_CLOSE|ECONNRESET|EPIPE|terminated/i.test(msg)) {
      console.error("Flux interrompu (ignoré, le serveur continue) :", msg);
      return;
    }
    showError(`J.A.R.V.I.S. a rencontré une erreur : ${msg}\n\nJournal : ${LOG_FILE}`);
    setTimeout(() => process.exit(1), 400);
  });
  process.on("unhandledRejection", (e) => console.error("Promesse rejetée :", e));
  main().catch((e) => {
    showError(`Impossible de démarrer J.A.R.V.I.S. : ${e && e.message}\n\nJournal : ${LOG_FILE}`);
    setTimeout(() => process.exit(1), 600);
  });
}
