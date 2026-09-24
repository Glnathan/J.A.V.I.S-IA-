"use client";

import { Film, Loader2, Pause, Play, SkipBack, SkipForward, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { useRef, useState } from "react";

interface MediaItem {
  id: string;
  name: string;
  url: string;
  kind: "video" | "audio";
  size: number;
}

const fmtTime = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

const fmtExt = (name: string) => {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return (m?.[1] ?? "?").toUpperCase();
};

/** Lecteur multimédia intégré (façon VLC) : fichiers locaux, playlist, contrôles HUD. */
export default function MediaPanel({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [current, setCurrent] = useState<number>(-1);
  const [showPlaylist, setShowPlaylist] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const addFiles = (files: FileList | File[]) => {
    const added: MediaItem[] = [];
    for (const f of Array.from(files)) {
      const kind = f.type.startsWith("audio") ? "audio" : "video";
      if (!f.type.startsWith("video") && !f.type.startsWith("audio")) continue;
      added.push({ id: `${f.name}-${f.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: f.name, url: URL.createObjectURL(f), kind, size: f.size });
    }
    if (!added.length) return;
    setItems((prev) => {
      const next = [...prev, ...added];
      if (current < 0) setCurrent(0);
      return next;
    });
  };

  const play = (index: number) => {
    setCurrent(index);
    setPlaying(true);
  };

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const step = (delta: number) => {
    if (current < 0) return;
    const next = (current + delta + items.length) % items.length;
    play(next);
  };

  const remove = (id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      const item = prev[idx];
      if (item) URL.revokeObjectURL(item.url);
      const next = prev.filter((i) => i.id !== id);
      setCurrent((cur) => {
        if (cur < 0) return cur;
        if (idx < cur) return cur - 1;
        if (idx === cur) return next.length ? Math.min(cur, next.length - 1) : -1;
        return cur;
      });
      return next;
    });
  };

  const item = current >= 0 ? items[current] : undefined;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="hud-panel fade-in relative z-10 flex h-[92dvh] w-[min(96vw,1000px)] flex-col !bg-[#030b14]/95 p-4">
        <header className="mb-3 flex flex-wrap items-center gap-3">
          <span className="glow-text font-display text-sm tracking-[0.3em] text-hud">JARVIS // MEDIA_PLAYER</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase tracking-widest text-slate-400">
            {item ? item.name : "aucun média chargé"}
          </span>
          <div className="flex gap-2">
            <button type="button" className="hud-btn" onClick={() => inputRef.current?.click()}>
              <Film size={13} /> <span className="hidden sm:inline">OUVRIR</span>
            </button>
            <button type="button" className="hud-btn" data-active={showPlaylist} onClick={() => setShowPlaylist((v) => !v)}>
              PLAYLIST
            </button>
            <button type="button" className="hud-btn" onClick={onClose} title="Fermer">
              <X size={16} />
            </button>
          </div>
        </header>

        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*,.mkv,.avi,.mov,.webm,.flac,.opus,.m4a"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
          {/* Zone de lecture */}
          <div
            ref={wrapRef}
            className={`relative grid min-h-0 place-items-center overflow-hidden rounded-lg border ${dragOver ? "border-hud bg-hud/10" : "border-hud/15 bg-black/40"}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              addFiles(e.dataTransfer.files);
            }}
          >
            {item ? (
              <video
                ref={videoRef}
                key={item.id}
                src={item.url}
                className="h-full w-full object-contain"
                autoPlay={playing}
                playsInline
                muted={muted}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onEnded={() => {
                  if (items.length > 1) step(1);
                  else setPlaying(false);
                }}
                onClick={toggle}
              />
            ) : (
              <button
                type="button"
                className="grid h-full w-full place-items-center p-8 text-center"
                onClick={() => inputRef.current?.click()}
              >
                <div>
                  <Film size={28} className="mx-auto mb-3 text-hud/60" />
                  <span className="text-sm text-slate-300">CHARGER DES FICHIERS</span>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                    Cliquez ou glissez-déposez vidéos et musiques · MP4, MKV*, WEBM, MP3…
                  </p>
                  <p className="mt-1 text-[10px] text-slate-600">* selon les formats acceptés par votre navigateur</p>
                </div>
              </button>
            )}
          </div>

          {/* Playlist */}
          {showPlaylist && (
            <div className="scroll-hud min-h-0 space-y-1.5 overflow-y-auto rounded-lg border border-hud/15 bg-black/30 p-2">
              {items.length === 0 && <p className="py-6 text-center text-xs text-slate-500">Playlist vide.</p>}
              {items.map((m, i) => (
                <div
                  key={m.id}
                  className={`group flex items-center gap-2 rounded border px-2 py-1.5 text-xs ${i === current ? "border-hud bg-hud/15" : "border-hud/10 bg-black/20 hover:border-hud/40"}`}
                >
                  <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => play(i)} title={m.name}>
                    <span className="block truncate text-slate-100">{m.name}</span>
                    <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
                      {fmtExt(m.name)} · {(m.size / 1048576).toFixed(1)} Mo
                    </span>
                  </button>
                  <button type="button" className="shrink-0 text-slate-500 hover:text-red-300" onClick={() => remove(m.id)} title="Retirer">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Barre de contrôle */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="hud-btn" onClick={() => step(-1)} title="Précédent">
            <SkipBack size={14} />
          </button>
          <button type="button" className="hud-btn !h-10 !w-10" onClick={toggle} disabled={!item} title={playing ? "Pause" : "Lecture"}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button type="button" className="hud-btn" onClick={() => step(1)} title="Suivant">
            <SkipForward size={14} />
          </button>
          <button type="button" className="hud-btn" onClick={() => setMuted((v) => !v)} disabled={!item} title={muted ? "Réactiver le son" : "Couper le son"}>
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.5}
            value={time}
            className="min-w-32 flex-1"
            onChange={(e) => {
              const v = Number(e.target.value);
              if (videoRef.current) videoRef.current.currentTime = v;
              setTime(v);
            }}
            disabled={!item}
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-hud">
            {fmtTime(time)} / {fmtTime(duration)}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{item ? fmtExt(item.name) : ""}</span>
        </div>
      </div>
    </div>
  );
}
