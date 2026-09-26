"use client";

import { Download, ExternalLink, KeyRound, Loader2, Mic, Trash2, UserCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SettingsPayload } from "@/lib/types";
import { VoiceCapture } from "@/lib/client/voice-capture";
import { embedWav, loadVoiceModel, similarityOf } from "@/lib/client/voice-print";
import MicDiagnostic from "../MicDiagnostic";
import BootMusicSection from "./BootMusicSection";
import type { SetField, SettingsForm } from "./form";
import { Card, Field, Toggle } from "./ui";

interface Props {
  form: SettingsForm;
  set: SetField;
  payload: SettingsPayload;
  voices: SpeechSynthesisVoice[];
  sttKey: string;
  setSttKey: (v: string) => void;
  onClearSttKey: () => void;
  elevenKey: string;
  setElevenKey: (v: string) => void;
  onClearElevenKey: () => void;
  onTestVoice: (opts: { voiceName: string; rate: number; pitch: number }) => void;
  onBootMusicChanged: () => Promise<void>;
  onLocalSttChanged: () => void;
  onMicNeeded: () => void;
  onMicRelease: () => void;
}

const ENGINES = [
  { id: "auto", label: "Automatique", desc: "Navigateur, avec bascule sur Whisper en cas de problème" },
  { id: "browser", label: "Navigateur", desc: "Chrome ou Edge, gratuit, sans clé" },
  { id: "whisper", label: "Whisper", desc: "Très fiable, tous navigateurs (clé Groq gratuite)" },
  { id: "local", label: "Locale 100% privé (Premium)", desc: "Whisper sur votre PC : l'audio ne quitte jamais votre machine" },
];

const ORIGIN: Record<string, string> = { settings: "clé dédiée", ai: "clé de l'IA", env: "clé système" };

interface LocalStatus {
  installed: boolean;
  phase: "idle" | "python" | "pip" | "whisper" | "model" | "done" | "error";
  log?: string[];
  error?: string;
}

const PHASES: Record<LocalStatus["phase"], string> = {
  idle: "non installé",
  python: "téléchargement de Python…",
  pip: "installation de pip…",
  whisper: "installation de Whisper (~300 Mo)…",
  model: "téléchargement du modèle (~460 Mo)…",
  done: "prêt",
  error: "échec",
};

/** Carte d'installation et d'état du moteur de transcription 100% locale. */
function LocalSttCard({ installed, premium, onInstalled }: { installed: boolean; premium: boolean; onInstalled: () => void }) {
  const [status, setStatus] = useState<LocalStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const installing = status !== null && status.phase !== "idle" && status.phase !== "done" && status.phase !== "error" && !status.installed;

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/stt?action=local-status", { cache: "no-store" });
      if (r.ok) setStatus((await r.json()) as LocalStatus);
    } catch {
      /* hors ligne */
    }
  }, []);

  useEffect(() => {
    void poll();
  }, [poll]);

  useEffect(() => {
    if (!installing) return;
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [installing, poll]);

  useEffect(() => {
    if (status?.installed && !installed) onInstalled();
  }, [status, installed, onInstalled]);

  const start = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/stt?action=local-install", { method: "PUT" });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) setMsg(j.error ?? "Lancement impossible.");
      else await poll();
    } catch {
      setMsg("Serveur injoignable.");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`flex items-center gap-1 text-sm ${installed ? "text-emerald-300" : installing ? "text-hud" : "text-amber-200"}`}>
          {installing ? <Loader2 size={13} className="animate-spin" /> : installed ? "✓" : "⚠"}
          {installed ? "Moteur local installé" : installing ? PHASES[status?.phase ?? "idle"] : "Moteur local non installé"}
        </span>
        {!installed && (
          <button type="button" className="hud-btn" onClick={() => void start()} disabled={busy || installing || !premium}>
            <Download size={13} /> {installing ? "Installation en cours…" : "Installer (~1 Go, une seule fois)"}
          </button>
        )}
      </div>
      {!premium && <p className="text-xs text-slate-400">Réservé à l&apos;édition Premium.</p>}
      {status?.log && status.log.length > 0 && (
        <p className="text-[11px] leading-snug text-slate-500">{status.log.slice(-2).join(" · ")}</p>
      )}
      {status?.error && <p className="text-xs text-red-300">✗ {status.error}</p>}
      {msg && <p className="text-xs text-amber-200">{msg}</p>}
      {installed && (
        <p className="text-[11px] leading-snug text-slate-500">
          Survit aux mises à jour de JARVIS. Repli automatique sur Whisper cloud si le moteur local échoue.
        </p>
      )}
    </div>
  );
}

