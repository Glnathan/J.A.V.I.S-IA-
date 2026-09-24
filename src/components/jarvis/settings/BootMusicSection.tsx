"use client";

import { Loader2, Music, Play, Square, Trash2, Upload, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { startBootMusic, stopActiveMusic } from "@/lib/client/boot-theme";
import { canonicalYouTubeUrl, parseYouTubeId, THUNDERSTRUCK_URL, youTubeLabel } from "@/lib/youtube";
import type { SetField, SettingsForm } from "./form";
import { Card, formatSize } from "./ui";

interface Props {
  form: SettingsForm;
  set: SetField;
  file: { name: string; size: number } | null;
  desktop: boolean;
  onFileChanged: () => Promise<void>;
}

const OPTIONS = [
  { id: "youtube", label: "Vidéo YouTube", desc: "AC/DC — Thunderstruck par défaut (Internet requis)" },
  { id: "custom", label: "Mon fichier audio", desc: "Votre MP3 : instantané, hors ligne" },
  { id: "theme", label: "Thème J.A.R.V.I.S.", desc: "Morceau original, hors ligne" },
  { id: "off", label: "Aucune", desc: "Démarrage rapide et silencieux" },
];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default function BootMusicSection({ form, set, file, desktop, onFileChanged }: Props) {
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kind = form.bootMusic;
  const urlOk = Boolean(parseYouTubeId(form.bootMusicUrl));
  const isTrack = kind === "youtube" || kind === "custom";
  const whole = form.bootMusicDuration === 0;

  useEffect(
    () => () => {
      if (resetRef.current) clearTimeout(resetRef.current);
      stopActiveMusic(0.3);
    },
    [],
  );

  const preview = () => {
    if (playing) {
      stopActiveMusic(0.4);
      setPlaying(false);
      return;
    }
    setError(null);
    const handle = startBootMusic(kind, {
      volume: form.bootVolume,
      version: file ? `${file.name}-${file.size}-${Date.now()}` : "",
      name: file?.name,
      url: form.bootMusicUrl,
      start: form.bootMusicStart,
      duration: form.bootMusicDuration,
      title: youTubeLabel(form.bootMusicUrl),
    });
    if (!handle) return;
    setPlaying(true);
    void handle.ready?.then((ok) => {
      if (!ok) {
        setPlaying(false);
        setError(handle.getFailReason?.() ?? (kind === "youtube" ? "YouTube n'a pas pu lire la vidéo (hors ligne, publicité ou lecture refusée)." : "Lecture impossible."));
      }
    });
    const seconds = handle.kind === "theme" ? 10.5 : form.bootMusicDuration > 0 ? form.bootMusicDuration + 3.5 : 0;
    if (resetRef.current) clearTimeout(resetRef.current);
    if (seconds > 0) resetRef.current = setTimeout(() => setPlaying(false), seconds * 1000);
  };

  const upload = async (f: File) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/boot-music", {
        method: "PUT",
        headers: { "Content-Type": f.type || "application/octet-stream", "X-File-Name": encodeURIComponent(f.name) },
        body: f,
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(j.error ?? `Erreur ${r.status}`);
      set("bootMusic", "custom");
      await onFileChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async () => {
    stopActiveMusic(0.3);
    setPlaying(false);
    await fetch("/api/boot-music", { method: "DELETE" }).catch(() => undefined);
    if (kind === "custom") set("bootMusic", "youtube");
    await onFileChanged();
  };

  return (
    <Card title="Musique de démarrage" tone="accent">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => set("bootMusic", o.id)}
            disabled={o.id === "custom" && !file}
            title={o.id === "custom" && !file ? "Importez d'abord un fichier audio ci-dessous" : undefined}
            className={`rounded border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${kind === o.id ? "border-hud bg-hud/15 shadow-[0_0_12px_rgb(var(--hud-rgb)/0.25)]" : "border-hud/15 bg-black/20 hover:border-hud/40"}`}
          >
            <span className="block text-sm text-white">{o.label}</span>
            <span className="block text-[11px] leading-snug text-slate-400">{o.desc}</span>
          </button>
        ))}
      </div>

      {kind === "youtube" && (
        <div className="space-y-2 rounded border border-hud/15 bg-black/30 p-3">
          <label className="block space-y-1.5">
            <span className="label">Lien de la vidéo YouTube</span>
            <input
              className="hud-field font-mono !text-xs"
              value={form.bootMusicUrl}
              onChange={(e) => set("bootMusicUrl", e.target.value)}
              placeholder={THUNDERSTRUCK_URL}
            />
          </label>
          {!urlOk && <p className="text-xs text-red-300">Lien YouTube invalide.</p>}
          <button type="button" className="hud-btn !h-8" onClick={() => set("bootMusicUrl", THUNDERSTRUCK_URL)}>
            <Zap size={13} /> AC/DC — Thunderstruck
          </button>
          {urlOk && (
            <a className="hud-btn !h-8" href={canonicalYouTubeUrl(parseYouTubeId(form.bootMusicUrl)!)} target="_blank" rel="noopener noreferrer">
              Ouvrir sur YouTube
            </a>
          )}
          <p className="text-xs leading-relaxed text-slate-400">
            Lecture avec le lecteur officiel de YouTube : une petite fenêtre vidéo s&apos;affiche pendant la musique (bouton ■ pour l&apos;arrêter). Internet
            requis. Si YouTube affiche une publicité, refuse la lecture ou si vous êtes hors ligne, JARVIS joue son thème original à la place.
            Les codes 101 et 150 indiquent une vidéo interdite en lecture intégrée : ouvrez-la sur YouTube ou importez votre fichier audio.
          </p>
        </div>
      )}

      {(kind === "custom" || !file) && (
        <div className="rounded border border-hud/15 bg-black/30 p-3">
          {file ? (
            <div className="flex items-center gap-2 text-sm">
              <Music size={14} className="shrink-0 text-hud" />
              <span className="min-w-0 flex-1 truncate text-slate-100">{file.name}</span>
              <span className="font-mono text-[11px] text-slate-500">{formatSize(file.size)}</span>
              <button type="button" className="text-slate-500 hover:text-red-400" onClick={() => void remove()} title="Supprimer">
                <Trash2 size={14} />
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              Vous avez le MP3 de Thunderstruck ou d&apos;une autre musique ? Importez-le : il sera joué instantanément, même hors ligne (30 Mo max).
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3,.ogg,.wav,.m4a,.aac,.flac,.webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <button type="button" className="hud-btn mt-2" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} {file ? "Remplacer le fichier" : "Importer un fichier audio"}
          </button>
        </div>
      )}

      {isTrack && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="label">Commencer à : {mmss(form.bootMusicStart)}</span>
            <input
              type="range"
              min={0}
              max={240}
              step={1}
              value={form.bootMusicStart}
              onChange={(e) => set("bootMusicStart", Number(e.target.value))}
              className="w-full"
            />
          </label>
          <div className="space-y-1.5">
            <span className="label">Durée : {whole ? "morceau entier" : `${form.bootMusicDuration} s`}</span>
            <input
              type="range"
              min={10}
              max={300}
              step={5}
              value={whole ? 300 : form.bootMusicDuration}
              disabled={whole}
              onChange={(e) => set("bootMusicDuration", Number(e.target.value))}
              className="w-full disabled:opacity-40"
            />
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={whole} onChange={(e) => set("bootMusicDuration", e.target.checked ? 0 : 30)} /> Jouer le morceau entier
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex flex-1 items-center gap-3 text-xs text-slate-300">
          Volume
          <input type="range" min={0.1} max={1} step={0.05} value={form.bootVolume} onChange={(e) => set("bootVolume", Number(e.target.value))} className="flex-1" />
          <span className="w-9 text-right font-mono">{Math.round(form.bootVolume * 100)}%</span>
        </label>
        <button type="button" className="hud-btn" onClick={preview} disabled={kind === "off" || (kind === "youtube" && !urlOk)}>
          {playing ? <Square size={13} /> : <Play size={13} />} {playing ? "Arrêter" : "Écouter"}
        </button>
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <p className="text-xs leading-relaxed text-slate-400">
        La musique baisse automatiquement quand JARVIS parle ou vous écoute, puis s&apos;estompe à la fin de la durée choisie. À la voix : « Jarvis, mets
        Thunderstruck », « arrête la musique ».{desktop ? " Ce choix est aussi proposé pendant l'installation." : ""} N&apos;oubliez pas d&apos;enregistrer.
      </p>
    </Card>
  );
}
