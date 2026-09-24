// Web Speech recognition typings + helpers (browser detection, iframe detection, error messages).

export interface SRAlternative {
  transcript: string;
  confidence: number;
}
export interface SRResult {
  isFinal: boolean;
  length: number;
  [index: number]: SRAlternative;
}
export interface SRResultList {
  length: number;
  [index: number]: SRResult;
}
export interface SREvent {
  resultIndex: number;
  results: SRResultList;
}
export interface SRErrorEvent {
  error: string;
  message?: string;
}
export interface SpeechRec {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onsoundstart?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SRCtor = new () => SpeechRec;

export function getRecognitionCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Same-length lowercase + accent stripping (indices stay aligned with the original). */
export function foldText(s: string): string {
  let out = "";
  for (const ch of s) {
    const b = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    out += b.length === ch.length ? b : ch;
  }
  return out;
}

export const WAKE_RE = /\b(jarvis|jarvi|jarviss|djarvis|jarvisse|jarvys|jervis|jarves|jarwis|jarvice|jarviz|javis)\b/;

export interface BrowserInfo {
  name: string;
  brave: boolean;
  edge: boolean;
  chrome: boolean;
  firefox: boolean;
  safari: boolean;
  opera: boolean;
}

export function browserInfo(): BrowserInfo {
  if (typeof navigator === "undefined") return { name: "?", brave: false, edge: false, chrome: false, firefox: false, safari: false, opera: false };
  const ua = navigator.userAgent;
  const brave = Boolean((navigator as Navigator & { brave?: unknown }).brave);
  const edge = /Edg\//.test(ua);
  const opera = /OPR\//.test(ua);
  const firefox = /Firefox\//.test(ua);
  const chrome = !edge && !opera && !brave && /Chrome\//.test(ua);
  const safari = !chrome && !edge && !opera && !firefox && !brave && /Safari\//.test(ua);
  const name = brave ? "Brave" : edge ? "Microsoft Edge" : opera ? "Opera" : firefox ? "Firefox" : chrome ? "Google Chrome" : safari ? "Safari" : "Navigateur inconnu";
  return { name, brave, edge, chrome, firefox, safari, opera };
}

export function inIframe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** true/false when the Permissions Policy API can tell whether the microphone is allowed here, null otherwise. */
export function micAllowedByPolicy(): boolean | null {
  if (typeof document === "undefined") return null;
  const d = document as Document & {
    featurePolicy?: { allowsFeature(feature: string): boolean };
    permissionsPolicy?: { allowsFeature(feature: string): boolean };
  };
  const policy = d.permissionsPolicy ?? d.featurePolicy;
  try {
    return policy ? policy.allowsFeature("microphone") : null;
  } catch {
    return null;
  }
}

export interface ErrorContext {
  iframe: boolean;
  brave: boolean;
  edge: boolean;
  whisper: boolean;
}

export function recognitionErrorMessage(code: string, ctx: ErrorContext): string {
  const whisperHint = ctx.whisper ? "" : " Astuce : le moteur Whisper (clé Groq gratuite, Paramètres → Voix & micro) fonctionne partout.";
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      if (ctx.iframe) return "Le micro est bloqué dans l'aperçu intégré. Ouvrez JARVIS dans un nouvel onglet pour lui parler.";
      if (code === "service-not-allowed") return `Le service de reconnaissance vocale de ce navigateur est bloqué.${whisperHint}`;
      return "Accès au micro refusé. Autorisez-le pour JARVIS (icône à gauche de l'adresse, ou menu ⋯ → Autorisations du site) et vérifiez Paramètres Windows → Confidentialité et sécurité → Microphone.";
    case "audio-capture":
      return "Aucun micro utilisable : vérifiez qu'il est branché, non coupé, et que Windows autorise les applications de bureau à l'utiliser.";
    case "network":
      if (ctx.brave) return `Brave ne fournit pas la reconnaissance vocale. Utilisez Chrome ou Edge.${whisperHint}`;
      if (ctx.edge) return `Le service de reconnaissance vocale de Microsoft Edge ne répond pas. Essayez Google Chrome.${whisperHint}`;
      return `Service de reconnaissance vocale injoignable (connexion Internet requise).${whisperHint}`;
    case "no-speech":
      return "Je n'ai rien entendu. Parlez plus près du micro, ou lancez le diagnostic (icône stéthoscope).";
    case "language-not-supported":
      return `La reconnaissance du français n'est pas disponible dans ce navigateur.${whisperHint}`;
    case "start-failed":
      return "Impossible de démarrer la reconnaissance vocale. Réessayez dans un instant.";
    case "start-timeout":
      return `Le service vocal ne démarre pas. Vérifiez l'autorisation du micro et lancez le diagnostic (icône stéthoscope).${whisperHint}`;
    default:
      return `Erreur de reconnaissance vocale (${code}).${whisperHint}`;
  }
}

export function captureErrorMessage(e: unknown, iframe: boolean): string {
  const name = (e as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return iframe
      ? "Le micro est bloqué dans l'aperçu intégré : ouvrez JARVIS dans un nouvel onglet."
      : "Accès au micro refusé. Autorisez-le pour JARVIS, et vérifiez Paramètres Windows → Confidentialité et sécurité → Microphone.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Aucun micro détecté : branchez-en un, ou vérifiez qu'il est activé dans Paramètres Windows → Son → Entrée.";
  if (name === "NotReadableError" || name === "AbortError") {
    return "Le micro est occupé par une autre application, ou bloqué par Windows (Paramètres → Confidentialité et sécurité → Microphone → applications de bureau).";
  }
  if (name === "NotSupportedError") return "Ce navigateur ne permet pas d'utiliser le micro ici (connexion non sécurisée ?).";
  return `Micro indisponible (${name || (e instanceof Error ? e.message : String(e))}).`;
}
