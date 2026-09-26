// Licence J.A.R.V.I.S. Premium : activation en ligne + jeton signé Ed25519.
// La clé publique ci-dessous est embarquée volontairement : elle ne permet que de
// VÉRIFIER un jeton — forger un jeton exige la clé privée, qui ne quitte jamais le
// service de licences (dossier licences/ du dépôt, hébergement Vercel).

import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import type { SettingsRow } from "./brain/settings";

/** URL du service de licences (l'importer sur Vercel sous ce nom, ou ajuster ici). */
const LICENCE_URL = process.env.JARVIS_LICENCE_URL || "https://jarvis-licences.vercel.app";

/** Clé publique de vérification des jetons (la privée vit sur le service de licences). */
const VERIFY_PUB = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA4bFogApMDnPEUkLSZbjkuvGMRZfgbk4T76obRVe1kMc=
-----END PUBLIC KEY-----`;

export interface LicenceToken {
  key: string;
  exp: number;
}

/** Décode et vérifie un jeton de licence signé. null = invalide/expiré. */
export function verifyPremiumToken(raw: string): LicenceToken | null {
  const token = (raw ?? "").trim();
  const m = /^JARVIS-PREM\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
  if (!m) return null;
  try {
    const payload = Buffer.from(m[1], "base64url").toString("utf8");
    const parsed = JSON.parse(payload) as { key?: unknown; exp?: unknown };
    if (typeof parsed.key !== "string" || typeof parsed.exp !== "number" || parsed.exp < Date.now()) return null;
    let pub: ReturnType<typeof createPublicKey>;
    try {
      pub = createPublicKey(VERIFY_PUB);
    } catch {
      return null;
    }
    const ok = cryptoVerify(null, Buffer.from(m[1]), pub, Buffer.from(m[2], "base64url"));
    return ok ? { key: parsed.key, exp: parsed.exp } : null;
  } catch {
    return null;
  }
}

/** Édition Premium active ? (jeton signé valide et non expiré) */
export function hasPremium(s: Pick<SettingsRow, "premiumToken">): boolean {
  return verifyPremiumToken(s.premiumToken) !== null;
}

/** Date d'expiration du jeton courant (null si aucun Premium actif). */
export function premiumExpiry(s: Pick<SettingsRow, "premiumToken">): string | null {
  const t = verifyPremiumToken(s.premiumToken);
  return t ? new Date(t.exp).toISOString() : null;
}

/** Une clé de licence est-elle stockée (en attente d'activation) ? */
export function hasStoredKey(s: Pick<SettingsRow, "premiumKey">): boolean {
  return s.premiumKey.trim().length > 0;
}

/** Normalise une clé saisie (majuscules, sans espaces). */
export function normalizePremiumKey(raw: string): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export interface ActivateResult {
  ok: boolean;
  token?: string;
  exp?: number;
  days?: number;
  error?: string;
}

/** Active (ou renouvelle) une clé auprès du service de licences. */
export async function activatePremiumKey(key: string): Promise<ActivateResult> {
  const clean = (key ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!clean) return { ok: false, error: "Aucune clé saisie." };
  try {
    const r = await fetch(`${LICENCE_URL}/api/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: clean }),
      signal: AbortSignal.timeout(15000),
    });
    const j = (await r.json().catch(() => ({}))) as ActivateResult;
    if (!r.ok) return { ok: false, error: j.error ?? `Service de licences indisponible (HTTP ${r.status}).` };
    return j;
  } catch {
    return { ok: false, error: "Service de licences injoignable — vérifiez votre connexion Internet et réessayez." };
  }
}
