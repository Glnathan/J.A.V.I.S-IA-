// Shared types between server (API routes / brain) and client (HUD).

/** Action d'écran proposée par l'IA, coordonnées en pixels de l'IMAGE capturée. */
export interface ControlProposal {
  kind: "click" | "dblclick" | "type" | "key";
  x?: number;
  y?: number;
  text?: string;
  combo?: string;
}

export type ThemeName = "cyan" | "red" | "gold" | "green" | "party" | "gaming" | "nanotech" | "ultron" | "stealth";

export type ClientAction =
  | { type: "open"; url: string; label: string }
  | { type: "timer"; seconds: number; label: string }
  | { type: "stop_timers" }
  | { type: "refresh"; target: "tasks" | "memories" | "settings" | "home" | "all" }
  | { type: "clear_chat" }
  | { type: "set_wake"; enabled: boolean }
  | { type: "mute"; muted: boolean }
  | { type: "theme"; theme: ThemeName; duration?: number }
  | { type: "stop_speech" }
  | { type: "quit" }
  | { type: "play_music"; kind: "boot" | "youtube"; url?: string; title?: string }
  | { type: "stop_music" }
  | { type: "sound"; name: "party" | "alert" | "success" | "theme" }
  | { type: "espace"; vue?: "systeme" | "satellites" }
  | { type: "media" }
  | { type: "vision"; target: "panel" | "close" | "screen" | "camera"; instruction?: string }
  | { type: "converse"; on: boolean }
  | { type: "control-propose"; action: ControlProposal; description: string }
  | { type: "control-confirm" }
  | { type: "control-cancel" };;

export interface WeatherDay {
  date: string;
  min: number;
  max: number;
  code: number;
  desc: string;
  icon: string;
  rain: number | null;
}

export interface WeatherData {
  city: string;
  country?: string;
  current: {
    temp: number;
    feels: number;
    humidity: number;
    wind: number;
    code: number;
    isDay: boolean;
    desc: string;
    icon: string;
  };
  daily: WeatherDay[];
}

export interface SystemStats {
  platform: string;
  release: string;
  hostname: string;
  cpuModel: string;
  cores: number;
  cpuUsage: number;
  totalMem: number;
  freeMem: number;
  uptime: number;
  pcControl: boolean;
  node: string;
}

export type Card =
  | { kind: "weather"; data: WeatherData }
  | { kind: "wiki"; title: string; extract: string; url: string; thumbnail?: string }
  | { kind: "news"; source: string; items: { title: string; link: string }[] }
  | { kind: "links"; links: { label: string; url: string }[] }
  | { kind: "list"; title: string; items: string[]; ordered?: boolean }
  | { kind: "system"; stats: SystemStats; battery?: { level: number; charging: boolean } | null };

export interface MessageMeta {
  cards?: Card[];
  actions?: ClientAction[];
  provider?: string;
}

export interface ClientContext {
  now: string;
  timezone: string;
  tzOffset: number;
  battery?: { level: number; charging: boolean } | null;
  online?: boolean;
  cores?: number;
  memory?: number;
  userAgent?: string;
  timers?: { label: string; remaining: number }[];
}

export type StreamEvent =
  | { type: "meta"; conversationId: number; source: string; provider?: string }
  | { type: "delta"; text: string }
  | { type: "cards"; cards: Card[] }
  | { type: "actions"; actions: ClientAction[] }
  | { type: "final"; text: string; messageId: number }
  | { type: "error"; message: string };

export interface BrainResult {
  text: string;
  source: string;
  cards?: Card[];
  actions?: ClientAction[];
}

