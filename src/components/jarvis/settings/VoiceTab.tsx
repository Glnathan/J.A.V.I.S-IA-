"use client";

import { ExternalLink, KeyRound, Mic, Trash2 } from "lucide-react";
import { useMemo } from "react";
import type { SettingsPayload } from "@/lib/types";
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
  onTestVoice: (opts: { voiceName: string; rate: number; pitch: number }) => void;
  onBootMusicChanged: () => Promise<void>;
}

const ENGINES = [
  { id: "auto", label: "Automatique", desc: "Navigateur, avec bascule sur Whisper en cas de problème" },
  { id: "browser", label: "Navigateur", desc: "Chrome ou Edge, gratuit, sans clé" },
  { id: "whisper", label: "Whisper", desc: "Très fiable, tous navigateurs (clé Groq gratuite)" },
];

const ORIGIN: Record<string, string> = { settings: "clé dédiée", ai: "clé de l'IA", env: "clé système" };

export default function VoiceTab({ form, set, payload, voices, sttKey, setSttKey, onClearSttKey, onTestVoice, onBootMusicChanged }: Props) {
  const s = payload.settings;
  const frVoices = useMemo(() => voices.filter((v) => v.lang?.toLowerCase().startsWith("fr")), [voices]);
  const otherVoices = useMemo(() => voices.filter((v) => !v.lang?.toLowerCase().startsWith("fr")), [voices]);
  const sameProvider = form.sttProvider === s.sttProvider;

  return (
    <div className="space-y-5">
      <Card title="Reconnaissance vocale — JARVIS vous entend" tone="accent">
        <div className="grid gap-2 sm:grid-cols-3">
          {ENGINES.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => set("sttEngine", e.id)}
              className={`rounded border p-3 text-left transition ${form.sttEngine === e.id ? "border-hud bg-hud/15 shadow-[0_0_12px_rgb(var(--hud-rgb)/0.25)]" : "border-hud/15 bg-black/20 hover:border-hud/40"}`}
            >
              <span className="block text-sm text-white">{e.label}</span>
              <span className="block text-[11px] leading-snug text-slate-400">{e.desc}</span>
            </button>
          ))}
        </div>

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

      <Card title="Voix de JARVIS">
        <Toggle checked={form.autoSpeak} onChange={(v) => set("autoSpeak", v)} label="Réponses vocales" desc="JARVIS lit ses réponses à voix haute." />
        <Toggle
          checked={form.wakeWord}
          onChange={(v) => set("wakeWord", v)}
          label="Écoute permanente (mot d'activation « Jarvis »)"
          desc="Le micro reste actif : dites « Jarvis » suivi de votre demande, comme dans le film."
        />
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
