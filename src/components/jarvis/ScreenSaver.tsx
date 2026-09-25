"use client";

import { useEffect, useRef, useState } from "react";

const IDLE_MS = 3 * 60 * 1000;

interface Props {
  /** Toute activité de conversation (nouveaux messages, changement d'état) réveille JARVIS. */
  activityKey: unknown[];
  /** true = pas d'écran de veille (démarrage, réglages, lecteur multimédia ouverts…). */
  disabled: boolean;
}

export default function ScreenSaver({ activityKey, disabled }: Props) {
  const [show, setShow] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const last = useRef(0);

  useEffect(() => {
    const bump = () => {
      last.current = Date.now();
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, bump, { passive: true });
    const clock = setInterval(() => setNow(new Date()), 1000);
    const check = setInterval(() => {
      setShow(!disabled && Date.now() - last.current > IDLE_MS);
    }, 500);
    return () => {
      for (const e of events) window.removeEventListener(e, bump);
      clearInterval(clock);
      clearInterval(check);
    };
  }, [disabled]);

  useEffect(() => {
    last.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, activityKey);

  if (!show || !now) return null;

  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const sec = String(now.getSeconds()).padStart(2, "0");
  const date = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="saver-fade fixed inset-0 z-[75] select-none bg-[#02060c]/97" role="presentation">
      <div className="hud-grid pointer-events-none fixed inset-0" />
      <div className="absolute left-1/2 top-1/2 h-[130vmin] w-[130vmin] -translate-x-1/2 -translate-y-1/2 opacity-40">
        <div className="saver-ring" />
      </div>
      <div className="absolute left-1/2 top-1/2 h-[86vmin] w-[86vmin] -translate-x-1/2 -translate-y-1/2 opacity-30">
        <div className="saver-ring" style={{ animationDuration: "40s", animationDirection: "reverse" }} />
      </div>
      <div className="relative grid h-full place-items-center px-6 text-center">
        <div>
          <div className="label mb-6 tracking-[0.5em]">Systèmes en veille — J.A.R.V.I.S. reste à votre écoute</div>
          <div className="glow-text font-display text-[clamp(4rem,18vw,11rem)] leading-none text-hud">
            {time}
            <span className="text-[0.35em] opacity-50">:{sec}</span>
          </div>
          <div className="mt-4 text-sm capitalize text-slate-300">{date}</div>
          <div className="mt-10 font-mono text-[11px] uppercase tracking-[0.25em] text-slate-500">
            Bougez la souris, appuyez sur une touche ou dites « Jarvis » pour reprendre
          </div>
        </div>
      </div>
    </div>
  );
}
