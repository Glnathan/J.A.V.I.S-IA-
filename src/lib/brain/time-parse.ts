// French date / duration parsing ("dans 10 minutes", "demain à 14h30", "un quart d'heure"...).
// All functions work on folded strings (see foldForMatch) and return spans aligned with the input.

export interface Span {
  start: number;
  end: number;
}

const NUM_WORDS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, "dix sept": 17, "dix huit": 18,
  "dix neuf": 19, vingt: 20, "vingt cinq": 25, trente: 30, quarante: 40, "quarante cinq": 45,
  cinquante: 50, soixante: 60, cent: 100,
};

const NUM =
  "(\\d+(?:[.,]\\d+)?|dix sept|dix huit|dix neuf|vingt cinq|quarante cinq|une|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|cent)";

export function toNumber(s: string): number {
  const t = s.trim();
  if (/^\d/.test(t)) return parseFloat(t.replace(",", "."));
  return NUM_WORDS[t] ?? NaN;
}

function unitSeconds(u: string): number {
  if (u.startsWith("sem")) return 604800;
  if (u.startsWith("j")) return 86400;
  if (u.startsWith("h")) return 3600;
  if (u.startsWith("s")) return 1;
  return 60;
}

/** Sum of every duration mentioned (for timers). */
export function parseDuration(f: string): { seconds: number; spans: Span[] } {
  let seconds = 0;
  const spans: Span[] = [];
  const add = (re: RegExp, fn: (m: RegExpExecArray) => number) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(f))) {
      const s = m.index;
      const e = m.index + m[0].length;
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (spans.some((sp) => s < sp.end && e > sp.start)) continue;
      const v = fn(m);
      if (!Number.isFinite(v) || v <= 0) continue;
      seconds += v;
      spans.push({ start: s, end: e });
    }
  };
  add(/\b(\d+)\s*h\s*(\d{1,2})\b/g, (m) => Number(m[1]) * 3600 + Number(m[2]) * 60);
  add(/\btrois\s+quarts?\s+d\s*heure\b/g, () => 2700);
  add(/\b(?:un\s+)?quart\s+d\s*heure\b/g, () => 900);
  add(/\b(?:une\s+)?demi\s*heure\b/g, () => 1800);
  add(new RegExp(`\\b${NUM}\\s*(?:heures?|h)\\s+et\\s+demie?\\b`, "g"), (m) => toNumber(m[1]) * 3600 + 1800);
  add(
    new RegExp(`\\b${NUM}\\s*(heures?|hrs?|h|minutes?|mins?|mn|secondes?|secs?|s)\\b`, "g"),
    (m) => toNumber(m[1]) * unitSeconds(m[2]),
  );
  return { seconds: Math.round(seconds), spans };
}

const REL_UNIT = "(heures?|hrs?|h|minutes?|mins?|mn|secondes?|secs?|s|jours?|semaines?)";

