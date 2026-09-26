# Transcription 100% locale (J.A.R.V.I.S.) — worker Whisper.
# Le modèle est chargé UNE fois au démarrage puis transcrit à la demande :
# l'audio ne quitte jamais le PC. Protocole : lignes JSON sur stdin/stdout.
#   requête :  {"id": 1, "wav_b64": "..."}      → transcription
#   réponse :  {"id": 1, "ok": true, "text": "..."}  ou {"id": 1, "ok": false, "error": "..."}
#   démarrage : {"event": "ready"}
# Option --warmup : charge (et télécharge au premier lancement) le modèle puis quitte.
import base64
import io
import json
import os
import sys
import wave


def load_model():
    from faster_whisper import WhisperModel

    download_root = os.environ.get("JARVIS_STT_MODELS", "")
    return WhisperModel("small", device="cpu", compute_type="int8", download_root=download_root or None)


def pcm_from_wav(raw: bytes):
    import numpy as np

    with wave.open(io.BytesIO(raw)) as w:
        rate = w.getframerate()
        data = w.readframes(w.getnframes())
    audio = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
    if rate != 16000:  # rééchantillonnage linéaire (normalement déjà 16 kHz)
        n = int(len(audio) * 16000 / rate)
        idx = np.arange(n) * (rate / 16000)
        audio = np.interp(idx, np.arange(len(audio)), audio).astype(np.float32)
    return audio


def main() -> int:
    warmup_only = "--warmup" in sys.argv
    try:
        model = load_model()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"event": "error", "error": str(e)}), flush=True)
        return 1
    print(json.dumps({"event": "ready"}), flush=True)
    if warmup_only:
        return 0
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception:  # noqa: BLE001
            continue
        rid = req.get("id")
        try:
            raw = base64.b64decode(req.get("wav_b64", ""))
            audio = pcm_from_wav(raw)
            segments, _info = model.transcribe(audio, language="fr", beam_size=1, vad_filter=True)
            text = " ".join(s.text for s in segments).strip()
            print(json.dumps({"id": rid, "ok": True, "text": text}), flush=True)
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"id": rid, "ok": False, "error": str(e)}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
