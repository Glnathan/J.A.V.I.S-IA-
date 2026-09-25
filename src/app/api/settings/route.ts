import { normalizeHaUrl } from "@/lib/brain/home-assistant";
import { buildSettingsPayload } from "@/lib/brain/payload";
import { getSettings, parseVisionFace, parseVoicePrint, updateSettings, type SettingsPatch } from "@/lib/brain/settings";
import { isValidPremiumKey, hasPremium, normalizePremiumKey } from "@/lib/premium";
import { getProvider } from "@/lib/providers";
import { canonicalYouTubeUrl, parseYouTubeId } from "@/lib/youtube";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await buildSettingsPayload());
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const cur = await getSettings();
  const patch: SettingsPatch = {};

  const str = (k: string, max = 200): string | undefined => {
    const v = body[k];
    return typeof v === "string" ? v.trim().slice(0, max) : undefined;
  };
  const num = (k: string, min: number, max: number): number | undefined => {
    const v = body[k];
    return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;
  };
  const bool = (k: string): boolean | undefined => {
    const v = body[k];
    return typeof v === "boolean" ? v : undefined;
  };
  const oneOf = <T extends string>(k: string, values: readonly T[]): T | undefined => {
    const v = str(k, 40);
    return v !== undefined && (values as readonly string[]).includes(v) ? (v as T) : undefined;
  };

  // Profil
  const userName = str("userName", 60);
  if (userName !== undefined) patch.userName = userName;
  const honorific = str("honorific", 60);
  if (honorific !== undefined) patch.honorific = honorific || "Monsieur";
  const addressBy = oneOf("addressBy", ["name", "title"] as const);
  if (addressBy) patch.addressBy = addressBy;
  const city = str("city", 80);
  if (city !== undefined) patch.city = city || "Paris";
  const onboarded = bool("onboarded");
  if (onboarded !== undefined) patch.onboarded = onboarded;

  // Voix & micro
  const voiceName = str("voiceName", 200);
  if (voiceName !== undefined) patch.voiceName = voiceName;
  const voiceRate = num("voiceRate", 0.5, 2);
  if (voiceRate !== undefined) patch.voiceRate = voiceRate;
  const voicePitch = num("voicePitch", 0, 2);
  if (voicePitch !== undefined) patch.voicePitch = voicePitch;
  const autoSpeak = bool("autoSpeak");
  if (autoSpeak !== undefined) patch.autoSpeak = autoSpeak;
  const wakeWord = bool("wakeWord");
  if (wakeWord !== undefined) patch.wakeWord = wakeWord;
  // Veille faciale (Premium) : le booléen n'est appliqué que si une licence valide est présente.
  const visionGate = bool("visionGate");
  if (visionGate !== undefined) {
    if (!visionGate) patch.visionGate = false;
    else {
      const s = await getSettings();
      if (hasPremium(s)) patch.visionGate = true;
    }
  }

  // Empreinte vocale (Premium)
  const voicePrint = str("voicePrint", 200000);
  if (voicePrint !== undefined) {
    if (voicePrint === "") patch.voicePrint = "";
    else {
      if (!parseVoicePrint(voicePrint)) return Response.json({ error: "Empreinte vocale invalide." }, { status: 400 });
      patch.voicePrint = voicePrint;
    }
  }
  // Mot d'activation personnalisé (Premium) : lettres seulement, 2 à 20 caractères.
    const wakeCustom = str("wakeCustom", 20);
  if (wakeCustom !== undefined) {
    if (wakeCustom === "") patch.wakeCustom = "";
    else {
      const word = wakeCustom
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z ]/g, "")
        .trim()
        .slice(0, 20);
      if (word.length < 2) return Response.json({ error: "Mot d'activation trop court (2 lettres minimum)." }, { status: 400 });
      const s = await getSettings();
      if (!hasPremium(s)) return Response.json({ error: "Le mot d'activation personnalisé est réservé à l'édition Premium." }, { status: 403 });
      patch.wakeCustom = word.replace(/\s+/g, " ");
    }
  }
