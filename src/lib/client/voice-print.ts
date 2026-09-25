// Empreinte vocale J.A.R.V.I.S. (édition Premium) : vérification du locuteur par
// WavLM X-Vector (modèle Xenova/wavlm-base-sv via transformers.js, exécution 100 %
// locale en WebAssembly). Le modèle est chargé depuis Hugging Face au premier emploi
// puis mis en cache par le navigateur — l'installateur reste léger.
import type { PublicSettings } from "@/lib/types";

export interface StoredVoice {
  descriptors: number[][];
}

type Lib = typeof import("@huggingface/transformers");
const MODEL_ID = "Xenova/wavlm-base-sv";
/** Cosinus de similarité au-dessus duquel la voix est reconnue (0-1). */
export const VOICE_THRESHOLD = 0.55;

let lib: Lib | null = null;
let modelPromise: Promise<{ processor: Awaited<ReturnType<Lib["AutoProcessor"]["from_pretrained"]>>; model: Awaited<ReturnType<Lib["AutoModel"]["from_pretrained"]>> }> | null = null;

/**
 * Prépare le modèle (téléchargé depuis Hugging Face au premier emploi, ~100 Mo,
 * puis mis en cache par le navigateur). À appeler AVANT les prises pour éviter
 * l'attente silencieuse au milieu d'une inscription.
 */
export async function loadVoiceModel(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!lib) lib = await import("@huggingface/transformers");
    // Charger depuis le hub Hugging Face (sinon la bibliothèque cherche d'abord un
    // modèle local inexistant et échoue). Le cache navigateur prend le relais ensuite.
    lib.env.allowLocalModels = false;
    lib.env.useBrowserCache = true;
    if (!modelPromise)
      modelPromise = (async () => {
        const processor = await lib!.AutoProcessor.from_pretrained(MODEL_ID);
        const model = await lib!.AutoModel.from_pretrained(MODEL_ID, { dtype: "q8" });
        return { processor, model };
      })();
    await modelPromise;
    return { ok: true };
  } catch (e) {
    modelPromise = null;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[jarvis] Modèle de voix :", msg);
    return { ok: false, error: msg.slice(0, 200) };
  }
}

async function ensureModel() {
  if (!lib) lib = await import("@huggingface/transformers");
  lib.env.allowLocalModels = false;
  lib.env.useBrowserCache = true;
  if (!modelPromise) await loadVoiceModel();
  if (!modelPromise) throw new Error("Modèle de voix indisponible");
  return modelPromise;
}

/** Empreinte du locuteur d'un enregistrement WAV (16 kHz mono) ; null si échec. */
export async function embedWav(blob: Blob): Promise<number[] | null> {
  let ctx: AudioContext | null = null;
  try {
    const { processor, model } = await ensureModel();
    const buf = await blob.arrayBuffer();
    ctx = new AudioContext({ sampleRate: 16000 });
    const decoded = await ctx.decodeAudioData(buf);
    const audio = decoded.getChannelData(0);
    const inputs = await processor(audio);
    const { embeddings } = await model(inputs);
    return Array.from(embeddings.data as Float32Array);
  } catch (e) {
    console.error("[jarvis] Empreinte vocale :", e);
    return null;
  } finally {
    void ctx?.close();
  }
}

export function cosSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / Math.sqrt(na * nb);
}

/**
 * La voix de l'enregistrement est-elle celle de l'utilisateur inscrit ?
 * true / false ; null = modèle indisponible (on ne bloque pas dans ce cas).
 */
export async function verifyWav(blob: Blob, stored: StoredVoice | null): Promise<boolean | null> {
  if (!stored || !stored.descriptors.length) return null;
  const e = await embedWav(blob);
  if (!e) return null;
  const best = Math.max(...stored.descriptors.map((d) => cosSim(e, d)));
  return best >= VOICE_THRESHOLD;
}

/** Similarité (0-1) d'un enregistrement avec la voix inscrite ; null si échec. */
export async function similarityOf(blob: Blob, stored: StoredVoice | null): Promise<number | null> {
  if (!stored || !stored.descriptors.length) return null;
  const e = await embedWav(blob);
  if (!e) return null;
  return Math.max(...stored.descriptors.map((d) => cosSim(e, d)));
}

/** Empreinte vocale inscrite dans les réglages publics (null si aucune). */
export function storedVoiceOf(settings: PublicSettings | undefined): StoredVoice | null {
  return settings?.voicePrint ?? null;
}
