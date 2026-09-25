"use client";

import { Brain, Download, ExternalLink, KeyRound, Loader2, Trash2 } from "lucide-react";
import { getProvider, PROVIDERS } from "@/lib/providers";
import type { SettingsPayload } from "@/lib/types";
import type { SetField, SettingsForm } from "./form";
import { Field } from "./ui";

export interface TestState {
  loading: boolean;
  ok?: boolean;
  message?: string;
}

interface Props {
  form: SettingsForm;
  set: SetField;
  payload: SettingsPayload;
  keyDrafts: Record<string, string>;
  setKeyDraft: (id: string, v: string) => void;
  onClearKey: (id: string) => void;
  serpKey: string;
  setSerpKey: (v: string) => void;
  onClearSerpKey: () => void;
  onProviderChange: (id: string) => void;
  onTest: () => void;
  test: TestState;
  saving: boolean;
}

/** Cartes de clés recommandées (saisie d'une clé par fournisseur, conservée même si on en change). */
const KEY_CARDS: { id: string; chip: string; tag: string; free: boolean; title: string; desc: string }[] = [
  {
    id: "gemini",
    chip: "Gemini AI",
    tag: "Gratuit & recommandé",
    free: true,
    title: "Google Gemini",
    desc: "Cerveau principal gratuit, réactif, sans carte bancaire. Idéal pour démarrer.",
  },
  {
    id: "groq",
    chip: "Groq Cloud",
    tag: "Gratuit & ultra rapide",
    free: true,
    title: "Groq",
    desc: "Inférence ultra-rapide, parfaite pour les réponses vocales. La même clé sert aussi au moteur Whisper.",
  },
  {
    id: "anthropic",
    chip: "Claude AI",
    tag: "Payant (crédits)",
    free: false,
    title: "Anthropic (Claude)",
    desc: "Raisonnement avancé pour les demandes complexes. Compte Anthropic requis.",
  },
];

