"use client";

import { ArrowLeft, ArrowRight, Check, Loader2, Volume2 } from "lucide-react";
import { useState } from "react";
import { DEFAULT_USER_NAME } from "@/lib/defaults";
import type { SettingsPayload } from "@/lib/types";
import MicDiagnostic from "./MicDiagnostic";
import { addressChoiceOf, addressPatch, greetingPreview, type AddressChoice } from "./settings/form";
import { Toggle } from "./settings/ui";

interface Props {
  payload: SettingsPayload;
  onFinish: (p: SettingsPayload) => void;
  onPreview: (text: string) => void;
}

const CHOICES: { id: AddressChoice; label: string }[] = [
  { id: "name", label: "Par mon prénom" },
  { id: "monsieur", label: "Monsieur" },
  { id: "madame", label: "Madame" },
  { id: "custom", label: "Autre…" },
];
const STEPS = ["Profil", "Micro", "Options"];

export default function Onboarding({ payload, onFinish, onPreview }: Props) {
  const s = payload.settings;
  const initialChoice = addressChoiceOf(s);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(s.userName || DEFAULT_USER_NAME);
  const [choice, setChoice] = useState<AddressChoice>(initialChoice);
  const [custom, setCustom] = useState(initialChoice === "custom" ? s.honorific : "Patron");
  const [wake, setWake] = useState(s.wakeWord);
  const [speak, setSpeak] = useState(s.autoSpeak);
  const [engine, setEngine] = useState(s.sttEngine);
  const [music, setMusic] = useState(s.bootMusic);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!r.ok) throw new Error("save");
      onFinish((await r.json()) as SettingsPayload);
    } catch {
      setError("Enregistrement impossible. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  const finish = () =>
    save({ userName: name.trim(), ...addressPatch(choice, custom), wakeWord: wake, autoSpeak: speak, sttEngine: engine, bootMusic: music, onboarded: true });
  const skip = () => save({ onboarded: true });

  const nameMissing = choice === "name" && !name.trim();
  const preview = greetingPreview(name, choice, custom);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-3 backdrop-blur-sm">
      <div className="hud-panel fade-in scroll-hud max-h-[94dvh] w-[min(96vw,660px)] overflow-y-auto !bg-[#030b14]/95 p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <div className="glow-text font-display text-sm tracking-[0.3em] text-hud">CONFIGURATION INITIALE</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Étape {step + 1} / {STEPS.length} · {STEPS[step]}
            </div>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((label, i) => (
              <span key={label} className={`h-1.5 w-8 rounded-full ${i <= step ? "bg-hud shadow-[0_0_8px_var(--hud)]" : "bg-hud/15"}`} />
            ))}
          </div>
        </div>

        {step === 0 && (
          <div className="space-y-5">
            <h2 className="text-xl text-white">Comment dois-je vous appeler ?</h2>
            <label className="block space-y-1.5">
              <span className="label">Votre prénom</span>
              <input className="hud-field !text-base" value={name} onChange={(e) => setName(e.target.value)} placeholder={DEFAULT_USER_NAME} autoFocus />
            </label>
            <div className="space-y-2">
              <span className="label">JARVIS s&apos;adressera à vous</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CHOICES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChoice(c.id)}
                    className={`rounded border px-3 py-2.5 text-sm transition ${choice === c.id ? "border-hud bg-hud/15 text-white shadow-[0_0_12px_rgb(var(--hud-rgb)/0.25)]" : "border-hud/15 bg-black/20 text-slate-300 hover:border-hud/40"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {choice === "custom" && (
                <input className="hud-field" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Patron, Boss, Monsieur Stark…" />
              )}
            </div>
            <div className="flex items-center gap-3 rounded border border-hud/20 bg-hud/5 p-3">
              <span className="flex-1 text-sm italic text-slate-100">« {preview} »</span>
              <button type="button" className="hud-btn shrink-0" onClick={() => onPreview(preview)}>
                <Volume2 size={14} /> Écouter
              </button>
            </div>
            {nameMissing && <p className="text-xs text-amber-200">Indiquez votre prénom, ou choisissez une autre appellation.</p>}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl text-white">Vérifions que je vous entends</h2>
            <p className="text-sm leading-relaxed text-slate-300">
              Autorisez le micro quand le navigateur le demande. Si le test échoue, suivez les conseils affichés — vous pourrez toujours écrire vos demandes.
            </p>
            <MicDiagnostic sttAvailable={payload.stt.available} compact onUseWhisper={() => setEngine("whisper")} />
            {engine === "whisper" && <p className="text-xs text-emerald-300">✅ Le moteur Whisper sera utilisé pour vous entendre.</p>}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xl text-white">Dernières options</h2>
            <Toggle checked={speak} onChange={setSpeak} label="Réponses vocales" desc="JARVIS lit ses réponses à voix haute." />
            <Toggle
              checked={wake}
              onChange={setWake}
              label="Écoute permanente (« Jarvis, … »)"
              desc="Le micro reste actif : dites « Jarvis » suivi de votre demande, sans cliquer. Sinon : Espace ou clic sur le réacteur pour parler."
            />
            <label className="block space-y-1.5 px-2">
              <span className="label">Musique de démarrage</span>
              <select className="hud-field" value={music} onChange={(e) => setMusic(e.target.value)}>
                <option value="youtube">AC/DC — Thunderstruck (YouTube, Internet requis)</option>
                {payload.bootMusicFile && <option value="custom">Mon fichier audio ({payload.bootMusicFile.name})</option>}
                <option value="theme">Thème original J.A.R.V.I.S. (hors ligne)</option>
                <option value="off">Aucune</option>
              </select>
            </label>
            <div className="rounded border border-hud/15 bg-black/20 p-3 text-xs leading-relaxed text-slate-400">
              Plus tard, dans les paramètres : connecter une IA gratuite (Groq, Gemini), votre maison Home Assistant, et des plugins Python.
            </div>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

        <div className="mt-6 flex items-center gap-2 border-t border-hud/15 pt-4">
          <button type="button" className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline" onClick={() => void skip()} disabled={saving}>
            Passer la configuration
          </button>
          <div className="ml-auto flex gap-2">
            {step > 0 && (
              <button type="button" className="hud-btn" onClick={() => setStep((s0) => s0 - 1)} disabled={saving}>
                <ArrowLeft size={14} /> Précédent
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button type="button" className="hud-btn" data-active="true" onClick={() => setStep((s0) => s0 + 1)} disabled={nameMissing}>
                Suivant <ArrowRight size={14} />
              </button>
            ) : (
              <button type="button" className="hud-btn" data-active="true" onClick={() => void finish()} disabled={saving || nameMissing}>
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Terminer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
