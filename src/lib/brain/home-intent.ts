// Understands home-automation sentences in French and executes them through Home Assistant:
//  1) Home Assistant's own Assist agent (conversation API) — it knows your rooms, aliases and devices;
//  2) JARVIS's direct matching (friendly names + rooms) as a fallback.
import { isDesktop } from "@/lib/runtime";
import type { Card, HomeEntity } from "@/lib/types";
import { assist, callService, haErrorMessage, listEntities, serviceFor, type HAConfig, type HomeCommand, type ServiceCall } from "./home-assistant";
import { foldForMatch } from "./text";

export interface HomeReply {
  text: string;
  ok: boolean;
  cards?: Card[];
}

interface DeviceWord {
  re: RegExp;
  domains: string[];
}

const VERB_RE =
  /\b(allume|allumer|allumes|eteins|eteindre|eteint|active|activer|desactive|desactiver|ouvre|ouvrir|ferme|fermer|monte|monter|baisse|baisser|leve|lever|descends|descendre|regle|regler|mets|mettre|passe|passer|lance|lancer|demarre|demarrer|arrete|arreter|coupe|couper|bascule|inverse|declenche|declencher|verrouille|verrouiller|deverrouille|deverrouiller|chauffe|tamise)\b/;
const QUERY_RE = /\b(temperature|humidite|degres?|etat|allumee?s?|eteinte?s?|ouverte?s?|fermee?s?|verrouillee?s?|en marche|chaud|froid)\b/;
const EXPLICIT_RE = /\b(home assistant|domotique|maison connectee)\b/;
const INDOOR_RE = /\b(maison|interieur|dedans|chez moi|appartement|salon|chambre|cuisine|bureau|salle|garage|cave|grenier|couloir|entree|piece)\b/;
const TEMP_Q_RE = /\b(temperature|degres?|chaud|froid)\b/;
const VALUE_RE = /\b\d{1,3}(?:[.,]\d)?\s*(?:%|pour ?cent|degres?|°)/;
const LIST_Q_RE = /\b(qu est ce qui|quels?|quelles?|lesquel(?:le)?s?|y a t il)\b.*\b(allumee?s?|en marche|ouverte?s?|actifs?|actives?)\b/;
const NOT_HOME_RE = /\b(google|youtube|internet|site|web|recherche|cherche|musique|chanson|video|film|spotify|deezer|netflix|wikipedia|maps|actualites?|meteo|minuteur|rappel)\b/;
const SENSITIVE_TEXT_RE =
  /\b(ouvre|ouvrir|deverrouille|deverrouiller|debloque|desarme|desarmer)\b.*\b(garage|portail|porte|serrure|verrou|alarme)\b|\b(desactive|desactiver|coupe|couper|eteins|eteindre|arrete|arreter)\b.*\balarme\b/;

const DEVICE_WORDS: DeviceWord[] = [
  { re: /\b(lumieres?|lampes?|eclairages?|plafonniers?|spots?|leds?|lustres?|ampoules?|veilleuses?|appliques?|guirlandes?)\b/, domains: ["light", "switch"] },
  { re: /\b(prises?|multiprises?)\b/, domains: ["switch"] },
  { re: /\b(volets?|stores?|rideaux?|persiennes?|velux)\b/, domains: ["cover"] },
  { re: /\b(chauffages?|radiateurs?|thermostats?|clim|climatisation|climatiseur|pompe a chaleur|chaudiere)\b/, domains: ["climate", "water_heater", "switch"] },
  { re: /\b(ventilateurs?|ventilos?|vmc)\b/, domains: ["fan", "switch"] },
  { re: /\b(tele|tv|television|enceintes?|sonos|chromecast|ampli|home cinema)\b/, domains: ["media_player", "switch"] },
  { re: /\b(aspirateur|robot)\b/, domains: ["vacuum"] },
  { re: /\b(scenes?|ambiances?)\b/, domains: ["scene"] },
  { re: /\b(scripts?|routines?)\b/, domains: ["script"] },
  { re: /\b(portails?|garage)\b/, domains: ["cover"] },
  { re: /\b(serrures?|verrous?)\b/, domains: ["lock"] },
  { re: /\b(arrosage|irrigation|vanne)\b/, domains: ["valve", "switch"] },
  { re: /\b(chauffe eau|ballon d eau chaude)\b/, domains: ["water_heater", "switch"] },
];
const LIGHTS = DEVICE_WORDS[0];

