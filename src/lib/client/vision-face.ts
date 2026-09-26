// Reconnaissance faciale J.A.R.V.I.S. (édition Premium) — face-api/TFJS en WebAssembly,
// modèles locaux dans /models, aucun envoi d'image sur Internet.
import type { PublicSettings } from "@/lib/types";

export interface StoredFace {
  name: string;
  descriptors: number[][];
}

export type FaceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "not-enrolled" }
  | { status: "no-face" }
  | { status: "recognized"; name: string; greet: boolean }
  | { status: "unknown" }
  | { status: "error"; message?: string };

type FaceApi = typeof import("@vladmandic/face-api");

let api: FaceApi | null = null;
let loadPromise: Promise<FaceApi | null> | null = null;
let lastGreetAt = 0;

async function ensureModels(): Promise<FaceApi | null> {
  if (api) return api;
  if (!loadPromise)
    loadPromise = (async () => {
      try {
        const faceapi = await import("@vladmandic/face-api");
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
          faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
          faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
        ]);
        api = faceapi;
        return faceapi;
      } catch {
        return null;
      }
    })();
  return loadPromise;
}

async function descriptorOf(faceapi: FaceApi, canvas: HTMLCanvasElement): Promise<Float32Array | null> {
  const det = await faceapi
    .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.4 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return det?.descriptor ?? null;
}

function distance(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) * (a[i] - b[i]);
  return Math.sqrt(sum);
}

/** Cherche un visage dans l'image et le compare aux visages inscrits (famille). */
export async function recognizeFrame(canvas: HTMLCanvasElement, faces: StoredFace[] | null): Promise<FaceState> {
  if (!faces || !faces.length) return { status: "not-enrolled" };
  const faceapi = await ensureModels();
  if (!faceapi) return { status: "error", message: "Modèles de reconnaissance introuvables." };
  const d = await descriptorOf(faceapi, canvas);
  if (!d) return { status: "no-face" };
  let best = Infinity;
  let bestName = "";
  for (const face of faces) {
    for (const ref of face.descriptors) {
      const dist = distance(d, ref);
      if (dist < best) {
        best = dist;
        bestName = face.name;
      }
    }
  }
  if (best < 0.5) {
    const now = Date.now();
    const greet = now - lastGreetAt > 120000;
    if (greet) lastGreetAt = now;
    return { status: "recognized", name: bestName, greet };
  }
  return { status: "unknown" };
}

const MAX_PROFILES = 6;

async function saveFaces(faces: StoredFace[]): Promise<FaceState> {
  try {
    const r = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visionFace: JSON.stringify(faces) }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return { status: "error", message: j.error ?? "Enregistrement refusé par le serveur." };
    }
  } catch {
    return { status: "error", message: "Le serveur ne répond pas." };
  }
  lastGreetAt = Date.now();
  return { status: "idle" };
}

/** Inscrit un visage : trois captures, moyenne conservée côté serveur.
 *  Met à jour le profil portant le même nom, sinon l'ajoute (jusqu'à 6 profils). */
export async function enrollFace(canvas: HTMLCanvasElement, name: string, existing: StoredFace[]): Promise<FaceState> {
  const faceapi = await ensureModels();
  if (!faceapi) return { status: "error", message: "Modèles de reconnaissance introuvables." };
  const descriptors: number[][] = [];
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise((r) => setTimeout(r, 500));
    const d = await descriptorOf(faceapi, canvas);
    if (!d) return { status: "no-face" };
    descriptors.push(Array.from(d));
  }
  const clean = name.trim().slice(0, 40) || "Monsieur";
  const next = existing.filter((f) => f.name !== clean);
  if (next.length >= MAX_PROFILES && next.length === existing.length)
    return { status: "error", message: `Maximum ${MAX_PROFILES} visages inscrits.` };
  next.push({ name: clean, descriptors });
  const r = await saveFaces(next);
  if (r.status === "error") return r;
  return { status: "recognized", name: clean, greet: false };
}

/** Retire un visage inscrit (par nom). */
export async function removeFace(name: string, existing: StoredFace[]): Promise<FaceState> {
  const next = existing.filter((f) => f.name !== name);
  if (next.length === existing.length) return { status: "error", message: "Visage introuvable." };
  return saveFaces(next);
}

/** Visages inscrits dans les réglages publics (null si aucun). */
export function storedFaceOf(settings: PublicSettings | undefined): StoredFace[] | null {
  return settings?.visionFace ?? null;
}
