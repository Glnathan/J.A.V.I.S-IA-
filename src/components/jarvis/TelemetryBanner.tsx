"use client";

import { useEffect, useState } from "react";
import type { SystemStats } from "@/lib/types";
import { APP_NAME, APP_VERSION } from "@/lib/version";

interface Props {
  /** État de l'IA, ex. « Groq » ou « Noyau local ». */
  ai: string;
  /** État du micro, ex. « écoute » ou « veille active ». */
  mic: string;
}

function fmtUptime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

export default function TelemetryBanner({ ai, mic }: Props) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/system", { cache: "no-store" });
        if (r.ok && alive) setStats((await r.json()) as SystemStats);
      } catch {
        /* le prochain cycle réessaiera */
      }
    };
    void load();
    const poll = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(clock);
      clearInterval(poll);
    };
  }, []);

  const memUsed = stats ? (stats.totalMem - stats.freeMem) / 1073741824 : 0;
  const memTotal = stats ? stats.totalMem / 1073741824 : 0;
  const items: string[] = [
    `${APP_NAME} v${APP_VERSION}`,
    now ? now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase() : "…",
    now ? now.toLocaleTimeString("fr-FR") : "--:--:--",
    stats ? `CPU ${stats.cpuUsage} % · ${stats.cores} CŒURS` : "CPU …",
    stats ? `RAM ${memUsed.toFixed(1)} / ${memTotal.toFixed(1)} GO` : "RAM …",
    stats ? `UPTIME ${fmtUptime(stats.uptime)}` : "UPTIME …",
    stats ? `HÔTE ${stats.hostname.toUpperCase()} · ${stats.platform.toUpperCase()}` : "HÔTE …",
    `IA : ${ai.toUpperCase()}`,
    `MICRO : ${mic.toUpperCase()}`,
    "TOUS LES SYSTÈMES NOMINAUX",
  ];
  const line = items.join("   ·   ");

  return (
    <div className="telemetry-banner" aria-hidden>
      <div className="telemetry-track">
        <span>{line}</span>
        <span>{line}</span>
      </div>
    </div>
  );
}
