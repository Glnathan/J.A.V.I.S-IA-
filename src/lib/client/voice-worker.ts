/// <reference lib="webworker" />
// Worker de reconnaissance vocale J.A.R.V.I.S. : le modèle WavLM X-Vector y est
// chargé et exécuté hors de la fenêtre principale — si le WebAssembly plantait,
// seule l'analyse échouerait, jamais l'interface.
//
// IMPORTANT : transformers.js est chargé depuis le CDN au runtime, jamais depuis
// le bundle (l'empaquetage du moteur ONNX par le compilateur corrompt le WebAssembly
// et fait planter le rendu — vérifié par auto-test : la version CDN fonctionne).
import type { Processor, PreTrainedModel } from "@xenova/transformers";

const MODEL_ID = "Xenova/wavlm-base-sv";
const CDN = "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

let processor: Processor | null = null;
let model: PreTrainedModel | null = null;
let loading: Promise<void> | null = null;

async function ensureModel(): Promise<void> {
  if (model && processor) return;
  if (!loading)
    loading = (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const T: any = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ CDN);
      T.env.allowLocalModels = false;
      T.env.useBrowserCache = true;
      try {
        T.env.backends.onnx.wasm.numThreads = 1;
      } catch {
        /* option absente : comportement par défaut */
      }
      processor = await T.AutoProcessor.from_pretrained(MODEL_ID);
      model = await T.AutoModel.from_pretrained(MODEL_ID, { quantized: true });
    })();
  await loading;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, type, audio } = e.data as { id: number; type: string; audio?: Float32Array };
  if (type !== "embed" || !audio) return;
  try {
    await ensureModel();
    if (!processor || !model) throw new Error("Modèle indisponible");
    const inputs = await processor(audio);
    const { embeddings } = await model(inputs);
    const out = Array.from(embeddings.data as Float32Array);
    (self as unknown as Worker).postMessage({ id, ok: true, embedding: out });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : "Erreur du modèle" });
  }
};
