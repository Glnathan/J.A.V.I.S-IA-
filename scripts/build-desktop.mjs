#!/usr/bin/env node
/**
 * Construit l'installateur Windows de J.A.R.V.I.S. : downloads/JARVIS-Setup-<version>.exe
 * (+ l'archive du code source downloads/JARVIS-code-source-<version>.zip).
 *
 * Fonctionne sous Windows, Linux et macOS avec Node.js 20+ (aucune autre installation requise :
 * Node.js pour Windows, Python intégré et NSIS sont téléchargés automatiquement).
 *
 *   node scripts/build-desktop.mjs [--skip-next] [--no-python] [--no-installer] [--no-source]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const args = new Set(process.argv.slice(2));

const CACHE = path.join(ROOT, ".cache-desktop");
const DIST = path.join(ROOT, "dist-desktop");
const PAYLOAD = path.join(DIST, "JARVIS");
const SOURCE = path.join(DIST, "code-source");
const DOWNLOADS = path.join(ROOT, "downloads");
const NEXT_DIST = ".next-desktop";

const NODE_VERSION = "22.22.1";
const PYTHON_VERSION = "3.12.10";
const NSIS_URL = "https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z";
const PORT = 3777;

const VERSION = (fs.readFileSync(path.join(ROOT, "src/lib/version.ts"), "utf8").match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1] || "1.0.0";
const DEFAULT_NAME = (fs.readFileSync(path.join(ROOT, "src/lib/defaults.ts"), "utf8").match(/DEFAULT_USER_NAME\s*=\s*"([^"]*)"/) || [])[1] || "Nathan";
const VERSION4 = [...VERSION.split(".").map((n) => parseInt(n, 10) || 0), 0, 0, 0].slice(0, 4).join(".");

const step = (msg) => console.log(`\n\x1b[36m▶ ${msg}\x1b[0m`);
const info = (msg) => console.log(`  ${msg}`);

function run(cmd, cmdArgs, opts = {}) {
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", cwd: ROOT, ...opts });
  if (r.error) throw new Error(`${cmd} : ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${path.basename(cmd)} ${cmdArgs.slice(0, 3).join(" ")}… a échoué (code ${r.status}).`);
}

function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    info(`(cache) ${path.basename(dest)}`);
    return Promise.resolve();
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  info(`Téléchargement : ${url}`);
  return new Promise((resolve, reject) => {
    const get = (u, redirects = 0) => {
      https
        .get(u, { headers: { "User-Agent": "jarvis-build" } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 10) {
            res.resume();
            get(new URL(res.headers.location, u).toString(), redirects + 1);
            return;
          }
          if (res.statusCode !== 200) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode} pour ${u}`));
            return;
          }
          const tmp = `${dest}.part`;
          const out = fs.createWriteStream(tmp);
          res.pipe(out);
          out.on("finish", () =>
            out.close(() => {
              fs.renameSync(tmp, dest);
              resolve();
            }),
          );
          out.on("error", reject);
        })
        .on("error", reject);
    };
    get(url);
  });
}

function sevenZip() {
  const bin = require("7zip-bin").path7za;
  if (process.platform !== "win32") {
    try {
      fs.chmodSync(bin, 0o755);
    } catch {
      /* ignore */
    }
  }
  return bin;
}

/** Recursive copy (works even when the destination lives inside the source). */
function copyTree(src, dst, skip = () => false) {
  if (skip(src)) return;
  let st;
  try {
    st = fs.statSync(src);
  } catch {
    return;
  }
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) copyTree(path.join(src, name), path.join(dst, name), skip);
  } else {
    fs.copyFileSync(src, dst);
  }
}

function removeWhere(dir, test) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (test(full, entry)) fs.rmSync(full, { recursive: true, force: true });
    else if (entry.isDirectory()) removeWhere(full, test);
  }
}

function dirSize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(full) : fs.statSync(full).size;
  }
  return total;
}

const mb = (n) => `${(n / 1048576).toFixed(1)} Mo`;
const rel = (base, p) => path.relative(base, p).split(path.sep).join("/");

async function getMakensis() {
  if (process.env.MAKENSIS) return { bin: process.env.MAKENSIS, env: process.env };
  const probe = spawnSync("makensis", ["-VERSION"], { stdio: "ignore" });
  if (!probe.error && probe.status === 0) return { bin: "makensis", env: process.env };
  const dir = path.join(CACHE, "nsis");
  if (!fs.existsSync(path.join(dir, "Include", "MUI2.nsh"))) {
    const archive = path.join(CACHE, "nsis-3.0.4.1.7z");
    await download(NSIS_URL, archive);
    fs.rmSync(dir, { recursive: true, force: true });
    run(sevenZip(), ["x", "-y", `-o${dir}`, archive], { stdio: "ignore" });
  }
  let bin;
  if (process.platform === "win32") bin = fs.existsSync(path.join(dir, "Bin", "makensis.exe")) ? path.join(dir, "Bin", "makensis.exe") : path.join(dir, "makensis.exe");
  else bin = path.join(dir, process.platform === "darwin" ? "mac" : "linux", "makensis");
  if (process.platform !== "win32") fs.chmodSync(bin, 0o755);
  return { bin, env: { ...process.env, NSISDIR: dir } };
}

