// Home Assistant REST client (server only): entities, rooms, services and Assist (conversation API).
// Docs: https://developers.home-assistant.io/docs/api/rest/ — https://developers.home-assistant.io/docs/intent_conversation_api/
import { isDesktop } from "@/lib/runtime";
import type { HomeEntity, HomeTestResult } from "@/lib/types";
import type { SettingsRow } from "./settings";

export interface HAConfig {
  url: string;
  token: string;
  useAssist: boolean;
  /** Doors, gates, locks and alarms — only possible in the PC version, and only if the user allows it. */
  allowSensitive: boolean;
}

export function normalizeHaUrl(raw: string): string {
  let u = raw.trim().replace(/\/+$/, "");
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/api$/i, "").replace(/\/+$/, "");
}

export function haConfig(s: SettingsRow): HAConfig | null {
  if (!s.haEnabled) return null;
  const url = normalizeHaUrl(s.haUrl || process.env.HOME_ASSISTANT_URL || process.env.HA_URL || "");
  const token = (s.haToken || process.env.HOME_ASSISTANT_TOKEN || process.env.HA_TOKEN || "").trim();
  if (!url || !token) return null;
  return { url, token, useAssist: s.haUseAssist, allowSensitive: s.haAllowSensitive && isDesktop() };
}

export class HAError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`HTTP ${status}${detail ? ` — ${detail.replace(/\s+/g, " ").slice(0, 160)}` : ""}`);
  }
}

