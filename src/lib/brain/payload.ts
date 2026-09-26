import { getBootMusic } from "@/lib/boot-music";
import { dataDir, isDesktop, pluginsDir, userDir } from "@/lib/runtime";
import type { SettingsPayload } from "@/lib/types";
import { APP_VERSION } from "@/lib/version";
import { haConfig } from "./home-assistant";
import { detectEnvProviders, resolveAI } from "./llm";
import { pcControlAvailable } from "./pc";
import { getSettings, toPublicSettings } from "./settings";
import { resolveSTT } from "./stt";
import { sttLocalInstalled } from "./sttLocal";

export async function buildSettingsPayload(): Promise<SettingsPayload> {
  const s = await getSettings();
  const ai = resolveAI(s);
  const stt = resolveSTT(s);
  const desktop = isDesktop();
  const music = getBootMusic();
  return {
    settings: toPublicSettings(s),
    ai: ai ? { active: true, provider: ai.provider, label: ai.label, model: ai.model, origin: ai.origin } : { active: false },
    envProviders: detectEnvProviders(),
    pc: { available: pcControlAvailable(), platform: process.platform },
    desktop: {
      enabled: desktop,
      version: process.env.JARVIS_VERSION || APP_VERSION,
      platform: process.platform,
      dataDir: desktop ? dataDir() : null,
      userDir: userDir(),
      pluginsDir: pluginsDir(),
    },
    bootMusicFile: music ? { name: music.name, size: music.size } : null,
    stt: stt
      ? { available: true, provider: stt.provider, origin: stt.origin, local: sttLocalInstalled() }
      : { available: sttLocalInstalled(), provider: "local", origin: null, local: sttLocalInstalled() },
    home: { configured: Boolean(haConfig(s)) },
  };
}