export default function AITab({ form, set, payload, keyDrafts, setKeyDraft, onClearKey, serpKey, setSerpKey, onClearSerpKey, onProviderChange, onTest, test, saving }: Props) {
  const s = payload.settings;
  const provider = getProvider(form.aiProvider);
  const envHasKey = provider ? payload.envProviders.includes(provider.id) : false;
  const savedPreview = (id: string) => s.aiKeyPreviews[id] ?? "";

  return (
    <div className="space-y-5">
      <div className={`rounded border p-3 text-sm ${payload.ai.active ? "border-emerald-400/30 bg-emerald-400/5" : "border-amber-400/30 bg-amber-400/5"}`}>
        {payload.ai.active ? (
          <span>
            ✅ Noyau connecté : <b className="text-white">{payload.ai.label}</b> · <span className="font-mono text-xs">{payload.ai.model}</span>
            {payload.ai.origin === "env" ? " (clé système)" : ""}
          </span>
        ) : (
          <span>⚠️ Aucune IA connectée : JARVIS fonctionne en mode local (commandes intégrées, météo, actualités, Wikipédia, maison).</span>
        )}
      </div>

      <div>
        <div className="label mb-2">Vos clés IA</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {KEY_CARDS.map((c) => {
            const p = getProvider(c.id);
            const saved = savedPreview(c.id);
            return (
              <div key={c.id} className="space-y-2.5 rounded border border-hud/15 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-hud">{c.chip}</span>
                  <span className={`font-mono text-[10px] uppercase tracking-widest ${c.free ? "text-emerald-300" : "text-amber-300"}`}>{c.tag}</span>
                </div>
                <div className="text-sm font-medium text-white">{c.title}</div>
                <p className="text-xs leading-relaxed text-slate-400">{c.desc}</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-hud/60" />
                    <input
                      type="password"
                      autoComplete="off"
                      className="hud-field !pl-9 font-mono text-xs"
                      value={keyDrafts[c.id] ?? ""}
                      onChange={(e) => setKeyDraft(c.id, e.target.value)}
                      placeholder={saved ? `Clé enregistrée (${saved}) — laisser vide pour la conserver` : "votre_clé_ici"}
                    />
                  </div>
                  {saved && (
                    <button type="button" className="hud-btn shrink-0" onClick={() => onClearKey(c.id)} title={`Supprimer la clé ${c.title}`}>
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                {p?.keyUrl && (
                  <a href={p.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-hud underline underline-offset-2">
                    <KeyRound size={12} /> Obtenir ma clé {c.title} <ExternalLink size={12} />
                  </a>
                )}
              </div>
            );
          })}

          <div className="space-y-2.5 rounded border border-hud/15 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-hud">Local / Premium</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">Au choix</span>
            </div>
            <div className="text-sm font-medium text-white">Ollama · OpenAI · autres</div>
            <p className="text-xs leading-relaxed text-slate-400">
              Ollama : 100 % local et privé, sans clé. OpenAI, Mistral, OpenRouter et DeepSeek se branchent aussi ci-dessous.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="hud-btn" onClick={() => onProviderChange("ollama")}>
                <Download size={14} /> Ollama
              </button>
              <button type="button" className="hud-btn" onClick={() => onProviderChange("openai")}>
                OpenAI
              </button>
            </div>
          </div>
        </div>
      </div>

      <Field label="Fournisseur actif" hint="« Automatique » choisit le premier fournisseur dont la clé est renseignée (ou une clé d'environnement).">
        <select className="hud-field" value={form.aiProvider} onChange={(e) => onProviderChange(e.target.value)}>
          <option value="auto">Automatique (clés ci-dessus ou environnement)</option>
          <option value="local">Noyau local uniquement (hors ligne, sans IA)</option>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.free ? " — gratuit" : ""}
            </option>
          ))}
        </select>
      </Field>

      {provider && (
        <div className="space-y-4 rounded border border-hud/15 bg-black/20 p-4">
          <p className="text-sm text-slate-300">
            {provider.description}{" "}
            {provider.keyUrl && (
              <a href={provider.keyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-hud underline underline-offset-2">
                {provider.needsKey ? (provider.free ? "Obtenir une clé gratuite" : "Obtenir une clé") : "Télécharger"} <ExternalLink size={12} />
              </a>
            )}
          </p>
          {provider.needsKey &&
            (KEY_CARDS.some((c) => c.id === provider.id) ? (
              <p className="text-xs text-slate-400">
                Clé gérée dans la carte « {provider.label} » ci-dessus{savedPreview(provider.id) ? ` (enregistrée : ${savedPreview(provider.id)})` : ""}.
              </p>
            ) : (
              <Field
                label="Clé API"
                hint={
                  envHasKey
                    ? `Une clé ${provider.envKeys[0]} est déjà définie dans l'environnement : laissez vide pour l'utiliser.`
                    : "La clé est stockée dans votre base de données et n'est jamais renvoyée au navigateur."
                }
              >
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-hud/60" />
                    <input
                      type="password"
                      autoComplete="off"
                      className="hud-field !pl-9"
                      value={keyDrafts[provider.id] ?? ""}
                      onChange={(e) => setKeyDraft(provider.id, e.target.value)}
                      placeholder={savedPreview(provider.id) ? `Clé enregistrée (${savedPreview(provider.id)}) — laisser vide pour la conserver` : "Collez votre clé API ici"}
                    />
                  </div>
                  {savedPreview(provider.id) && (
                    <button type="button" className="hud-btn shrink-0" onClick={() => onClearKey(provider.id)} title="Supprimer la clé enregistrée">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </Field>
            ))}
          {provider.needsBaseUrl && (
            <Field
              label="Adresse du serveur"
              hint={provider.id === "ollama" ? "Installez Ollama, puis exécutez « ollama pull llama3.2 ». JARVIS doit tourner sur le même PC." : "URL compatible OpenAI, se terminant généralement par /v1."}
            >
              <input className="hud-field" value={form.aiBaseUrl} placeholder={provider.baseUrl} onChange={(e) => set("aiBaseUrl", e.target.value)} />
            </Field>
          )}
          <Field label="Modèle" hint={`Laisser vide pour utiliser le modèle par défaut : ${provider.defaultModel}`}>
            <input className="hud-field font-mono" value={form.aiModel} placeholder={provider.defaultModel} onChange={(e) => set("aiModel", e.target.value)} />
          </Field>
        </div>
      )}

      <button type="button" className="hud-btn" onClick={onTest} disabled={test.loading || saving}>
        {test.loading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />} Enregistrer & tester la connexion
      </button>
      {test.message && (
        <div className={`rounded border p-3 text-sm ${test.ok ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-100" : "border-red-400/30 bg-red-400/5 text-red-100"}`}>
          {test.ok ? "✅ " : "❌ "}
          {test.message}
        </div>
      )}

      <div className="rounded border border-hud/20 bg-hud/5 p-4">
        <div className="label mb-2">Recherche Google en direct (SerpAPI)</div>
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          Avec une clé SerpAPI (100 recherches gratuites par mois), « Jarvis, cherche… » répond à voix haute avec les
          résultats de Google au lieu d&apos;ouvrir un simple onglet. Clé sur{" "}
          <a href="https://serpapi.com/manage-api-key" target="_blank" rel="noreferrer" className="text-hud underline">
            serpapi.com
          </a>
          .
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="hud-field flex-1 min-w-52"
            value={serpKey}
            placeholder={payload.settings.hasSerpKey ? `Clé enregistrée (${payload.settings.serpKeyPreview})` : "Clé SerpAPI"}
            onChange={(e) => setSerpKey(e.target.value)}
          />
          {payload.settings.hasSerpKey && (
            <button type="button" className="hud-btn" onClick={onClearSerpKey}>
              <Trash2 size={13} /> Retirer
            </button>
          )}
        </div>
      </div>

      {!payload.ai.active && (
        <div className="rounded border border-hud/20 bg-hud/5 p-4 text-sm leading-relaxed text-slate-300">
          <div className="label mb-2">Recommandé : Groq (gratuit, ultra-rapide)</div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Créez un compte gratuit sur{" "}
              <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-hud underline">
                console.groq.com
              </a>
              .
            </li>
            <li>Cliquez sur « Create API Key » et copiez la clé.</li>
            <li>Collez-la dans la carte « Groq » ci-dessus, puis « Enregistrer & tester ». La même clé sert aussi au moteur vocal Whisper.</li>
          </ol>
        </div>
      )}
    </div>
  );
}
