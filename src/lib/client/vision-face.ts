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

/** Cherche un visage dans l'image et le compare au visage inscrit. */
export async function recognizeFrame(canvas: HTMLCanvasElement, stored: StoredFace | null): Promise<FaceState> {
  if (!stored) return { status: "not-enrolled" };
  const faceapi = await ensureModels();
  if (!faceapi) return { status: "error", message: "Modèles de reconnaissance introuvables." };
  const d = await descriptorOf(faceapi, canvas);
  if (!d) return { status: "no-face" };
  let best = Infinity;
  for (const ref of stored.descriptors) {
    for (let i = 0; i < ref.length; i++) {
      const dist = distance(d, ref);
      if (dist < best) best = dist;
    }
  }
  if (best < 0.5) {
    const now = Date.now();
    const greet = now - lastGreetAt > 120000;
    if (greet) lastGreetAt = now;
    return { status: "recognized", name: stored.name, greet };
  }
  return { status: "unknown" };
}

/** Inscrit le visage de l'utilisateur : trois captures, moyenne conservée côté serveur. */
export async function enrollFace(canvas: HTMLCanvasElement, name: string): Promise<FaceState> {
  const faceapi = await ensureModels();
  if (!faceapi) return { status: "error", message: "Modèles de reconnaissance introuvables." };
  const descriptors: number[][] = [];
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise((r) => setTimeout(r, 500));
    const d = await descriptorOf(faceapi, canvas);
    if (!d) return { status: "no-face" };
    descriptors.push(Array.from(d));
  }
  const face: StoredFace = { name: name.trim().slice(0, 40) || "Monsieur", descriptors };
  try {
    const r = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visionFace: JSON.stringify(face) }),
    });
    if (!r.ok) return { status: "error", message: "Enregistrement refusé par le serveur." };
  } catch {
    return { status: "error", message: "Le serveur ne répond pas." };
  }
  lastGreetAt = Date.now();
  return { status: "recognized", name: face.name, greet: false };
}

/** Visage inscrit dans les réglages publics (null si aucun). */
export function storedFaceOf(settings: PublicSettings | undefined): StoredFace | null {
  return settings?.visionFace ?? null;
}
