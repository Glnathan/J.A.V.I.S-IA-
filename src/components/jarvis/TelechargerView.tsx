"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { DownloadItem } from "@/lib/types";
import { InstallerDownloads } from "./settings/DownloadButtons";

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
        <div className="text-center">
          <a href="/" className="hud-btn">
            <ArrowLeft size={14} /> Retour à J.A.R.V.I.S.
          </a>
        </div>
      </div>
    </main>
  );
}
