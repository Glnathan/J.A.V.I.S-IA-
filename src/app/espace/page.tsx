"use client";

import { Orbit, Satellite } from "lucide-react";
import { useEffect, useState } from "react";
import type { SpaceVue } from "@/components/jarvis/SpacePanel";
import { SatellitesView, SolarView } from "@/components/jarvis/space/SpaceViews";

/** Page /espace : accès direct aux vues Espace (la voix ouvre le panneau intégré, sans changer d'onglet). */
export default function EspacePage() {
  const [vue, setVue] = useState<SpaceVue>("systeme");

  useEffect(() => {
    document.title = "J.A.R.V.I.S. — Espace";
    const q = new URLSearchParams(window.location.search).get("vue");
    if (q === "satellites" || q === "systeme") setVue(q);
  }, []);

  return (
    <div className="hud-bg h-dvh text-slate-100">
      <div className="hud-grid pointer-events-none fixed inset-0" />
      <div className="hud-orbit pointer-events-none fixed inset-0" />
      <div className="scanlines pointer-events-none fixed inset-0" />
      <div className="vignette pointer-events-none fixed inset-0" />
      <header className="relative flex flex-wrap items-center gap-3 px-5 pt-4">
        <span className="glow-text font-display text-sm tracking-[0.3em] text-hud">J.A.R.V.I.S. — ESPACE</span>
        <div className="ml-auto flex gap-2">
          <button type="button" className="hud-btn" data-active={vue === "systeme"} onClick={() => setVue("systeme")}>
            <Orbit size={13} /> Système solaire
          </button>
          <button type="button" className="hud-btn" data-active={vue === "satellites"} onClick={() => setVue("satellites")}>
            <Satellite size={13} /> Satellites
          </button>
        </div>
      </header>
      <main className="relative h-[calc(100dvh-72px)] p-4">
        <div className="hud-panel relative flex h-full flex-col !bg-[#030b14]/95 p-4">
          {vue === "systeme" ? (
            <SolarView />
          ) : (
            <SatellitesView />
          )}
        </div>
      </main>
    </div>
  );
}
