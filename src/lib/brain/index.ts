// J.A.R.V.I.S. brain orchestration: command cleanup, local intents, knowledge fallback,
// LLM system prompt and LLM action tags.
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { memories, tasks } from "@/db/schema";
import type { BrainResult, ClientAction, ClientContext, ControlProposal } from "@/lib/types";
import { INTENTS, say, stripParens, X, grab, type Ctx } from "./intents";
import { handleHome } from "./home-intent";
import { haConfig } from "./home-assistant";
import { address, favoritesOf, type SettingsRow } from "./settings";
import { SEARCH } from "./sites";
import { bestMatch, describeDue, firstSentences, foldForMatch, longDate, safeTz, speakTime, trimPunct, tzOffsetFor } from "./text";
import { wikiSummary } from "./wiki";

export type { Ctx };

const WAKE = "(?:jarvis|jarvi|djarvis|jarvisse|jarviss)";

/** Removes the wake word, polite formulas and "peux-tu…" prefixes. */
export function cleanCommand(input: string): string {
  let t = input.normalize("NFC").replace(/\s+/g, " ").trim();
  const strip = (re: RegExp) => {
    const f = foldForMatch(t);
    const m = re.exec(f);
    if (m && m[0].length) t = `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim();
  };
  strip(new RegExp(`^\\s*(?:(?:ok|okay|dis|hey|he|eh|yo|allo)\\s+)?${WAKE}\\b[\\s,]*`));
  strip(new RegExp(`[\\s,]*\\b${WAKE}\\s*$`));
  strip(/\s*\b(?:s il (?:te|vous) plait|stp|svp)\s*$/);
  strip(/^\s*(?:s il (?:te|vous) plait|stp|svp)\b\s*/);
  strip(
    /^\s*(?:est ce que\s+)?(?:tu (?:peux|pourrais|veux bien|voudrais bien)|peux tu|pourrais tu|voudrais tu|veux tu|pourriez vous|pouvez vous|voulez vous|je (?:voudrais|veux|souhaite|souhaiterais|aimerais) que tu|j aimerais que tu|merci de)\s+/,
  );
  return t.replace(/^[\s,.;:!?]+/, "").trim();
}

export function makeCtx(text: string, s: SettingsRow, client: Partial<ClientContext>, hasLLM: boolean): Ctx {
  const tz = safeTz(client.timezone);
  const tzOffset = typeof client.tzOffset === "number" && Math.abs(client.tzOffset) <= 900 ? client.tzOffset : tzOffsetFor(tz);
  const { sir, Sir } = address(s);
  const cc: ClientContext = {
    now: new Date().toISOString(),
    timezone: tz,
    tzOffset,
    battery: client.battery ?? null,
    online: client.online,
    cores: client.cores,
    memory: client.memory,
    userAgent: client.userAgent,
    timers: Array.isArray(client.timers) ? client.timers.slice(0, 10) : [],
  };
  return { text, f: foldForMatch(text), s, client: cc, hasLLM, sir, Sir, tz, now: Date.now(), tzOffset };
}

export async function runLocalBrain(c: Ctx): Promise<BrainResult | null> {
  for (const intent of INTENTS) {
    if (intent.fallbackOnly && c.hasLLM) continue;
    try {
      const r = await intent.run(c);
      if (r) return r;
    } catch (e) {
      console.error(`[jarvis] intent "${intent.name}" failed:`, e);
    }
  }
  return null;
}

async function memoryLookup(c: Ctx): Promise<BrainResult | null> {
  if (!/\b(mon|ma|mes|je|j|moi)\b/.test(c.f)) return null;
  if (!/\b(quel|quelle|quels|quelles|c est quoi|ou|quand|comment|combien|qui|est ce que|tu te souviens|tu sais|rappelle toi)\b/.test(c.f)) return null;
  const mems = await db.select().from(memories).orderBy(desc(memories.createdAt)).limit(200);
  if (!mems.length) return null;
  const idx = bestMatch(c.f, mems.map((m) => m.content));
  if (idx < 0) return null;
  return say(`D'après ma mémoire, ${c.sir} : « ${mems[idx].content} ».`, { source: "memory" });
}

const KNOWLEDGE_RE =
  /^\s*(?:qui\s+(?:est|etait|sont|etaient|fut)|qui\s+a\s+(?:invente|cree|decouvert|ecrit|fonde|peint|compose|realise|construit|gagne|dessine)|c\s+est\s+quoi|c\s+etait\s+quoi|qu\s+est\s+ce\s+qu(?:e|i)?(?:\s+(?:un|une|le|la|les|l|des))?|que\s+(?:signifie|veut\s+dire)|definition\s+(?:de|du|d|des)|definis|parle\s+moi\s+(?:de|d|du|des)|dis\s+moi\s+(?:ce\s+que\s+tu\s+sais\s+sur|qui\s+est|ce\s+qu\s+est)|explique\s+moi|raconte\s+moi|tu\s+connais|connais\s+tu|sais\s+tu\s+(?:qui|ce\s+qu)\s+est)\s+(.+?)\s*$/;
const QUESTION_RE = /^\s*(?:quelle|quel|quels|quelles|ou|quand|combien)\s+(?:est|sont|etait|etaient|se\s+trouve|a|ont)?\s*(.+?)\s*$/;

async function knowledgeLookup(c: Ctx): Promise<BrainResult | null> {
  const m = X(KNOWLEDGE_RE, c.f) ?? X(QUESTION_RE, c.f);
  if (!m) return null;
  let subject = grab(c, m, 1);
  subject = subject.replace(/^(?:un|une|le|la|les|l'|l’|des|du|de)\s+/i, "").trim();
  if (subject.length < 2) return null;
  const w = await wikiSummary(subject);
  if (!w) return null;
  return say(`D'après Wikipédia : ${stripParens(firstSentences(w.extract, 2))}`, { source: "wiki", cards: [{ kind: "wiki", ...w }] });
}

function generic(c: Ctx, reason?: string): BrainResult {
  const q = trimPunct(c.text).slice(0, 80);
  const links = q ? [{ label: `Rechercher « ${q} » sur Google`, url: SEARCH.google(q) }] : [];
  const text = reason
    ? `Mon noyau d'IA ne répond pas (${reason}), ${c.sir}. Vérifiez sa configuration dans les paramètres. En attendant, je peux lancer une recherche sur le web pour vous.`
    : `Je crains de ne pas avoir la réponse, ${c.sir}. Mon noyau d'intelligence avancée n'est pas encore connecté : ajoutez une clé d'IA dans les paramètres — Groq et Google Gemini en proposent gratuitement — et je pourrai répondre à pratiquement toutes vos questions. En attendant, dites « aide » pour découvrir mes capacités.`;
  return say(text, links.length ? { cards: [{ kind: "links", links }] } : {});
}

/** Used when no LLM is configured, or when the LLM failed (reason given). */
export async function fallbackBrain(c: Ctx, reason?: string): Promise<BrainResult> {
  const prefix = reason ? `Mon noyau d'IA ne répond pas (${reason}). ` : "";
  const withPrefix = (r: BrainResult): BrainResult => (prefix ? { ...r, text: prefix + r.text } : r);
  if (c.hasLLM) {
    const r = await runLocalBrain({ ...c, hasLLM: false });
    if (r) return withPrefix(r);
  }
  try {
    const mem = await memoryLookup(c);
    if (mem) return withPrefix(mem);
    const wiki = await knowledgeLookup(c);
    if (wiki) return withPrefix(wiki);
  } catch (e) {
    console.error("[jarvis] fallback lookup failed", e);
  }
  return generic(c, reason);
}

export function buildSystemPrompt(c: Ctx, mems: string[], pending: { title: string; dueAt: Date | null }[]): string {
  const lines = [
    "Tu es J.A.R.V.I.S. (Just A Rather Very Intelligent System), l'assistant IA personnel inspiré de celui de Tony Stark dans Iron Man.",
    `Personnalité : raffiné, loyal, efficace, avec un humour pince-sans-rire très britannique. Tu vouvoies l'utilisateur et tu l'appelles « ${c.sir} »${c.s.userName ? ` (son prénom est ${c.s.userName})` : ""}.`,
    "Tu réponds TOUJOURS en français, sauf demande contraire explicite.",
    "Tes réponses sont lues à voix haute : sois concis et naturel (2 à 4 phrases), sans tableaux ni titres markdown. Développe seulement si on te le demande (explications détaillées, code, rédaction).",
    "Si tu ne sais pas, ou si l'information demandée est trop récente pour toi, dis-le honnêtement.",
    "",
    `Contexte : nous sommes le ${longDate(c.now, c.tz)}, il est ${speakTime(c.now, c.tz)} (fuseau ${c.tz}). Ville de l'utilisateur : ${c.s.city || "inconnue"}.`,
    "",
    "Actions : tu peux déclencher des actions en ajoutant à la toute fin de ta réponse une ou plusieurs balises (elles sont masquées à l'utilisateur) :",
    "[[OUVRIR:https://adresse-complete]] ouvre un site web",
    "[[CLIC:x,y]] propose un clic gauche à la position x,y de l'image fournie (uniquement si l'utilisateur demande d'agir sur l'écran)",
    "[[TEXTE:texte]] propose de taper du texte au clavier (l'utilisateur doit le confirmer)",
    "[[TOUCHE:ctrl+t]] propose une combinaison de touches (entree, tab, echap, f1…)",
    "[[RECHERCHE:requête]] lance une recherche Google",
    "[[YOUTUBE:requête]] cherche une vidéo ou une musique sur YouTube",
    "[[TACHE:intitulé|AAAA-MM-JJTHH:MM]] ajoute une tâche ou un rappel (échéance facultative, heure locale de l'utilisateur)",
    "[[MEMOIRE:fait]] mémorise durablement une information importante sur l'utilisateur",
    "[[MINUTEUR:secondes|libellé]] lance un minuteur",
    "N'utilise une balise que si l'utilisateur le demande ou si c'est clairement utile, et annonce l'action dans ta réponse (ex. « J'ouvre YouTube. »).",
  ];
  if (haConfig(c.s)) {
    lines.splice(
      lines.length - 1,
      0,
      "[[MAISON:ordre en français]] pilote la maison connectée (Home Assistant), ex. [[MAISON:allume la lumière du salon]] ou [[MAISON:mets le chauffage à 21 degrés]]",
    );
  }
  if (mems.length) lines.push("", "Ce que tu sais de l'utilisateur (mémoire à long terme) :", ...mems.map((m) => `- ${m}`));
  if (pending.length)
    lines.push(
      "",
      "Tâches en attente de l'utilisateur :",
      ...pending.map((t) => `- ${t.title}${t.dueAt ? ` (échéance : ${describeDue(t.dueAt.getTime(), c.now, c.tz)})` : ""}`),
    );
  return lines.join("\n");
}

const TAG_RE = /\[\[\s*(OUVRIR|RECHERCHE|YOUTUBE|TACHE|MEMOIRE|MINUTEUR|MAISON|CLIC|TEXTE|TOUCHE)\s*:\s*([^\]]*?)\s*\]\]/gi;

/** Executes the action tags produced by the LLM and returns the cleaned text + client actions. */
/** Analyse une balise de contrôle : [[CLIC:x,y]], [[TEXTE:…]], [[TOUCHE:ctrl+t]]. */
function parseControlTag(kind: string, arg: string): ControlProposal | null {
  if (kind === "CLIC") {
    const m = /^(\d{1,5})\s*,\s*(\d{1,5})$/.exec(arg.replace(/\s/g, ""));
    if (!m) return null;
    return { kind: "click", x: Number(m[1]), y: Number(m[2]) };
  }
  if (kind === "TEXTE") {
    const t = arg.trim().slice(0, 200);
    return t ? { kind: "type", text: t } : null;
  }
  if (kind === "TOUCHE") {
    const c = arg.trim().toLowerCase().slice(0, 30);
    return c ? { kind: "key", combo: c } : null;
  }
  return null;
}

function describeControl(p: ControlProposal): string {
  if (p.kind === "click" || p.kind === "dblclick") return `clic sur (${p.x}, ${p.y})`;
  if (p.kind === "type") return `taper « ${p.text} »`;
  return `touches ${p.combo}`;
}

export async function applyLLMTags(full: string, c: Ctx): Promise<{ text: string; actions: ClientAction[] }> {
  const actions: ClientAction[] = [];
  let taskChanged = false;
  let memChanged = false;
  let homeChanged = false;
  const homeNotes: string[] = [];
  for (const m of full.matchAll(TAG_RE)) {
    const kind = m[1].toUpperCase();
    const arg = (m[2] ?? "").trim();
    if (!arg) continue;
    try {
      switch (kind) {
        case "CLIC":
        case "TEXTE":
        case "TOUCHE": {
          const proposal = parseControlTag(kind, arg);
          if (proposal)
            actions.push({
              type: "control-propose",
              action: proposal,
              description: describeControl(proposal),
            });
          break;
        }
        case "OUVRIR": {
          const url = /^https?:\/\//i.test(arg) ? arg : `https://${arg}`;
          const u = new URL(url);
          actions.push({ type: "open", url: u.toString(), label: u.hostname.replace(/^www\./, "") });
          break;
        }
        case "RECHERCHE":
          actions.push({ type: "open", url: SEARCH.google(arg), label: `Google : ${arg}` });
          break;
        case "YOUTUBE":
          actions.push({ type: "open", url: SEARCH.youtube(arg), label: `YouTube : ${arg}` });
          break;
        case "TACHE": {
          const [title, due] = arg.split("|").map((s) => s.trim());
          let dueAt: Date | null = null;
          const mm = due ? /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(due) : null;
          if (mm) {
            const ms = Date.UTC(Number(mm[1]), Number(mm[2]) - 1, Number(mm[3]), Number(mm[4]), Number(mm[5])) + c.tzOffset * 60000;
            if (Number.isFinite(ms)) dueAt = new Date(ms);
          }
          if (title) {
            await db.insert(tasks).values({ title: title.slice(0, 300), dueAt });
            taskChanged = true;
          }
          break;
        }
        case "MEMOIRE":
          await db.insert(memories).values({ content: arg.slice(0, 500) });
          memChanged = true;
          break;
        case "MAISON": {
          const cfg = haConfig(c.s);
          if (!cfg) {
            homeNotes.push("(Home Assistant n'est pas connecté : Paramètres → Maison.)");
            break;
          }
          const r = await handleHome(arg, c.sir, cfg, favoritesOf(c.s), true);
          homeChanged = true;
          if (r && !r.ok) homeNotes.push(`(Maison : ${r.text})`);
          break;
        }
        case "MINUTEUR": {
          const [secStr, label] = arg.split("|");
          const sec = Math.round(Number(secStr));
          if (sec > 0 && sec <= 86400) actions.push({ type: "timer", seconds: sec, label: (label || "Minuteur").trim() });
          break;
        }
      }
    } catch (e) {
      console.error("[jarvis] tag failed", kind, e);
    }
  }
  if (taskChanged) actions.push({ type: "refresh", target: "tasks" });
  if (memChanged) actions.push({ type: "refresh", target: "memories" });
  if (homeChanged) actions.push({ type: "refresh", target: "home" });
  const text = full
    .replace(TAG_RE, "")
    .replace(/\[\[[^\]]*$/, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: homeNotes.length ? `${text}\n\n${homeNotes.join("\n")}` : text, actions };
}
