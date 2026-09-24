// Shared types between server (API routes / brain) and client (HUD).

export type ThemeName = "cyan" | "red" | "gold" | "green" | "party" | "gaming";

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
  | { type: "media" };

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
  stt: { available: boolean; provider: string; origin: "settings" | "ai" | "env" | null };
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
