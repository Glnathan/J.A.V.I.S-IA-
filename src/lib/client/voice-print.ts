// Empreinte vocale J.A.R.V.I.S. (édition Premium) : vérification du locuteur par
// WavLM X-Vector (modèle Xenova/wavlm-base-sv). Le modèle s'exécute dans un Web
// Worker dédié — un plantage du WebAssembly n'emporte jamais la fenêtre de JARVIS.
// Le modèle (~100 Mo) est chargé depuis Hugging Face au premier emploi puis mis
// en cache par le navigateur : l'installateur reste léger.
import type { PublicSettings } from "@/lib/types";

export interface StoredVoice {
  descriptors: number[][];
}

const MODEL_ID = "Xenova/wavlm-base-sv";
/** Cosinus de similarité au-dessus duquel la voix est reconnue (0-1). */
export const VOICE_THRESHOLD = 0.55;

interface WorkerReply {
  id: number;
  ok: boolean;
  embedding?: number[];
  error?: string;
}

let worker: Worker | null = null;
let workerBroken = false;
let reqId = 0;
const pending = new Map<number, { resolve: (r: WorkerReply) => void; timer: ReturnType<typeof setTimeout> }>();

function ensureWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    // Fichier servi tel quel (public/voice-worker.js) : le compilateur d'application
    // ne sait pas empaqueter ce worker sans le corrompre (TypeScript brut servi tel quel).
    worker = new Worker("/voice-worker.js", { type: "module" });
    worker.onmessage = (e: MessageEvent) => {
      const r = e.data as WorkerReply;
      const p = pending.get(r.id);
      if (p) {
        pending.delete(r.id);
        clearTimeout(p.timer);
        p.resolve(r);
      }
    };
    worker.onerror = (e) => {
      console.error("[jarvis] Worker de voix :", e.message ?? "erreur");
      // Le worker est mort (pas la fenêtre) : on abandonne proprement l'analyse.
      workerBroken = true;
      for (const [id, p] of pending) {
        pending.delete(id);
        clearTimeout(p.timer);
        p.resolve({ id, ok: false, error: "Worker de reconnaissance vocale indisponible" });
      }
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

function ask(audio: Float32Array, timeoutMs: number): Promise<WorkerReply> {
  const w = ensureWorker();
  if (!w) return Promise.resolve({ id: 0, ok: false, error: "Worker indisponible" });
  const id = ++reqId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ id, ok: false, error: "Délai dépassé (le modèle se télécharge ?)" });
    }, timeoutMs);
    pending.set(id, { resolve, timer });
    w.postMessage({ id, type: "embed", audio }, [audio.buffer]);
  });
}

/** Décode un WAV/Blob en Float32Array 16 kHz mono (dans la fenêtre, sans risque). */
async function decodeTo16k(blob: Blob): Promise<Float32Array | null> {
  let ctx: AudioContext | null = null;
  try {
    const buf = await blob.arrayBuffer();
    ctx = new AudioContext({ sampleRate: 16000 });
    const decoded = await ctx.decodeAudioData(buf);
    return decoded.getChannelData(0);
  } catch {
    return null;
  } finally {
    void ctx?.close();
  }
}

/**
 * Prépare le modèle (téléchargé depuis Hugging Face au premier emploi, ~100 Mo,
 * puis mis en cache par le navigateur). À appeler AVANT les prises pour éviter
 * l'attente silencieuse au milieu d'une inscription.
 */
export async function loadVoiceModel(): Promise<{ ok: boolean; error?: string }> {
  const w = ensureWorker();
  if (!w) return { ok: false, error: "Web Worker indisponible dans ce navigateur" };
  // Sonde : une empreinte sur 1 s de silence force le chargement du modèle
  // (moins d'une seconde ferait échouer le modèle : entrée trop courte).
  const r = await ask(new Float32Array(16000), 180000);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

/** Empreinte du locuteur d'un enregistrement WAV (16 kHz mono) ; null si échec. */
export async function embedWav(blob: Blob): Promise<number[] | null> {
  const audio = await decodeTo16k(blob);
  if (!audio) return null;
  const r = await ask(audio, 120000);
  return r.ok ? (r.embedding ?? null) : null;
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

export { MODEL_ID };
