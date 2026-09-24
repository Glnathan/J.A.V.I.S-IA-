// Remote access (PC version): mode, PIN and session cookies. Stored in a small JSON file of the data
// folder (not the database) so the request proxy can read it cheaply on every request.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/runtime";

export type RemoteMode = "off" | "tailscale" | "lan";

export interface RemoteConfig {
  mode: RemoteMode;
  pinHash: string;
  pinSalt: string;
  updatedAt: string;
}

export const COOKIE = "jarvis_acces";
const FILE = "acces-distant.json";
const SESSION_DAYS = 30;
const EMPTY: RemoteConfig = { mode: "off", pinHash: "", pinSalt: "", updatedAt: "" };

let cache: { at: number; mtime: number; cfg: RemoteConfig } | null = null;

function file(): string {
  return path.join(dataDir(), FILE);
}

export function readRemoteConfig(): RemoteConfig {
  const now = Date.now();
  if (cache && cache.mtime !== 0 && now - cache.at < 300) return cache.cfg;
  let mtime = 0;
  try {
    mtime = fs.statSync(file()).mtimeMs;
  } catch {
    cache = { at: now, mtime: 0, cfg: EMPTY };
    return EMPTY;
  }
  if (cache && cache.mtime === mtime) {
    cache.at = now;
    return cache.cfg;
  }
  let cfg = EMPTY;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), "utf8")) as Partial<RemoteConfig>;
    cfg = {
      mode: raw.mode === "tailscale" || raw.mode === "lan" ? raw.mode : "off",
      pinHash: typeof raw.pinHash === "string" ? raw.pinHash : "",
      pinSalt: typeof raw.pinSalt === "string" ? raw.pinSalt : "",
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    };
  } catch {
    /* unreadable → defaults */
  }
  cache = { at: now, mtime, cfg };
  return cfg;
}

export function writeRemoteConfig(patch: Partial<RemoteConfig>): RemoteConfig {
  const cfg: RemoteConfig = { ...readRemoteConfig(), ...patch, updatedAt: new Date().toISOString() };
  fs.writeFileSync(file(), JSON.stringify(cfg, null, 2));
  cache = null;
  return cfg;
}

export function hashPin(pin: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${pin}`).digest("hex");
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export function setPin(pin: string): RemoteConfig {
  const salt = crypto.randomBytes(12).toString("hex");
  return writeRemoteConfig({ pinSalt: salt, pinHash: hashPin(pin, salt) });
}

export function verifyPin(pin: string, cfg: RemoteConfig): boolean {
  if (!cfg.pinHash || !isValidPin(pin)) return false;
  const a = Buffer.from(hashPin(pin, cfg.pinSalt));
  const b = Buffer.from(cfg.pinHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Secret used to sign session cookies (JARVIS_SESSION_SECRET, else a key file in the data folder). */
export function sessionSecret(): string {
  const env = process.env.JARVIS_SESSION_SECRET?.trim();
  if (env) return env;
  const keyFile = path.join(dataDir(), "secret.key");
  try {
    const k = fs.readFileSync(keyFile, "utf8").trim();
    if (k.length >= 32) return k;
  } catch {
    /* create below */
  }
  const k = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(keyFile, k, { mode: 0o600 });
  return k;
}

function sign(exp: number, cfg: RemoteConfig): string {
  return crypto.createHmac("sha256", sessionSecret()).update(`${exp}:${cfg.pinHash}`).digest("hex");
}

export function signSession(cfg: RemoteConfig): { token: string; maxAge: number } {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  return { token: `${exp}.${sign(exp, cfg)}`, maxAge: SESSION_DAYS * 86400 };
}

export function verifySession(token: string | undefined, cfg: RemoteConfig): boolean {
  if (!token || !cfg.pinHash) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() || !sig) return false;
  const a = Buffer.from(sign(exp, cfg));
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ─── Host classification ─────────────────────────────────────────────────
export function isLocalHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
}

export function isTailscaleHost(hostname: string): boolean {
  return /^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/i.test(hostname) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

/** Private IPv4, .local names or bare machine names (public domains are rejected against DNS rebinding). */
export function isLanHost(hostname: string): boolean {
  if (/^(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^[a-z0-9-]+(\.local)?$/i.test(hostname)) return true;
  return false;
}

export function hostnameOf(hostHeader: string): string {
  const h = hostHeader.trim().toLowerCase();
  if (h.startsWith("[")) return h.replace(/\]:\d+$/, "]");
  return h.replace(/:\d+$/, "");
}
