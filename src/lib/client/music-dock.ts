// Floating "now playing" panel (YouTube player or audio file), independent from React so the music
// keeps playing while the boot screen is replaced by the interface.

export interface MusicHandle {
  kind: "theme" | "custom" | "youtube";
  /** Fades the music out now (idempotent). */
  stop: (fadeSeconds?: number) => void;
  /** Called when the boot sequence ends normally. */
  release: () => void;
  /** Resolves true once the music really plays, false if it failed (offline, ad, blocked, unreadable file…). */
  ready?: Promise<boolean>;
  /** Lowers the volume while JARVIS speaks or listens. */
  duck?: (on: boolean) => void;
  getTitle?: () => string;
  /** Short French explanation when `ready` resolved false (YouTube error code, offline, timeout…). */
  getFailReason?: () => string | null;
}

export interface MusicDock {
  body: HTMLDivElement;
  setTitle: (title: string) => void;
  setProgress: (ratio: number | null) => void;
  remove: () => void;
}

let current: HTMLDivElement | null = null;

export function createMusicDock(title: string, onStop: () => void, video: boolean): MusicDock {
  current?.remove();
  const root = document.createElement("div");
  root.className = `music-dock${video ? " music-dock-video" : ""}`;
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "Musique en cours");

  const head = document.createElement("div");
  head.className = "music-dock-head";
  const note = document.createElement("span");
  note.className = "music-dock-note";
  note.textContent = "♪";
  const label = document.createElement("span");
  label.className = "music-dock-title";
  label.textContent = title;
  label.title = title;
  const stop = document.createElement("button");
  stop.type = "button";
  stop.className = "music-dock-stop";
  stop.title = "Arrêter la musique";
  stop.setAttribute("aria-label", "Arrêter la musique");
  stop.textContent = "■";
  stop.addEventListener("click", (e) => {
    e.stopPropagation();
    onStop();
  });
  head.append(note, label, stop);

  const body = document.createElement("div");
  body.className = "music-dock-body";
  const bar = document.createElement("div");
  bar.className = "music-dock-bar";
  const fill = document.createElement("div");
  fill.className = "music-dock-fill";
  bar.append(fill);

  root.append(head, body, bar);
  document.body.append(root);
  current = root;
  requestAnimationFrame(() => root.classList.add("music-dock-in"));

  return {
    body,
    setTitle: (t) => {
      label.textContent = t;
      label.title = t;
    },
    setProgress: (r) => {
      bar.style.visibility = r === null ? "hidden" : "visible";
      if (r !== null) fill.style.width = `${Math.max(0, Math.min(1, r)) * 100}%`;
    },
    remove: () => {
      if (current === root) current = null;
      body.replaceChildren(); // stops the YouTube player immediately
      root.classList.remove("music-dock-in");
      setTimeout(() => root.remove(), 260);
    },
  };
}
