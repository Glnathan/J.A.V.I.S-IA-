// Plays a YouTube video as boot music with YouTube's official embedded player (visible, 356×200),
// controlled through its postMessage protocol (enablejsapi=1) — no third-party script runs in JARVIS.
//
// Robustness: youtube-nocookie.com domain (no EU cookie-consent wall), sequential fallback videos,
// periodic play nudges, and ad-aware timeouts (an ad keeps the video clock still).
import { createMusicDock, type MusicHandle } from "./music-dock";

const YT_NOCOOKIE = "https://www.youtube-nocookie.com";
const YT = "https://www.youtube.com";
const ORIGINS = new Set([YT_NOCOOKIE, YT]);

interface YtInfo {
  currentTime?: number;
  playerState?: number;
  videoData?: { title?: string };
}

export interface YouTubeOptions {
  /** Video ids to try in order (official video first, then fallbacks). */
  ids: string[];
  start: number;
  /** Seconds before the final fade-out (0 = whole video). */
  duration: number;
  volume: number;
  title: string;
  /** Total budget for all attempts (default 45 s). The boot screen can be skipped meanwhile. */
  timeoutMs?: number;
}

const QUIET_MS = 12000; // no sign of life → try the next video
const ACTIVE_MS = 40000; // player alive (ad, buffering) → wait longer before the next video

const ERROR_FR: Record<number, string> = {
  2: "paramètre de lecture invalide",
  5: "erreur du lecteur vidéo",
  100: "vidéo introuvable ou privée",
  101: "intégration refusée par le propriétaire",
  150: "intégration refusée par le propriétaire",
  153: "identification de JARVIS refusée (référent absent ou filtré)",
};