async function main() {
  const started = Date.now();
  console.log(`\x1b[1mJ.A.R.V.I.S. ${VERSION} — construction de la version PC (Windows x64)\x1b[0m`);

  step("Migrations de la base de données embarquée (drizzle-kit generate)");
  const drizzleKit = path.join(ROOT, "node_modules", "drizzle-kit", "bin.cjs");
  if (!fs.existsSync(drizzleKit)) throw new Error("drizzle-kit est introuvable : lancez d'abord « npm install ».");
  run(process.execPath, [drizzleKit, "generate"]);

  fs.rmSync(DIST, { recursive: true, force: true });
  if (!args.has("--skip-next")) {
    step("Compilation de l'application (next build autonome → .next-desktop)");
    const nextBin = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
    const keep = ["tsconfig.json", "next-env.d.ts"].map((f) => [f, fs.existsSync(path.join(ROOT, f)) ? fs.readFileSync(path.join(ROOT, f)) : null]);
    try {
      run(process.execPath, [nextBin, "build"], { env: { ...process.env, JARVIS_DESKTOP_BUILD: "1", NEXT_TELEMETRY_DISABLED: "1" } });
    } finally {
      for (const [f, content] of keep) if (content) fs.writeFileSync(path.join(ROOT, f), content);
    }
  }
  const standalone = path.join(ROOT, NEXT_DIST, "standalone");
  if (!fs.existsSync(path.join(standalone, "server.js"))) throw new Error("Sortie autonome introuvable (.next-desktop/standalone/server.js).");

  step("Assemblage de l'application");
  fs.rmSync(DIST, { recursive: true, force: true });
  const appDir = path.join(PAYLOAD, "app");
  copyTree(standalone, appDir, (p) => {
    const r = rel(standalone, p);
    return /^(downloads|dist-desktop|\.cache-desktop|\.jarvis-data|\.git|plugins|python|drizzle)(\/|$)/.test(r) || /^\.env/.test(path.basename(p));
  });
  copyTree(path.join(ROOT, NEXT_DIST, "static"), path.join(appDir, NEXT_DIST, "static"));
  copyTree(path.join(ROOT, "public"), path.join(appDir, "public"));
  copyTree(path.join(ROOT, "drizzle"), path.join(appDir, "drizzle"));
  copyTree(path.join(ROOT, "python"), path.join(appDir, "python"), (p) => p.includes("__pycache__"));
  copyTree(path.join(ROOT, "plugins"), path.join(appDir, "plugins"), (p) => p.includes("__pycache__"));
  // PGlite loads WebAssembly files at runtime: ship the complete package wherever Turbopack references it
  // (node_modules/@electric-sql/pglite and the hashed copies under .next-desktop/node_modules).
  const pgliteSrc = path.join(ROOT, "node_modules", "@electric-sql", "pglite");
  const pgliteTargets = [path.join(appDir, "node_modules", "@electric-sql", "pglite")];
  for (const base of [path.join(appDir, NEXT_DIST, "node_modules"), path.join(appDir, NEXT_DIST, "node_modules", "@electric-sql")]) {
    if (!fs.existsSync(base)) continue;
    for (const name of fs.readdirSync(base)) if (/^(@electric-sql\/)?pglite-[0-9a-f]+$/.test(name) || /^pglite-[0-9a-f]+$/.test(name)) pgliteTargets.push(path.join(base, name));
  }
  for (const target of pgliteTargets) {
    fs.rmSync(target, { recursive: true, force: true });
    copyTree(pgliteSrc, target, (p) => p.endsWith(".map"));
  }
  info(`PGlite copié dans ${pgliteTargets.length} emplacement(s).`);
  const chunkCount = fs.readdirSync(path.join(appDir, NEXT_DIST, "server", "chunks")).filter((f) => f.endsWith(".js")).length;
  const builtCount = fs.readdirSync(path.join(ROOT, NEXT_DIST, "server", "chunks")).filter((f) => f.endsWith(".js")).length;
  if (chunkCount < builtCount) throw new Error(`Sortie autonome incomplète : ${chunkCount}/${builtCount} chunks serveur.`);
  for (const junk of ["src", "node_modules/sharp", "node_modules/@img", "node_modules/typescript"]) fs.rmSync(path.join(appDir, junk), { recursive: true, force: true });
  removeWhere(path.join(appDir, "node_modules", "@next"), (full) => path.basename(full).startsWith("swc-"));
  removeWhere(appDir, (full, entry) => entry.isFile() && full.endsWith(".map"));
  info(`Application : ${mb(dirSize(appDir))}`);

  fs.mkdirSync(path.join(PAYLOAD, "launcher"), { recursive: true });
  fs.copyFileSync(path.join(ROOT, "desktop", "launcher.js"), path.join(PAYLOAD, "launcher", "main.js"));
  fs.writeFileSync(
    path.join(PAYLOAD, "launcher", "app.json"),
    JSON.stringify({ name: "JARVIS", version: VERSION, port: PORT, builtAt: new Date().toISOString() }, null, 2),
  );
  fs.copyFileSync(path.join(ROOT, "desktop", "installer", "jarvis.ico"), path.join(PAYLOAD, "jarvis.ico"));
  fs.copyFileSync(path.join(ROOT, "desktop", "LISEZMOI.txt"), path.join(PAYLOAD, "LISEZMOI.txt"));

  step(`Moteur Node.js ${NODE_VERSION} pour Windows`);
  const nodeZip = path.join(CACHE, `node-v${NODE_VERSION}-win-x64.zip`);
  await download(`https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`, nodeZip);
  const runtimeDir = path.join(PAYLOAD, "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  run(sevenZip(), ["e", "-y", `-o${runtimeDir}`, nodeZip, `node-v${NODE_VERSION}-win-x64/node.exe`, `node-v${NODE_VERSION}-win-x64/LICENSE`], { stdio: "ignore" });
  if (!fs.existsSync(path.join(runtimeDir, "node.exe"))) throw new Error("node.exe introuvable après extraction.");
  if (fs.existsSync(path.join(runtimeDir, "LICENSE"))) fs.renameSync(path.join(runtimeDir, "LICENSE"), path.join(runtimeDir, "LICENCE-nodejs.txt"));

  if (!args.has("--no-python")) {
    step(`Python ${PYTHON_VERSION} intégré (pour les plugins)`);
    try {
      const pyZip = path.join(CACHE, `python-${PYTHON_VERSION}-embed-amd64.zip`);
      await download(`https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`, pyZip);
      run(sevenZip(), ["x", "-y", `-o${path.join(runtimeDir, "python")}`, pyZip], { stdio: "ignore" });
    } catch (e) {
      console.warn(`  ⚠ Python intégré ignoré : ${e.message}`);
    }
  }

  let sourceReady = false;
  fs.mkdirSync(DOWNLOADS, { recursive: true });
  if (!args.has("--no-source")) {
    step("Code source (pour Python / Antigravity)");
    copyTree(ROOT, SOURCE, (p) => {
      const r = rel(ROOT, p);
      if (!r) return false;
      return (
        /^(node_modules|\.next|\.next-desktop|dist-desktop|downloads|\.cache-desktop|\.jarvis-data|\.git|\.env)(\/|$)/.test(r) ||
        r.endsWith(".tsbuildinfo") ||
        r.includes("__pycache__") ||
        r === "next-env.d.ts"
      );
    });
    const zipName = `JARVIS-code-source-${VERSION}.zip`;
    for (const f of fs.readdirSync(DOWNLOADS)) if (/^JARVIS-code-source-.*\.zip$/.test(f)) fs.rmSync(path.join(DOWNLOADS, f));
    run(sevenZip(), ["a", "-tzip", "-mx=7", path.join(DOWNLOADS, zipName), "."], { cwd: SOURCE, stdio: "ignore" });
    info(`✔ downloads/${zipName} (${mb(fs.statSync(path.join(DOWNLOADS, zipName)).size)})`);
    sourceReady = true;
  }

  if (!args.has("--no-installer")) {
    step("Compilation de l'installateur (NSIS)");
    const makensis = await getMakensis();
    const common = ["-V2", "-INPUTCHARSET", "UTF8", `-DVERSION=${VERSION}`, `-DVERSION4=${VERSION4}`, `-DICON=${path.join(ROOT, "desktop", "installer", "jarvis.ico")}`];
    run(makensis.bin, [...common, `-DOUT_FILE=${path.join(PAYLOAD, "JARVIS.exe")}`, path.join(ROOT, "desktop", "installer", "launcher.nsi")], { env: makensis.env });
    const outFile = path.join(DOWNLOADS, `JARVIS-Setup-${VERSION}.exe`);
    for (const f of fs.readdirSync(DOWNLOADS)) if (/^JARVIS-Setup-.*\.exe$/.test(f)) fs.rmSync(path.join(DOWNLOADS, f));
    run(
      makensis.bin,
      [
        ...common,
        `-DOUT_FILE=${outFile}`,
        `-DPAYLOAD_DIR=${PAYLOAD}`,
        `-DDEFAULT_NAME=${DEFAULT_NAME}`,
        `-DWELCOME_BMP=${path.join(ROOT, "desktop", "installer", "welcome.bmp")}`,
        ...(sourceReady ? [`-DSOURCE_DIR=${SOURCE}`] : []),
        path.join(ROOT, "desktop", "installer", "installer.nsi"),
      ],
      { env: makensis.env },
    );
    info(`✔ downloads/${path.basename(outFile)} (${mb(fs.statSync(outFile).size)})`);
  }

  console.log(`\n\x1b[32m✔ Terminé en ${Math.round((Date.now() - started) / 1000)} s.\x1b[0m Fichiers dans le dossier « downloads ».`);
}

main().catch((e) => {
  console.error(`\n\x1b[31m✖ ${e.message}\x1b[0m`);
  process.exit(1);
});
