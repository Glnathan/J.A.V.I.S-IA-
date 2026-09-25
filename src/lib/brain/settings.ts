import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { DEFAULT_ADDRESS_BY, DEFAULT_HONORIFIC, DEFAULT_USER_NAME } from "@/lib/defaults";
import { writeDesktopFiles } from "@/lib/desktop/profile";
import { getProvider, PROVIDERS, type ProviderId } from "@/lib/providers";
import { hasPremium } from "@/lib/premium";
import { isDesktop } from "@/lib/runtime";
import type { PublicSettings } from "@/lib/types";
import { capitalize } from "./text";

export type SettingsRow = typeof settings.$inferSelect;
/** `aiKeys` accepte aussi un objet { fournisseur: clé } (fusionné avec les clés existantes). */
export type SettingsPatch = Omit<Partial<typeof settings.$inferInsert>, "aiKeys"> & { aiKeys?: string | Record<string, string> };

/** Clés API par fournisseur (JSON en base, une clé par fournisseur). */
export function aiKeysOf(s: Pick<SettingsRow, "aiKeys">): Partial<Record<ProviderId, string>> {
  try {
    const v = JSON.parse(s.aiKeys) as Record<string, unknown>;
    const out: Partial<Record<ProviderId, string>> = {};
    for (const p of PROVIDERS) {
      if (!p.needsKey) continue;
      const k = typeof v[p.id] === "string" ? (v[p.id] as string).trim() : "";
      if (k) out[p.id] = k;
    }
    return out;
  } catch {
    return {};
  }
}

/** Empreinte vocale (JSON en base) : { descriptors } ou null si absent/corrompu. */
export function parseVoicePrint(raw: string): { descriptors: number[][] } | null {
  try {
    const v = JSON.parse(raw) as { descriptors?: unknown };
    if (!Array.isArray(v.descriptors)) return null;
    const descriptors = v.descriptors.filter(
      (d): d is number[] => Array.isArray(d) && d.length >= 64 && d.every((n) => typeof n === "number"),
    );
    if (!descriptors.length) return null;
    return { descriptors: descriptors.slice(0, 5) };
  } catch {
    return null;
  }
}

/** Visage inscrit (JSON en base) : { name, descriptors } ou null si absent/corrompu. */
export function parseVisionFace(raw: string): { name: string; descriptors: number[][] } | null {
  try {
    const v = JSON.parse(raw) as { name?: unknown; descriptors?: unknown };
    if (typeof v.name !== "string" || !Array.isArray(v.descriptors)) return null;
    const descriptors = v.descriptors.filter(
      (d): d is number[] => Array.isArray(d) && d.length === 128 && d.every((n) => typeof n === "number"),
    );
    if (!descriptors.length) return null;
    return { name: v.name.slice(0, 40), descriptors: descriptors.slice(0, 5) };
  } catch {
    return null;
  }
}

export async function getSettings(): Promise<SettingsRow> {
  const rows = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (rows[0]) return rows[0];
  await db
    .insert(settings)
    .values({ id: 1, userName: DEFAULT_USER_NAME, addressBy: DEFAULT_ADDRESS_BY, honorific: DEFAULT_HONORIFIC })
    .onConflictDoNothing();
  const again = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return again[0];
}

export async function updateSettings(patch: SettingsPatch): Promise<SettingsRow> {
  const current = await getSettings();
  // aiKeys : accepte un objet { fournisseur: clé } à fusionner avec les clés existantes (clé vide = suppression).
  const { aiKeys, ...rest } = patch;
  let clean: Partial<typeof settings.$inferInsert>;
  if (aiKeys && typeof aiKeys === "object") {
    const merged = aiKeysOf(current);
    for (const [id, key] of Object.entries(aiKeys)) {
      const p = getProvider(id);
      if (!p?.needsKey) continue;
      const k = (key ?? "").trim().slice(0, 500);
      if (k) merged[id as ProviderId] = k;
      else delete merged[id as ProviderId];
    }
    clean = { ...rest, aiKeys: JSON.stringify(merged) };
  } else if (typeof aiKeys === "string") {
    clean = { ...rest, aiKeys };
  } else {
    clean = rest;
  }
  const [row] = await db
    .update(settings)
    .set({ ...clean, id: 1, updatedAt: new Date() })
    .where(eq(settings.id, 1))
    .returning();
  if (isDesktop()) {
    try {
      writeDesktopFiles(row);
    } catch (e) {
      console.error("[jarvis] Écriture du profil PC impossible :", e);
    }
  }
  return row;
}