export default function VoiceTab({ form, set, payload, voices, sttKey, setSttKey, onClearSttKey, elevenKey, setElevenKey, onClearElevenKey, onTestVoice, onBootMusicChanged, onLocalSttChanged, onMicNeeded, onMicRelease }: Props) {
  const s = payload.settings;
  const frVoices = useMemo(() => voices.filter((v) => v.lang?.toLowerCase().startsWith("fr")), [voices]);
  const otherVoices = useMemo(() => voices.filter((v) => !v.lang?.toLowerCase().startsWith("fr")), [voices]);
  const sameProvider = form.sttProvider === s.sttProvider;

  // ─── Empreinte vocale (Premium) ─────────────────────────────────────────
  const [voiceEnrolled, setVoiceEnrolled] = useState(Boolean(s.voicePrint));
  const [voiceStep, setVoiceStep] = useState<string | null>(null); // message d'étape en cours
  const [voiceMsg, setVoiceMsg] = useState<string | null>(null);
  const [voiceTest, setVoiceTest] = useState<{ ok: boolean; text: string } | null>(null);

  const captureOne = (label: string): Promise<Blob | null> =>
    new Promise((resolve) => {
      let done = false;
      setVoiceStep(label);
      const cap = new VoiceCapture({
        silenceMs: 1200,
        maxMs: 8000,
        minSpeechMs: 300,
        onLevel: () => undefined,
        onSpeechStart: () => undefined,
        onSegment: (wav) => {
          if (!done) {
            done = true;
            resolve(wav);
          }
        },
      });
      void cap.start("single").catch(() => {
        if (!done) {
          done = true;
          resolve(null);
        }
      });
      // Sécurité : abandon après 15 s sans parole.
      setTimeout(() => {
        if (!done) {
          done = true;
          cap.stop();
          resolve(null);
        }
      }, 15000);
    });

  const VOICE_PHRASES = [
    "Bonjour Jarvis, aujourd'hui tu vas apprendre à reconnaître ma voix.",
    "Jarvis, quelle heure est-il et quel temps fait-il dehors ?",
    "Jarvis, décris ce que tu vois et ouvre la vision.",
  ];

  const enrollVoice = async () => {
    onMicNeeded(); // réserver le micro : l'écoute permanente ne doit pas se réarmer pendant les prises
    try {
    await enrollVoiceInner();
    } finally {
      onMicRelease();
    }
  };

  const enrollVoiceInner = async () => {
    setVoiceMsg(null);
    setVoiceTest(null);
    // 1. Modèle d'abord (téléchargement ~100 Mo la première fois, caché ensuite).
    setVoiceStep("Chargement du modèle de reconnaissance vocale… (première fois : environ 100 Mo, quelques dizaines de secondes)");
    const load = await loadVoiceModel();
    if (!load.ok) {
      setVoiceStep(null);
      setVoiceMsg(`Modèle indisponible — vérifiez votre connexion Internet. (${load.error ?? "erreur inconnue"})`);
      return;
    }
    // 2. Trois prises.
    const descriptors: number[][] = [];
    for (let i = 1; i <= 3; i++) {
      const wav = await captureOne(`Prise ${i}/3 — dites : « ${VOICE_PHRASES[i - 1]} »`);
      if (!wav) {
        setVoiceStep(null);
        setVoiceMsg("Rien n'a été entendu sur cette prise — réessayez dans un endroit calme.");
        return;
      }
      setVoiceStep(`Analyse de la prise ${i}…`);
      const e = await embedWav(wav);
      if (!e) {
        setVoiceStep(null);
        setVoiceMsg("L'analyse vocale a échoué — réessayez.");
        return;
      }
      descriptors.push(e);
      // Cohérence : une prise trop différente des précédentes gâcherait l'inscription.
      if (i > 1) {
        const cross = Math.max(...descriptors.slice(0, i - 1).map((d) => {
          let dot = 0;
          let na = 0;
          let nb = 0;
          for (let k = 0; k < d.length; k++) {
            dot += d[k] * e[k];
            na += d[k] * d[k];
            nb += e[k] * e[k];
          }
          return dot / Math.sqrt(na * nb);
        }));
        if (cross < 0.4) {
          setVoiceStep(null);
          setVoiceMsg(`La prise ${i} est trop différente des précédentes (même personne ? même micro ?). Inscription relancée.`);
          return void enrollVoice();
        }
      }
    }
    setVoiceStep("Enregistrement…");
    try {
      const r = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voicePrint: JSON.stringify({ descriptors }) }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        setVoiceStep(null);
        setVoiceMsg(j.error ?? "Enregistrement refusé (licence Premium requise).");
        return;
      }
      setVoiceEnrolled(true);
      setVoiceStep(null);
      setVoiceMsg(null);
      setVoiceTest({ ok: true, text: "Voix inscrite. Activez « Ne m'écouter que ma voix » puis cliquez Enregistrer — et validez avec « Tester ma voix »." });
    } catch {
      setVoiceStep(null);
      setVoiceMsg("Le serveur ne répond pas.");
    }
  };

  const testVoice = async () => {
    onMicNeeded();
    try {
    await testVoiceInner();
    } finally {
      onMicRelease();
    }
  };

  const testVoiceInner = async () => {
    setVoiceTest(null);
    setVoiceMsg(null);
    setVoiceStep("Chargement du modèle de reconnaissance vocale… (première fois : environ 100 Mo)");
    const load = await loadVoiceModel();
    if (!load.ok) {
      setVoiceStep(null);
      setVoiceMsg(`Modèle indisponible. (${load.error ?? "erreur"})`);
      return;
    }
    setVoiceStep(null);
    const wav = await captureOne("Test — parlez comme d'habitude…");
    setVoiceStep("Analyse de votre voix…");
    if (!wav) {
      setVoiceStep(null);
      setVoiceMsg("Rien n'a été entendu — réessayez.");
      return;
    }
    const sim = await similarityOf(wav, { descriptors: s.voicePrint?.descriptors ?? [] });
    setVoiceStep(null);
    if (sim === null) {
      setVoiceMsg("L'analyse a échoué — réessayez.");
      return;
    }
    const pct = Math.round(sim * 100);
    setVoiceTest(
      sim >= 0.55
        ? { ok: true, text: `Similarité avec votre voix inscrite : ${pct} % — voix reconnue.` }
        : { ok: false, text: `Similarité : ${pct} % — voix NON reconnue. Parlez plus près du micro ou réinscrivez votre voix.` },
    );
  };

  return (
    <div className="space-y-5">
      <Card title="Reconnaissance vocale — JARVIS vous entend" tone="accent">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ENGINES.map((e) => {
            const localLocked = e.id === "local" && (!s.premiumActive || !payload.stt.local);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => !localLocked && set("sttEngine", e.id)}
                disabled={localLocked}
                className={`rounded border p-3 text-left transition ${form.sttEngine === e.id ? "border-hud bg-hud/15 shadow-[0_0_12px_rgb(var(--hud-rgb)/0.25)]" : localLocked ? "border-hud/10 bg-black/10 opacity-50" : "border-hud/15 bg-black/20 hover:border-hud/40"}`}
              >
                <span className="block text-sm text-white">{e.label}</span>
                <span className="block text-[11px] leading-snug text-slate-400">
                  {localLocked ? (!s.premiumActive ? "Réservé à l'édition Premium" : "Non installé — voir ci-dessous") : e.desc}
                </span>
              </button>
            );
          })}
        </div>

      <Card title="Transcription 100% locale (Premium, version PC)">
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          Whisper s'installe sur votre PC et transcrit votre voix entièrement en local : aucun audio ne quitte jamais votre
          machine, même quand internet est coupé. Le verrou vocal reste actif (votre voix est vérifiée en local avant la
          transcription). Installation en une fois (~1 Go), survit aux mises à jour de JARVIS.
        </p>
        <LocalSttCard installed={payload.stt.local} premium={s.premiumActive} onInstalled={onLocalSttChanged} />
      </Card>

        <div className="space-y-3 rounded border border-hud/15 bg-black/20 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="label !text-[10px]">Moteur Whisper</span>
            <span className={payload.stt.available ? "text-emerald-300" : "text-amber-200"}>
              {payload.stt.available ? `✅ prêt (${payload.stt.provider === "openai" ? "OpenAI" : "Groq"}, ${ORIGIN[payload.stt.origin ?? "settings"]})` : "⚠️ aucune clé configurée"}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <select className="hud-field" value={form.sttProvider} onChange={(e) => set("sttProvider", e.target.value)}>
              <option value="groq">Groq (gratuit)</option>
              <option value="openai">OpenAI (payant)</option>
            </select>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <KeyRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-hud/60" />
                <input
                  type="password"
                  autoComplete="off"
                  className="hud-field !pl-9"
                  value={sttKey}
                  onChange={(e) => setSttKey(e.target.value)}
                  placeholder={sameProvider && s.hasSttKey ? `Clé enregistrée (${s.sttKeyPreview})` : "Clé API (facultatif si déjà utilisée pour l'IA)"}
                />
              </div>
              {sameProvider && s.hasSttKey && (
                <button type="button" className="hud-btn shrink-0" onClick={onClearSttKey} title="Supprimer la clé">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-400">
            Clé gratuite :{" "}
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-hud underline">
              console.groq.com <ExternalLink size={11} />
            </a>{" "}
            (2 000 phrases par jour). Si votre IA est déjà Groq, sa clé est réutilisée automatiquement. Enregistrez avant de tester.
          </p>
        </div>

        {payload.desktop.enabled && (
          <Field
            label="Fenêtre de JARVIS (version PC)"
            hint="Chrome a la reconnaissance vocale la plus fiable ; Edge a les voix les plus naturelles. Pris en compte au prochain lancement."
          >
            <select className="hud-field" value={form.desktopBrowser} onChange={(e) => set("desktopBrowser", e.target.value)}>
              <option value="auto">Automatique (Chrome si installé, sinon Edge)</option>
              <option value="chrome">Google Chrome</option>
              <option value="edge">Microsoft Edge</option>
            </select>
          </Field>
        )}
      </Card>

      <Card title="Diagnostic du micro">
        <MicDiagnostic sttAvailable={payload.stt.available} onUseWhisper={() => set("sttEngine", "whisper")} />
      </Card>

      <Card title="Voix HD ElevenLabs (Premium)">
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          {s.premiumActive ? "Voix ultra-réalistes pour les réponses de JARVIS." : "Réservé à l'édition Premium : voix ultra-réalistes pour les réponses de JARVIS."} Clé sur{" "}
          <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer" className="text-hud underline">
            elevenlabs.io
          </a>{" "}
          (offre gratuite : 10 000 caractères par mois). La clé reste sur votre PC.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="hud-field flex-1 min-w-52"
            value={elevenKey}
            placeholder={s.hasElevenKey ? `Clé enregistrée (${s.elevenKeyPreview})` : "Clé ElevenLabs"}
            onChange={(e) => setElevenKey(e.target.value)}
          />
          {s.hasElevenKey && (
            <button type="button" className="hud-btn" onClick={onClearElevenKey}>
              <Trash2 size={13} /> Retirer
            </button>
          )}
        </div>
        <Toggle
          checked={form.elevenOn}
          onChange={(v) => set("elevenOn", v)}
          disabled={!s.premiumActive || !s.hasElevenKey}
          label="Répondre avec la voix HD ElevenLabs"
          desc={
            !s.premiumActive
              ? "Réservé à l'édition Premium."
              : !s.hasElevenKey
                ? "Ajoutez d'abord votre clé ElevenLabs."
                : "Les réponses de JARVIS sont synthétisées par ElevenLabs (multilingue, très naturel) au lieu des voix du système. Enregistrez pour appliquer."
          }
        />
        <Field label="Voix ElevenLabs (identifiant, facultatif)" hint="Vide = première voix de votre compte. Collez un voice_id depuis la bibliothèque ElevenLabs pour en choisir une précise.">
          <input className="hud-field" value={form.elevenVoiceId} placeholder="Ex : pFZPzY9k7TKf8p2yvG1B" disabled={!s.premiumActive} onChange={(e) => set("elevenVoiceId", e.target.value)} />
        </Field>
      </Card>

      <Card title="Voix de JARVIS">
        <Toggle checked={form.autoSpeak} onChange={(v) => set("autoSpeak", v)} label="Réponses vocales" desc="JARVIS lit ses réponses à voix haute." />
        <Toggle
          checked={form.wakeWord}
          onChange={(v) => set("wakeWord", v)}
          label={`Écoute permanente (mot d'activation « ${form.wakeCustom || "Jarvis"} »)`}
          desc="Le micro reste actif : dites le mot d'activation suivi de votre demande, comme dans le film."
        />
        <Field
          label="Mot d'activation personnalisé (Premium)"
          hint={
            !s.premiumActive
              ? "Réservé à l'édition Premium : remplacez « Jarvis » par le mot de votre choix (ex. « Vendredi »)."
              : `Remplacez « Jarvis » par le mot de votre choix, 2 à 20 lettres. Vide = « Jarvis ». Vous pouvez aussi me le demander à la voix : « Jarvis, réponds à Vendredi » (et « réponds à Jarvis » pour revenir).`
          }
        >
          <input
            className="hud-field"
            value={form.wakeCustom}
            placeholder="Ex. Vendredi (vide = Jarvis)"
            disabled={!s.premiumActive}
            onChange={(e) => set("wakeCustom", e.target.value.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z]/g, "").slice(0, 20))}
          />
        </Field>
        <Toggle
          checked={form.visionGate}
          onChange={(v) => set("visionGate", v)}
          disabled={!payload.settings.premiumActive || !payload.settings.visionFace}
          label="Ne m'écouter qu'en présence de mon visage (Premium)"
          desc={
            !payload.settings.premiumActive
              ? "Réservé à l'édition Premium : JARVIS vérifie que c'est bien vous devant la caméra avant d'obéir au mot d'activation."
              : !payload.settings.visionFace
                ? "Inscrivez d'abord votre visage : ouvrez la Vision (« Jarvis, active la vision ») puis « Inscrire mon visage »."
                : "En écoute permanente, le mot « Jarvis » n'est obéi que si votre visage inscrit est devant la caméra — la télé ne commande plus JARVIS. La caméra n'est utilisée qu'une à deux secondes au moment du mot « Jarvis », puis relâchée : vos autres applications (Deezer, Discord…) en disposent librement."
          }
        />
        <Toggle
          checked={form.voiceGate}
          onChange={(v) => set("voiceGate", v)}
          disabled={!payload.settings.premiumActive || !voiceEnrolled}
          label="Ne m'écouter que ma voix (Premium)"
          desc={
            !payload.settings.premiumActive
              ? "Réservé à l'édition Premium : JARVIS apprend votre voix et ignore la télévision ou les autres personnes."
              : !voiceEnrolled
                ? "Inscrivez d'abord votre voix avec le bouton ci-dessous (trois prises, quelques secondes)."
                : "En écoute permanente, chaque phrase est comparée à votre voix : la télévision est ignorée, même quand vous êtes devant l'écran. Nécessite le moteur Whisper."
          }
        />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" className="hud-btn" onClick={() => void enrollVoice()} disabled={voiceStep !== null}>
            {voiceStep ? <Loader2 size={13} className="animate-spin" /> : <UserCheck size={13} />}
            {voiceEnrolled ? "Inscrire à nouveau ma voix" : "Inscrire ma voix (3 prises)"}
          </button>
          {voiceEnrolled && (
            <button type="button" className="hud-btn" onClick={() => void testVoice()} disabled={voiceStep !== null}>
              {voiceStep ? <Loader2 size={13} className="animate-spin" /> : <Mic size={13} />} Tester ma voix
            </button>
          )}
          {voiceEnrolled && !voiceStep && <span className="flex items-center gap-1 text-xs text-emerald-300"><Mic size={11} /> voix inscrite</span>}
        </div>
        {voiceStep && <p className="text-xs text-hud">{voiceStep}</p>}
        {voiceMsg && <p className="text-xs text-amber-200">{voiceMsg}</p>}
        {voiceTest && <p className={`text-xs ${voiceTest.ok ? "text-emerald-300" : "text-red-300"}`}>{voiceTest.ok ? "✓ " : "✗ "}{voiceTest.text}</p>}
        <Field label="Voix" hint="Sous Windows, Microsoft Edge propose des voix naturelles très réalistes (ex. « Henri Online (Natural) »).">
          <select className="hud-field" value={form.voiceName} onChange={(e) => set("voiceName", e.target.value)}>
            <option value="">Automatique (meilleure voix française)</option>
            {frVoices.length > 0 && (
              <optgroup label="Français">
                {frVoices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </optgroup>
            )}
            {otherVoices.length > 0 && (
              <optgroup label="Autres langues">
                {otherVoices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Vitesse : ${form.voiceRate.toFixed(2)}`}>
            <input type="range" min={0.6} max={1.6} step={0.05} value={form.voiceRate} onChange={(e) => set("voiceRate", Number(e.target.value))} className="w-full" />
          </Field>
          <Field label={`Tonalité : ${form.voicePitch.toFixed(2)}`}>
            <input type="range" min={0.5} max={1.5} step={0.05} value={form.voicePitch} onChange={(e) => set("voicePitch", Number(e.target.value))} className="w-full" />
          </Field>
        </div>
        <button type="button" className="hud-btn" onClick={() => onTestVoice({ voiceName: form.voiceName, rate: form.voiceRate, pitch: form.voicePitch })}>
          <Mic size={14} /> Tester la voix
        </button>
      </Card>

      <BootMusicSection form={form} set={set} file={payload.bootMusicFile} desktop={payload.desktop.enabled} onFileChanged={onBootMusicChanged} />
    </div>
  );
}
