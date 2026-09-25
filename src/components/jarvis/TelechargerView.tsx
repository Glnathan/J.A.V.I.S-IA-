"use client";

import { ArrowLeft, Check, Crown, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { DownloadItem } from "@/lib/types";
import { PREMIUM_PRICE } from "@/lib/premium";
import { InstallerDownloads } from "./settings/DownloadButtons";

/** Comparatif des éditions : les fonctions de base sont identiques, Premium ajoute le confort. */
const EDITIONS: { label: string; standard: boolean; premium: boolean }[] = [
  { label: "Assistant vocal complet (voix, chat, plugins, contrôle du PC)", standard: true, premium: true },
  { label: "Maison connectée, Gmail, espace, lecteur multimédia", standard: true, premium: true },
  { label: "Accès depuis le téléphone (Tailscale / Wi-Fi local)", standard: true, premium: true },
  { label: "Mode Vision : caméra avec suivi des mouvements (HUD Iron Man)", standard: false, premium: true },
  { label: "Reconnaissance faciale (« Bonjour Nathan » à votre retour)", standard: false, premium: true },
  { label: "Vision de l'écran : JARVIS décrit ce que vous regardez (IA)", standard: false, premium: true },
  { label: "Mises à jour automatiques (installation silencieuse, sans clic)", standard: false, premium: true },
  { label: "Apparences exclusives : nanotech, Ultron, furtif", standard: false, premium: true },
  { label: "Sauvegarde quotidienne automatique + restauration en un clic", standard: false, premium: true },
  { label: "Journal des connexions distantes", standard: false, premium: true },
  { label: "Fonctions Premium à venir, incluses à vie", standard: false, premium: true },
];

export default function TelechargerView() {
  const [items, setItems] = useState<DownloadItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/download", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<DownloadItem[]>) : []))
      .then((d) => {
        if (alive) setItems(d);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const installer = items?.find((d) => d.kind === "installer");
  const source = items?.find((d) => d.kind === "source");

  return (
    <main className="hud-bg relative min-h-dvh overflow-hidden px-4 py-10">
      <div className="hud-grid pointer-events-none absolute inset-0" />
      <div className="scanlines pointer-events-none absolute inset-0" />
      <div className="vignette pointer-events-none absolute inset-0" />
      <div className="relative mx-auto w-full max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="glow-text font-display text-3xl tracking-[0.25em] text-hud">J.A.R.V.I.S.</h1>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.3em] text-hud/60">Option B · version PC Windows</p>
        </div>
        <div className="hud-panel p-5">
          {items === null || !installer ? (
            <p className="flex items-center gap-2 text-sm text-slate-300">
              {items === null ? (
                <>
                  <Loader2 size={15} className="animate-spin text-hud" /> Recherche des fichiers…
                </>
              ) : (
                "L'installateur n'a pas encore été généré sur ce serveur."
              )}
            </p>
          ) : (
            <InstallerDownloads installer={installer} source={source} />
          )}
        </div>

        <div className="hud-panel space-y-4 p-5">
          <div className="text-center">
            <div className="label">Deux éditions</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded border border-hud/25 bg-hud/5 p-4">
              <div className="flex items-center gap-2 font-display text-sm tracking-[0.2em] text-white">STANDARD</div>
              <div className="glow-text mt-1 font-display text-2xl text-hud">Gratuite</div>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                L&apos;assistant J.A.R.V.I.S. complet, pour toujours. Les mises à jour s&apos;installent depuis cette page.
              </p>
            </div>
            <div className="rounded border border-amber-400/40 bg-amber-400/5 p-4">
              <div className="flex items-center gap-2 font-display text-sm tracking-[0.2em] text-amber-200">
                <Crown size={14} /> PREMIUM
              </div>
              <div className="glow-text mt-1 font-display text-2xl text-amber-300">{PREMIUM_PRICE}</div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200/70">Licence à vie</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Le confort en plus : mises à jour automatiques, apparences exclusives, sauvegardes et journal des connexions.
                Clé fournie par le créateur après votre soutien.
              </p>
            </div>
          </div>
          <div>
            {EDITIONS.map((row) => (
              <div key={row.label} className="flex items-center gap-2 border-b border-hud/10 py-1.5 text-xs last:border-0">
                <span className="min-w-0 flex-1 text-slate-300">{row.label}</span>
                <span className="grid w-8 shrink-0 justify-center">{row.standard ? <Check size={13} className="text-emerald-400" /> : <X size={13} className="text-slate-600" />}</span>
                <span className="grid w-8 shrink-0 justify-center">{row.premium ? <Check size={13} className="text-amber-300" /> : <X size={13} className="text-slate-600" />}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1 text-[10px] uppercase tracking-[0.2em] text-hud/60">
              <span className="min-w-0 flex-1" />
              <span className="w-8 shrink-0 text-center">Std</span>
              <span className="w-8 shrink-0 text-center">Prem</span>
            </div>
          </div>
          <p className="text-center text-xs text-slate-400">
            Déjà une clé ? Ouvrez JARVIS → Paramètres → Premium et saisissez-la : tout s&apos;active immédiatement.
          </p>
        </div>
        <div className="text-center">
          <a href="/" className="hud-btn">
            <ArrowLeft size={14} /> Retour à J.A.R.V.I.S.
          </a>
        </div>
      </div>
    </main>
  );
}