const TITLE_RE =
  /^(monsieur|madame|mademoiselle|maître|maitre|docteur|professeur|patron|patronne|chef|capitaine|commandant|colonel|agent|lieutenant|général|general|boss|sir)\b/i;

/** True for an appellation such as "Monsieur", "Madame", "Patron", "Monsieur Stark"… */
export function isTitle(value: string): boolean {
  return TITLE_RE.test(value.trim());
}

/**
 * How J.A.R.V.I.S. addresses the user, mid-sentence ("Nathan", "monsieur") and at the start of a sentence.
 * addressBy = "name" → first name (falls back to the appellation when no name is known).
 */
export function address(s: Pick<SettingsRow, "honorific" | "userName" | "addressBy">): { sir: string; Sir: string } {
  const name = (s.userName || "").trim();
  if (s.addressBy === "name" && name) return { sir: name, Sir: name };
  const h = (s.honorific || DEFAULT_HONORIFIC).trim() || DEFAULT_HONORIFIC;
  const sir = TITLE_RE.test(h) ? h.charAt(0).toLowerCase() + h.slice(1) : h;
  return { sir, Sir: capitalize(h) };
}

const preview = (key: string) => {
  const k = key.trim();
  return k ? `${k.slice(0, 4)}…${k.slice(-4)}` : "";
};

function parseList(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  } catch {
    return [];
  }
}

export function favoritesOf(s: SettingsRow): string[] {
  return parseList(s.haFavorites);
}

export function toPublicSettings(s: SettingsRow): PublicSettings {
  const keys = aiKeysOf(s);
  const aiKeyPreviews: Record<string, string> = {};
  for (const p of PROVIDERS) if (p.needsKey) aiKeyPreviews[p.id] = keys[p.id] ? preview(keys[p.id] as string) : "";
  // Clé effective du fournisseur sélectionné : ancienne clé unique, sinon clé par fournisseur.
  const sel = getProvider(s.aiProvider);
  const effective = sel?.needsKey ? (s.aiApiKey.trim() || keys[sel.id] || "") : "";
  return {
    userName: s.userName,
    honorific: s.honorific,
    addressBy: s.addressBy,
    city: s.city,
    voiceName: s.voiceName,
    voiceRate: s.voiceRate,
    voicePitch: s.voicePitch,
    autoSpeak: s.autoSpeak,
    wakeWord: s.wakeWord,
    visionGate: s.visionGate,
    voicePrint: parseVoicePrint(s.voicePrint),
    voiceGate: s.voiceGate,
    wakeCustom: s.wakeCustom,
    aiProvider: s.aiProvider,
    aiModel: s.aiModel,
    aiBaseUrl: s.aiBaseUrl,
    hasApiKey: effective.length > 0,
    apiKeyPreview: preview(effective),
    aiKeyPreviews,
    premiumActive: hasPremium(s),
    visionFace: parseVisionFace(s.visionFace),
    pcControl: s.pcControl,
    bootMusic: s.bootMusic,
    bootVolume: s.bootVolume,
    bootMusicUrl: s.bootMusicUrl,
    bootMusicStart: s.bootMusicStart,
    bootMusicDuration: s.bootMusicDuration,
    pluginsEnabled: s.pluginsEnabled,
    onboarded: s.onboarded,
    sttEngine: s.sttEngine,
    sttProvider: s.sttProvider,
    hasSttKey: s.sttApiKey.trim().length > 0,
    sttKeyPreview: preview(s.sttApiKey),
    desktopBrowser: s.desktopBrowser,
    haEnabled: s.haEnabled,
    haUrl: s.haUrl,
    hasHaToken: s.haToken.trim().length > 0,
    haTokenPreview: preview(s.haToken),
    haUseAssist: s.haUseAssist,
    haAllowSensitive: s.haAllowSensitive,
    haFavorites: parseList(s.haFavorites),
  };
}