function relativeDuration(f: string): { seconds: number; span: Span } | null {
  const re = new RegExp(
    `\\bdans\\s+(?:(\\d+)\\s*h\\s*(\\d{2})|(une\\s+demi\\s*heure)|(un\\s+quart\\s+d\\s*heure)|(trois\\s+quarts?\\s+d\\s*heure)|${NUM}\\s*${REL_UNIT}(?:\\s+et\\s+(?:(demie?)|${NUM}\\s*${REL_UNIT}))?)\\b`,
  );
  const m = re.exec(f);
  if (!m) return null;
  let seconds = 0;
  if (m[1]) seconds = Number(m[1]) * 3600 + Number(m[2]) * 60;
  else if (m[3]) seconds = 1800;
  else if (m[4]) seconds = 900;
  else if (m[5]) seconds = 2700;
  else if (m[6] && m[7]) {
    const u = unitSeconds(m[7]);
    seconds = toNumber(m[6]) * u;
    if (m[8]) seconds += u / 2;
    else if (m[9] && m[10]) seconds += toNumber(m[9]) * unitSeconds(m[10]);
  }
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return { seconds, span: { start: m.index, end: m.index + m[0].length } };
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/**
 * Parses when something should happen. Returns the due timestamp (UTC ms) and the spans
 * of text that described the moment (so they can be removed from a reminder title).
 * tzOffset follows Date#getTimezoneOffset (minutes, positive west of UTC).
 */
export function parseWhen(f: string, nowMs: number, tzOffset: number): { due: number | null; spans: Span[] } {
  const rel = relativeDuration(f);
  if (rel) return { due: nowMs + rel.seconds * 1000, spans: [rel.span] };

  const spans: Span[] = [];
  let hour: number | null = null;
  let minute = 0;

  const clock = /\b(?:a|vers|pour|des|avant)\s+(\d{1,2})\s*(?:h|heures?|:)\s*(\d{2})?(?:\s+(du matin|du soir|de l apres midi))?\b/.exec(f);
  const noon = /\b(?:a|vers|pour)\s+(midi|minuit)(\s+et\s+demie?)?\b/.exec(f);
  if (clock) {
    hour = Number(clock[1]);
    minute = clock[2] ? Number(clock[2]) : 0;
    if (clock[3] && clock[3] !== "du matin" && hour < 12) hour += 12;
    spans.push({ start: clock.index, end: clock.index + clock[0].length });
  } else if (noon) {
    hour = noon[1] === "midi" ? 12 : 0;
    minute = noon[2] ? 30 : 0;
    spans.push({ start: noon.index, end: noon.index + noon[0].length });
  }

  const day =
    /\b(apres\s+demain|demain|aujourd\s*hui|ce\s+soir|cette\s+nuit|ce\s+matin|ce\s+midi|cet\s+apres\s+midi|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+(matin|midi|apres\s+midi|soir|prochain))?\b/.exec(
      f,
    );
  let addDays: number | null = null;
  let partHour: number | null = null;
  if (day) {
    spans.push({ start: day.index, end: day.index + day[0].length });
    const w = day[1].replace(/\s+/g, " ");
    const wall = new Date(nowMs - tzOffset * 60000);
    if (w === "apres demain") addDays = 2;
    else if (w === "demain") addDays = 1;
    else if (w.startsWith("aujourd")) addDays = 0;
    else if (w === "ce soir") { addDays = 0; partHour = 20; }
    else if (w === "cette nuit") { addDays = 0; partHour = 23; }
    else if (w === "ce matin") { addDays = 0; partHour = 9; }
    else if (w === "ce midi") { addDays = 0; partHour = 12; }
    else if (w === "cet apres midi") { addDays = 0; partHour = 15; }
    else {
      const idx = WEEKDAYS.indexOf(w);
      if (idx >= 0) {
        const diff = (idx - wall.getUTCDay() + 7) % 7;
        addDays = diff === 0 ? 7 : diff;
      }
    }
    const part = day[2]?.replace(/\s+/g, " ");
    if (part === "matin") partHour = 9;
    else if (part === "midi") partHour = 12;
    else if (part === "apres midi") partHour = 15;
    else if (part === "soir") partHour = 20;
  }

  if (hour === null && addDays === null) return { due: null, spans: [] };

  const wall = new Date(nowMs - tzOffset * 60000);
  const h = hour ?? partHour ?? 9;
  let due = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate() + (addDays ?? 0), h, minute) + tzOffset * 60000;
  if (addDays === null && due <= nowMs) due += 86400000;
  return { due, spans };
}

/** Replace the given spans by spaces (keeps string length). */
export function maskSpans(s: string, spans: Span[]): string {
  if (!spans.length) return s;
  const chars = s.split("");
  for (const sp of spans) for (let i = sp.start; i < sp.end && i < chars.length; i++) chars[i] = " ";
  return chars.join("");
}