export async function haRequest<T>(cfg: HAConfig, apiPath: string, opts: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const res = await fetch(`${cfg.url}${apiPath}`, {
    method: opts.method ?? "GET",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new HAError(res.status, text);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export function haErrorMessage(e: unknown): string {
  if (e instanceof HAError) {
    if (e.status === 401 || e.status === 403) return "jeton d'accès refusé : créez un « jeton d'accès longue durée » dans votre profil Home Assistant";
    if (e.status === 404) return "adresse incorrecte (API introuvable)";
    return `erreur ${e.message}`;
  }
  const cause = (e as { cause?: { code?: string; message?: string } } | null)?.cause;
  const msg = `${e instanceof Error ? e.message : String(e)} ${cause?.code ?? ""} ${cause?.message ?? ""}`;
  if (/timeout|aborted/i.test(msg)) return "Home Assistant ne répond pas (délai dépassé)";
  if (/certificate|self.signed|CERT_/i.test(msg)) return "certificat HTTPS non reconnu (utilisez l'adresse http:// locale ou un certificat valide)";
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH|ECONNRESET|fetch failed/i.test(msg)) {
    return isDesktop()
      ? "Home Assistant injoignable à cette adresse"
      : "Home Assistant injoignable : la version en ligne a besoin d'une adresse accessible depuis Internet (Nabu Casa…)";
  }
  return msg.trim().slice(0, 160);
}

// ─── Entities ────────────────────────────────────────────────────────────
export const CONTROL_DOMAINS = new Set([
  "light", "switch", "fan", "cover", "climate", "media_player", "scene", "script", "input_boolean", "lock", "vacuum",
  "humidifier", "valve", "button", "input_button", "automation", "siren", "water_heater", "alarm_control_panel",
]);
const INFO_CLASSES = new Set(["temperature", "humidity"]);
const DOMAIN_ORDER = [
  "light", "switch", "cover", "climate", "fan", "media_player", "scene", "script", "input_boolean", "vacuum", "humidifier",
  "water_heater", "valve", "lock", "alarm_control_panel", "button", "input_button", "automation", "siren", "sensor",
];

export function isSensitiveEntity(domain: string, deviceClass: string | null): boolean {
  if (domain === "lock" || domain === "alarm_control_panel") return true;
  if (domain === "cover") return ["garage", "door", "gate"].includes(deviceClass ?? "");
  if (domain === "valve") return deviceClass === "gas";
  return false;
}

interface RawState {
  entity_id: string;
  state: string;
  attributes?: Record<string, unknown>;
}

const AREA_TEMPLATE =
  "[{% for a in areas() %}{{ {'name': area_name(a), 'entities': area_entities(a)} | tojson }}{% if not loop.last %},{% endif %}{% endfor %}]";

type Cache<T> = { key: string; at: number; value: T };
const g = globalThis as typeof globalThis & {
  __jarvisHaStates?: Cache<HomeEntity[]>;
  __jarvisHaAreas?: Cache<Map<string, string>>;
};
const cacheKey = (cfg: HAConfig) => `${cfg.url}|${cfg.token.slice(-8)}`;

async function areaMap(cfg: HAConfig): Promise<Map<string, string>> {
  const key = cacheKey(cfg);
  const c = g.__jarvisHaAreas;
  if (c && c.key === key && Date.now() - c.at < 5 * 60000) return c.value;
  const map = new Map<string, string>();
  try {
    const raw = await haRequest<unknown>(cfg, "/api/template", { method: "POST", body: { template: AREA_TEMPLATE } });
    const list = (typeof raw === "string" ? JSON.parse(raw) : raw) as { name?: string; entities?: string[] }[];
    if (Array.isArray(list)) for (const a of list) for (const id of a.entities ?? []) if (a.name && !map.has(id)) map.set(id, a.name);
  } catch (e) {
    console.warn("[home] Pièces indisponibles :", haErrorMessage(e));
  }
  g.__jarvisHaAreas = { key, at: Date.now(), value: map };
  return map;
}

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};

function toEntity(s: RawState, areas: Map<string, string>): HomeEntity {
  const [domain, objectId = ""] = s.entity_id.split(".");
  const a = s.attributes ?? {};
  const deviceClass = typeof a.device_class === "string" ? a.device_class : null;
  const bright = num(a.brightness);
  const friendly = typeof a.friendly_name === "string" ? a.friendly_name.trim() : "";
  return {
    id: s.entity_id,
    domain,
    name: friendly || objectId.replace(/_/g, " "),
    state: String(s.state),
    area: areas.get(s.entity_id) ?? null,
    unit: typeof a.unit_of_measurement === "string" ? a.unit_of_measurement : null,
    deviceClass,
    favorite: false,
    sensitive: isSensitiveEntity(domain, deviceClass),
    brightness: bright === null ? null : Math.round((bright / 255) * 100),
    currentTemperature: num(a.current_temperature),
    targetTemperature: num(a.temperature),
  };
}

export async function listEntities(cfg: HAConfig, favorites: string[] = [], maxAgeMs = 4000): Promise<HomeEntity[]> {
  const key = cacheKey(cfg);
  const c = g.__jarvisHaStates;
  let base: HomeEntity[];
  if (c && c.key === key && Date.now() - c.at < maxAgeMs) base = c.value;
  else {
    const [states, areas] = await Promise.all([haRequest<RawState[]>(cfg, "/api/states"), areaMap(cfg)]);
    if (!Array.isArray(states)) throw new Error("réponse inattendue de Home Assistant");
    base = states
      .filter((s) => {
        const d = s.entity_id.split(".")[0];
        return CONTROL_DOMAINS.has(d) || (d === "sensor" && INFO_CLASSES.has(String(s.attributes?.device_class ?? "")));
      })
      .map((s) => toEntity(s, areas))
      .sort((x, y) => {
        const dx = DOMAIN_ORDER.indexOf(x.domain);
        const dy = DOMAIN_ORDER.indexOf(y.domain);
        return dx !== dy ? dx - dy : x.name.localeCompare(y.name, "fr");
      })
      .slice(0, 400);
    g.__jarvisHaStates = { key, at: Date.now(), value: base };
  }
  const fav = new Set(favorites);
  return base.map((e) => (fav.has(e.id) ? { ...e, favorite: true } : e));
}

export function invalidateEntities(): void {
  g.__jarvisHaStates = undefined;
}

// ─── Services ────────────────────────────────────────────────────────────
export type HomeCommand = "on" | "off" | "toggle" | "open" | "close" | "stop" | "activate" | "set_temp" | "brightness";

export interface ServiceCall {
  domain: string;
  service: string;
  data: Record<string, unknown>;
}

const ONOFF = new Set(["light", "switch", "fan", "input_boolean", "media_player", "humidifier", "automation", "siren", "water_heater", "climate"]);
const SENSITIVE_SERVICES = new Set(["unlock", "open", "open_cover", "toggle", "open_valve", "set_cover_position"]);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

function rawServiceFor(e: HomeEntity, cmd: HomeCommand, value?: number): ServiceCall | null {
  const d = e.domain;
  const call = (service: string, extra: Record<string, unknown> = {}): ServiceCall => ({ domain: d, service, data: { entity_id: e.id, ...extra } });
  switch (d) {
    case "cover":
      if (cmd === "open" || cmd === "on" || cmd === "activate") return call("open_cover");
      if (cmd === "close" || cmd === "off") return call("close_cover");
      if (cmd === "stop") return call("stop_cover");
      if (cmd === "toggle") return call("toggle");
      if (cmd === "brightness" && value !== undefined) return call("set_cover_position", { position: clamp(value, 0, 100) });
      return null;
    case "valve":
      if (cmd === "open" || cmd === "on" || cmd === "activate") return call("open_valve");
      if (cmd === "close" || cmd === "off" || cmd === "stop") return call("close_valve");
      if (cmd === "toggle") return call("toggle");
      return null;
    case "lock":
      if (cmd === "close" || cmd === "on" || cmd === "activate") return call("lock");
      if (cmd === "open" || cmd === "off") return call("unlock");
      if (cmd === "toggle") return call(e.state === "locked" ? "unlock" : "lock");
      return null;
    case "scene":
      return cmd === "off" || cmd === "close" || cmd === "stop" ? null : call("turn_on");
    case "script":
      return cmd === "off" || cmd === "stop" ? call("turn_off") : call("turn_on");
    case "button":
    case "input_button":
      return cmd === "off" || cmd === "close" || cmd === "stop" ? null : call("press");
    case "vacuum":
      if (cmd === "on" || cmd === "activate" || cmd === "open") return call("start");
      if (cmd === "off" || cmd === "close") return call("return_to_base");
      if (cmd === "stop") return call("stop");
      if (cmd === "toggle") return call(e.state === "cleaning" ? "return_to_base" : "start");
      return null;
    case "alarm_control_panel":
      return null; // handled by Home Assistant Assist only (with its own exposure rules)
    case "climate":
    case "water_heater":
      if (cmd === "set_temp" && value !== undefined) return call("set_temperature", { temperature: value });
      if (cmd === "toggle") return call(e.state === "off" ? "turn_on" : "turn_off");
      break;
    case "light":
      if (cmd === "brightness" && value !== undefined) return value <= 0 ? call("turn_off") : call("turn_on", { brightness_pct: clamp(value, 1, 100) });
      break;
    case "automation":
      if (cmd === "activate") return call("trigger");
      break;
  }
  if (ONOFF.has(d)) {
    if (cmd === "on" || cmd === "activate" || cmd === "open") return call("turn_on");
    if (cmd === "off" || cmd === "stop" || cmd === "close") return call("turn_off");
    if (cmd === "toggle") return call("toggle");
  }
  return null;
}

/** Translates a command into a service call. "blocked" = sensitive action (door, gate, lock) not allowed. */
export function serviceFor(e: HomeEntity, cmd: HomeCommand, value: number | undefined, allowSensitive: boolean): ServiceCall | "blocked" | null {
  const call = rawServiceFor(e, cmd, value);
  if (!call) return null;
  if (e.sensitive && !allowSensitive && SENSITIVE_SERVICES.has(call.service)) return "blocked";
  return call;
}

export async function callService(cfg: HAConfig, call: ServiceCall): Promise<void> {
  await haRequest(cfg, `/api/services/${call.domain}/${call.service}`, { method: "POST", body: call.data, timeoutMs: 10000 });
  invalidateEntities();
}

// ─── Assist (natural language, French) ───────────────────────────────────
export interface AssistResult {
  type: string;
  speech: string;
  code?: string;
}

export async function assist(cfg: HAConfig, text: string): Promise<AssistResult> {
  const r = await haRequest<{ response?: { response_type?: string; speech?: { plain?: { speech?: string } }; data?: { code?: string } } }>(
    cfg,
    "/api/conversation/process",
    { method: "POST", body: { text, language: "fr" }, timeoutMs: 12000 },
  );
  const resp = r?.response;
  if (resp?.response_type === "action_done") invalidateEntities();
  return { type: resp?.response_type ?? "error", speech: (resp?.speech?.plain?.speech ?? "").trim(), code: resp?.data?.code };
}

export async function testConnection(cfg: HAConfig): Promise<HomeTestResult> {
  try {
    await haRequest(cfg, "/api/");
    const conf = await haRequest<{ version?: string; location_name?: string; components?: string[] }>(cfg, "/api/config");
    invalidateEntities();
    g.__jarvisHaAreas = undefined;
    const entities = await listEntities(cfg, [], 0);
    const assistAvailable = Array.isArray(conf.components) ? conf.components.includes("conversation") : undefined;
    return {
      ok: true,
      message: `Connecté à « ${conf.location_name || "Home Assistant"} » (version ${conf.version ?? "?"}) : ${entities.length} appareils détectés${assistAvailable === false ? ". Assist n'est pas activé : JARVIS utilisera sa propre analyse." : "."}`,
      version: conf.version,
      location: conf.location_name,
      entities: entities.length,
      assist: assistAvailable,
    };
  } catch (e) {
    return { ok: false, message: haErrorMessage(e) };
  }
}
