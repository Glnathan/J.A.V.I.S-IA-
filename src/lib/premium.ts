// Licence J.A.R.V.I.S. Premium : clé au format JARVIS-XXXXX-XXXXX-XX (hors ligne, somme de contrôle).
// Remarque : une validation 100 % hors ligne est symbolique ; un vrai contrôle d'accès passe par un
// service en ligne (futur « service Premium »). Pour un projet personnel, c'est largement suffisant.

/** Prix affiché de la licence Premium (à vie). Modifiez-le ici, il s'applique partout. */
export const PREMIUM_PRICE = "19,99 €";

const GROUP = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans I, L, O, 0, 1 pour éviter les confusions
const KEY_RE = new RegExp(`^JARVIS-([${GROUP}]{5})-([${GROUP}]{5})-(\\d{2})$`);

/** Somme de contrôle locale : somme des codes de caractères pondérée, modulo 97. */
export function premiumChecksum(chars: string): string {
  let sum = 0;
  for (let i = 0; i < chars.length; i++) sum += chars.charCodeAt(i) * (i + 7);
  return String(sum % 97).padStart(2, "0");
}

/** Une clé Premium est-elle valide ? (normalisée : majuscules, sans espaces) */
export function isValidPremiumKey(raw: string): boolean {
  const key = (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const m = KEY_RE.exec(key);
  if (!m) return false;
  return premiumChecksum(`${m[1]}${m[2]}`) === m[3];
}

export function normalizePremiumKey(raw: string): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

/** Édition Premium active ? */
export function hasPremium(s: Pick<SettingsRowLike, "premiumKey">): boolean {
  return isValidPremiumKey(s.premiumKey);
}

interface SettingsRowLike {
  premiumKey: string;
}
