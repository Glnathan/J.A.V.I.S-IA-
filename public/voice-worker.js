// Worker de reconnaissance vocale J.A.R.V.I.S. (édition Premium).
// Fichier servi tel quel (public/), hors du compilateur : l'empaquetage du moteur
// ONNX casse le WebAssembly. transformers.js est chargé depuis le CDN au runtime —
// chemin validé par l'auto-test (voice-selftest.html).
let processor = null;
let model = null;
let loading = null;

async function ensureModel() {
  if (model && processor) return;
  if (!loading) {
    loading = (async () => {
      const T = await import("https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2");
      T.env.allowLocalModels = false;
      T.env.useBrowserCache = true;
      try {
        T.env.backends.onnx.wasm.numThreads = 1;
      } catch (e) {
        /* option absente : comportement par défaut */
      }
      processor = await T.AutoProcessor.from_pretrained("Xenova/wavlm-base-sv");
      model = await T.AutoModel.from_pretrained("Xenova/wavlm-base-sv", { quantized: true });
    })();
  }
  await loading;
}

self.onmessage = async (e) => {
  const { id, type, audio } = e.data || {};
  if (type !== "embed" || !audio) return;
  try {
    await ensureModel();
    if (!processor || !model) throw new Error("Modèle indisponible");
    // Le modèle exige au moins 1 seconde : on complète avec du silence si besoin.
    let padded = audio;
    if (audio.length < 16000) {
      padded = new Float32Array(16000);
      padded.set(audio);
    }
    const inputs = await processor(padded);
    const { embeddings } = await model(inputs);
    const out = Array.from(embeddings.data);
    self.postMessage({ id, ok: true, embedding: out });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err && err.message ? err.message : "Erreur du modèle" });
  }
};