export interface PublicSettings {
  userName: string;
  honorific: string;
  city: string;
  voiceName: string;
  voiceRate: number;
  voicePitch: number;
  autoSpeak: boolean;
  wakeWord: boolean;
  aiProvider: string;
  aiModel: string;
  aiBaseUrl: string;
  hasApiKey: boolean;
  apiKeyPreview: string;
  /** Aperçu de la clé enregistrée par fournisseur ("" = aucune clé) — jamais la clé complète. */
  aiKeyPreviews: Record<string, string>;
  /** Édition Premium active (clé de licence valide). */
  premiumActive: boolean;
  /** Date dexpiration du jeton Premium (null si Standard). */
  premiumExpires: string | null;
  /** Visage inscrit pour la reconnaissance (édition Premium), null si aucun. */
  /** Visages inscrits pour la reconnaissance (famille) : null = aucun. */
  visionFace: { name: string; descriptors: number[][] }[] | null;
  /** Veille faciale : le mot d'activation ne compte que si le visage inscrit est devant la caméra. */
  visionGate: boolean;
  /** Empreinte vocale inscrite (édition Premium), null si aucune. */
  voicePrint: { descriptors: number[][] } | null;
  /** Verrou vocal : en écoute permanente, seule la voix inscrite est obéie. */
  voiceGate: boolean;
  /** Mot d'activation personnalisé (Premium), vide = « Jarvis ». */
  wakeCustom: string;
  pcControl: boolean;
  bootMusic: string;
  bootVolume: number;
  bootMusicUrl: string;
  bootMusicStart: number;
  bootMusicDuration: number;
  pluginsEnabled: boolean;
  addressBy: string;
  onboarded: boolean;
  sttEngine: string;
  sttProvider: string;
  hasSttKey: boolean;
  sttKeyPreview: string;
  desktopBrowser: string;
  haEnabled: boolean;
  haUrl: string;
  hasHaToken: boolean;
  haTokenPreview: string;
  haUseAssist: boolean;
  haAllowSensitive: boolean;
  haFavorites: string[];
  /** Clé SerpAPI : recherche Google lue par l'IA. */
  hasSerpKey: boolean;
  serpKeyPreview: string;
  /** Dossier du coffre Obsidian (vide = désactivé). */
  obsidianVault: string;
  /** Clé ElevenLabs : voix HD. */
  hasElevenKey: boolean;
  elevenKeyPreview: string;
  elevenVoiceId: string;
  elevenOn: boolean;
}

export interface AIStatus {
  active: boolean;
  provider?: string;
  label?: string;
  model?: string;
  origin?: "settings" | "env";
}

export interface DesktopInfo {
  enabled: boolean;
  version: string;
  platform: string;
  dataDir: string | null;
  userDir: string | null;
  pluginsDir: string;
}

export interface SettingsPayload {
  settings: PublicSettings;
  ai: AIStatus;
  envProviders: string[];
  pc: { available: boolean; platform: string };
  desktop: DesktopInfo;
  bootMusicFile: { name: string; size: number } | null;
  stt: { available: boolean; provider: string; origin: "settings" | "ai" | "env" | null; local: boolean };
  home: { configured: boolean };
}

export interface HomeEntity {
  id: string;
  domain: string;
  name: string;
  state: string;
  area: string | null;
  unit: string | null;
  deviceClass: string | null;
  favorite: boolean;
  sensitive: boolean;
  brightness: number | null;
  currentTemperature: number | null;
  targetTemperature: number | null;
}

export interface HomePayload {
  configured: boolean;
  enabled: boolean;
  desktop: boolean;
  allowSensitive: boolean;
  entities: HomeEntity[];
  error?: string;
}

export interface HomeTestResult {
  ok: boolean;
  message: string;
  version?: string;
  location?: string;
  entities?: number;
  assist?: boolean;
}

export interface PythonStatus {
  found: boolean;
  version?: string;
  command?: string;
  origin?: "env" | "system" | "embedded";
}

export interface PluginCommandInfo {
  name: string;
  patterns: string[];
  description: string;
}

export interface PluginInfo {
  file: string;
  name: string;
  description: string;
  commands: PluginCommandInfo[];
  error: string | null;
}

export interface PluginsPayload {
  enabled: boolean;
  dir: string;
  python: PythonStatus;
  plugins: PluginInfo[];
  canOpen: boolean;
  error?: string;
  created?: string;
}

export interface DownloadItem {
  name: string;
  size: number;
  kind: "installer" | "source" | "other";
  updatedAt: string;
}

export interface TaskItem {
  id: number;
  title: string;
  done: boolean;
  dueAt: string | null;
  notified: boolean;
  createdAt: string;
}

export interface MemoryItem {
  id: number;
  content: string;
  createdAt: string;
}

export interface ConversationItem {
  id: number;
  title: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: number;
  role: string;
  content: string;
  source: string | null;
  meta: MessageMeta | null;
  createdAt: string;
}
