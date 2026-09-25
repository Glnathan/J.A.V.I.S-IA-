import type { PublicSettings } from "@/lib/types";

/** Editable (non-secret) settings shown in the settings window. */
export interface SettingsForm {
  userName: string;
  honorific: string;
  addressBy: string;
  city: string;
  voiceName: string;
  voiceRate: number;
  voicePitch: number;
  autoSpeak: boolean;
  wakeWord: boolean;
  visionGate: boolean;
  voiceGate: boolean;
  wakeCustom: string;
  aiProvider: string;
  aiModel: string;
  aiBaseUrl: string;
  pcControl: boolean;
  bootMusic: string;
  bootVolume: number;
  bootMusicUrl: string;
  bootMusicStart: number;
  bootMusicDuration: number;
  pluginsEnabled: boolean;
  sttEngine: string;
  sttProvider: string;
  desktopBrowser: string;
  haEnabled: boolean;
  haUrl: string;
  haUseAssist: boolean;
  haAllowSensitive: boolean;
  obsidianVault: string;
  elevenVoiceId: string;
  elevenOn: boolean;
}

export type SetField = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => void;

export function formFromSettings(s: PublicSettings): SettingsForm {
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
    voiceGate: s.voiceGate,
    wakeCustom: s.wakeCustom,
    aiProvider: s.aiProvider,
    aiModel: s.aiModel,
    aiBaseUrl: s.aiBaseUrl,
    pcControl: s.pcControl,
    bootMusic: s.bootMusic,
    bootVolume: s.bootVolume,
    bootMusicUrl: s.bootMusicUrl,
    bootMusicStart: s.bootMusicStart,
    bootMusicDuration: s.bootMusicDuration,
    pluginsEnabled: s.pluginsEnabled,
    sttEngine: s.sttEngine,
    sttProvider: s.sttProvider,
    desktopBrowser: s.desktopBrowser,
    haEnabled: s.haEnabled,
    haUrl: s.haUrl,
    haUseAssist: s.haUseAssist,
    haAllowSensitive: s.haAllowSensitive,
    obsidianVault: s.obsidianVault,
    elevenVoiceId: s.elevenVoiceId,
    elevenOn: s.elevenOn,
  };
}

export type AddressChoice = "name" | "monsieur" | "madame" | "custom";

export function addressChoiceOf(s: { addressBy: string; honorific: string }): AddressChoice {
  if (s.addressBy === "name") return "name";
  const h = s.honorific.trim().toLowerCase();
  return h === "monsieur" ? "monsieur" : h === "madame" ? "madame" : "custom";
}

export function addressPatch(choice: AddressChoice, custom: string): { addressBy: "name" | "title"; honorific?: string } {
  if (choice === "name") return { addressBy: "name" };
  if (choice === "monsieur") return { addressBy: "title", honorific: "Monsieur" };
  if (choice === "madame") return { addressBy: "title", honorific: "Madame" };
  return { addressBy: "title", honorific: custom.trim() || "Monsieur" };
}

const TITLE_RE = /^(monsieur|madame|mademoiselle|maître|maitre|docteur|professeur|patron|patronne|chef|capitaine|commandant|colonel|agent|lieutenant|général|general|boss|sir)\b/i;

export function greetingPreview(name: string, choice: AddressChoice, custom: string): string {
  let who: string;
  if (choice === "name") who = name.trim() || "…";
  else if (choice === "monsieur") who = "monsieur";
  else if (choice === "madame") who = "madame";
  else {
    const c = custom.trim() || "Monsieur";
    who = TITLE_RE.test(c) ? c.charAt(0).toLowerCase() + c.slice(1) : c;
  }
  return `Bonjour, ${who}. Que puis-je faire pour vous ?`;
}