const STOP = new Set(
  "le la les l un une des de du d au aux a et en dans sur pour par avec mon ma mes ton ta tes son sa ses notre nos votre vos leur leurs je tu il elle on nous vous ils elles me m te t se s ce c cet cette ces ca y est sont plait stp svp jarvis moi toi lui qui que qu quoi".split(" "),
);
const GENERIC = new Set(
  "lumiere lampe eclairage temperature humidite capteur sensor maison home etat appareil tout toute tou toutes mode salle piece light switch prise volet store thermostat chauffage radiateur scene script porte fenetre niveau batterie".split(" "),
);

const singular = (w: string) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w);
const tokens = (s: string) =>
  foldForMatch(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .map(singular);
const nameTokens = (name: string) => tokens(name).filter((w) => !GENERIC.has(w));

function joinFr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(n);
const numeric = (s: string): number | null => (s.trim() !== "" && Number.isFinite(Number(s)) ? Number(s) : null);

const STATE_FR: Record<string, string> = {
  on: "allumé", off: "éteint", open: "ouvert", closed: "fermé", opening: "en ouverture", closing: "en fermeture",
  locked: "verrouillé", unlocked: "déverrouillé", locking: "en verrouillage", unlocking: "en déverrouillage", jammed: "bloqué",
  playing: "en lecture", paused: "en pause", idle: "inactif", standby: "en veille", buffering: "en chargement",
  cleaning: "en nettoyage", docked: "sur sa base", returning: "retour à la base", heat: "en chauffe", cool: "en climatisation",
  heat_cool: "automatique", auto: "automatique", dry: "déshumidification", fan_only: "ventilation",
  armed_home: "armée (présence)", armed_away: "armée (absence)", armed_night: "armée (nuit)", disarmed: "désarmée",
  triggered: "déclenchée", home: "à la maison", not_home: "absent",
};

function describeState(e: HomeEntity): string {
  if (e.state === "unavailable") return "indisponible";
  if (e.state === "unknown") return "état inconnu";
  if (e.domain === "climate") {
    const parts = [STATE_FR[e.state] ?? e.state];
    if (e.currentTemperature !== null) parts.push(`${fmt(e.currentTemperature)} °C mesurés`);
    if (e.targetTemperature !== null) parts.push(`consigne ${fmt(e.targetTemperature)} °C`);
    return parts.join(", ");
  }
  const n = numeric(e.state);
  if (n !== null) return `${fmt(n)}${e.unit ? ` ${e.unit}` : ""}`;
  if (e.domain === "light" && e.state === "on" && e.brightness !== null) return `allumé (${e.brightness} %)`;
  return STATE_FR[e.state] ?? e.state;
}

function sensitiveRefusal(sir: string): string {
  return `Par sécurité, je n'ouvre ni porte, ni portail, ni serrure, et je ne désactive pas l'alarme, ${sir}. ${
    isDesktop() ? "Vous pouvez l'autoriser dans Paramètres → Maison." : "Cette action est réservée à la version PC de JARVIS."
  }`;
}

function detectCommand(f: string): { cmd: HomeCommand | "query"; value?: number } | null {
  const temp = /\b(\d{1,2}(?:[.,]\d)?)\s*(?:degres?|°|deg)\b/.exec(f);
  if (temp && /\b(regle|regler|mets|mettre|passe|passer|monte|baisse|chauffe|temperature|thermostat|chauffage|clim|radiateur)\b/.test(f) && !/\b(quel|quelle|combien|est ce)\b/.test(f))
    return { cmd: "set_temp", value: parseFloat(temp[1].replace(",", ".")) };
  const pct = /\b(\d{1,3})\s*(?:%|pour ?cent)/.exec(f);
  if (pct && /\b(lumieres?|lampes?|luminosite|eclairage|intensite|mets|regle|baisse|monte|tamise|volets?|stores?)\b/.test(f)) return { cmd: "brightness", value: parseInt(pct[1], 10) };
  if (LIST_Q_RE.test(f) || /\b(quel|quelle|quels|quelles|combien|est ce qu|qu est ce qui|est il|est elle|sont ils|sont elles|etat|il fait combien|dis moi si)\b/.test(f)) return { cmd: "query" };
  if (/\b(deverrouille|deverrouiller)\b/.test(f)) return { cmd: "open" };
  if (/\b(verrouille|verrouiller)\b/.test(f)) return { cmd: "close" };
  if (/\b(eteins|eteindre|eteint|desactive|desactiver|coupe|couper)\b/.test(f)) return { cmd: "off" };
  if (/\b(arrete|arreter|stoppe|stop)\b/.test(f)) return { cmd: "stop" };
  if (/\b(ouvre|ouvrir|monte|monter|leve|lever|remonte)\b/.test(f)) return { cmd: "open" };
  if (/\b(ferme|fermer|baisse|baisser|descends|descendre|abaisse)\b/.test(f)) return { cmd: "close" };
  if (/\b(bascule|inverse)\b/.test(f)) return { cmd: "toggle" };
  if (/\b(lance|lancer|active|activer|declenche|declencher|demarre|demarrer)\b/.test(f) || /\b(passe|mets)\s+(?:en\s+)?mode\b/.test(f)) return { cmd: "activate" };
  if (/\b(allume|allumer|allumes|enclenche)\b/.test(f) || /\bmets en marche\b/.test(f)) return { cmd: "on" };
  return null;
}

interface Targeting {
  targets: HomeEntity[];
  area: string | null;
  device: DeviceWord | null;
  all: boolean;
}

function locate(f: string, cmd: Set<string>, entities: HomeEntity[]): Targeting {
  const device = DEVICE_WORDS.find((d) => d.re.test(f)) ?? null;
  const all = /\b(toutes?|tous|tout|partout)\b/.test(f);
  let area: string | null = null;
  let areaTokens: string[] = [];
  for (const a of new Set(entities.map((e) => e.area).filter((x): x is string => Boolean(x)))) {
    const t = tokens(a);
    if (t.length && t.every((w) => cmd.has(w)) && t.join(" ").length > areaTokens.join(" ").length) {
      area = a;
      areaTokens = t;
    }
  }
  const matchesDevice = (e: HomeEntity, d: DeviceWord) => e.domain === d.domains[0] || (d.domains.includes(e.domain) && d.re.test(foldForMatch(e.name)));

  const scored: { e: HomeEntity; score: number; specific: boolean; full: boolean }[] = [];
  for (const e of entities) {
    const nt = nameTokens(e.name);
    const hit = nt.filter((w) => cmd.has(w));
    if (!hit.length) continue;
    const extra = nt.filter((w) => !areaTokens.includes(w));
    const specific = extra.length > 0 && extra.every((w) => cmd.has(w));
    let score = hit.length + hit.length / nt.length + (specific ? 1 : 0);
    if (device) score += device.domains.includes(e.domain) ? (device.domains[0] === e.domain ? 1 : 0.5) : -1;
    if (area && e.area === area) score += 0.5;
    scored.push({ e, score, specific, full: hit.length === nt.length });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored.length ? scored[0].score : 0;
  const tied = scored.filter((s) => Math.abs(s.score - best) < 1e-6);
  const specific = tied.filter((s) => s.specific).map((s) => s.e);
  const result = (targets: HomeEntity[], dev: DeviceWord | null = device): Targeting => ({ targets: targets.slice(0, 12), area, device: dev, all });

  if (device && (area || all) && !(specific.length && !all)) {
    const group = entities.filter((e) => (!area || e.area === area) && matchesDevice(e, device));
    if (group.length) return result(group);
  }
  if (specific.length) return result(device ? specific.filter((e) => device.domains.includes(e.domain)).concat(specific.filter((e) => !device.domains.includes(e.domain))) : specific);
  if (!device && area) {
    const lights = entities.filter((e) => e.area === area && matchesDevice(e, LIGHTS));
    if (lights.length) return result(lights, LIGHTS);
  }
  if (!device && all) {
    const lights = entities.filter((e) => matchesDevice(e, LIGHTS));
    if (lights.length) return result(lights, LIGHTS);
  }
  // Partial name matches: only accepted when a device type was mentioned, or when the whole name was said.
  const top = tied.filter((s) => device || s.full).map((s) => s.e);
  if (top.length) {
    const filtered = device ? top.filter((e) => device.domains.includes(e.domain)) : top;
    return result(filtered.length ? filtered : top);
  }
  if (device && !area) {
    const only = entities.filter((e) => matchesDevice(e, device));
    if (only.length === 1) return result(only);
  }
  return result([]);
}

function answerQuery(f: string, entities: HomeEntity[], loc: Targeting, sir: string): HomeReply | null {
  const hum = /\bhumidite\b/.test(f);
  if (hum || TEMP_Q_RE.test(f)) {
    const cls = hum ? "humidity" : "temperature";
    const pool0 = entities.filter(
      (e) => (e.domain === "sensor" && e.deviceClass === cls && numeric(e.state) !== null) || (!hum && e.domain === "climate" && e.currentTemperature !== null),
    );
    const named = loc.targets.filter((e) => pool0.includes(e));
    const pool1 = named.length ? named : loc.area ? pool0.filter((e) => e.area === loc.area) : pool0;
    // Prefer real sensors over thermostats, one reading per room.
    const seen = new Set<string>();
    const pool = [...pool1]
      .sort((a, b) => Number(a.domain === "climate") - Number(b.domain === "climate"))
      .filter((e) => {
        const k = e.area ?? e.id;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    if (!pool.length) return { ok: false, text: `Je ne trouve aucun capteur ${hum ? "d'humidité" : "de température"}${loc.area ? ` dans ${loc.area}` : ""}, ${sir}.` };
    const val = (e: HomeEntity) => (e.domain === "climate" ? (e.currentTemperature ?? 0) : (numeric(e.state) ?? 0));
    if (pool.length === 1 || named.length || loc.area) {
      const e = pool[0];
      const where = loc.area ? `dans ${loc.area}` : `selon ${e.name}`;
      return { ok: true, text: hum ? `L'humidité est de ${fmt(val(e))} % ${where}, ${sir}.` : `Il fait ${fmt(val(e))} °C ${where}, ${sir}.` };
    }
    const items = pool.slice(0, 10).map((e) => `${e.area ?? e.name} : ${fmt(val(e))}${hum ? " %" : " °C"}`);
    return { ok: true, text: `Voici les relevés, ${sir} : ${items.slice(0, 5).join(" ; ")}.`, cards: [{ kind: "list", title: hum ? "Humidité" : "Températures", items }] };
  }
  const listQ = /\b(quels?|quelles?|qu est ce qui|lesquel(?:le)?s?|y a t il)\b/.test(f);
  if (listQ && /\b(allumee?s?|en marche|ouverte?s?|actifs?|actives?)\b/.test(f)) {
    const openQ = /\bouverte?s?\b/.test(f);
    const onStates = new Set(["on", "playing", "heat", "cool", "heat_cool", "auto", "dry", "fan_only", "cleaning"]);
    let pool = entities.filter((e) =>
      openQ
        ? ["cover", "valve", "lock"].includes(e.domain) && ["open", "opening", "unlocked"].includes(e.state)
        : ["light", "switch", "fan", "media_player", "input_boolean", "climate", "humidifier", "vacuum"].includes(e.domain) && onStates.has(e.state),
    );
    const dev = loc.device;
    if (dev) pool = pool.filter((e) => e.domain === dev.domains[0] || (dev.domains.includes(e.domain) && dev.re.test(foldForMatch(e.name))));
    if (loc.area) pool = pool.filter((e) => e.area === loc.area);
    const where = loc.area ? ` dans ${loc.area}` : "";
    if (!pool.length) return { ok: true, text: openQ ? `Tout est fermé${where}, ${sir}.` : `Rien n'est allumé${where}, ${sir}.` };
    const names = pool.map((e) => e.name);
    const n = names.length;
    return {
      ok: true,
      text: `${n} appareil${n > 1 ? "s" : ""} ${openQ ? "ouvert" : "allumé"}${n > 1 ? "s" : ""}${where}, ${sir} : ${joinFr(names.slice(0, 6))}${n > 6 ? "…" : "."}`,
      cards: [{ kind: "list", title: openQ ? "Ouverts" : "Allumés", items: names }],
    };
  }
  if (loc.targets.length) {
    const items = loc.targets.slice(0, 6).map((e) => `${e.name} : ${describeState(e)}`);
    return { ok: true, text: `${items.join(". ")}.`, cards: loc.targets.length > 1 ? [{ kind: "list", title: "État des appareils", items }] : undefined };
  }
  return null;
}

function phrase(cmd: HomeCommand, done: HomeEntity[], area: string | null, value?: number): string {
  const d = done[0].domain;
  const names = done.length > 3 ? `${done.length} appareils${area ? ` (${area})` : ""}` : joinFr(done.map((e) => e.name));
  switch (cmd) {
    case "set_temp":
      return `Je règle ${names} sur ${fmt(value ?? 0)} °C`;
    case "brightness":
      return d === "cover" ? `Je règle ${names} à ${value} %` : `Je règle ${names} à ${value} % de luminosité`;
    case "toggle":
      return `Je bascule ${names}`;
    case "stop":
      if (d === "cover" || d === "vacuum") return `J'arrête ${names}`;
      break;
  }
  if (d === "cover" || d === "valve") return cmd === "close" || cmd === "off" || cmd === "stop" ? `Je ferme ${names}` : `J'ouvre ${names}`;
  if (d === "lock") return cmd === "open" || cmd === "off" ? `Je déverrouille ${names}` : `Je verrouille ${names}`;
  if (d === "scene") return `J'active ${done.length === 1 && !/^sc[eè]ne\b/i.test(names) ? `la scène ${names}` : names}`;
  if (d === "script" || d === "button" || d === "input_button" || d === "automation") return `Je lance ${names}`;
  if (d === "vacuum") return cmd === "off" || cmd === "close" ? `Je renvoie ${names} à sa base` : `Je lance ${names}`;
  if (cmd === "off" || cmd === "close" || cmd === "stop") return `J'éteins ${names}`;
  return d === "light" || d === "switch" ? `J'allume ${names}` : `J'active ${names}`;
}

function polish(speech: string, sir: string): string {
  const s = speech.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
  if (!s) return `C'est fait, ${sir}.`;
  return s.length <= 60 && !s.endsWith("?") ? `${s}, ${sir}.` : `${s}.`;
}

async function direct(f: string, cmd: Set<string>, sir: string, cfg: HAConfig, entities: HomeEntity[], strong: boolean): Promise<HomeReply | null> {
  const det = detectCommand(f);
  const loc = locate(f, cmd, entities);
  if (!det || det.cmd === "query") {
    const q = answerQuery(f, entities, loc, sir);
    if (q) return q;
    return strong ? { ok: false, text: `Je n'ai pas compris quelle action effectuer dans la maison, ${sir}.` } : null;
  }
  if (!loc.targets.length) {
    const dev = loc.device;
    if (!strong && !dev) return null;
    const candidates = dev ? entities.filter((e) => dev.domains.includes(e.domain)).length : 0;
    return {
      ok: false,
      text:
        candidates > 1
          ? `Précisez la pièce ou le nom de l'appareil, ${sir} : j'en vois ${candidates} de ce type.`
          : `Je ne trouve pas cet appareil dans Home Assistant, ${sir}. Vérifiez son nom, ou donnez-lui un alias.`,
    };
  }
  const plans = loc.targets.map((e) => ({ e, call: serviceFor(e, det.cmd as HomeCommand, det.value, cfg.allowSensitive) }));
  const blocked = plans.some((p) => p.call === "blocked");
  const doable = plans.filter((p): p is { e: HomeEntity; call: ServiceCall } => p.call !== null && p.call !== "blocked");
  if (!doable.length) {
    return { ok: false, text: blocked ? sensitiveRefusal(sir) : `Cette action n'est pas possible sur ${joinFr(loc.targets.slice(0, 3).map((e) => e.name))}, ${sir}.` };
  }
  const results = await Promise.allSettled(doable.map((p) => callService(cfg, p.call)));
  const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed.length === results.length) return { ok: false, text: `Home Assistant a refusé la commande, ${sir} : ${haErrorMessage(failed[0].reason)}.` };
  const done = doable.filter((_, i) => results[i].status === "fulfilled").map((p) => p.e);
  let out = `${phrase(det.cmd, done, loc.area, det.value)}, ${sir}.`;
  if (failed.length) out += ` ${failed.length} appareil${failed.length > 1 ? "s n'ont" : " n'a"} pas répondu.`;
  if (blocked) out += " Par sécurité, les portes, serrures et alarmes ont été ignorées.";
  return { ok: true, text: out };
}

/** True when the sentence clearly looks like a home-automation order (used to guide users before Home Assistant is set up). */
export function looksLikeHomeCommand(text: string): boolean {
  const f = foldForMatch(text);
  if (EXPLICIT_RE.test(f)) return true;
  return (VERB_RE.test(f) || VALUE_RE.test(f)) && DEVICE_WORDS.some((d) => d.re.test(f)) && !NOT_HOME_RE.test(f);
}

/**
 * Returns a reply when the sentence is a home-automation command/question, or null to let
 * the other JARVIS intents handle it. `force` = explicit order (e.g. from the AI [[MAISON:…]] tag).
 */
export async function handleHome(text: string, sir: string, cfg: HAConfig, favorites: string[], force = false): Promise<HomeReply | null> {
  const f = foldForMatch(text);
  const explicit = EXPLICIT_RE.test(f);
  const valueCmd = VALUE_RE.test(f);
  const listQ = LIST_Q_RE.test(f);
  if (!force && !explicit && !valueCmd && !listQ && !VERB_RE.test(f) && !QUERY_RE.test(f)) return null;
  const device = DEVICE_WORDS.find((d) => d.re.test(f)) ?? null;
  if (!force && !device && !explicit && NOT_HOME_RE.test(f)) return null;
  if (SENSITIVE_TEXT_RE.test(f) && !cfg.allowSensitive) return { ok: false, text: sensitiveRefusal(sir) };

  let entities: HomeEntity[];
  try {
    entities = await listEntities(cfg, favorites);
  } catch (e) {
    return device || explicit || force ? { ok: false, text: `Home Assistant ne répond pas, ${sir} : ${haErrorMessage(e)}.` } : null;
  }
  const cmd = new Set(tokens(text));
  const nameHit = entities.some((e) => nameTokens(e.name).some((w) => cmd.has(w)));
  const areaHit = entities.some((e) => {
    if (!e.area) return false;
    const t = tokens(e.area);
    return t.length > 0 && t.every((w) => cmd.has(w));
  });
  const indoorTemp = TEMP_Q_RE.test(f) && INDOOR_RE.test(f);
  if (!force && !explicit && !device && !nameHit && !areaHit && !indoorTemp && !listQ) return null;

  if (cfg.useAssist) {
    try {
      const a = await assist(cfg, text.trim());
      if (a.type === "action_done" || a.type === "query_answer") return { ok: true, text: polish(a.speech, sir) };
    } catch (e) {
      console.warn("[home] Assist indisponible :", haErrorMessage(e));
    }
  }
  return direct(f, cmd, sir, cfg, entities, Boolean(device || explicit || force || indoorTemp || listQ));
}
