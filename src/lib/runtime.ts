// Runtime environment helpers (server only): web version vs installed PC version.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** True when JARVIS runs as the installed PC application (the launcher sets JARVIS_DESKTOP=1). */
export function isDesktop(): boolean {
  return process.env.JARVIS_DESKTOP === "1";
}

/** True when the embedded PGlite database is used instead of a PostgreSQL server. */
export function usesEmbeddedDb(): boolean {
  return process.env.JARVIS_DB === "pglite";
}

function projectRoot(): string {
  return process.cwd();
}

/** Folder containing bundled resources: drizzle migrations, python bridge, example plugins. */
export function resourcesDir(): string {
  return process.env.JARVIS_RESOURCES_DIR || projectRoot();
}

/** Private data folder: embedded database, custom boot music, plugin storage. */
export function dataDir(): string {
  const dir = process.env.JARVIS_DATA_DIR || path.join(projectRoot(), ".jarvis-data");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Folder scanned for Python plugins. */
export function pluginsDir(): string {
  return process.env.JARVIS_PLUGINS_DIR || path.join(resourcesDir(), "plugins");
}

/** User-facing folder of the PC version (C:\Users\<nom>\JARVIS). */
export function userDir(): string | null {
  if (process.env.JARVIS_USER_DIR) return process.env.JARVIS_USER_DIR;
  return isDesktop() ? path.join(os.homedir(), "JARVIS") : null;
}

/** Folder holding the generated installer and source archive (web version). */
export function downloadsDir(): string {
  return path.join(projectRoot(), "downloads");
}

const g = globalThis as typeof globalThis & { __jarvisLastSeen?: number };

/** Records that a JARVIS window is still alive (used by the desktop idle watchdog). */
export function touchActivity(): void {
  g.__jarvisLastSeen = Date.now();
}

export function lastActivity(): number {
  return g.__jarvisLastSeen ?? 0;
}

const r = globalThis as typeof globalThis & { __jarvisRemoteSeen?: number };

/** Records an authenticated request coming from a phone / another device. */
export function touchRemote(): void {
  r.__jarvisRemoteSeen = Date.now();
}

export function remoteSeenAt(): number {
  return r.__jarvisRemoteSeen ?? 0;
}
