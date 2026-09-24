// Text helpers for the French natural-language engine.

/** Lowercase + strip accents while keeping EXACTLY the same string length (UTF-16 units). */
export function fold(input: string): string {
  let out = "";
  for (const ch of input) {
    const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const lower = base.toLowerCase();
    if (lower.length === ch.length) out += lower;
    else if (base.length === ch.length) out += base;
    else out += ch;
  }
  return out;
}

/** Folded version used for matching: punctuation becomes spaces (same length as input). */
export function foldForMatch(input: string): string {
  const f = fold(input)
    .replace(/[’'`´]/g, " ")
    .replace(/([a-z])-(?=[a-z])/g, "$1 ")
    .replace(/[!?;:"«»()[\]{}…]/g, " ")
    .replace(/,(?!\d)/g, " ");
  return f.replace(/\./g, (_m: string, offset: number, str: string) =>
    /\d/.test(str.charAt(offset - 1)) && /\d/.test(str.charAt(offset + 1)) ? "." : " ",
  );
}

export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function trimPunct(s: string): string {
  return s.replace(/^[\s,.;:!?'"«»\-–—]+|[\s,.;:!?'"«»\-–—]+$/g, "").replace(/\s+/g, " ");
}

export function safeTz(tz?: string): string {
  try {
    if (tz) {
      new Intl.DateTimeFormat("fr-FR", { timeZone: tz });
      return tz;
    }
  } catch {
    /* invalid tz */
  }
  return "Europe/Paris";
}

export function tzOffsetFor(tz: string): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((now.getTime() - asUTC) / 60000);
}

export function hourIn(ms: number, tz: string): number {
  const h = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(ms);
  return parseInt(h, 10) || 0;
}

/** "14 h 32" */
export function speakTime(ms: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: tz,
  }).formatToParts(ms);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return m === "00" ? `${h} h` : `${h} h ${m}`;
}

/** "mardi 23 septembre 2025" */
export function longDate(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: tz,
  }).format(ms);
}

export function dayKey(ms: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(ms);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function describeDue(dueMs: number, nowMs: number, tz: string): string {
  const mins = Math.round((dueMs - nowMs) / 60000);
  if (mins >= 0 && mins < 60) return mins <= 1 ? "dans une minute" : `dans ${mins} minutes`;
  const diff = Math.round((Date.parse(dayKey(dueMs, tz)) - Date.parse(dayKey(nowMs, tz))) / 86400000);
  const t = speakTime(dueMs, tz);
  if (diff === 0) return `aujourd'hui à ${t}`;
  if (diff === 1) return `demain à ${t}`;
  if (diff === 2) return `après-demain à ${t}`;
  if (diff === -1) return `hier à ${t}`;
  const d = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(dueMs);
  return `le ${d} à ${t}`;
}

export function formatDuration(totalSec: number): string {
  const sec = Math.max(0, Math.round(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} heure${h > 1 ? "s" : ""}`);
  if (m) parts.push(`${m} minute${m > 1 ? "s" : ""}`);
  if (s && !h) parts.push(`${s} seconde${s > 1 ? "s" : ""}`);
  return parts.length ? parts.join(" et ") : "0 seconde";
}

export function formatUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d} jour${d > 1 ? "s" : ""}${h ? ` et ${h} heure${h > 1 ? "s" : ""}` : ""}`;
  if (h) return `${h} heure${h > 1 ? "s" : ""}${m ? ` et ${m} minute${m > 1 ? "s" : ""}` : ""}`;
  return `${Math.max(1, m)} minute${m > 1 ? "s" : ""}`;
}

export function gb(bytes: number): string {
  return `${(bytes / 1073741824).toFixed(1).replace(".", ",")} Go`;
}

export function formatNumber(v: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(v);
}

export function weekdayName(date: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function firstSentences(text: string, n: number): string {
  const parts = text.replace(/\s+/g, " ").match(/[^.!?]+(?:[.!?]+|$)/g) ?? [text];
  return parts.slice(0, n).join("").trim();
}

const STOP = new Set(
  (
    "le la les l un une des de du d au aux a et ou mais donc or ni car que qu qui quoi quel quelle quels quelles " +
    "est sont es suis etre ai as avons avez ont avoir mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs " +
    "je j tu il elle on nous vous ils elles me m te t se s ce c cet cette ces ca cela en y dans sur sous pour par avec " +
    "sans chez vers ne pas plus tres bien tout tous toute toutes fait faire dit dire peux peut veux veut moi toi lui " +
    "comment combien quand pourquoi jarvis sil stp svp merci tache taches rappel rappels liste termine terminee fini " +
    "finie coche valide marque supprime efface retire enleve oublie memoire retiens souviens numero cest quest"
  ).split(" "),
);

export function keywords(f: string): string[] {
  return f.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Index of the item sharing the most keywords with the query, or -1. */
export function bestMatch(queryFolded: string, items: string[]): number {
  const q = new Set(keywords(queryFolded));
  let best = -1;
  let score = 0;
  items.forEach((it, i) => {
    const k = keywords(foldForMatch(it));
    const s = k.filter((w) => q.has(w)).length;
    if (s > score) {
      score = s;
      best = i;
    }
  });
  return best;
}
