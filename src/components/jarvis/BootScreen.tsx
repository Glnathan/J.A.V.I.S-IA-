"use client";

import { Loader2, Music, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { preloadCustomBootMusic, startBootMusic, THEME_TIMING, type MusicHandle, type MusicOptions } from "@/lib/client/boot-theme";
import { sfx } from "@/lib/client/sounds";
import { canonicalYouTubeUrl, parseYouTubeId } from "@/lib/youtube";
import ArcReactor from "./ArcReactor";

export type BootMusicKind = "youtube" | "custom" | "theme" | "off";
type Plan = "theme" | "track" | "off";

interface Props {
  aiLabel: string;
  music: BootMusicKind;
  musicOptions: MusicOptions;
  musicLabel: string;
  autoStart: boolean;
  onInitialize: () => void;
  onDone: () => void;
}

function bootLines(ai: string, soundtrack: string | null): string[] {
  const lines = [
    "Initialisation du noyau J.A.R.V.I.S.",
    "Réacteur Arc : montée en puissance",
    "Chargement des matrices neuronales",
    "Connexion à la base de données mémorielle",
    "Interface vocale chargée (micro à tester)",
    "Synchronisation des satellites météo",
    `Noyau cognitif : ${ai}`,
    "Chargement des plugins Python",
    "Protocoles de sécurité : actifs",
    "Tous les systèmes sont opérationnels",
  ];
  if (soundtrack) lines.splice(1, 0, `Bande-son : ${soundtrack}`);
  return lines;
}

function schedule(plan: Plan, n: number): { times: number[]; exit: number; flashes: number[] } {
  if (plan === "theme") {
    const base = [0.25, 0.7, 1.25, THEME_TIMING.impact, 2.75, 3.6, 4.45, 5.3, 6.2, THEME_TIMING.final];
    const times = Array.from({ length: n }, (_, i) => base[i] ?? THEME_TIMING.final);
    return { times, exit: THEME_TIMING.final + 1.0, flashes: [THEME_TIMING.impact, THEME_TIMING.final] };
  }
  if (plan === "track") {
    const times = Array.from({ length: n }, (_, i) => 0.35 + i * 0.7);
    return { times, exit: times[n - 1] + 0.9, flashes: [0.05, times[n - 1]] };
  }
  const times = Array.from({ length: n }, (_, i) => 0.17 * (i + 1));
  return { times, exit: times[n - 1] + 0.35, flashes: [] };
}

function musicCaption(kind: BootMusicKind, label: string): string {
  if (kind === "youtube") return `Musique de démarrage : ${label} (YouTube)`;
  if (kind === "custom") return `Musique de démarrage : ${label}`;
  if (kind === "theme") return "Musique de démarrage : thème J.A.R.V.I.S.";
  return "Musique de démarrage désactivée";
}

export default function BootScreen({ aiLabel, music, musicOptions, musicLabel, autoStart, onInitialize, onDone }: Props) {
  const [phase, setPhase] = useState<"idle" | "booting" | "exit">("idle");
  const [lines, setLines] = useState<string[]>([]);
  const [total, setTotal] = useState(10);
  const [waiting, setWaiting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const started = useRef(false);
  const finished = useRef(false);
  const planRef = useRef<Plan | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const musicRef = useRef<MusicHandle | null>(null);
  const levelRef = useRef(0);
  const latest = useRef({ aiLabel, music, musicOptions, musicLabel, onInitialize, onDone });

  useEffect(() => {
    latest.current = { aiLabel, music, musicOptions, musicLabel, onInitialize, onDone };
  });

  const version = musicOptions.version ?? "";
  useEffect(() => {
    if (music === "custom") preloadCustomBootMusic(version);
  }, [music, version]);

  const finish = (skipped: boolean) => {
    if (finished.current) return;
    finished.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setWaiting(null);
    // The synthesized theme belongs to the animation; a real track (Thunderstruck…) keeps playing in its dock.
    if (skipped && planRef.current !== "track") musicRef.current?.stop(0.5);
    else if (!skipped) musicRef.current?.release();
    setPhase("exit");
    setTimeout(() => latest.current.onDone(), skipped ? 350 : 650);
  };

  const run = (plan: Plan, soundtrack: string | null) => {
    planRef.current = plan;
    const all = bootLines(latest.current.aiLabel, soundtrack);
    setTotal(all.length);
    const s = schedule(plan, all.length);
    s.times.forEach((t, i) => timers.current.push(setTimeout(() => setLines(all.slice(0, i + 1)), t * 1000)));
    s.flashes.forEach((t) =>
      timers.current.push(
        setTimeout(() => {
          setFlash((f) => f + 1);
          levelRef.current = 1;
        }, t * 1000),
      ),
    );
    timers.current.push(setTimeout(() => finish(false), s.exit * 1000));
  };

  const start = () => {
    if (started.current) return;
    started.current = true;
    const { music: kind, musicOptions: opts, musicLabel: label } = latest.current;
    latest.current.onInitialize();
    setPhase("booting");
    const handle = startBootMusic(kind, opts);
    musicRef.current = handle;
    if (!handle) {
      sfx.boot();
      run("off", null);
      return;
    }
    if (handle.kind === "theme") {
      run("theme", null);
      return;
    }
    // Real track (YouTube / file): wait until it really plays, then sync the boot sequence on it.
    setWaiting(
      kind === "youtube"
        ? `Connexion à la bande-son : ${label}… (une publicité YouTube peut retarder le démarrage — « Passer » pour continuer)`
        : `Chargement de la bande-son : ${label}…`,
    );
    const safetyMs = kind === "youtube" ? 50000 : 16000;
    const safety = new Promise<boolean>((resolve) => timers.current.push(setTimeout(() => resolve(false), safetyMs)));
    void Promise.race([handle.ready ?? Promise.resolve(true), safety]).then((ok) => {
      if (finished.current) return;
      setWaiting(null);
      if (ok) {
        run("track", handle.getTitle?.() ?? label);
        return;
      }
      handle.stop(0);
      const reason = handle.getFailReason?.() ?? "hors ligne, publicité ou lecture refusée";
      setNotice(
        kind === "youtube"
          ? `${label} indisponible pour le moment (${reason}) : thème original. Vous pouvez aussi importer votre fichier audio dans Paramètres → Voix & micro.`
          : "Fichier audio illisible : thème original.",
      );
      const theme = startBootMusic("theme", { volume: opts.volume });
      musicRef.current = theme;
      if (theme) run("theme", null);
      else {
        sfx.boot();
        run("off", null);
      }
    });
  };

  const startRef = useRef(start);
  const finishRef = useRef(finish);
  useEffect(() => {
    startRef.current = start;
    finishRef.current = finish;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!started.current && (e.key === "Enter" || e.code === "Space")) {
        e.preventDefault();
        startRef.current();
      } else if (started.current && e.key === "Escape") finishRef.current(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!autoStart) return;
    const t = setTimeout(() => startRef.current(), 500);
    return () => clearTimeout(t);
  }, [autoStart]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);

  const progress = Math.round((lines.length / Math.max(1, total)) * 100);
  const videoId = parseYouTubeId(musicOptions.url ?? "");

  return (
    <div
      className={`hud-bg fixed inset-0 z-50 grid place-items-center overflow-hidden transition-opacity duration-700 ${phase === "exit" ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div className="hud-grid pointer-events-none absolute inset-0" />
      <div className="scanlines pointer-events-none absolute inset-0" />
      <div className="vignette pointer-events-none absolute inset-0" />
      {flash > 0 && <div key={flash} className="boot-flash pointer-events-none absolute inset-0" />}
      <div className="relative flex w-full max-w-xl flex-col items-center gap-7 px-6 text-center">
        <div className="h-56 w-56 sm:h-64 sm:w-64">
          <ArcReactor state={phase === "idle" ? "idle" : "thinking"} levelRef={levelRef} onClick={start} title="Initialiser J.A.R.V.I.S." className="h-full w-full" />
        </div>
        <div>
          <h1 className="glow-text font-display text-4xl tracking-[0.3em] text-hud sm:text-6xl">J.A.R.V.I.S.</h1>
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.3em] text-hud/60 sm:text-xs">Just A Rather Very Intelligent System</p>
        </div>
        {phase === "idle" ? (
          <div className="flex flex-col items-center gap-4">
            <button type="button" onClick={start} className="hud-btn-primary">
              Initialiser le système
            </button>
            <p className="flex items-center gap-2 font-mono text-[11px] text-hud/70">
              <Music size={12} /> {musicCaption(music, musicLabel)}
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-slate-400">
              Pour une expérience optimale, utilisez Google Chrome ou Microsoft Edge et autorisez le microphone. Appuyez sur Entrée pour démarrer.
            </p>
          </div>
        ) : (
          <div className="w-full max-w-md text-left">
            <div className="space-y-1 font-mono text-xs">
              {lines.map((l, i) => (
                <div key={i} className="animate-msg flex justify-between gap-3">
                  <span className="text-slate-300">&gt; {l}</span>
                  <span className="text-hud">[OK]</span>
                </div>
              ))}
            </div>
            <div className="mt-4 h-1 w-full overflow-hidden rounded bg-hud/10">
              <div className="h-full bg-hud shadow-[0_0_12px_var(--hud)] transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            {waiting && (
              <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-hud">
                <Loader2 size={12} className="animate-spin" /> {waiting}
              </p>
            )}
            {notice && <p className="mt-3 font-mono text-[11px] text-amber-300">{notice}</p>}
            {notice && music === "youtube" && videoId && (
              <a className="hud-btn mt-3 text-xs" href={canonicalYouTubeUrl(videoId)} target="_blank" rel="noopener noreferrer">
                Ouvrir la musique sur YouTube
              </a>
            )}
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => finish(true)} className="hud-btn !h-8 text-xs" title="Passer (Échap)">
                Passer <SkipForward size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
