// Module Gmail (phase 1) : OAuth « Application de bureau » (credentials.json dans le dossier de données)
// + lecture des messages via l'API REST de Gmail. Aucune dépendance supplémentaire.
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/runtime";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const CREDENTIALS_FILE = "credentials.json";
const TOKEN_FILE = "gmail-token.json";

interface OAuthCreds {
  installed?: { client_id?: string; client_secret?: string; redirect_uris?: string[] };
  web?: { client_id?: string; client_secret?: string; redirect_uris?: string[] };
}

export interface GmailToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

export function credentialsPath(): string {
  return path.join(dataDir(), CREDENTIALS_FILE);
}

function tokenPath(): string {
  return path.join(dataDir(), TOKEN_FILE);
}

export function gmailCredentials(): { clientId: string; clientSecret: string } | null {
  try {
    const raw = JSON.parse(fs.readFileSync(credentialsPath(), "utf8")) as OAuthCreds;
    const c = raw.installed ?? raw.web;
    return c?.client_id && c?.client_secret ? { clientId: c.client_id, clientSecret: c.client_secret } : null;
  } catch {
    return null;
  }
}

export function gmailConnected(): boolean {
  try {
    const t = JSON.parse(fs.readFileSync(tokenPath(), "utf8")) as GmailToken;
    return Boolean(t.access_token && (t.expires_at > Date.now() || t.refresh_token));
  } catch {
    return false;
  }
}

export function gmailDisconnect(): void {
  fs.rmSync(tokenPath(), { force: true });
}

function redirectUri(port: number): string {
  return `http://localhost:${port}/api/gmail/callback`;
}

export function gmailAuthUrl(port: number): string | null {
  const c = gmailCredentials();
  if (!c) return null;
  const p = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  p.searchParams.set("client_id", c.clientId);
  p.searchParams.set("redirect_uri", redirectUri(port));
  p.searchParams.set("response_type", "code");
  p.searchParams.set("scope", SCOPES.join(" "));
  p.searchParams.set("access_type", "offline");
  p.searchParams.set("prompt", "consent");
  return p.toString();
}

function saveToken(t: GmailToken): void {
  fs.writeFileSync(tokenPath(), JSON.stringify(t));
}

async function tokenRequest(body: Record<string, string>): Promise<GmailToken> {
  const c = gmailCredentials();
  if (!c) throw new Error("credentials.json introuvable");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...body, client_id: c.clientId, client_secret: c.clientSecret }).toString(),
  });
  if (!r.ok) throw new Error(`Google a refusé la requête (HTTP ${r.status})`);
  const j = (await r.json()) as { access_token: string; refresh_token?: string; expires_in: number };
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + Math.max(60, j.expires_in - 60) * 1000 };
}

/** Échange le code d'autorisation Google contre un token (récupère le refresh_token pour les connexions suivantes). */
export async function gmailExchangeCode(code: string, port: number): Promise<GmailToken> {
  const fresh = await tokenRequest({ code, redirect_uri: redirectUri(port), grant_type: "authorization_code" });
  try {
    const prev = JSON.parse(fs.readFileSync(tokenPath(), "utf8")) as GmailToken;
    if (!fresh.refresh_token && prev.refresh_token) fresh.refresh_token = prev.refresh_token;
  } catch {
    /* premier token */
  }
  saveToken(fresh);
  return fresh;
}

/** Token d'accès valide, rafraîchi automatiquement s'il a expiré. */
export async function gmailAccessToken(): Promise<string | null> {
  let t: GmailToken;
  try {
    t = JSON.parse(fs.readFileSync(tokenPath(), "utf8")) as GmailToken;
  } catch {
    return null;
  }
  if (t.expires_at > Date.now()) return t.access_token;
  if (!t.refresh_token) return null;
  try {
    const fresh = await tokenRequest({ refresh_token: t.refresh_token, grant_type: "refresh_token" });
    fresh.refresh_token = t.refresh_token;
    saveToken(fresh);
    return fresh.access_token;
  } catch {
    return null;
  }
}

export interface GmailMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
  snippet: string;
}

interface GmailPayloadPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPayloadPart[];
}
interface GmailRaw {
  id: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] } & GmailPayloadPart;
}

async function gmailFetch<T>(pathname: string, token: string): Promise<T> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${pathname}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Gmail a répondu HTTP ${r.status}`);
  return (await r.json()) as T;
}

function headerOf(m: GmailRaw, name: string): string {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
}

function senderOf(from: string): string {
  const m = /^"?([^"<]*)"?\s*<([^>]*)>/.exec(from);
  return (m ? m[1] || m[2] : from).trim() || from;
}

function dateOf(internal: string | undefined): string {
  const ms = internal ? Number(internal) : NaN;
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function toMessage(m: GmailRaw): GmailMessage {
  const from = headerOf(m, "from");
  return {
    id: m.id,
    from: senderOf(from),
    subject: headerOf(m, "subject") || "(sans objet)",
    date: dateOf(m.internalDate),
    unread: Boolean(m.labelIds?.includes("UNREAD")),
    snippet: (m.snippet ?? "").slice(0, 180),
  };
}

/** Liste les derniers messages (50 max, recherche Gmail possible : "is:unread", "from:x", …). */
export async function gmailList(max = 25, query = ""): Promise<GmailMessage[]> {
  const token = await gmailAccessToken();
  if (!token) throw new Error("Gmail n'est pas connecté");
  const params = new URLSearchParams({ maxResults: String(Math.min(50, Math.max(1, max))) });
  if (query.trim()) params.set("q", query.trim());
  const list = await gmailFetch<{ messages?: { id: string }[] }>(`/messages?${params}`, token);
  const ids = (list.messages ?? []).map((m) => m.id);
  const messages = await Promise.all(
    ids.map(async (id) => {
      const raw = await gmailFetch<GmailRaw>(`/messages/${id}?format=full`, token);
      return toMessage(raw);
    }),
  );
  return messages;
}

/** Nombre de mails non lus (plafonné à l'API : « 50+ » au-delà). */
export async function gmailUnreadCount(): Promise<number> {
  const token = await gmailAccessToken();
  if (!token) throw new Error("Gmail n'est pas connecté");
  const list = await gmailFetch<{ messages?: unknown[]; resultSizeEstimate?: number }>("/messages?maxResults=50&q=is%3Aunread", token);
  return list.resultSizeEstimate && list.resultSizeEstimate > 0 && (list.messages?.length ?? 0) >= 50 ? 50 : (list.messages?.length ?? 0);
}

/** Corps texte d'un message (décode le texte brut ; les mails HTML sont simplifiés). */
export async function gmailBody(id: string): Promise<string> {
  const token = await gmailAccessToken();
  if (!token) throw new Error("Gmail n'est pas connecté");
  const m = await gmailFetch<GmailRaw>(`/messages/${id}?format=full`, token);
  const findPlain = (part: GmailPayloadPart | undefined): string => {
    if (!part) return "";
    if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64").toString("utf8");
    for (const sub of part.parts ?? []) {
      const found = findPlain(sub);
      if (found) return found;
    }
    return "";
  };
  const text =
    findPlain(m.payload) ||
    (m.payload?.body?.data ? Buffer.from(m.payload.body.data, "base64").toString("utf8") : "");
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
