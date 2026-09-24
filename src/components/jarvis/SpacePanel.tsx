"use client";

import { Orbit, Satellite, X } from "lucide-react";
import { useState } from "react";
import { SatellitesView, SolarView } from "./space/SpaceViews";

export type SpaceVue = "systeme" | "satellites";

interface Props {
  vue: SpaceVue;
  onClose: () => void;
}

/** Panneau Espace intégré à l'interface JARVIS (ouvert par la voix ou le bouton 🛰). */
export default function SpacePanel({ vue: initial, onClose }: Props) {
  const [vue, setVue] = useState<SpaceVue>(initial);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="hud-panel fade-in relative z-10 flex h-[92dvh] w-[min(96vw,1000px)] flex-col !bg-[#030b14]/95 p-4">
        <header className="mb-3 flex flex-wrap items-center gap-3">
          <span className="glow-text font-display text-sm tracking-[0.3em] text-hud">ESPACE</span>
          <div className="flex gap-2">
            <button type="button" className="hud-btn" data-active={vue === "systeme"} onClick={() => setVue("systeme")}>
              <Orbit size={13} /> Système solaire
            </button>
            <button type="button" className="hud-btn" data-active={vue === "satellites"} onClick={() => setVue("satellites")}>
              <Satellite size={13} /> Satellites
            </button>
          </div>
          <button type="button" className="hud-btn ml-auto" onClick={onClose} title="Fermer">
            <X size={16} />
          </button>
        </header>
        {vue === "systeme" ? <SolarView /> : <SatellitesView />}
      </div>
    </div>
  );
}