export function playYouTube(o: YouTubeOptions): MusicHandle {
  const list = o.ids.filter(Boolean);
  const base = Math.round(Math.max(0, Math.min(1, o.volume)) * 100);
  const startAt = Math.max(0, Math.floor(o.start));
  const totalBudget = o.timeoutMs ?? 45000;
  const t0 = Date.now();
  const info: YtInfo = {};
  const timers: ReturnType<typeof setTimeout>[] = [];
  const intervals: ReturnType<typeof setInterval>[] = [];
  const baseTitle = o.title;
  let title = o.title;
  let attempt = 0;
  let attemptStart = Date.now();
  let sawActivity = false;
  let playingStuckSince = 0;
  let adNotified = false;
  let stopped = false;
  let started = false;
  let ducked = false;
  let fading = false;
  let connected = false;
  let autoplayBlocked = false;
  let failReason: string | null = typeof navigator !== "undefined" && !navigator.onLine ? "pas de connexion Internet" : null;
  let settle: (ok: boolean) => void = () => undefined;
  const ready = new Promise<boolean>((resolve) => {
    let done = false;
    settle = (ok) => {
      if (!done) {
        done = true;
        resolve(ok);
      }
    };
  });

  const dock = createMusicDock(`${baseTitle} — connexion…`, () => handle.stop(0.6), true);
  const iframe = document.createElement("iframe");
  const params = new URLSearchParams({
    autoplay: "1",
    enablejsapi: "1",
    origin: window.location.origin,
    playsinline: "1",
    rel: "0",
    start: String(startAt),
  });
  const srcFor = (id: string) => `${YT_NOCOOKIE}/embed/${encodeURIComponent(id)}?${params.toString()}`;
  iframe.src = srcFor(list[0] ?? "");
  iframe.title = `Lecteur YouTube — ${baseTitle}`;
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.width = "356";
  iframe.height = "200";
  dock.body.append(iframe);
  const hint = document.createElement("p");
  hint.style.cssText = "padding:8px 10px;margin:0;font-size:12px";
  hint.textContent = "Si la musique ne démarre pas, cliquez sur ▶ dans la vidéo.";
  dock.body.append(hint);

  const post = (msg: Record<string, unknown>) => {
    try {
      iframe.contentWindow?.postMessage(JSON.stringify({ ...msg, id: 1, channel: "widget" }), YT_NOCOOKIE);
    } catch {
      /* player gone */
    }
  };
  const command = (func: string, args: unknown[] = []) => post({ event: "command", func, args });
  const target = () => (ducked ? Math.round(base * 0.3) : base);
  const prime = () => {
    command("unMute");
    command("setVolume", [target()]);
    command("playVideo");
  };
  const showStatus = (s: string | null) => dock.setTitle(s ? `${baseTitle} — ${s}` : title);

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    settle(false);
    timers.forEach(clearTimeout);
    intervals.forEach(clearInterval);
    window.removeEventListener("message", onMessage);
    dock.remove();
  };

  const fail = (reason: string) => {
    if (!failReason || reason !== "délai dépassé") failReason = failReason ?? reason;
    if (reason !== "délai dépassé") failReason = reason;
    cleanup();
  };

  const nextAttempt = (reason: string) => {
    if (started || stopped) return;
    failReason = reason;
    attempt += 1;
    if (attempt >= list.length || Date.now() - t0 > totalBudget) {
      fail(reason);
      return;
    }
    attemptStart = Date.now();
    sawActivity = false;
    playingStuckSince = 0;
    adNotified = false;
    autoplayBlocked = false;
    info.currentTime = undefined;
    info.playerState = undefined;
    showStatus("essai d'une autre version…");
    // A dead iframe cannot receive loadVideoById. Reload it for a real retry.
    connected = false;
    iframe.src = srcFor(list[attempt]);
  };

  const markStarted = () => {
    if (started || stopped) return;
    started = true;
    hint.remove();
    failReason = null;
    settle(true);
    dock.setTitle(title);
    command("setVolume", [target()]);
    const start = Date.now();
    if (o.duration > 0) {
      timers.push(setTimeout(() => handle.stop(3), o.duration * 1000));
      intervals.push(setInterval(() => dock.setProgress((Date.now() - start) / (o.duration * 1000)), 500));
    } else dock.setProgress(null);
  };

  const onMessage = (e: MessageEvent) => {
    if (!ORIGINS.has(e.origin) || e.source !== iframe.contentWindow) return;
    let data: { event?: string; info?: unknown } | null;
    try {
      data = typeof e.data === "string" ? (JSON.parse(e.data) as { event?: string; info?: unknown }) : (e.data as { event?: string; info?: unknown });
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    if (!connected) {
      connected = true;
      showStatus("chargement…");
      // Unlike infoDelivery, these events require an explicit subscription.
      for (const event of ["onReady", "onStateChange", "onError", "onAutoplayBlocked"]) {
        command("addEventListener", [event]);
      }
      prime();
    }
    if (data.event === "onReady") prime();
    if ((data.event === "initialDelivery" || data.event === "infoDelivery") && data.info && typeof data.info === "object") {
      Object.assign(info, data.info as YtInfo);
      const t = info.videoData?.title;
      if (t && t !== title) {
        title = t;
        if (!started) showStatus(null);
        else dock.setTitle(t);
      }
      if (info.playerState === 1 || info.playerState === 3) {
        sawActivity = true;
        if (typeof navigator !== "undefined" && navigator.onLine && failReason === "pas de connexion Internet") failReason = null;
      }
      // Real playback = "playing" AND the video clock moves (an ad keeps the video clock still).
      const clockOk = typeof info.currentTime === "number" && info.currentTime >= startAt + 0.3;
      if (info.playerState === 1 && clockOk) {
        playingStuckSince = 0;
        markStarted();
      } else if (info.playerState === 1 && !clockOk) {
        if (!playingStuckSince) playingStuckSince = Date.now();
        if (!adNotified && Date.now() - playingStuckSince > 2500) {
          adNotified = true;
          showStatus("publicité YouTube… la musique arrive");
        }
      } else if (info.playerState === 3) {
        showStatus("chargement…");
      }
      if (info.playerState === 0 && started) cleanup();
    } else if (data.event === "onStateChange") {
      info.playerState = Number(data.info);
      if (info.playerState === 1 || info.playerState === 3) sawActivity = true;
      if (info.playerState === 0 && started) cleanup();
    } else if (data.event === "onAutoplayBlocked") {
      autoplayBlocked = true;
      showStatus("cliquez sur ▶ dans la vidéo");
      hint.textContent = "Lecture automatique bloquée par le navigateur. Cliquez sur ▶ directement dans la vidéo.";
    } else if (data.event === "onError") {
      const code = Number(data.info);
      console.warn(`[musique] YouTube a refusé la lecture (vidéo ${attempt + 1}/${list.length}, code ${data.info})`);
      if (code === 153 || started) {
        fail(`lecture refusée par YouTube (${ERROR_FR[code] ?? `code ${code}`})`);
        return;
      }
      nextAttempt(ERROR_FR[code] ? `lecture refusée par YouTube (${ERROR_FR[code]})` : `lecture refusée par YouTube (code ${data.info})`);
    }
  };
  window.addEventListener("message", onMessage);
  const listen = () => post({ event: "listening" });
  iframe.addEventListener("load", listen);
  intervals.push(
    setInterval(() => {
      if (!connected && !stopped) listen();
    }, 250),
  );
  // Nudge playback: the first playVideo is sometimes swallowed (autoplay policies, focus).
  intervals.push(
    setInterval(() => {
      if (!started && !stopped && connected && !autoplayBlocked) command("playVideo");
    }, 1500),
  );
  // Watchdog: quiet attempt → next video quickly; alive attempt (ad…) → wait longer; total budget caps all.
  intervals.push(
    setInterval(() => {
      if (started || stopped) return;
      const now = Date.now();
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        showStatus("hors ligne…");
        if (now - t0 > totalBudget) fail("pas de connexion Internet");
        return;
      }
      if (now - t0 > totalBudget) {
        fail(autoplayBlocked ? "lecture automatique bloquée : cliquez sur ▶ dans la vidéo au prochain essai" : adNotified ? "publicité YouTube trop longue" : "délai dépassé");
        return;
      }
      const quietBudget = sawActivity ? ACTIVE_MS : QUIET_MS;
      if (!autoplayBlocked && now - attemptStart > quietBudget) {
        nextAttempt(adNotified ? "publicité YouTube trop longue" : sawActivity ? "démarrage bloqué" : "YouTube ne répond pas");
      }
    }, 500),
  );

  const handle: MusicHandle = {
    kind: "youtube",
    ready,
    getTitle: () => title,
    getFailReason: () => failReason,
    duck(on) {
      ducked = on;
      if (connected && !stopped && !fading) command("setVolume", [target()]);
    },
    release() {
      /* the duration timer ends the music */
    },
    stop(fade = 0.5) {
      if (stopped || fading) return;
      if (!started || fade <= 0) {
        cleanup();
        return;
      }
      fading = true;
      const from = target();
      const steps = Math.max(1, Math.round((fade * 1000) / 100));
      let i = 0;
      const t = setInterval(() => {
        i++;
        command("setVolume", [Math.max(0, Math.round(from * (1 - i / steps)))]);
        if (i >= steps) {
          clearInterval(t);
          command("pauseVideo");
          cleanup();
        }
      }, 100);
      intervals.push(t);
    },
  };
  return handle;
}
