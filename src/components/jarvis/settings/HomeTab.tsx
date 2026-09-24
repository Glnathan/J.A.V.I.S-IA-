"use client";

import { ExternalLink, House, KeyRound, Loader2, ShieldAlert, Trash2 } from "lucide-react";
import type { SettingsPayload } from "@/lib/types";
import type { TestState } from "./AITab";
import type { SetField, SettingsForm } from "./form";
import { Card, Field, Toggle } from "./ui";

interface Props {
  form: SettingsForm;
  set: SetField;
  payload: SettingsPayload;
  token: string;
  setToken: (v: string) => void;
  onClearToken: () => void;
  onTest: () => void;
  test: TestState;
  saving: boolean;
}

const EXAMPLES = [
  "Allume la lumière du salon",
  "Éteins toutes les lumières",
  "Ferme les volets de la chambre",
  "Mets le chauffage à 21 degrés",
  "Active la scène cinéma",
  "Quelle est la température de la chambre ?",
  "Qu'est-ce qui est allumé ?",
  "Lumière de la cuisine à 30 %",
];

export default function HomeTab({ form, set, payload, token, setToken, onClearToken, onTest, test, saving }: Props) {
  const s = payload.settings;
  const desktop = payload.desktop.enabled;

  return (
    <div className="space-y-5">
      <div className={`flex items-center gap-2 rounded border p-3 text-sm ${payload.home.configured ? "border-emerald-400/30 bg-emerald-400/5" : "border-hud/20 bg-hud/5"}`}>
        <House size={16} className="text-hud" />
        {payload.home.configured ? "Home Assistant est connecté : pilotez votre maison à la voix et depuis le panneau « Maison »." : "Connectez Home Assistant pour piloter lumières, volets, chauffage et scènes à la voix."}
      </div>

      <Toggle checked={form.haEnabled} onChange={(v) => set("haEnabled", v)} label="Activer Home Assistant" />

      <Field
        label="Adresse de Home Assistant"
        hint={
          desktop
            ? "Adresse locale, par exemple http://homeassistant.local:8123 ou http://192.168.1.20:8123."
            : "Version en ligne : il faut une adresse accessible depuis Internet (Nabu Casa https://xxxx.ui.nabu.casa, DuckDNS…). L'adresse locale ne fonctionne qu'avec la version PC."
        }
      >
        <input className="hud-field font-mono" value={form.haUrl} placeholder="http://homeassistant.local:8123" onChange={(e) => set("haUrl", e.target.value)} />
      </Field>

      <Field
        label="Jeton d'accès longue durée"
        hint={
          <>
            Dans Home Assistant : cliquez sur votre profil (en bas à gauche) → onglet « Sécurité » → « Jetons d&apos;accès longue durée » → « Créer un jeton ».{" "}
            <a href="https://www.home-assistant.io/docs/authentication/#your-account-profile" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-hud underline">
              Aide <ExternalLink size={11} />
            </a>
          </>
        }
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <KeyRound size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-hud/60" />
            <input
              type="password"
              autoComplete="off"
              className="hud-field !pl-9"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={s.hasHaToken ? `Jeton enregistré (${s.haTokenPreview}) — laisser vide pour le conserver` : "Collez le jeton ici"}
            />
          </div>
          {s.hasHaToken && (
            <button type="button" className="hud-btn shrink-0" onClick={onClearToken} title="Supprimer le jeton">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </Field>

      <Toggle
        checked={form.haUseAssist}
        onChange={(v) => set("haUseAssist", v)}
        label="Utiliser Assist de Home Assistant (recommandé)"
        desc="Home Assistant comprend lui-même vos phrases en français (pièces, alias, appareils exposés à Assist). JARVIS prend le relais s'il ne comprend pas."
      />
      <Toggle
        checked={form.haAllowSensitive && desktop}
        onChange={(v) => set("haAllowSensitive", v)}
        disabled={!desktop}
        label="Autoriser l'ouverture des portes, portails, serrures et alarmes"
        desc={desktop ? "Désactivé par défaut. Fermer et verrouiller restent toujours possibles." : "Réservé à la version PC : la version en ligne n'est pas protégée par mot de passe."}
      />

      <button type="button" className="hud-btn" onClick={onTest} disabled={test.loading || saving}>
        {test.loading ? <Loader2 size={14} className="animate-spin" /> : <House size={14} />} Enregistrer & tester la connexion
      </button>
      {test.message && (
        <div className={`rounded border p-3 text-sm ${test.ok ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-100" : "border-red-400/30 bg-red-400/5 text-red-100"}`}>
          {test.ok ? "✅ " : "❌ "}
          {test.message}
        </div>
      )}

      {!desktop && (
        <div className="flex items-start gap-2 rounded border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-100">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            Sécurité : la version en ligne n&apos;a pas de mot de passe. Toute personne connaissant son adresse pourrait allumer ou éteindre vos appareils. Pour
            la maison, préférez la version PC (onglet « Installation »), qui ne répond qu&apos;à votre ordinateur.
          </span>
        </div>
      )}

      <Card title="Exemples de commandes">
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <span key={e} className="rounded-full border border-hud/25 bg-hud/5 px-2.5 py-1 text-xs text-slate-200">
              « {e} »
            </span>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          Astuce : donnez des noms simples à vos appareils et pièces dans Home Assistant (« Lumière salon », « Volet chambre »). Vous pouvez aussi écrire vos
          propres commandes en Python (onglet « Plugins Python »).
        </p>
      </Card>
    </div>
  );
}