const voiceGate = bool("voiceGate");
  if (voiceGate !== undefined) {
    if (!voiceGate) patch.voiceGate = false;
    else {
      const s = await getSettings();
      if (hasPremium(s)) patch.voiceGate = true;
    }
  }
  const sttEngine = oneOf("sttEngine", ["auto", "browser", "whisper"] as const);
  if (sttEngine) patch.sttEngine = sttEngine;
  const sttProvider = oneOf("sttProvider", ["groq", "openai"] as const);
  if (sttProvider) {
    patch.sttProvider = sttProvider;
    if (sttProvider !== cur.sttProvider) patch.sttApiKey = "";
  }
  const sttApiKey = str("sttApiKey", 500);
  if (sttApiKey) patch.sttApiKey = sttApiKey;
  if (body.clearSttKey === true) patch.sttApiKey = "";
  const desktopBrowser = oneOf("desktopBrowser", ["auto", "chrome", "edge"] as const);
  if (desktopBrowser) patch.desktopBrowser = desktopBrowser;
  const bootMusic = oneOf("bootMusic", ["youtube", "theme", "custom", "off"] as const);
  if (bootMusic) patch.bootMusic = bootMusic;
  const bootMusicUrl = str("bootMusicUrl", 300);
  if (bootMusicUrl !== undefined) {
    const id = parseYouTubeId(bootMusicUrl);
    if (id) patch.bootMusicUrl = canonicalYouTubeUrl(id);
  }
  const bootMusicStart = num("bootMusicStart", 0, 3600);
  if (bootMusicStart !== undefined) patch.bootMusicStart = Math.round(bootMusicStart);
  const bootMusicDuration = num("bootMusicDuration", 0, 900);
  if (bootMusicDuration !== undefined) patch.bootMusicDuration = Math.round(bootMusicDuration);
  const bootVolume = num("bootVolume", 0, 1);
  if (bootVolume !== undefined) patch.bootVolume = bootVolume;

  // Système
  const pcControl = bool("pcControl");
  if (pcControl !== undefined) patch.pcControl = pcControl;
  const pluginsEnabled = bool("pluginsEnabled");
  if (pluginsEnabled !== undefined) patch.pluginsEnabled = pluginsEnabled;

  // Intelligence — une clé par fournisseur (aiKeys), conservée quand on change de fournisseur
  const aiProvider = str("aiProvider", 40);
  const providerChanged =
    aiProvider !== undefined &&
    aiProvider !== cur.aiProvider &&
    (aiProvider === "auto" || aiProvider === "local" || Boolean(getProvider(aiProvider)));
  if (providerChanged) {
    patch.aiProvider = aiProvider;
    // L'ancienne clé unique reste utilisable pour son fournisseur d'origine.
    const oldProvider = getProvider(cur.aiProvider);
    if (oldProvider?.needsKey && cur.aiApiKey.trim()) patch.aiKeys = { [oldProvider.id]: cur.aiApiKey.trim() };
    patch.aiApiKey = "";
    patch.aiModel = "";
  }
  const aiModel = str("aiModel", 120);
  if (aiModel !== undefined) patch.aiModel = aiModel;
  const aiBaseUrl = str("aiBaseUrl", 300);
  if (aiBaseUrl !== undefined) patch.aiBaseUrl = aiBaseUrl;

  const targetProvider = aiProvider ?? cur.aiProvider;
  const mergeKeys = (keys: Record<string, string>): void => {
    const into = patch.aiKeys && typeof patch.aiKeys === "object" ? (patch.aiKeys as Record<string, string>) : {};
    patch.aiKeys = { ...into, ...keys };
  };

  // Clés saisies dans les cartes (une entrée vide supprime la clé du fournisseur).
  if (typeof body.aiKeys === "object" && body.aiKeys !== null && !Array.isArray(body.aiKeys)) {
    const keys: Record<string, string> = {};
    for (const [id, v] of Object.entries(body.aiKeys as Record<string, unknown>)) {
      if (!getProvider(id)?.needsKey) continue;
      if (v === "" || typeof v === "string") keys[id] = typeof v === "string" ? v.trim().slice(0, 500) : "";
    }
    if (Object.keys(keys).length) {
      mergeKeys(keys);
      if (typeof keys[targetProvider] === "string") patch.aiApiKey = keys[targetProvider];
    }
  }
  const clearAiKey = str("clearAiKey", 40);
  if (clearAiKey && getProvider(clearAiKey)?.needsKey) {
    mergeKeys({ [clearAiKey]: "" });
    if (clearAiKey === targetProvider) patch.aiApiKey = "";
  }
  // Champ « clé du fournisseur sélectionné » (compatibilité) : rangé avec les clés par fournisseur.
  const aiApiKey = str("aiApiKey", 500);
  if (aiApiKey && getProvider(targetProvider)?.needsKey) {
    mergeKeys({ [targetProvider]: aiApiKey });
    patch.aiApiKey = aiApiKey;
  }
  if (body.clearApiKey === true) {
    const p = getProvider(targetProvider);
    if (p?.needsKey) mergeKeys({ [p.id]: "" });
    patch.aiApiKey = "";
  }

  // Premium
  const premiumKey = str("premiumKey", 40);
  if (premiumKey !== undefined) {
    if (!premiumKey) patch.premiumKey = "";
    else if (isValidPremiumKey(premiumKey)) patch.premiumKey = normalizePremiumKey(premiumKey);
    else return Response.json({ error: "Clé Premium invalide. Format attendu : JARVIS-XXXXX-XXXXX-XX." }, { status: 400 });
  }

  // Vision (édition Premium) : inscription du visage pour la reconnaissance.
  const visionFace = str("visionFace", 200000);
  if (visionFace !== undefined) {
    if (visionFace === "") patch.visionFace = "";
    else {
      if (!parseVisionFace(visionFace)) return Response.json({ error: "Visage invalide (nom ou descripteurs)." }, { status: 400 });
      patch.visionFace = visionFace;
    }
  }

  // Home Assistant
  const haEnabled = bool("haEnabled");
  if (haEnabled !== undefined) patch.haEnabled = haEnabled;
  const haUrl = str("haUrl", 300);
  if (haUrl !== undefined) patch.haUrl = normalizeHaUrl(haUrl);
  const haToken = str("haToken", 2000);
  if (haToken) patch.haToken = haToken;
  if (body.clearHaToken === true) patch.haToken = "";
  const haUseAssist = bool("haUseAssist");
  if (haUseAssist !== undefined) patch.haUseAssist = haUseAssist;
  const haAllowSensitive = bool("haAllowSensitive");
  if (haAllowSensitive !== undefined) patch.haAllowSensitive = haAllowSensitive;
  if (Array.isArray(body.haFavorites)) {
    patch.haFavorites = JSON.stringify(body.haFavorites.filter((x): x is string => typeof x === "string").slice(0, 100));
  }

  if (Object.keys(patch).length) await updateSettings(patch);
  return Response.json(await buildSettingsPayload());
}
