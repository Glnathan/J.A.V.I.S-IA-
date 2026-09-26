"use client";

import {
  Activity,
  Download,
  Ear,
  EarOff,
  Eye,
  Film,
  ExternalLink,
  History,
  ListTodo,
  MessageSquare,
  Mic,
  MicOff,
  Plus,
  Power,
  Orbit,
  Send,
  Settings,
  Sparkles,
  Stethoscope,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import SpacePanel, { type SpaceVue } from "./SpacePanel";
import MediaPanel from "./MediaPanel";
import VisionPanel from "./VisionPanel";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import ArcReactor, { type OrbState } from "./ArcReactor";
import BootScreen, { type BootMusicKind } from "./BootScreen";
import ChatLog, { stripTags, type UIMessage } from "./ChatLog";
import HistoryDrawer from "./HistoryDrawer";
import HomePanel from "./HomePanel";
import MicDiagnostic from "./MicDiagnostic";
import Onboarding from "./Onboarding";
import ScreenSaver from "./ScreenSaver";
import SettingsModal, { type SettingsTab } from "./SettingsModal";
import TelemetryBanner from "./TelemetryBanner";
import { AICorePanel, AgendaPanel, Clock, MailsPanel, MemoryPanel, PythonPanel, SystemPanel, TasksPanel, TimersPanel, WeatherWidget, type Timer } from "./SidePanels";
import {
  browserInfo,
  captureErrorMessage,
  foldText,
  getRecognitionCtor,
  inIframe,
  micAllowedByPolicy,
  recognitionErrorMessage,
  setWakeWord,
  wakeRe,
  type SpeechRec,
} from "@/lib/client/recognition";
import { transcribe, VoiceCapture } from "@/lib/client/voice-capture";
import { duckActiveMusic, startBootMusic, stopActiveMusic, type MusicOptions } from "@/lib/client/boot-theme";
import { recognizeFrame } from "@/lib/client/vision-face";
import { verifyWav } from "@/lib/client/voice-print";
import { sfx } from "@/lib/client/sounds";
import type { ControlProposal } from "@/lib/types";
import { ElevenSpeaker, getVoices, pickVoice, Speaker } from "@/lib/client/speech";
import { parseYouTubeId, youTubeLabel } from "@/lib/youtube";
import type { ClientAction, ClientContext, MemoryItem, SettingsPayload, StoredMessage, StreamEvent, TaskItem, ThemeName } from "@/lib/types";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

type Status = "idle" | "listening" | "thinking" | "speaking";
type ListenMode = "off" | "ptt" | "wake";

interface Fns {
  send: (text: string, via?: "voice" | "text") => void;
  startRec: (mode: "ptt" | "wake") => boolean;
  tick: () => void;
  toggleListening: () => void;
  cancelAll: () => void;
  afterSpeech: () => void;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

const SUGGESTIONS = [
  "Quelle heure est-il ?",
  "Quel temps fait-il ?",
  "Mets un minuteur de 5 minutes",
  "Rappelle-moi de boire de l'eau dans 30 minutes",
  "Les actualités",
  "Raconte-moi une blague",
  "Diagnostic système",
  "Que sais-tu faire ?",
];

const MOBILE_TABS = [
  { id: "chat", label: "Assistant", Icon: MessageSquare },
  { id: "system", label: "Système", Icon: Activity },
  { id: "tasks", label: "Tâches", Icon: ListTodo },
] as const;

const TITLE_RE = /^(monsieur|madame|mademoiselle|maître|maitre|docteur|professeur|patron|patronne|chef|capitaine|commandant|colonel|agent|boss)/i;

function addressOf(p: SettingsPayload | null): { sir: string; Sir: string } {
  const name = p?.settings.userName?.trim() ?? "";
  if (p?.settings.addressBy === "name" && name) return { sir: name, Sir: name };
  const h = (p?.settings.honorific || "Monsieur").trim() || "Monsieur";
  return { sir: TITLE_RE.test(h) ? h.charAt(0).toLowerCase() + h.slice(1) : h, Sir: h.charAt(0).toUpperCase() + h.slice(1) };
}

/** Boot music configuration derived from the settings (falls back to the original theme). */
function musicSetup(p: SettingsPayload | null): { kind: BootMusicKind; label: string; options: MusicOptions } {
  const s = p?.settings;
  const file = p?.bootMusicFile ?? null;
  const url = s?.bootMusicUrl ?? "";
  const kind: BootMusicKind =
    s?.bootMusic === "off"
      ? "off"
      : s?.bootMusic === "custom" && file
        ? "custom"
        : s?.bootMusic === "youtube" && parseYouTubeId(url)
          ? "youtube"
          : "theme";
  const label =
    kind === "youtube" ? youTubeLabel(url) : kind === "custom" ? (file?.name ?? "").replace(/\.[a-z0-9]{2,4}$/i, "") || "Mon fichier audio" : "Thème J.A.R.V.I.S.";
  return {
    kind,
    label,
    options: {
      volume: s?.bootVolume ?? 0.8,
      version: file ? `${file.name}-${file.size}` : "",
      name: file?.name,
      url,
      start: s?.bootMusicStart ?? 0,
      duration: s?.bootMusicDuration ?? 30,
      title: label,
    },
  };
}

function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.round(total % 60);
  const parts: string[] = [];
  if (h) parts.push(`${h} heure${h > 1 ? "s" : ""}`);
  if (m) parts.push(`${m} minute${m > 1 ? "s" : ""}`);
  if (s && !h) parts.push(`${s} seconde${s > 1 ? "s" : ""}`);
  return parts.join(" et ") || "quelques secondes";
}

function notify(title: string, body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      new Notification(title, { body, icon: "/icons/icon-192.png" });
    }
  } catch {
    /* notifications unavailable */
  }
}

const JSON_HEADERS = { "Content-Type": "application/json" };

/** Facteur d'échelle de la dernière capture (pixels image → pixels écran). */
let lastGrabScale = 1;

/** Capture une image (JPEG ≤ 1280 px) depuis un flux vidéo (écran ou caméra). */
async function grabFrame(stream: MediaStream): Promise<string | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) resolve();
      else video.onloadeddata = () => resolve();
    });
    await new Promise((r) => setTimeout(r, 150));
    lastGrabScale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const scale = lastGrabScale;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  } finally {
    video.srcObject = null;
  }
}

