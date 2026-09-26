"use client";

import { Trash2, Volume2 } from "lucide-react";
import { useState } from "react";
import type { ThemeName } from "@/lib/types";
import { addressChoiceOf, greetingPreview, type AddressChoice, type SetField, type SettingsForm } from "./form";
import { Card, Field } from "./ui";

interface Props {
  form: SettingsForm;
  set: SetField;
  desktop: boolean;
  premium: boolean;
  theme: ThemeName;
  onTheme: (t: ThemeName) => void;
  onPreview: (text: string) => void;
  onClearData: (kind: "history" | "memories" | "tasks") => void;
}

const CHOICES: { id: AddressChoice; label: string }[] = [
  { id: "name", label: "Par mon prénom" },
  { id: "monsieur", label: "Monsieur" },
  { id: "madame", label: "Madame" },
  { id: "custom", label: "Autre…" },
];

/** Apparences disponibles (couleurs du thème correspondant). */
const THEMES: { id: ThemeName; label: string; color: string; premium?: boolean }[] = [
  { id: "cyan", label: "Cyan (classique)", color: "#22d3ee" },
  { id: "red", label: "Alerte rouge", color: "#ff4d4d" },
  { id: "gold", label: "Mark (rouge et or)", color: "#fbbf24" },
  { id: "green", label: "Éco", color: "#34d399" },
  { id: "gaming", label: "Gaming", color: "#b026ff" },
  { id: "nanotech", label: "Nanotech", color: "#7dd3fc", premium: true },
  { id: "ultron", label: "Ultron", color: "#ff3b30", premium: true },
  { id: "stealth", label: "Furtif", color: "#cbd5e1", premium: true },
];

export default function ProfileTab({ form, set, desktop, premium, theme, onTheme, onPreview, onClearData }: Props) {
  const choice = addressChoiceOf(form);
  const [custom, setCustom] = useState(choice === "custom" ? form.honorific : "Patron");
  const preview = greetingPreview(form.userName, choice, form.honorific);

  const pick = (c: AddressChoice) => {
    if (c === "name") {
      set("addressBy", "name");
      return;
    }
    set("addressBy", "title");
    set("honorific", c === "monsieur" ? "Monsieur" : c === "madame" ? "Madame" : custom.trim() || "Patron");
  };

  const confirmClear = (kind: "history" | "memories" | "tasks", label: string) => {
    if (window.confirm(`Confirmer : effacer ${label} ?`)) onClearData(kind);
  };

  return (
    <div className="space-y-5">
      <Card title="Votre profil" tone="accent">
        <Field label="Votre prénom">
          <input className="hud-field !text-base" value={form.userName} placeholder="Nathan" onChange={(e) => set("userName", e.target.value)} />
        </Field>
        <div className="space-y-2">
          <span className="label">JARVIS s&apos;adresse à vous</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CHOICES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.id)}
                className={`rounded border px-3 py-2 text-sm transition ${choice === c.id ? "border-hud bg-hud/15 text-white shadow-[0_0_12px_rgb(var(--hud-rgb)/0.25)]" : "border-hud/15 bg-black/20 text-slate-300 hover:border-hud/40"}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          {choice === "custom" && (
            <input
              className="hud-field"
              value={custom}
              placeholder="Patron, Boss, Monsieur Stark…"
              onChange={(e) => {
                setCustom(e.target.value);
                set("honorific", e.target.value);
              }}
            />
          )}
          {choice === "name" && !form.userName.trim() && <p className="text-xs text-amber-200">Indiquez votre prénom pour que JARVIS l&apos;utilise.</p>}
        </div>
        <div className="flex items-center gap-3 rounded border border-hud/20 bg-black/30 p-3">
          <span className="flex-1 text-sm italic text-slate-100">« {preview} »</span>
          <button type="button" className="hud-btn shrink-0" onClick={() => onPreview(preview)}>
            <Volume2 size={14} /> Écouter
          </button>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          À la voix : « Jarvis, appelle-moi Nathan », « appelle-moi monsieur », « je m&apos;appelle… ».
          {desktop ? " Le prénom choisi pendant l'installation est repris ici." : ""} N&apos;oubliez pas d&apos;enregistrer.
        </p>
      </Card>

      <Field label="Ville (météo par défaut)">
        <input className="hud-field" value={form.city} placeholder="Paris" onChange={(e) => set("city", e.target.value)} />
      </Field>

      <Card title="Apparence de JARVIS">
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          Un clic pour changer de costume — ou à la voix : « Jarvis, mode or », « mode Ultron »…
        </p>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => {
            const locked = t.premium && !premium;
            return (
              <button
                key={t.id}
                type="button"
                disabled={locked}
                onClick={() => onTheme(t.id)}
                title={locked ? "Réservé à l'édition Premium" : `Activer : ${t.label}`}
                className={`flex items-center gap-2 rounded border px-3 py-1.5 text-xs transition ${theme === t.id ? "border-hud bg-hud/15 text-white" : locked ? "border-hud/10 bg-black/10 text-slate-500" : "border-hud/15 bg-black/20 text-slate-300 hover:border-hud/40 hover:text-white"}`}
              >
                <span className="h-3 w-3 rounded-full" style={{ background: t.color }} />
                {t.label}
                {t.premium && <span className="text-[9px] uppercase text-amber-300/80">Premium</span>}
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Coffre Obsidian (Premium)">
        <Field
          label="Dossier du coffre Obsidian"
          hint={
            !premium
              ? "Réservé à l'édition Premium : JARVIS écrit ses notes dans un fichier Markdown (JARVIS.md) de votre coffre Obsidian, à relire sur tous vos appareils."
              : "Ex : C:\\Users\\Nathan\\Documents\\MonCoffre. Dites « Jarvis, note dans Obsidian : … » pour ajouter une note, « relis mon coffre » pour les entendre. Vide = désactivé."
          }
        >
          <input className="hud-field" value={form.obsidianVault} placeholder="C:\\Users\\Nathan\\Documents\\MonCoffre" disabled={!premium} onChange={(e) => set("obsidianVault", e.target.value)} />
        </Field>
      </Card>

      <Card title="Données" tone="danger">
        <div className="flex flex-wrap gap-2">
          <button type="button" className="hud-btn" onClick={() => confirmClear("history", "tout l'historique des conversations")}>
            <Trash2 size={14} /> Historique
          </button>
          <button type="button" className="hud-btn" onClick={() => confirmClear("memories", "toute la mémoire à long terme")}>
            <Trash2 size={14} /> Mémoire
          </button>
          <button type="button" className="hud-btn" onClick={() => confirmClear("tasks", "toutes les tâches et rappels")}>
            <Trash2 size={14} /> Tâches
          </button>
        </div>
      </Card>
    </div>
  );
}