export default function JarvisApp() {
  const [booted, setBooted] = useState(false);
  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [listenMode, setListenMode] = useState<ListenMode>("off");
  const [interim, setInterim] = useState("");
  const [input, setInput] = useState("");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [muted, setMuted] = useState(false);
  const [wakeMode, setWakeMode] = useState(false);
  const [theme, setTheme] = useState<ThemeName>("cyan");
  const [themeFlash, setThemeFlash] = useState(0);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [spaceVue, setSpaceVue] = useState<SpaceVue | null>(null);
  const [showMedia, setShowMedia] = useState(false);
  const [mobileTab, setMobileTab] = useState<"chat" | "system" | "tasks">("chat");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [micError, setMicError] = useState<string | null>(null);
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [awaiting, setAwaiting] = useState(false);
  const [hideAiHint, setHideAiHint] = useState(false);
  const [shutdown, setShutdown] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [showMicTest, setShowMicTest] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [homeKey, setHomeKey] = useState(0);
  const [iframeBlocked, setIframeBlocked] = useState(false);

  const levelRef = useRef(0);
  const speakerRef = useRef<Speaker | null>(null);
  const recRef = useRef<SpeechRec | null>(null);
  const listenRef = useRef<ListenMode>("off");
  const wakeRef = useRef(false);
  const mutedRef = useRef(false);
  const payloadRef = useRef<SettingsPayload | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const convRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timersRef = useRef<Timer[]>([]);
  const tasksRef = useRef<TaskItem[]>([]);
  const awaitingUntilRef = useRef(0);
  const statusRef = useRef<Status>("idle");
  const bootedRef = useRef(false);
  const baseThemeRef = useRef<ThemeName>("cyan");
  const themeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const meterRef = useRef<{ stream: MediaStream; ctx: AudioContext; raf: number } | null>(null);
  const meterWantedRef = useRef(false);
  const quickFailsRef = useRef(0);
  const captureRef = useRef<VoiceCapture | null>(null);
  const engineFailedRef = useRef(false);
  const micDiagnosticRef = useRef(false);
  const pttTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fns = useRef<Fns>({
    send: () => undefined,
    startRec: () => false,
    tick: () => undefined,
    toggleListening: () => undefined,
    cancelAll: () => undefined,
    afterSpeech: () => undefined,
  });

  // ─── Data loading ──────────────────────────────────────────────────────
  const loadSettings = useCallback(async (): Promise<SettingsPayload | null> => {
    try {
      const r = await fetch("/api/settings", { cache: "no-store" });
      if (!r.ok) return null;
      const p = (await r.json()) as SettingsPayload;
      payloadRef.current = p;
      setPayload(p);
      setWakeWord(p.settings.wakeCustom);
      return p;
    } catch {
      return null;
    }
  }, []);

  const loadTasks = useCallback(async () => {
    try {
      const r = await fetch("/api/tasks", { cache: "no-store" });
      if (!r.ok) return;
      const t = (await r.json()) as TaskItem[];
      tasksRef.current = t;
      setTasks(t);
    } catch {
      /* offline */
    }
  }, []);

  const loadMemories = useCallback(async () => {
    try {
      const r = await fetch("/api/memories", { cache: "no-store" });
      if (r.ok) setMemories((await r.json()) as MemoryItem[]);
    } catch {
      /* offline */
    }
  }, []);

  const saveSettings = async (patch: Record<string, unknown>) => {
    try {
      const r = await fetch("/api/settings", { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(patch) });
      if (r.ok) {
        const p = (await r.json()) as SettingsPayload;
        payloadRef.current = p;
        setPayload(p);
        setWakeWord(p.settings.wakeCustom);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void loadSettings().then((p) => {
      if (p) {
        mutedRef.current = !p.settings.autoSpeak;
        setMuted(!p.settings.autoSpeak);
      }
    });
    void loadTasks();
    void loadMemories();
    try {
      setHideAiHint(localStorage.getItem("jarvis-hide-ai-hint") === "1");
    } catch {
      /* storage unavailable */
    }
    setAutoStart(new URLSearchParams(window.location.search).get("autostart") === "1");
    setIframeBlocked(inIframe() && micAllowedByPolicy() !== true);
    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    const poll = setInterval(() => {
      if (!document.hidden) void loadTasks();
    }, 60000);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
      clearInterval(poll);
    };
  }, [loadSettings, loadTasks, loadMemories]);

  useEffect(() => {
    statusRef.current = status;
    // The music (Thunderstruck…) is lowered while JARVIS speaks or listens.
    duckActiveMusic(status === "speaking" || status === "listening");
  }, [status]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // ─── Speech output ─────────────────────────────────────────────────────
  const pauseRecognitionForSpeech = () => {
    if (captureRef.current && captureRef.current.mode === "continuous") captureRef.current.paused = true;
    if (listenRef.current === "wake" && recRef.current) {
      const r = recRef.current;
      recRef.current = null;
      r.onend = null;
      r.onresult = null;
      r.onerror = null;
      r.onstart = null;
      try {
        r.abort();
      } catch {
        /* ignore */
      }
    }
  };

  const speak = (text: string) => {
    const sp = speakerRef.current;
    if (!sp || mutedRef.current || !text.trim()) return;
    const p = payloadRef.current?.settings;
    pauseRecognitionForSpeech();
    sp.speak(text, { voice: pickVoice(voicesRef.current, p?.voiceName), rate: p?.voiceRate ?? 1.05, pitch: p?.voicePitch ?? 0.9 });
  };

  const afterSpeech = () => {
    if (awaitingUntilRef.current > Date.now()) awaitingUntilRef.current = Date.now() + 7000;
    const cap = captureRef.current;
    if (cap && cap.mode === "continuous") {
      setTimeout(() => {
        if (captureRef.current === cap && !speakerRef.current?.speaking) cap.paused = false;
      }, 350);
      return;
    }
    if (wakeRef.current && !recRef.current && statusRef.current !== "thinking") {
      setTimeout(() => {
        if (wakeRef.current && !recRef.current && !speakerRef.current?.speaking) fns.current.startRec("wake");
      }, 350);
    }
  };

  // ─── Speech recognition ────────────────────────────────────────────────
  const stopRecognition = () => {
    stopWhisper();
    const r = recRef.current;
    recRef.current = null;
    listenRef.current = "off";
    setListenMode("off");
    if (r) {
      r.onend = null;
      r.onresult = null;
      r.onerror = null;
      r.onstart = null;
      try {
        r.abort();
      } catch {
        /* ignore */
      }
    }
  };

  // ─── Veille faciale (Premium) : la caméra n'est utilisée qu'une à deux
  // secondes au moment du mot « Jarvis », puis relâchée aussitôt — elle reste
  // disponible pour vos autres applications (Deezer, Discord, OBS…).
  const faceGateNoticeRef = useRef(0);
  const voiceGateNoticeRef = useRef(0);
  /** Visage pré-chauffé pendant la transcription (résultat réutilisé par handleWake). */
  const pendingFaceRef = useRef<Promise<string | false | null> | null>(null);

  /** Action d'écran en attente de confirmation (prise de contrôle, Premium). */
  const pendingControlRef = useRef<ControlProposal | null>(null);

  const executeControl = async (proposal: ControlProposal, scale: number): Promise<void> => {
    // Les coordonnées de l'IA sont en pixels de l'image capturée : conversion écran.
    const action = { ...proposal };
    if ((action.kind === "click" || action.kind === "dblclick") && typeof action.x === "number" && typeof action.y === "number") {
      action.x = Math.round(action.x / (scale || 1));
      action.y = Math.round(action.y / (scale || 1));
    }
    try {
      const r = await fetch("/api/control", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ action }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (r.ok && j.ok) sfx.success();
      else pushNotice(j.error ?? "L'action a échoué.");
    } catch {
      pushNotice("Le serveur ne répond pas — action non exécutée.");
    }
  };

  /** Conversation libre (Premium) : sans mot d'activation jusqu'à silence ou « merci ». */
  const converseUntilRef = useRef(0);
  const converseLastAtRef = useRef(0);
  const converseActive = () => Date.now() < converseUntilRef.current;
  const visionGateActive = () =>
    Boolean(payloadRef.current?.settings.visionGate && payloadRef.current?.settings.visionFace && wakeRef.current);

  /** Vérification du visage à la demande (caméra ouverte brièvement, puis relâchée).
   *  Renvoie le nom reconnu, false si aucun visage inscrit ne correspond, null si impossible. */
  const checkFaceNow = async (): Promise<string | false | null> => {
    const faces = payloadRef.current?.settings.visionFace ?? null;
    if (!faces || !faces.length) return null;
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } } });
      video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      await new Promise((r) => setTimeout(r, 700)); // laisser la caméra s'ajuster
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext("2d")?.drawImage(video, 0, 0, 320, 240);
      const r = await recognizeFrame(canvas, faces);
      return r.status === "recognized" ? r.name : false;
    } catch {
      return null; // caméra occupée ou refusée : vérification impossible
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      if (video) video.srcObject = null;
    }
  };

  const handleWake = async (interimText: string, finalText: string, voiceVerified = false) => {
    if (voiceGateActive() && !voiceVerified) return;
    const now = Date.now();
    const awaitingNow = now < awaitingUntilRef.current;
    if (interimText && (awaitingNow || wakeRe().test(foldText(interimText)))) {
      setInterim(interimText);
      setStatus((s) => (s === "idle" ? "listening" : s));
    }
    const text = finalText.trim();
    if (!text) return;
    // Conversation libre : la phrase est une commande directe (déjà vérifiée par le verrou vocal).
    if (converseActive() && voiceGateActive() && voiceVerified) {
      converseLastAtRef.current = Date.now();
      const spoken = finalText.trim();
      if (/^(c est (tout|fini)|merci|fin de (la )?conversation|stop|arrete la conversation)\b/.test(foldText(spoken).replace(/[’']/g, " "))) {
        converseUntilRef.current = 0;
        setInterim("");
        sfx.success();
        return;
      }
      if (spoken.length > 1) {
        setInterim("");
        awaitingUntilRef.current = 0;
        fns.current.send(spoken, "voice");
      }
      return;
    }
    const m = wakeRe().exec(foldText(finalText));
    if (m) {
      // Veille faciale : une brève vérification du visage au moment du mot
      // d'activation (la caméra est ouverte puis relâchée immédiatement).
      let faceName: string | null = null;
      if (visionGateActive()) {
        setStatus("thinking");
        const pending = pendingFaceRef.current;
        const faceOk = pending ? await pending : await checkFaceNow();
        setStatus((s) => (s === "thinking" ? "idle" : s));
        if (!faceOk) {
          if (now - faceGateNoticeRef.current > 60000) {
            faceGateNoticeRef.current = now;
            pushNotice(faceOk === null
              ? "Vérification du visage impossible — commande ignorée. Vérifiez l'accès à la caméra dans Paramètres → Voix & micro."
              : "Mot « Jarvis » entendu sans visage reconnu — ignoré. (Veille faciale active : Paramètres → Voix & micro)");
          }
          setInterim("");
          return;
        }
        if (typeof faceOk === "string") faceName = faceOk;
      }
      const after = finalText.slice(m.index + m[0].length).replace(/^[\s,.!?;:-]+/, "").trim();
      const before = finalText.slice(0, m.index).replace(/[\s,.!?;:-]+$/, "").trim();
      setInterim("");
      const command = after.length > 1 ? after : before.length > 2 ? before : "";
      if (command) {
        awaitingUntilRef.current = 0;
        setAwaiting(false);
        fns.current.send(command, "voice");
      } else {
        awaitingUntilRef.current = now + 8000;
        setAwaiting(true);
        setStatus("listening");
        sfx.wake();
        // Salutation personnalisée : le visage reconnu salue par son nom.
        const { sir } = addressOf(payloadRef.current);
        const who = faceName ?? sir;
        speak(pick([`Oui, ${who} ?`, "Je vous écoute.", `À votre service, ${who}.`]));
      }
    } else if (awaitingNow) {
      awaitingUntilRef.current = 0;
      setAwaiting(false);
      setInterim("");
      fns.current.send(text, "voice");
    } else {
      setInterim("");
      setStatus((s) => (s === "listening" ? "idle" : s));
    }
  };

  const errCtx = () => {
    const b = browserInfo();
    return { iframe: inIframe(), brave: b.brave, edge: b.edge, whisper: Boolean(payloadRef.current?.stt.available) };
  };

  /** Verrou vocal (Premium) : la voix de chaque phrase est vérifiée en écoute permanente. */
  const voiceGateActive = () =>
    Boolean(payloadRef.current?.settings.voiceGate && payloadRef.current?.settings.premiumActive);

  /** "browser" = Web Speech API (Chrome/Edge) ; "whisper" = server-side transcription (all browsers). */
  const currentEngine = (mode: "ptt" | "wake" = "ptt"): "browser" | "whisper" => {
    const p = payloadRef.current;
    // Verrou vocal : il faut l'audio des phrases, seul Whisper (cloud ou local) le fournit.
    if (mode === "wake" && voiceGateActive() && p?.stt.available) return "whisper";
    const pref = p?.settings.sttEngine ?? "auto";
    const whisperOk = Boolean(p?.stt.available);
    if (pref === "whisper" || pref === "local") return whisperOk ? "whisper" : "browser";
    if (pref === "browser" || !whisperOk) return "browser";
    return engineFailedRef.current || !getRecognitionCtor() || browserInfo().brave ? "whisper" : "browser";
  };

  const stopWhisper = () => {
    if (pttTimerRef.current) clearTimeout(pttTimerRef.current);
    pttTimerRef.current = null;
    const cap = captureRef.current;
    if (!cap) return;
    captureRef.current = null;
    cap.stop();
    if (listenRef.current !== "off") {
      listenRef.current = "off";
      setListenMode("off");
    }
  };

  const handleSegment = async (wav: Blob, mode: "ptt" | "wake") => {
    if (mode === "ptt") {
      stopWhisper();
      setInterim("Transcription…");
      setStatus("thinking");
    }
    try {
      let voiceVerified = false;
      // Verrou vocal : la voix est vérifiée AVANT la transcription — l'audio qui
      // n'est pas le vôtre (télévision, invités) ne quitte jamais votre PC.
      if (mode === "wake" && voiceGateActive()) {
        const mine = await verifyWav(wav, payloadRef.current?.settings.voicePrint ?? null);
        const now = Date.now();
        if (mine !== true) {
          if (now - voiceGateNoticeRef.current > 60000) {
            voiceGateNoticeRef.current = now;
            pushNotice(mine === null
              ? "Vérification vocale indisponible — commande ignorée. Vérifiez votre empreinte vocale et le chargement du modèle dans Paramètres → Voix & micro."
              : "Voix non reconnue — ignorée. (Verrou vocal actif : Paramètres → Voix & micro)");
          }
          return;
        }
        voiceVerified = true;
        // C'est bien vous : le contrôle du visage démarre dès maintenant, en
        // parallèle de la transcription (la caméra est locale, rien n'est envoyé).
        if (payloadRef.current?.settings.visionGate && payloadRef.current?.settings.visionFace && wakeRef.current) {
          const faceP = checkFaceNow();
          pendingFaceRef.current = faceP;
          faceP.finally(() => {
            setTimeout(() => { if (pendingFaceRef.current === faceP) pendingFaceRef.current = null; }, 1500);
          }).catch(() => undefined);
        }
      }
      const { text, suspect } = await transcribe(wav);
      if (mode === "ptt") {
        setInterim("");
        if (!text || (suspect && text.length < 4)) {
          setStatus((st) => (st === "thinking" ? "idle" : st));
          setMicError(recognitionErrorMessage("no-speech", errCtx()));
          return;
        }
        void sendMessage(text, "voice");
      } else if (text && (!suspect || (voiceVerified && converseActive() && /^merci(?: beaucoup)?[.!?\s]*$/i.test(text.trim())))) {
        await handleWake("", text, voiceVerified);
      }
    } catch (err) {
      setInterim("");
      if (mode === "ptt") setStatus((st) => (st === "thinking" ? "idle" : st));
      setMicError(err instanceof Error ? err.message : "Transcription impossible.");
    }
  };

  const startWhisper = async (mode: "ptt" | "wake") => {
    stopWhisper();
    if (recRef.current) {
      const old = recRef.current;
      recRef.current = null;
      old.onend = null;
      old.onresult = null;
      old.onerror = null;
      try {
        old.abort();
      } catch {
        /* ignore */
      }
    }
    const single = mode === "ptt";
    const cap = new VoiceCapture({
      silenceMs: single ? 1100 : 650,
      maxMs: single ? 15000 : 9000,
      minSpeechMs: single ? 200 : 300,
      onLevel: (l) => {
        if (captureRef.current === cap) levelRef.current = Math.max(levelRef.current * 0.7, l);
      },
      onSpeechStart: () => {
        if (single) setInterim("…");
      },
      onSegment: (wav) => void handleSegment(wav, mode),
    });
    captureRef.current = cap;
    listenRef.current = mode;
    setListenMode(mode);
    try {
      await cap.start(single ? "single" : "continuous");
    } catch (err) {
      cap.stop();
      if (captureRef.current !== cap) return;
      captureRef.current = null;
      listenRef.current = "off";
      setListenMode("off");
      setInterim("");
      setStatus((st) => (st === "listening" ? "idle" : st));
      setMicError(captureErrorMessage(err, inIframe()));
      if (!single) {
        wakeRef.current = false;
        setWakeMode(false);
      }
      return;
    }
    // A second click or a panel may have cancelled this pending permission request.
    if (captureRef.current !== cap) { cap.stop(); return; }
    if (single) {
      pttTimerRef.current = setTimeout(() => {
        if (captureRef.current === cap && !cap.hasSpeech) {
          stopWhisper();
          setInterim("");
          setStatus((st) => (st === "listening" ? "idle" : st));
          setMicError(recognitionErrorMessage("no-speech", errCtx()));
        }
      }, 8000);
    } else if (speakerRef.current?.speaking) cap.paused = true;
  };

  // Réservation du micro (inscription/test de voix) : plus rien ne peut réarmer l'écoute.
  const micReservedRef = useRef(false);

  const startRecognition = (mode: "ptt" | "wake"): boolean => {
    if (micDiagnosticRef.current || micReservedRef.current) return false;
    if (mode === "wake" && voiceGateActive() && !payloadRef.current?.stt.available) {
      stopRecognition();
      converseUntilRef.current = 0;
      setMicError("Le verrou vocal nécessite Whisper. Configurez-le dans Paramètres → Voix & micro pour reprendre l'écoute protégée.");
      return false;
    }
    if (currentEngine(mode) === "whisper") {
      void startWhisper(mode);
      return true;
    }
    return startBrowserRecognition(mode);
  };

  const startBrowserRecognition = (mode: "ptt" | "wake"): boolean => {
    stopWhisper();
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setMicError(
        "La reconnaissance vocale n'est pas disponible dans ce navigateur. Utilisez Google Chrome ou Microsoft Edge, ou activez le moteur Whisper (Paramètres → Voix & micro). Vous pouvez toujours écrire vos demandes.",
      );
      return false;
    }
    if (recRef.current) {
      const old = recRef.current;
      recRef.current = null;
      old.onend = null;
      old.onresult = null;
      old.onerror = null;
      old.onstart = null;
      try {
        old.abort();
      } catch {
        /* ignore */
      }
    }
    const r = new Ctor();
    r.lang = "fr-FR";
    r.continuous = mode === "wake";
    r.interimResults = true;
    r.maxAlternatives = 1;
    recRef.current = r;
    listenRef.current = mode;
    setListenMode(mode);
    const startedAt = Date.now();
    let hadResult = false;
    let hadError = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const clearWatchdog = () => { if (watchdog) clearTimeout(watchdog); };
    const timeout = (code: string) => {
      if (recRef.current !== r) return;
      r.onerror?.({ error: code });
      try { r.abort(); } catch { /* already ended */ }
    };
    r.onstart = () => {
      clearWatchdog();
      if (mode === "ptt") watchdog = setTimeout(() => timeout("no-speech"), 15000);
    };

    r.onsoundstart = () => {
      levelRef.current = Math.max(levelRef.current, 0.45);
    };
    r.onspeechstart = () => {
      levelRef.current = Math.max(levelRef.current, 0.75);
    };
    r.onresult = (e) => {
      if (recRef.current !== r) return;
      hadResult = true;
      levelRef.current = 0.9;
      let interimText = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = res[0]?.transcript ?? "";
        if (res.isFinal) finalText += t;
        else interimText += t;
      }
      if (listenRef.current === "ptt") {
        setInterim(interimText || finalText);
        if (finalText.trim()) {
          clearWatchdog();
          const text = finalText.trim();
          setInterim("");
          recRef.current = null;
          r.onend = null;
          r.onresult = null;
          try {
            r.stop();
          } catch {
            /* ignore */
          }
          listenRef.current = "off";
          setListenMode("off");
          fns.current.send(text, "voice");
        }
      } else handleWake(interimText, finalText);
    };

    r.onerror = (e) => {
      if (recRef.current !== r) return;
      clearWatchdog();
      hadError = true;
      const code = e.error;
      if (code === "aborted") return;
      if (code === "no-speech") {
        if (mode === "ptt") setMicError(recognitionErrorMessage("no-speech", errCtx()));
        return;
      }
      const ctx = errCtx();
      const switchable = code === "network" || code === "service-not-allowed" || code === "language-not-supported" || code === "start-timeout";
      if (switchable && ctx.whisper && (payloadRef.current?.settings.sttEngine ?? "auto") === "auto") {
        engineFailedRef.current = true;
        setMicError(`${recognitionErrorMessage(code, ctx)} Je bascule sur le moteur Whisper.`);
        r.onend = null;
        r.onresult = null;
        r.onerror = null;
        r.onstart = null;
        try { r.abort(); } catch { /* already ended */ }
        // Keep ownership until the deferred handoff, so a cancel prevents a restart.
        listenRef.current = "off";
        setListenMode("off");
        setTimeout(() => {
          if (recRef.current !== r || (mode === "wake" && !wakeRef.current)) return;
          void startWhisper(mode);
        }, 250);
        return;
      }
      setMicError(recognitionErrorMessage(code, ctx));
      if (switchable || code === "not-allowed" || code === "audio-capture") {
        wakeRef.current = false;
        setWakeMode(false);
        listenRef.current = "off";
        setListenMode("off");
        setStatus((st) => (st === "listening" ? "idle" : st));
      }
    };

    r.onend = () => {
      clearWatchdog();
      if (recRef.current !== r) return;
      recRef.current = null;
      if (mode === "ptt" && !hadResult && !hadError) setMicError(recognitionErrorMessage("no-speech", errCtx()));
      if (listenRef.current === "wake" && wakeRef.current) {
        quickFailsRef.current = Date.now() - startedAt < 1500 ? quickFailsRef.current + 1 : 0;
        if (quickFailsRef.current >= 6) {
          quickFailsRef.current = 0;
          wakeRef.current = false;
          setWakeMode(false);
          listenRef.current = "off";
          setListenMode("off");
          setMicError("L'écoute permanente s'interrompt sans cesse (micro ou réseau indisponible). Elle a été désactivée.");
          return;
        }
        setTimeout(() => {
          if (wakeRef.current && !recRef.current && !speakerRef.current?.speaking) fns.current.startRec("wake");
        }, 300);
      } else {
        listenRef.current = "off";
        setListenMode("off");
        setInterim("");
        setStatus((s) => (s === "listening" ? "idle" : s));
        if (wakeRef.current) {
          setTimeout(() => {
            if (wakeRef.current && !recRef.current && !speakerRef.current?.speaking && statusRef.current !== "thinking") fns.current.startRec("wake");
          }, 500);
        }
      }
    };

    try {
      watchdog = setTimeout(() => timeout("start-timeout"), 10000);
      r.start();
      return true;
    } catch {
      clearWatchdog();
      recRef.current = null;
      listenRef.current = "off";
      setListenMode("off");
      setMicError(recognitionErrorMessage("start-failed", errCtx()));
      return false;
    }
  };

  const toggleListening = () => {
    sfx.unlock();
    if (listenRef.current === "ptt") {
      const cap = captureRef.current;
      if (cap && cap.mode === "single" && cap.flush()) return;
      stopRecognition();
      sfx.stop();
      setInterim("");
      setStatus((s) => (s === "listening" ? "idle" : s));
      if (wakeRef.current) setTimeout(() => fns.current.startRec("wake"), 400);
      return;
    }
    speakerRef.current?.cancel();
    setMicError(null);
    if (startRecognition("ptt")) {
      sfx.listen();
      setStatus("listening");
    }
  };

  const setWake = (enabled: boolean, persist = true) => {
    wakeRef.current = enabled;
    setWakeMode(enabled);
    if (persist) void saveSettings({ wakeWord: enabled });
    if (enabled) {
      setMicError(null);
      quickFailsRef.current = 0;
      if (!recRef.current && !speakerRef.current?.speaking) startRecognition("wake");
    } else {
      converseUntilRef.current = 0;
      if (listenRef.current === "wake") stopRecognition();
      awaitingUntilRef.current = 0;
      setAwaiting(false);
      setInterim("");
      setStatus((s) => (s === "listening" ? "idle" : s));
    }
  };

  const setMute = (m: boolean, persist: boolean, cancelNow: boolean) => {
    mutedRef.current = m;
    setMuted(m);
    if (m && cancelNow) speakerRef.current?.cancel();
    if (persist) void saveSettings({ autoSpeak: !m });
  };

  // ─── Timers, themes & actions ──────────────────────────────────────────
  const pushNotice = (text: string) => setMessages((m) => [...m, { id: uid(), role: "notice", content: text, createdAt: Date.now() }]);

  const addTimer = (seconds: number, label: string) => {
    const t: Timer = { id: uid(), label, endsAt: Date.now() + seconds * 1000, total: seconds };
    timersRef.current = [...timersRef.current, t];
    setTimers(timersRef.current);
  };

  const cancelTimer = (id: string) => {
    timersRef.current = timersRef.current.filter((t) => t.id !== id);
    setTimers(timersRef.current);
  };

  // Viseur HUD (Iron Man) : suit le curseur ; parallaxe des couches de fond avec la souris.
  const reticleRef = useRef<HTMLDivElement | null>(null);
  // Licence Premium : renouvellement silencieux quand le jeton approche de son
  // expiration (60 jours), tant qu'une clé est enregistrée et Internet disponible.
  useEffect(() => {
    const exp = payload?.settings.premiumExpires;
    if (!exp || !payload.settings.premiumActive) return;
    const msLeft = new Date(exp).getTime() - Date.now();
    if (msLeft > 60 * 24 * 3600 * 1000) return;
    let done = false;
    const renew = () => {
      if (done) return;
      done = true;
      void fetch("/api/premium", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({}) })
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => {
          if (p?.settings?.premiumActive) {
            payloadRef.current = p as SettingsPayload;
            setPayload(p as SettingsPayload);
          }
        })
        .catch(() => undefined);
    };
    const id = setTimeout(renew, 15000); // laisser le serveur démarrer tranquillement
    return () => {
      clearTimeout(id);
    };
  }, [payload?.settings.premiumExpires, payload?.settings.premiumActive]);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const root = document.documentElement;
      root.style.setProperty("--mx", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
      root.style.setProperty("--my", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      if (reticleRef.current) reticleRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px) rotate(45deg)`;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const applyTheme = (t: ThemeName, duration?: number) => {
    if (themeTimerRef.current) clearTimeout(themeTimerRef.current);
    themeTimerRef.current = null;
    if (t !== "party") baseThemeRef.current = t;
    setTheme(t);
    setThemeFlash((n) => n + 1);
    if (t === "party") themeTimerRef.current = setTimeout(() => setTheme(baseThemeRef.current), duration ?? 30000);
  };

  const runActions = (actions: ClientAction[], botId: string) => {
    for (const a of actions) {
      switch (a.type) {
        case "open": {
          // Version PC : ouverture native par le serveur — le bloqueur de pop-ups
          // du navigateur ne bloque plus les commandes vocales. Repli fenêtre sinon.
          void (async () => {
            if (payloadRef.current?.desktop.enabled) {
              try {
                const r = await fetch("/api/open", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ url: a.url }) });
                if (r.ok) return;
              } catch {
                /* repli ci-dessous */
              }
            }
            let w: Window | null = null;
            try {
              w = window.open(a.url, "_blank");
            } catch {
              w = null;
            }
            if (w) {
              try {
                w.opener = null;
              } catch {
                /* ignore */
              }
            } else {
              const entry = { label: a.label, url: a.url };
              setMessages((ms) => ms.map((m) => (m.id === botId ? { ...m, blocked: [...(m.blocked ?? []), entry] } : m)));
            }
          })();
          break;
        }
        case "timer":
          addTimer(a.seconds, a.label);
          break;
        case "stop_timers":
          timersRef.current = [];
          setTimers([]);
          break;
        case "refresh":
          if (a.target === "home" || a.target === "all") setHomeKey((k) => k + 1);
          if (a.target === "tasks" || a.target === "all") void loadTasks();
          if (a.target === "memories" || a.target === "all") void loadMemories();
          if (a.target === "settings" || a.target === "all") void loadSettings();
          break;
        case "clear_chat":
          setMessages((ms) => ms.filter((m) => m.id === botId));
          convRef.current = null;
          setConversationId(null);
          break;
        case "set_wake":
          setWake(a.enabled);
          break;
        case "mute":
          setMute(a.muted, true, false);
          break;
        case "theme":
          applyTheme(a.theme, a.duration);
          break;
        case "stop_speech":
          speakerRef.current?.cancel();
          break;
        case "sound":
          if (a.name === "theme") startBootMusic("theme", { volume: payloadRef.current?.settings.bootVolume ?? 0.8 });
          else sfx[a.name]();
          break;
        case "espace":
          setSpaceVue(a.vue === "satellites" ? "satellites" : "systeme");
          break;
        case "media":
          setShowMedia(true);
          break;
        case "converse":
          if (a.on) {
            if (!voiceGateActive() || !payloadRef.current?.settings.voicePrint || !payloadRef.current?.stt.available) {
              pushNotice("La conversation libre nécessite une voix inscrite, le verrou vocal et Whisper disponible.");
              break;
            }
            converseUntilRef.current = Date.now() + 10 * 60 * 1000;
            converseLastAtRef.current = Date.now();
            setAwaiting(false);
            awaitingUntilRef.current = 0;
            if (!wakeRef.current) setWake(true);
          } else {
            converseUntilRef.current = 0;
            setInterim("");
          }
          break;
        case "control-propose":
          pendingControlRef.current = a.action;
          pushNotice(`Proposition : ${a.description}. Dites « oui, exécute » pour valider, ou « annule ».`);
          break;
        case "control-confirm":
          void (async () => {
            const p = pendingControlRef.current;
            pendingControlRef.current = null;
            if (!p) {
              pushNotice("Je n'ai rien à confirmer.");
              return;
            }
            await executeControl(p, lastGrabScale);
          })();
          break;
        case "control-cancel":
          if (pendingControlRef.current) pushNotice("Action annulée.");
          pendingControlRef.current = null;
          break;
        case "vision":
          if (a.target === "panel") setShowVision(true);
          else if (a.target === "close") setShowVision(false);
          else if (a.target === "screen") {
            void (async () => {
              pushNotice("Capture de votre écran…");
              const img = await captureScreen();
              if (!img) {
                pushNotice("Capture refusée ou impossible — autorisez le partage d'écran si demandé.");
                return;
              }
              const prompt = a.instruction?.trim()
                ? `L'utilisateur demande : « ${a.instruction} ». Voici la capture de son écran. Réponds en français ; si tu peux agir sur l'écran, propose-le avec la balise [[CLIC:x,y]] (coordonnées en pixels de CETTE image), [[TEXTE:…]] ou [[TOUCHE:…]], et demande sa confirmation.`
                : "Voici une capture de mon écran. Décris précisément ce que tu vois, en français.";
              void sendMessage(prompt, "text", img);
            })();
          } else if (a.target === "camera") {
            void (async () => {
              pushNotice("Capture de la caméra…");
              const img = await captureCamera();
              if (!img) {
                pushNotice("Caméra indisponible ou refusée.");
                return;
              }
              void sendMessage("Voici une image de ma caméra. Décris précisément ce que tu vois, en français.", "text", img);
            })();
          }
          break;
        case "play_music": {
          const setup = musicSetup(payloadRef.current);
          if (a.kind === "youtube" && a.url) {
            startBootMusic("youtube", { ...setup.options, url: a.url, start: 0, duration: 0, title: a.title ?? youTubeLabel(a.url) });
          } else startBootMusic(setup.kind === "off" ? "theme" : setup.kind, setup.options);
          break;
        }
        case "stop_music":
          stopActiveMusic(0.6);
          break;
        case "quit": {
          const askedAt = Date.now();
          const waitThenQuit = () => {
            if (speakerRef.current?.speaking && Date.now() - askedAt < 8000) setTimeout(waitThenQuit, 300);
            else void quitApp(false);
          };
          setTimeout(waitThenQuit, 600);
          break;
        }
      }
    }
  };

  const clientContext = async (): Promise<ClientContext> => {
    let battery: ClientContext["battery"] = null;
    try {
      const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
      if (nav.getBattery) {
        const b = await nav.getBattery();
        battery = { level: Math.round(b.level * 100), charging: b.charging };
      }
    } catch {
      /* no battery api */
    }
    return {
      now: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      tzOffset: new Date().getTimezoneOffset(),
      battery,
      online: navigator.onLine,
      cores: navigator.hardwareConcurrency,
      memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      userAgent: navigator.userAgent,
      timers: timersRef.current.map((t) => ({ label: t.label, remaining: Math.max(0, Math.round((t.endsAt - Date.now()) / 1000)) })),
    };
  };

  // ─── Conversation ──────────────────────────────────────────────────────
  // ─── Vision : captures d'écran et de caméra (édition Premium) ──────────
  const [showVision, setShowVision] = useState(false);
  /** Fournisseur d'image du panneau Vision ouvert (la trame courante de la caméra). */
  const visionFrameRef = useRef<(() => string | null) | null>(null);

  const captureScreen = async (): Promise<string | null> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const img = await grabFrame(stream);
      stream.getTracks().forEach((t) => t.stop());
      return img;
    } catch {
      return null;
    }
  };

  const captureCamera = async (): Promise<string | null> => {
    const fromPanel = visionFrameRef.current?.();
    if (fromPanel) return fromPanel;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      const img = await grabFrame(stream);
      stream.getTracks().forEach((t) => t.stop());
      return img;
    } catch {
      return null;
    }
  };

  const sendMessage = async (raw: string, via: "voice" | "text" = "text", image?: string) => {
    const text = raw.trim();
    if (!text) return;
    if (/^(stop|arr[êe]te|tais[- ]toi|silence|chut|ça suffit|ca suffit)[.!\s]*$/i.test(text) && speakerRef.current?.speaking) {
      speakerRef.current.cancel();
      return;
    }
    speakerRef.current?.cancel();
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setMobileTab("chat");
    const botId = uid();
    setMessages((m) => [
      ...m,
      { id: uid(), role: "user", content: text, createdAt: Date.now(), via },
      { id: botId, role: "assistant", content: "", pending: true, createdAt: Date.now() },
    ]);
    statusRef.current = "thinking";
    setStatus("thinking");
    sfx.send();

    const patchBot = (patch: Partial<UIMessage>) => setMessages((ms) => ms.map((m) => (m.id === botId ? { ...m, ...patch } : m)));
    let full = "";
    let spokenUpTo = 0;
    const actions: ClientAction[] = [];
    const speakProgress = (flush: boolean) => {
      if (mutedRef.current) return;
      const visible = stripTags(full);
      const rest = visible.slice(spokenUpTo);
      if (!rest.trim()) return;
      let cut = -1;
      if (flush) cut = rest.length;
      else {
        const re = /[.!?…](?=\s)|\n/g;
        let mm: RegExpExecArray | null;
        while ((mm = re.exec(rest))) cut = mm.index + 1;
      }
      if (cut > 0) {
        const chunk = rest.slice(0, cut);
        spokenUpTo += cut;
        speak(chunk);
      }
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ message: text, conversationId: convRef.current, client: await clientContext(), image }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        let msg = `Erreur serveur (${res.status})`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* not json */
        }
        throw new Error(msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const handle = (ev: StreamEvent) => {
        switch (ev.type) {
          case "meta":
            convRef.current = ev.conversationId;
            setConversationId(ev.conversationId);
            patchBot({ source: ev.source, provider: ev.provider });
            break;
          case "delta":
            full += ev.text;
            patchBot({ content: full });
            speakProgress(false);
            break;
          case "cards":
            patchBot({ cards: ev.cards });
            break;
          case "actions":
            actions.push(...ev.actions);
            break;
          case "final":
            full = ev.text;
            patchBot({ content: ev.text, pending: false });
            break;
          case "error":
            throw new Error(ev.message);
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (line) handle(JSON.parse(line) as StreamEvent);
        }
      }
      if (buf.trim()) handle(JSON.parse(buf) as StreamEvent);
      patchBot({ pending: false });
      speakProgress(true);
      runActions(actions, botId);
    } catch (err) {
      if (!ac.signal.aborted) {
        const { sir } = addressOf(payloadRef.current);
        const msg = err instanceof Error ? err.message : "Erreur inconnue";
        patchBot({ content: `Je rencontre une difficulté technique, ${sir}. ${msg}`, pending: false, error: true });
        sfx.error();
      } else patchBot({ pending: false });
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      if (!ac.signal.aborted) {
        const speaking = Boolean(speakerRef.current?.speaking);
        statusRef.current = speaking ? "speaking" : "idle";
        setStatus((s) => (s === "thinking" ? (speaking ? "speaking" : "idle") : s));
        if (!speaking) afterSpeech();
      }
    }
  };

  const newConversation = () => {
    abortRef.current?.abort();
    speakerRef.current?.cancel();
    convRef.current = null;
    setConversationId(null);
    setMessages([]);
    setMobileTab("chat");
    setStatus("idle");
  };

  const openConversation = async (id: number) => {
    try {
      const r = await fetch(`/api/conversations/${id}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { messages: StoredMessage[] };
      const ms: UIMessage[] = j.messages.map((m) => ({
        id: `db-${m.id}`,
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
        source: m.source ?? undefined,
        provider: m.meta?.provider,
        cards: m.meta?.cards,
        createdAt: Date.parse(m.createdAt),
        instant: true,
      }));
      abortRef.current?.abort();
      speakerRef.current?.cancel();
      convRef.current = id;
      setConversationId(id);
      setMessages(ms);
      setShowHistory(false);
      setMobileTab("chat");
      setStatus("idle");
    } catch {
      /* ignore */
    }
  };

  // ─── Periodic checks: timers & reminders ───────────────────────────────
  const tick = () => {
    const now = Date.now();
    // Conversation libre : elle s'achève après 60 s de silence.
    if (converseUntilRef.current && now > converseLastAtRef.current + 60000) {
      converseUntilRef.current = 0;
      pushNotice("Conversation libre terminée (silence). Dites « Jarvis » pour me rappeler, ou « Jarvis, parlons » pour en ouvrir une nouvelle.");
    }
    if (awaitingUntilRef.current && now > awaitingUntilRef.current) {
      awaitingUntilRef.current = 0;
      setAwaiting(false);
      setInterim("");
      setStatus((s) => (s === "listening" && listenRef.current === "wake" ? "idle" : s));
    }
    const { Sir } = addressOf(payloadRef.current);
    const finished = timersRef.current.filter((t) => t.endsAt <= now);
    if (finished.length) {
      timersRef.current = timersRef.current.filter((t) => t.endsAt > now);
      setTimers(timersRef.current);
      sfx.alarm();
      for (const t of finished) {
        pushNotice(`⏰ Minuteur « ${t.label} » terminé`);
        notify("Minuteur terminé", t.label);
      }
      const t0 = finished[0];
      speak(
        finished.length > 1
          ? `${Sir}, vos minuteurs sont terminés.`
          : t0.label === "Minuteur"
            ? `${Sir}, votre minuteur de ${formatSeconds(t0.total)} est terminé.`
            : `${Sir}, le minuteur « ${t0.label} » est terminé.`,
      );
    }
    if (!bootedRef.current) return;
    const due = tasksRef.current.filter((t) => !t.done && !t.notified && t.dueAt && Date.parse(t.dueAt) <= now);
    if (due.length) {
      const ids = new Set(due.map((d) => d.id));
      tasksRef.current = tasksRef.current.map((t) => (ids.has(t.id) ? { ...t, notified: true } : t));
      setTasks(tasksRef.current);
      for (const d of due) void fetch(`/api/tasks/${d.id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ notified: true }) });
      sfx.alarm();
      const titles = due.map((d) => d.title);
      pushNotice(`🔔 Rappel : ${titles.join(" · ")}`);
      notify("Rappel J.A.R.V.I.S.", titles.join("\n"));
      speak(due.length === 1 ? `${Sir}, je vous rappelle : ${titles[0]}.` : `${Sir}, vous avez ${due.length} rappels : ${titles.join(", ")}.`);
    }
  };

  const cancelAll = () => {
    if (settingsTab) {
      setSettingsTab(null);
      return;
    }
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    speakerRef.current?.cancel();
    if (listenRef.current === "ptt") {
      stopRecognition();
      setStatus("idle");
      if (wakeRef.current) setTimeout(() => fns.current.startRec("wake"), 400);
    }
    setInterim("");
  };

  useEffect(() => {
    fns.current = {
      send: (t, v) => void sendMessage(t, v),
      startRec: startRecognition,
      tick,
      toggleListening,
      cancelAll,
      afterSpeech,
    };
  });

  useEffect(() => {
    const i = setInterval(() => fns.current.tick(), 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!bootedRef.current) return;
      if (e.key === "Escape") {
        fns.current.cancelAll();
        return;
      }
      const el = e.target as HTMLElement | null;
      const busy = !!el && (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName) || el.isContentEditable);
      if (busy) return;
      if (e.code === "Space" && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        fns.current.toggleListening();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
      captureRef.current?.stop();
      speakerRef.current?.cancel();
      meterWantedRef.current = false;
      const m = meterRef.current;
      if (m) {
        cancelAnimationFrame(m.raf);
        m.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ─── PC version: heartbeat & shutdown ─────────────────────────────────
  const desktopEnabled = Boolean(payload?.desktop.enabled);
  useEffect(() => {
    if (!desktopEnabled) return;
    const beat = () => void fetch("/api/health?hb=1", { cache: "no-store" }).catch(() => undefined);
    beat();
    const i = setInterval(beat, 30000);
    return () => clearInterval(i);
  }, [desktopEnabled]);

  const quitApp = async (confirmFirst: boolean) => {
    if (confirmFirst && !window.confirm("Arrêter J.A.R.V.I.S. ? Le serveur local sera éteint.")) return;
    speakerRef.current?.cancel();
    stopActiveMusic(0.3);
    wakeRef.current = false;
    stopRecognition();
    setShutdown(true);
    try {
      await fetch("/api/desktop/quit", { method: "POST" });
    } catch {
      /* server already stopped */
    }
    setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, 1500);
  };

  // ─── Mises à jour automatiques (Premium) ───────────────────────────────
  // Vérifie 30 s après le démarrage puis toutes les 6 h ; lance l'installation
  // silencieuse sans intervention dès qu'une nouvelle version est publiée.
  const autoUpdateDone = useRef(false);
  useEffect(() => {
    if (!booted || !desktopEnabled || !payload?.settings.premiumActive) return;
    let stopped = false;
    const tryUpdate = async () => {
      if (stopped || autoUpdateDone.current) return;
      let check: { latest?: string | null; downloadUrl?: string | null } | null = null;
      try {
        const r = await fetch("/api/update", { cache: "no-store" });
        check = (await r.json()) as { latest?: string | null; downloadUrl?: string | null };
      } catch {
        return; // pas d'Internet ou serveur injoignable : nouvel essai au prochain cycle
      }
      if (stopped || autoUpdateDone.current || !check?.latest || !check.downloadUrl) return;
      autoUpdateDone.current = true;
      pushNotice(`Nouvelle version ${check.latest} disponible — installation automatique en cours…`);
      try {
        const p = await fetch("/api/update", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ action: "install" }) });
        const k = (await p.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (stopped) return;
        if (p.ok && k.ok) {
          const { sir } = addressOf(payloadRef.current);
          pushNotice(`Mise à jour ${check.latest} prête. J.A.R.V.I.S. redémarre pour l'installer et revient dans un instant.`);
          speak(`Une mise à jour est disponible, ${sir}. Je l'installe et reviens dans un instant.`);
          setTimeout(() => void quitApp(false), 8000);
        } else {
          pushNotice(`Échec de la mise à jour automatique : ${k.error ?? "erreur inconnue"}. Installez-la depuis l'onglet Premium.`);
        }
      } catch {
        if (!stopped) pushNotice("Échec de la mise à jour automatique. Installez-la depuis l'onglet Premium.");
      }
    };
    const first = setTimeout(() => void tryUpdate(), 30000);
    const loop = setInterval(() => void tryUpdate(), 6 * 3600 * 1000);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(loop);
    };
    // quitApp / speak : stables pour la session ; les inclure réinitialiserait les minuteurs à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, desktopEnabled, payload?.settings.premiumActive]);

  // ─── Boot ──────────────────────────────────────────────────────────────
  /** Crée ou remplace le moteur de parole : voix HD ElevenLabs si activée (Premium). */
  const makeSpeaker = () => {
    const useEleven = Boolean(payloadRef.current?.settings.elevenOn && payloadRef.current?.settings.premiumActive);
    const cur = speakerRef.current;
    if (cur && cur instanceof ElevenSpeaker === useEleven) return;
    const sp = useEleven ? new ElevenSpeaker() : new Speaker();
    sp.setEvents({
      onStart: () => setStatus((s) => (s === "listening" ? s : "speaking")),
      onEnd: () => {
        setStatus((s) => (s === "speaking" ? "idle" : s));
        fns.current.afterSpeech();
      },
      onBoundary: () => {
        levelRef.current = 0.85;
      },
    });
    speakerRef.current = sp;
  };
  useEffect(() => {
    if (booted) makeSpeaker();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, payload?.settings.elevenOn, payload?.settings.premiumActive]);
  const handleInit = () => {
    sfx.unlock();
    makeSpeaker();
    void getVoices().then((v) => {
      voicesRef.current = v;
      setVoices(v);
    });
    try {
      window.speechSynthesis?.addEventListener("voiceschanged", () => {
        const v = window.speechSynthesis.getVoices();
        voicesRef.current = v;
        setVoices(v);
      });
    } catch {
      /* ignore */
    }
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission().catch(() => undefined);
    } catch {
      /* ignore */
    }
    if ("serviceWorker" in navigator && window.isSecureContext) void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  };

  const previewVoice = (text: string) => {
    const sp = speakerRef.current;
    if (!sp) return;
    sp.cancel();
    const st = payloadRef.current?.settings;
    sp.speak(text, { voice: pickVoice(voicesRef.current, st?.voiceName), rate: st?.voiceRate ?? 1.05, pitch: st?.voicePitch ?? 0.9 });
  };

  const finishOnboarding = (p: SettingsPayload) => {
    payloadRef.current = p;
    setPayload(p);
    setWakeWord(p.settings.wakeCustom);
    setShowOnboarding(false);
    mutedRef.current = !p.settings.autoSpeak;
    setMuted(!p.settings.autoSpeak);
    engineFailedRef.current = false;
    const { sir } = addressOf(p);
    const text = `Enchanté, ${sir}. Configuration terminée : tous les systèmes sont opérationnels. Que puis-je faire pour vous ?`;
    setMessages([{ id: uid(), role: "assistant", content: text, source: "local", createdAt: Date.now() }]);
    speak(text);
    if (p.settings.wakeWord) setWake(true, false);
  };

  const handleBootDone = () => {
    bootedRef.current = true;
    setBooted(true);
    const p = payloadRef.current;
    if (p && !p.settings.onboarded) {
      setShowOnboarding(true);
      return;
    }
    const { sir } = addressOf(p);
    const h = new Date().getHours();
    const g = h >= 18 || h < 5 ? "Bonsoir" : "Bonjour";
    const text = `${g}, ${sir}. Tous les systèmes sont opérationnels. Que puis-je faire pour vous ?`;
    setMessages([{ id: uid(), role: "assistant", content: text, source: "local", createdAt: Date.now() }]);
    speak(text);
    if (p?.settings.wakeWord) setWake(true, false);
  };

  // ─── Panels callbacks ──────────────────────────────────────────────────
  const addTask = async (title: string, dueAt: string | null) => {
    await fetch("/api/tasks", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ title, dueAt }) }).catch(() => undefined);
    void loadTasks();
  };
  const toggleTask = async (t: TaskItem) => {
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ done: !t.done }) }).catch(() => undefined);
    void loadTasks();
  };
  const deleteTask = async (id: number) => {
    setTasks((ts) => ts.filter((x) => x.id !== id));
    await fetch(`/api/tasks/${id}`, { method: "DELETE" }).catch(() => undefined);
    void loadTasks();
  };
  const clearDoneTasks = async () => {
    await fetch("/api/tasks?scope=done", { method: "DELETE" }).catch(() => undefined);
    void loadTasks();
  };
  const addMemory = async (content: string) => {
    await fetch("/api/memories", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ content }) }).catch(() => undefined);
    void loadMemories();
  };
  const deleteMemory = async (id: number) => {
    setMemories((ms) => ms.filter((m) => m.id !== id));
    await fetch(`/api/memories/${id}`, { method: "DELETE" }).catch(() => undefined);
    void loadMemories();
  };
  const clearData = async (kind: "history" | "memories" | "tasks") => {
    if (kind === "history") {
      await fetch("/api/conversations", { method: "DELETE" }).catch(() => undefined);
      newConversation();
    } else if (kind === "memories") {
      await fetch("/api/memories", { method: "DELETE" }).catch(() => undefined);
      void loadMemories();
    } else {
      await fetch("/api/tasks?scope=all", { method: "DELETE" }).catch(() => undefined);
      void loadTasks();
    }
  };
  const testVoice = (o: { voiceName: string; rate: number; pitch: number; text?: string }) => {
    const sp = speakerRef.current;
    if (!sp) return;
    sp.cancel();
    const { sir } = addressOf(payloadRef.current);
    sp.speak(o.text ?? `Bonjour, ${sir}. Voici ma voix. Tous les systèmes sont opérationnels.`, { voice: pickVoice(voicesRef.current, o.voiceName), rate: o.rate, pitch: o.pitch });
  };
  const onSettingsSaved = (p: SettingsPayload) => {
    const prevEngine = payloadRef.current?.settings.sttEngine;
    const prevSttOk = payloadRef.current?.stt.available;
    const wasPremium = payloadRef.current?.settings.premiumActive ?? false;
    if (prevEngine !== p.settings.sttEngine) engineFailedRef.current = false;
    const protectionChanged = payloadRef.current?.settings.voiceGate !== p.settings.voiceGate
      || payloadRef.current?.settings.premiumActive !== p.settings.premiumActive
      || payloadRef.current?.settings.voicePrint !== p.settings.voicePrint;
    const engineChanged = prevEngine !== p.settings.sttEngine || prevSttOk !== p.stt.available || protectionChanged;
    payloadRef.current = p;
    setPayload(p);
    setWakeWord(p.settings.wakeCustom);
    if (!p.settings.voiceGate || !p.settings.voicePrint || !p.settings.premiumActive || !p.stt.available) converseUntilRef.current = 0;
    if (!wasPremium && p.settings.premiumActive) {
      // Activation de la licence : message d'accueil Premium, voix et éclair doré éphémère.
      const { sir } = addressOf(p);
      const text = `Bienvenue dans l'édition Premium, ${sir}. Merci de votre confiance : mises à jour automatiques, apparences exclusives, sauvegardes quotidiennes et journal des connexions sont désormais actifs — pour toujours. Je m'occupe de tout.`;
      setMessages((m) => [...m, { id: uid(), role: "assistant", content: text, source: "local", createdAt: Date.now() }]);
      sfx.success();
      speak(text);
      const prev = baseThemeRef.current;
      applyTheme("gold");
      themeTimerRef.current = setTimeout(() => applyTheme(prev), 6000);
    }
    if (p.settings.autoSpeak === mutedRef.current) setMute(!p.settings.autoSpeak, false, true);
    if (p.settings.wakeWord !== wakeRef.current) setWake(p.settings.wakeWord, false);
    else if (engineChanged && wakeRef.current) {
      stopRecognition();
      setTimeout(() => fns.current.startRec("wake"), 300);
    }
  };
  const install = async () => {
    if (!installEvt) return;
    try {
      await installEvt.prompt();
      await installEvt.userChoice;
    } catch {
      /* dismissed */
    }
    setInstallEvt(null);
  };
  const dismissAiHint = () => {
    setHideAiHint(true);
    try {
      localStorage.setItem("jarvis-hide-ai-hint", "1");
    } catch {
      /* ignore */
    }
  };

  const openMicTest = () => {
    micDiagnosticRef.current = true;
    stopRecognition();
    setInterim("");
    setStatus((st) => (st === "listening" ? "idle" : st));
    setShowMicTest(true);
  };

  const closeMicTest = () => {
    micDiagnosticRef.current = false;
    setShowMicTest(false);
    if (wakeRef.current) setTimeout(() => fns.current.startRec("wake"), 400);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = input;
    setInput("");
    void sendMessage(t, "text");
  };

  // ─── Render ────────────────────────────────────────────────────────────
  const orbState: OrbState = status === "idle" ? (wakeMode ? "standby" : "idle") : status;
  const bootSetup = musicSetup(payload);
  const { sir } = addressOf(payload);
  const statusLabel = converseActive()
    ? "CONVERSATION LIBRE — PARLEZ NORMALEMENT (MERCI POUR ARRÊTER)"
    : status === "listening"
      ? awaiting
        ? "À VOTRE ÉCOUTE…"
        : "ÉCOUTE EN COURS…"
      : status === "thinking"
        ? "ANALYSE EN COURS…"
        : status === "speaking"
          ? "TRANSMISSION VOCALE"
          : wakeMode
            ? "EN VEILLE — DITES « JARVIS »"
            : "SYSTÈMES EN LIGNE";
  const compact = messages.length > 1;
  const aiLabel = payload?.ai.active ? `${payload.ai.label ?? "IA"}` : "Noyau local";
  const orbSize = compact ? "150px" : "min(300px, 62vw)";

  return (
    <div className="party-fx hud-bg relative h-dvh overflow-hidden text-slate-100">
      <div className="hud-grid pointer-events-none fixed inset-0" />
      <div className="hud-orbit pointer-events-none fixed inset-0" />
      <div className="hud-particles pointer-events-none fixed inset-x-0" />
      <div className="hud-sweep pointer-events-none fixed inset-x-0" />
      <div ref={reticleRef} className="hud-reticle" aria-hidden />
      {themeFlash > 0 && <div key={themeFlash} className="boot-flash pointer-events-none fixed inset-0 z-40" />}
      <div className="scanlines pointer-events-none fixed inset-0" />
      <div className="vignette pointer-events-none fixed inset-0" />

      {!booted && (
        <BootScreen
          aiLabel={payload?.ai.active ? `${payload.ai.label} · ${payload.ai.model}` : "noyau local"}
          music={bootSetup.kind}
          musicOptions={bootSetup.options}
          musicLabel={bootSetup.label}
          autoStart={autoStart && payload !== null}
          onInitialize={handleInit}
          onDone={handleBootDone}
        />
      )}

      {booted && (
        <div className="fade-in relative z-10 flex h-dvh flex-col pb-7">
          <header className="relative z-20 flex items-center gap-3 px-3 py-3 lg:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-9 w-9 shrink-0">
                <div className="absolute inset-0 rounded-full border border-hud/60 shadow-[0_0_16px_var(--hud)]" />
                <div className="absolute inset-[30%] rounded-full bg-hud shadow-[0_0_14px_var(--hud)]" />
              </div>
              <div className="min-w-0">
                <div className="glow-text font-display text-base tracking-[0.3em] text-hud sm:text-lg">J.A.R.V.I.S.</div>
                <div className="hidden font-mono text-[10px] uppercase tracking-[0.25em] text-hud/50 sm:block">Just A Rather Very Intelligent System</div>
              </div>
            </div>

            <div className="mx-auto hidden items-center gap-2 md:flex">
              <button
                type="button"
                onClick={() => setSettingsTab("ai")}
                className="flex items-center gap-2 rounded-full border border-hud/20 bg-hud/5 px-3 py-1 font-mono text-[11px] text-slate-300 transition hover:border-hud/50"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${payload?.ai.active ? "bg-emerald-400 shadow-[0_0_6px_#34d399]" : "bg-amber-400 shadow-[0_0_6px_#fbbf24]"}`} />
                IA : {aiLabel}
              </button>
              <span className="flex items-center gap-2 rounded-full border border-hud/20 bg-hud/5 px-3 py-1 font-mono text-[11px] text-slate-300">
                <span className={`h-1.5 w-1.5 rounded-full ${listenMode !== "off" ? "animate-pulse bg-hud" : "bg-slate-500"}`} />
                Micro : {listenMode === "ptt" ? "écoute" : wakeMode ? "veille active" : "prêt"}
              </span>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" className="hud-btn" title="Historique" onClick={() => setShowHistory(true)}>
                <History size={16} />
              </button>
              <button type="button" className="hud-btn" title="Nouvelle conversation" onClick={newConversation}>
                <Plus size={16} />
              </button>
              <button type="button" className="hud-btn" title="Espace : système solaire en temps réel et satellites en direct" onClick={() => setSpaceVue("systeme")}>
                <Orbit size={16} />
                <span className="hidden lg:inline">Espace</span>
              </button>
              {Boolean(payload?.settings.premiumActive) && (
                <button
                  type="button"
                  className="hud-btn"
                  title="Vision (Premium) : caméra avec suivi des mouvements et reconnaissance faciale"
                  onClick={() => setShowVision(true)}
                >
                  <Eye size={16} />
                  <span className="hidden lg:inline">Vision</span>
                </button>
              )}
              <button type="button" className="hud-btn" title="Lecteur multimédia (vidéos et musiques)" onClick={() => setShowMedia(true)}>
                <Film size={16} />
              </button>
              <button type="button" className="hud-btn" data-active={!muted} title={muted ? "Activer la voix" : "Couper la voix"} onClick={() => setMute(!muted, true, true)}>
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              <button type="button" className="hud-btn" title="Diagnostic du micro (JARVIS ne vous entend pas ?)" onClick={openMicTest}>
                <Stethoscope size={16} />
              </button>
              <button type="button" className="hud-btn" data-active={wakeMode} title="Écoute permanente (dites « Jarvis »)" onClick={() => setWake(!wakeMode)}>
                {wakeMode ? <Ear size={16} /> : <EarOff size={16} />}
              </button>
              {!desktopEnabled && (
                <button type="button" className="hud-btn hidden sm:inline-flex" title="Installer J.A.R.V.I.S. sur mon PC (option B)" onClick={() => setSettingsTab("install")}>
                  <Download size={16} />
                  <span className="hidden lg:inline">Installer</span>
                </button>
              )}
              {desktopEnabled && (
                <button type="button" className="hud-btn hover:!text-red-300" title="Quitter J.A.R.V.I.S." onClick={() => void quitApp(true)}>
                  <Power size={16} />
                </button>
              )}
              <button type="button" className="hud-btn" title="Paramètres" onClick={() => setSettingsTab("profile")}>
                <Settings size={16} />
              </button>
            </div>
          </header>

          <nav className="relative z-20 mx-3 mb-2 grid grid-cols-3 gap-1 rounded-lg border border-hud/20 bg-black/30 p-1 lg:hidden">
            {MOBILE_TABS.map(({ id, label, Icon }) => (
              <button key={id} type="button" onClick={() => setMobileTab(id)} className="hud-btn !h-8 !border-transparent" data-active={mobileTab === id}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </nav>

          <main className="relative z-10 grid min-h-0 flex-1 grid-cols-1 gap-4 px-3 pb-3 lg:grid-cols-[290px_minmax(0,1fr)_320px] lg:px-5 lg:pb-5">
            <aside className={`${mobileTab === "system" ? "flex" : "hidden"} scroll-hud min-h-0 flex-col gap-4 overflow-y-auto lg:flex`}>
              <Clock />
              <SystemPanel />
              <WeatherWidget city={payload?.settings.city || "Paris"} />
              <AICorePanel ai={payload?.ai} onConfigure={() => setSettingsTab("ai")} />
              <AgendaPanel onOpenSettings={() => setSettingsTab("mail")} />
              <MailsPanel onOpenSettings={() => setSettingsTab("mail")} />
              <PythonPanel onOpenSettings={() => setSettingsTab("plugins")} />
            </aside>

            <section className={`${mobileTab === "chat" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`}>
              <div className="flex shrink-0 flex-col items-center">
                <div className="transition-all duration-700 ease-out" style={{ width: orbSize, height: orbSize }}>
                  <ArcReactor state={orbState} levelRef={levelRef} onClick={toggleListening} title="Cliquer pour parler (Espace)" className="h-full w-full" />
                </div>
                <div className="glow-text mt-1 text-center font-display text-[11px] tracking-[0.3em] text-hud">{statusLabel}</div>
                <div className="h-6 max-w-xl truncate px-4 text-center text-sm italic text-slate-300">
                  {interim ? (
                    `« ${interim} »`
                  ) : status === "idle" && !wakeMode ? (
                    <span className="text-xs not-italic text-slate-500">Espace ou clic sur le réacteur pour parler · 👂 pour l&apos;écoute permanente</span>
                  ) : (
                    ""
                  )}
                </div>
              </div>

              <div className="scroll-hud min-h-0 flex-1 overflow-y-auto">
                <ChatLog messages={messages} />
              </div>

              {messages.length <= 1 && (
                <div className="mx-auto mb-3 flex max-w-3xl flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void sendMessage(s, "text")}
                      className="rounded-full border border-hud/25 bg-hud/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-hud/60 hover:bg-hud/15 hover:text-white"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {iframeBlocked && (
                <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 rounded border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                  <MicOff size={14} className="shrink-0" />
                  <span className="flex-1">Vous êtes dans l&apos;aperçu intégré : le navigateur y bloque le micro. Ouvrez JARVIS dans un onglet pour lui parler.</span>
                  <button type="button" className="hud-btn !h-7 shrink-0" onClick={() => window.open(window.location.href, "_blank", "noopener")}>
                    <ExternalLink size={12} /> Nouvel onglet
                  </button>
                </div>
              )}

              {micError && (
                <div className="mx-auto mb-2 flex w-full max-w-3xl items-start gap-2 rounded border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  <MicOff size={14} className="mt-0.5 shrink-0" />
                  <span className="flex-1">{micError}</span>
                  <button type="button" className="shrink-0 underline underline-offset-2 hover:text-white" onClick={openMicTest}>
                    Diagnostic
                  </button>
                  <button type="button" onClick={() => setMicError(null)} title="Fermer">
                    <X size={14} />
                  </button>
                </div>
              )}

              {payload && !payload.ai.active && !hideAiHint && (
                <div className="mx-auto mb-2 flex w-full max-w-3xl items-center gap-2 rounded border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-xs text-amber-100">
                  <Sparkles size={14} className="shrink-0 text-amber-300" />
                  <span className="flex-1">
                    Mode local actif. Connectez une IA gratuite (Groq, Gemini) ou 100 % locale (Ollama) pour converser librement avec JARVIS.
                  </span>
                  <button type="button" className="hud-btn !h-7 shrink-0" onClick={() => setSettingsTab("ai")}>
                    Configurer
                  </button>
                  <button type="button" onClick={dismissAiHint} title="Masquer">
                    <X size={14} />
                  </button>
                </div>
              )}

              <form onSubmit={submit} className="hud-panel mx-auto flex w-full max-w-3xl items-center gap-2 p-2">
                <button
                  type="button"
                  onClick={toggleListening}
                  title="Parler (Espace)"
                  className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full border transition ${listenMode === "ptt" ? "border-hud bg-hud/30 text-white shadow-[0_0_20px_var(--hud)]" : "border-hud/40 bg-hud/10 text-hud hover:bg-hud/20"}`}
                >
                  {listenMode === "ptt" && <span className="mic-ping" />}
                  {listenMode === "ptt" ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={listenMode === "ptt" ? "Je vous écoute…" : `Parlez ou écrivez à JARVIS, ${sir}…`}
                  className="min-w-0 flex-1 bg-transparent px-2 text-[15px] text-white outline-none placeholder:text-slate-500"
                  aria-label="Message pour JARVIS"
                />
                <button type="submit" disabled={!input.trim()} className="hud-btn !h-11 !w-11 shrink-0" title="Envoyer">
                  <Send size={16} />
                </button>
              </form>
              <p className="mt-2 hidden text-center font-mono text-[10px] text-slate-500 lg:block">
                Espace : parler · Entrée : envoyer · Échap : interrompre · Ctrl+K : écrire · {conversationId ? `Session #${conversationId}` : "Nouvelle session"}
              </p>
            </section>

            <aside className={`${mobileTab === "tasks" ? "flex" : "hidden"} scroll-hud min-h-0 flex-col gap-4 overflow-y-auto lg:flex`}>
              <TimersPanel timers={timers} onCancel={cancelTimer} />
              {payload?.home.configured && <HomePanel refreshKey={homeKey} onOpenSettings={() => setSettingsTab("home")} />}
              <TasksPanel tasks={tasks} onAdd={(t, d) => void addTask(t, d)} onToggle={(t) => void toggleTask(t)} onDelete={(id) => void deleteTask(id)} onClearDone={() => void clearDoneTasks()} />
              <MemoryPanel memories={memories} onAdd={(c) => void addMemory(c)} onDelete={(id) => void deleteMemory(id)} />
            </aside>
          </main>
          <TelemetryBanner ai={aiLabel} mic={listenMode === "ptt" ? "écoute" : wakeMode ? "veille active" : "prêt"} />
        </div>
      )}

      <ScreenSaver
        activityKey={[booted, status, interim, messages.length, listenMode]}
        disabled={
          !booted ||
          shutdown ||
          settingsTab !== null ||
          showHistory ||
          spaceVue !== null ||
          showMedia ||
          showMicTest ||
          showOnboarding
        }
      />

      {shutdown && (
        <div className="fade-in fixed inset-0 z-[70] grid place-items-center bg-black/95 px-6 text-center">
          <div>
            <div className="glow-text font-display text-2xl tracking-[0.3em] text-hud">SYSTÈMES DÉSACTIVÉS</div>
            <p className="mt-3 text-sm text-slate-400">J.A.R.V.I.S. est arrêté. Vous pouvez fermer cette fenêtre.</p>
          </div>
        </div>
      )}

      {spaceVue && <SpacePanel vue={spaceVue} onClose={() => setSpaceVue(null)} />}

      {showVision && (
        <VisionPanel
          onClose={() => setShowVision(false)}
          frameRef={visionFrameRef}
          onGreet={(text) => speak(text)}
          onDescribe={(img) => void sendMessage("Voici une image de ma caméra. Décris précisément ce que tu vois, en français.", "text", img)}
          premium={Boolean(payload?.settings.premiumActive)}
          faceData={payload?.settings.visionFace ?? null}
          userName={payload?.settings.userName ?? ""}
        />
      )}

      {showMedia && <MediaPanel onClose={() => setShowMedia(false)} />}

      {showOnboarding && payload && <Onboarding payload={payload} onFinish={finishOnboarding} onPreview={previewVoice} />}

      {showMicTest && (
        <div className="fixed inset-0 z-50 grid place-items-center p-3">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeMicTest} />
          <div className="hud-panel fade-in scroll-hud relative z-10 max-h-[92dvh] w-[min(96vw,640px)] overflow-y-auto !bg-[#030b14]/95 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="glow-text flex items-center gap-2 font-display text-sm tracking-[0.3em] text-hud">
                <Stethoscope size={16} /> DIAGNOSTIC DU MICRO
              </div>
              <button type="button" className="hud-btn" onClick={closeMicTest} title="Fermer">
                <X size={16} />
              </button>
            </div>
            <MicDiagnostic
              sttAvailable={Boolean(payload?.stt.available)}
              autoStart
              onUseWhisper={() => {
                void saveSettings({ sttEngine: "whisper" });
                setMicError(null);
                closeMicTest();
              }}
            />
          </div>
        </div>
      )}

      {settingsTab && payload && (
        <SettingsModal
          payload={payload}
          voices={voices}
          canInstall={Boolean(installEvt)}
          initialTab={settingsTab}
          theme={theme}
          onTheme={applyTheme}
          onInstall={() => void install()}
          onClose={() => setSettingsTab(null)}
          onSaved={onSettingsSaved}
          onMicNeeded={() => {
            micReservedRef.current = true;
            stopRecognition();
          }}
          onMicRelease={() => {
            micReservedRef.current = false;
            if (wakeRef.current) setTimeout(() => fns.current.startRec("wake"), 400);
          }}
          onTestVoice={testVoice}
          onClearData={(k) => void clearData(k)}
          onQuit={() => void quitApp(true)}
        />
      )}

      {showHistory && (
        <HistoryDrawer
          currentId={conversationId}
          onClose={() => setShowHistory(false)}
          onSelect={(id) => void openConversation(id)}
          onDeletedCurrent={newConversation}
        />
      )}
    </div>
  );
}
