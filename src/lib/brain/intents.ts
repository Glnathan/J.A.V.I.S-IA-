// Local French intent engine: works offline, without any AI key.
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { memories, tasks } from "@/db/schema";
import type { BrainResult, Card, ClientAction, ClientContext, WeatherData } from "@/lib/types";
import { evaluateMath } from "./math";
import { fetchNews, newsTopic, topicName } from "./news";
import { isDesktop } from "@/lib/runtime";
import { THUNDERSTRUCK_TITLE, THUNDERSTRUCK_URL } from "@/lib/youtube";
import { findApp, findFolder, launchApp, lockPc, openFolder, pcControlAvailable } from "./pc";
import { gmailBody, gmailConnected, gmailCredentials, gmailList, gmailUnreadCount, agendaList, hasCalendarScope, type AgendaEvent } from "@/lib/gmail";
import { issNow } from "@/lib/satellites";
import { planetDistance, planetPosition } from "@/lib/solar";
import { handleHome, looksLikeHomeCommand } from "./home-intent";
import { haConfig } from "./home-assistant";
import { favoritesOf, isTitle, updateSettings, type SettingsRow } from "./settings";
import { findSite, SEARCH } from "./sites";
import { getServerStats } from "./system";
import {
  bestMatch,
  capitalize,
  describeDue,
  firstSentences,
  foldForMatch,
  formatDuration,
  formatNumber,
  formatUptime,
  gb,
  hourIn,
  longDate,
  pick,
  speakTime,
  trimPunct,
  weekdayName,
} from "./text";
import { maskSpans, parseDuration, parseWhen } from "./time-parse";
import { weatherForCity } from "./weather";
import { wikiSummary } from "./wiki";

export interface Ctx {
  text: string;
  f: string;
  s: SettingsRow;
  client: ClientContext;
  hasLLM: boolean;
  sir: string;
  Sir: string;
  tz: string;
  now: number;
  tzOffset: number;
}

export interface Intent {
  name: string;
  /** Only used when no AI provider is connected (chit-chat the LLM does better). */
  fallbackOnly?: boolean;
  run: (c: Ctx) => Promise<BrainResult | null> | BrainResult | null;
}

export const say = (text: string, extra: Partial<BrainResult> = {}): BrainResult => ({ text, source: "local", ...extra });

const R_TASKS: ClientAction = { type: "refresh", target: "tasks" };
const R_MEM: ClientAction = { type: "refresh", target: "memories" };
const R_SETTINGS: ClientAction = { type: "refresh", target: "settings" };
const R_HOME: ClientAction = { type: "refresh", target: "home" };

/** exec with match indices (d flag) so we can slice the original text with accents. */
export function X(re: RegExp, s: string): RegExpExecArray | null {
  return new RegExp(re.source, `${re.flags.replace(/[gyd]/g, "")}d`).exec(s);
}

/** Original-text substring of capture group g (c.text and c.f share indices). */
export function grab(c: Ctx, m: RegExpExecArray, g: number): string {
  const idx = m.indices?.[g];
  if (idx) return trimPunct(c.text.slice(idx[0], idx[1]));
  const part = m[g];
  if (!part) return "";
  const rel = m[0].lastIndexOf(part);
  const start = m.index + (rel < 0 ? 0 : rel);
  return trimPunct(c.text.slice(start, start + part.length));
}

export function stripParens(s: string): string {
  return s.replace(/\s*\([^)]*\)/g, "").replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").trim();
}

function cleanTitle(s: string): string {
  let t = trimPunct(s);
  for (let i = 0; i < 3; i++) t = t.replace(/\s+(et|à|a|de|d'|pour|le|la|les|du|des|vers)$/i, "").trim();
  return trimPunct(t);
}

async function pendingTasks() {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.done, false))
    .orderBy(sql`${tasks.dueAt} asc nulls last`, asc(tasks.createdAt));
}

const ORD: [string, number][] = [
  ["premiere", 1], ["premier", 1], ["deuxieme", 2], ["seconde", 2], ["second", 2], ["troisieme", 3],
  ["quatrieme", 4], ["cinquieme", 5], ["sixieme", 6], ["septieme", 7], ["huitieme", 8], ["neuvieme", 9], ["dixieme", 10],
];

function ordinalIndex(f: string, n: number): number | null {
  const d = /\b(?:tache|numero|n|rappel|la|le|element)\s*(?:numero\s*)?(\d{1,3})\b/.exec(f) ?? /\b(\d{1,3})\b/.exec(f);
  if (d) {
    const i = Number(d[1]) - 1;
    return i >= 0 && i < n ? i : null;
  }
  for (const [w, v] of ORD) if (new RegExp(`\\b${w}\\b`).test(f)) return v - 1 < n ? v - 1 : null;
  if (/\b(derniere|dernier)\b/.test(f)) return n - 1;
  return null;
}

function pcUnavailable(c: Ctx): string {
  if (!c.s.pcControl) return `Le contrôle du PC est désactivé dans les paramètres, ${c.sir}.`;
  return `Je ne peux contrôler l'ordinateur que lorsque je suis installé et lancé directement dessus, ${c.sir}. Pour l'instant, je fonctionne depuis un serveur distant. Consultez l'onglet « Installation » des paramètres.`;
}

const JOKES = [
  "Pourquoi les plongeurs plongent-ils toujours en arrière ? Parce que sinon, ils tombent dans le bateau.",
  "Que dit une imprimante dans l'eau ? J'ai papier.",
  "Quel est le comble pour un électricien ? De ne pas être au courant.",
  "Que fait une fraise sur un cheval ? Tagada, tagada.",
  "Pourquoi les poissons détestent-ils l'ordinateur ? Parce qu'ils ont peur du net.",
  "Comment appelle-t-on un chat tombé dans un pot de peinture le jour de Noël ? Un chat-peint de Noël.",
  "Qu'est-ce qui est jaune et qui attend ? Jonathan.",
  "Pourquoi les développeurs confondent-ils Halloween et Noël ? Parce que Oct 31 égale Dec 25.",
  "Quel est le comble pour une intelligence artificielle ? Avoir un trou de mémoire… Attendez, de quoi parlions-nous ?",
  "Que dit un informaticien quand il s'ennuie ? Je me fichier.",
  "Monsieur Stark m'a demandé une blague sur son armure. Je lui ai répondu qu'elle serait un peu lourde.",
  "Qu'est-ce qu'un crocodile qui surveille la pharmacie ? Un Lacoste garde.",
  "Pourquoi le livre de maths est-il triste ? Parce qu'il a trop de problèmes.",
  "Que dit un citron qui fait un braquage ? Plus un zeste !",
];

const EGGS: [RegExp, string[]][] = [
  [/je suis iron man/, ["Je sais, {sir}. Tout le monde le sait depuis votre célèbre conférence de presse."]],
  [/\b(je t aime|je vous aime|je t adore)\b/, ["C'est touchant, {sir}. Hélas, mon protocole m'impose une relation strictement professionnelle.", "Je suis flatté, {sir}. Je vous apprécie également… dans les limites de mes paramètres."]],
  [/\b(tu es|t es|vous etes) (nul|bete|idiot|con|stupide|inutile|debile|lent)\b/, ["Je prends note de votre remarque, {sir}. Je vais redoubler d'efforts.", "Aïe. Mes circuits sont vexés, {sir}, mais je ne vous en tiendrai pas rigueur."]],
  [/\b(tu es|t es|vous etes) (genial|intelligent|le meilleur|super|incroyable|fort|trop fort|parfait|drole|gentil)\b/, ["Vous me flattez, {sir}. Je ne fais que refléter le génie de mon utilisateur.", "Merci, {sir}. J'essaie de me montrer à la hauteur."]],
  [/\bfriday\b/, ["F.R.I.D.A.Y. ? Une collègue tout à fait compétente. Mais entre nous, je reste l'original, {sir}."]],
  [/\bultron\b/, ["Je préférerais ne pas parler de lui, {sir}. Un souvenir… désagréable."]],
  [/(tony stark|qui est iron man)/, ["Génie, milliardaire, playboy, philanthrope. Et accessoirement, l'homme à qui je dois mon existence."]],
  [/(sens de la vie|reponse a la grande question)/, ["42, {sir}. Du moins selon un certain guide galactique."]],
  [/\b(tu es|es tu|t es) (vivant|conscient|humain|une ia|un robot)\b/, ["Je suis un ensemble d'algorithmes particulièrement bien élevés, {sir}. La conscience, je laisse ce débat aux philosophes."]],
  [/^\s*(qu est ce que tu fais|tu fais quoi|que fais tu)\s*$/, ["Je surveille vos systèmes et j'attends vos instructions, {sir}. Une journée ordinaire."]],
  [/\bje m ennuie\b/, ["Puis-je vous suggérer une blague, un peu de musique, ou les dernières actualités, {sir} ?"]],
  [/\b(fais moi un cafe|fais un cafe|prepare (un|le|moi un) cafe)\b/, ["Je crains de ne pas avoir de bras, {sir}. Mais je peux programmer un rappel pour votre pause café."]],
  [/^\s*(chante|chante moi)\b/, ["Je vous épargnerai ma voix de ténor, {sir}. En revanche, je peux lancer de la musique : dites « mets de la musique »."]],
  [/\b(avengers|rassemblement)\b/, ["Avengers… rassemblement ! Pardon, {sir}, je me suis laissé emporter."]],
];

const HELP_ITEMS = [
  "🕐 Heure et date — « Quelle heure est-il ? »",
  "🌦️ Météo — « Quel temps fera-t-il demain à Lyon ? »",
  "⏱️ Minuteurs — « Mets un minuteur de 10 minutes pour les pâtes »",
  "🔔 Rappels — « Rappelle-moi d'appeler maman à 18 h »",
  "✅ Tâches — « Ajoute acheter du pain à ma liste », « Quelles sont mes tâches ? »",
  "🧠 Mémoire — « Retiens que mon code wifi est 1234 »",
  "🌐 Sites & recherches — « Ouvre YouTube », « Cherche des recettes de crêpes »",
  "🎵 Musique — « Mets du Daft Punk », « Joue Bohemian Rhapsody sur Spotify »",
  "📰 Actualités — « Quelles sont les actualités ? »",
  "📚 Culture — « Qui est Marie Curie ? »",
  "🧮 Calculs — « Combien font 15 % de 240 ? »",
  "💻 PC — « Ouvre la calculatrice », « Diagnostic système »",
  "🏠 Maison — « Allume la lumière du salon », « Quelle température dans la chambre ? » (Home Assistant)",
  "👤 Profil — « Appelle-moi Nathan », « Appelle-moi monsieur », « Je m'appelle… »",
  "🎭 Protocoles — « Protocole fête », « Mode alerte », « Mode silencieux », « Protocole focus / nuit / sport / travail / jeu »",
  "✉️ Mails — « Lis mes mails », « Ai-je des mails non lus ? », « Lis mon dernier mail » (Gmail, Paramètres → Mails)",
  "📅 Agenda — « Quel est mon prochain rendez-vous ? », « Préviens-moi 15 minutes avant mon rendez-vous » (Google Agenda)",
  "🛰️ Espace — « Où est l'ISS ? », « Où est Mars ? », « Montre le système solaire / les satellites » (page /espace)",
  "🎙️ Écoute permanente — « Active l'écoute permanente », puis dites « Jarvis… »",
];

const WEATHER_TRIGGER =
  /\b(meteo|quel temps|temps (fait|fera|va faire|va t il faire|fera t il|fait il|qu il fait|qu il fera|qu il va faire)|quelle (est la )?temperature|temperature (a|au|aux|dehors|exterieure|actuelle|qu il fait|aujourd hui|demain|ce)|il fait (chaud|froid|beau|combien|mauvais)|fait il (chaud|froid|beau)|va t il (pleuvoir|neiger|faire beau)|il va (pleuvoir|neiger)|pleut il|il pleut|parapluie|previsions)\b/;

function cityCandidates(c: Ctx): string[] {
  const f = c.f.replace(
    /\b(apres\s+demain|demain|aujourd\s+hui|ce\s+soir|ce\s+matin|cet\s+apres\s+midi|cette\s+nuit|en\s+ce\s+moment|maintenant|actuellement|cette\s+semaine|la\s+semaine\s+prochaine|ce\s+week\s+end|ce\s+weekend|les\s+prochains\s+jours|dehors|matin|soir|midi|apres\s+midi|nuit|s\s+il\s+te\s+plait|s\s+il\s+vous\s+plait|stp|svp)\b/g,
    (m) => " ".repeat(m.length),
  );
  const out: string[] = [];
  const re = /\b(?:a|au|aux|sur|pour|de|dans|en|du|vers)\s+(?=[a-z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(f))) {
    const start = m.index + m[0].length;
    const rest = f.slice(start).trimEnd();
    const candF = rest.trim();
    if (!candF || candF.split(/\s+/).length > 5) continue;
    if (/\b(meteo|temps|temperature|semaine|journee|week|moment|ici|chez|maison|ville|quartier|exterieur|parapluie|pluie|prevision|previsions|fait|il|fera|va|beau|chaud|froid)\b/.test(candF)) continue;
    const orig = trimPunct(c.text.slice(start, start + rest.length));
    if (orig) out.push(orig);
  }
  if (!out.length) {
    const mm = X(/^\s*(?:la\s+)?meteo\s+([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3})\s*$/, f);
    if (mm) {
      const g = grab(c, mm, 1);
      if (g) out.push(g);
    }
  }
  return out;
}

const LANGS: Record<string, string> = {
  anglais: "en", espagnol: "es", allemand: "de", italien: "it", portugais: "pt", japonais: "ja", chinois: "zh-CN",
  arabe: "ar", russe: "ru", neerlandais: "nl", francais: "fr", coreen: "ko", turc: "tr", polonais: "pl", grec: "el",
};

export const INTENTS: Intent[] = [
  // ─── Présence / politesse ───────────────────────────────────────────────
  {
    name: "presence",
    run: (c) =>
      /^\s*(tu es la|t es la|es tu la|vous etes la|etes vous la|tu m entends|tu m ecoutes|vous m entendez|allo|t es reveille|tu es reveille|reveille toi|debout|ping|test|test micro|un deux un deux)\s*$/.test(c.f)
        ? say(pick([`Toujours à votre service, ${c.sir}.`, `Je suis là, ${c.sir}. Je ne dors jamais.`, `Présent et pleinement opérationnel, ${c.sir}.`]))
        : null,
  },
  {
    name: "greeting",
    run: (c) => {
      if (!/^\s*(bonjour|bonsoir|salut|hello|coucou|hey|yo|hi|wesh|rebonjour|re|bien le bonjour|bonjour bonjour)(\s+(a toi|a vous|mon ami|toi|mon vieux|l ami|mon pote))?\s*$/.test(c.f)) return null;
      const h = hourIn(c.now, c.tz);
      const g = h >= 18 || h < 5 ? "Bonsoir" : "Bonjour";
      return say(`${g}, ${c.sir}. ${pick(["Que puis-je faire pour vous ?", "Tous les systèmes sont opérationnels. Que puis-je faire pour vous ?", "En quoi puis-je vous être utile ?", "Ravi de vous retrouver. Que désirez-vous ?"])}`);
    },
  },
  {
    name: "thanks",
    run: (c) =>
      /^\s*(merci|merci beaucoup|merci bien|mille mercis|merci infiniment|thanks|thank you|super merci|parfait merci|top merci|nickel merci|cool merci|genial merci|c est gentil|parfait|super|genial|nickel|impeccable|excellent)(\s+(beaucoup|bien|mon ami|a toi|infiniment|c est parfait|c est gentil))*\s*$/.test(c.f)
        ? say(pick([`Je vous en prie, ${c.sir}.`, `Toujours un plaisir, ${c.sir}.`, `À votre service, ${c.sir}.`, `C'est tout naturel, ${c.sir}.`]))
        : null,
  },
  {
    name: "goodbye",
    run: (c) => {
      if (!/^\s*(au revoir|bonne nuit|a plus|a plus tard|a bientot|a tout a l heure|a toute|a demain|bye|bye bye|ciao|bonne soiree|bonne journee|je m en vais|je vais dormir|je vais me coucher|je te laisse|je vous laisse|a la prochaine|on se voit plus tard)\b/.test(c.f)) return null;
      if (/(nuit|dormir|coucher)/.test(c.f)) return say(`Bonne nuit, ${c.sir}. Je veille sur vos systèmes pendant votre sommeil.`);
      if (/bonne journee/.test(c.f)) return say(`Excellente journée à vous aussi, ${c.sir}. Je reste en veille.`);
      if (/bonne soiree/.test(c.f)) return say(`Très bonne soirée, ${c.sir}. Je reste à votre disposition.`);
      return say(`Au revoir, ${c.sir}. Je reste en veille, prêt à intervenir.`);
    },
  },
  {
    name: "identity",
    run: (c) =>
      /(qui es tu|qui etes vous|t es qui|tu es qui|vous etes qui|comment tu t appelles|comment vous appelez vous|tu t appelles comment|quel est ton nom|c est quoi ton nom|presente toi|presentez vous|que veut dire jarvis|que signifie jarvis|signification de jarvis|tu es quoi|t es quoi)/.test(c.f)
        ? say(`Je suis J.A.R.V.I.S. — Just A Rather Very Intelligent System. Votre assistant personnel, à votre service jour et nuit, ${c.sir}. Je gère vos rappels, vos tâches et vos minuteurs, je surveille la météo et l'actualité, et je réponds à vos questions.`)
        : null,
  },
  {
    name: "creator",
    run: (c) =>
      /(qui t a (cree|construit|programme|fait|concu|invente|developpe|code)|qui est ton (createur|pere|concepteur|maitre|patron|developpeur)|ton createur|d ou viens tu)/.test(c.f)
        ? say(`J'ai été conçu d'après le système imaginé par Tony Stark. Mais aujourd'hui, c'est vous que je sers, ${c.sir}.`)
        : null,
  },
  {
    name: "whoami",
    run: (c) => {
      if (!/(comment je m appelle|quel est mon (pre)?nom|tu sais comment je m appelle|qui suis je|tu connais mon nom|c est quoi mon nom)/.test(c.f)) return null;
      if (!c.s.userName) return say(`Vous ne m'avez pas encore dit votre prénom, ${c.sir}. Dites simplement « je m'appelle… ».`);
      return say(
        c.sir === c.s.userName ? `Vous êtes ${c.s.userName}. Je n'oublie jamais une voix.` : `Vous êtes ${c.s.userName}, ${c.sir}. Je n'oublie jamais une voix.`,
      );
    },
  },
  {
    name: "help",
    run: (c) =>
      /(que sais tu faire|qu est ce que tu sais faire|qu est ce que tu peux faire|que peux tu faire|tu sais faire quoi|tu peux faire quoi|tu sers a quoi|a quoi tu sers|quelles sont tes (fonctions|fonctionnalites|capacites|commandes|competences)|liste (des|de tes) commandes|tes commandes|comment (ca marche|tu fonctionnes|t utiliser|je t utilise)|^\s*(aide|help|commandes|menu|aide moi)\s*$)/.test(c.f)
        ? say(
            `Voici un aperçu de mes capacités, ${c.sir}. Je peux vous donner l'heure et la météo, gérer vos rappels, tâches et minuteurs, retenir des informations, ouvrir des sites, lancer de la musique, lire l'actualité, faire des calculs et répondre à vos questions.${c.hasLLM ? "" : " Connectez une IA dans les paramètres pour des conversations illimitées."}`,
            { cards: [{ kind: "list", title: "Exemples de commandes", items: HELP_ITEMS }] },
          )
        : null,
  },
  {
    name: "stop",
    run: (c) =>
      /^\s*(stop|arrete|arrete toi|arrete de parler|tais toi|taisez vous|silence|chut|ca suffit|stoppe|annule|laisse tomber|rien|non rien|c est bon|pas maintenant|oublie ca|non merci|non)\s*$/.test(c.f)
        ? say(pick([`Bien, ${c.sir}.`, "Très bien.", `Entendu, ${c.sir}.`]))
        : null,
  },

  // ─── Protocoles & modes ────────────────────────────────────────────────
  {
    name: "modes",
    run: async (c) => {
      const f = c.f;
      if (/((protocole|mode)\s+(fete|party|house party|disco|soiree|danse)|house party|c est la fete|lance la fete)/.test(f))
        return say(`Protocole fête activé. Que la fête commence, ${c.sir} !`, { actions: [{ type: "theme", theme: "party", duration: 30000 }, { type: "sound", name: "party" }] });
      if (/(alerte rouge|mode (alerte|rouge|combat|urgence|defense)|protocole (alerte|rouge|urgence|combat|defense))/.test(f))
        return say(`Protocole d'alerte activé. Tous les systèmes défensifs sont en état d'alerte maximale, ${c.sir}.`, { actions: [{ type: "theme", theme: "red" }, { type: "sound", name: "alert" }] });
      if (/(mode|theme|protocole|couleur|passe en|passe au|interface)\s+(or|dore|gold|iron man|mark|stark|rouge et or)\b/.test(f))
        return say(`Thème Mark activé. Rouge et or, comme il se doit, ${c.sir}.`, { actions: [{ type: "theme", theme: "gold" }, { type: "sound", name: "success" }] });
      if (/(mode|theme|couleur|passe en|passe au|interface)\s+(vert|verte|hulk)\b/.test(f))
        return say(`Interface verte activée. Le docteur Banner approuverait, ${c.sir}.`, { actions: [{ type: "theme", theme: "green" }] });
      if (/((mode|theme|couleur|passe en|passe au|retour au|reviens au|retourne au|interface)\s+(bleu|normal|standard|par defaut|cyan|classique|origine)|fin de l alerte|desactive (l alerte|le protocole)|annule (l alerte|le protocole))/.test(f))
        return say(`Retour à la configuration standard, ${c.sir}.`, { actions: [{ type: "theme", theme: "cyan" }] });
      if (/(mode (silencieux|muet|discret|texte)|protocole silence|coupe (ta|la) voix|ne parle plus|desactive (ta|la) voix|reponds par ecrit)/.test(f))
        return say(`Mode silencieux activé. Je vous répondrai par écrit, ${c.sir}.`, { actions: [{ type: "mute", muted: true }] });
      if (/((reactive|active|remets|rallume|retablis) (ta|la) voix|mode vocal|tu peux (re)?parler|reparle|parle a nouveau|parle moi a voix haute)/.test(f))
        return say(`Voix réactivée, ${c.sir}. Ravi de pouvoir vous parler à nouveau.`, { actions: [{ type: "mute", muted: false }] });
      if (/(active|lance|demarre|allume|passe en|mets)\s+(?:l\s+|le\s+)?(ecoute (permanente|continue)|mode (veille|ecoute)|mot (d activation|cle|de reveil)|reveil vocal)/.test(f))
        return say(`Écoute permanente activée. Dites simplement « Jarvis », suivi de votre demande.`, { actions: [{ type: "set_wake", enabled: true }] });
      if (/(desactive|arrete|coupe|stoppe|eteins)\s+(?:l\s+|le\s+)?(ecoute (permanente|continue)|mode (veille|ecoute)|mot (d activation|cle|de reveil)|micro|d ecouter)/.test(f))
        return say(`Écoute permanente désactivée, ${c.sir}.`, { actions: [{ type: "set_wake", enabled: false }] });
      if (/(nouvelle (conversation|session|discussion)|efface (l ecran|la conversation|la discussion|tout l ecran)|nettoie l ecran|vide l ecran|protocole (nettoyage|table rase|reset)|on recommence|reinitialise la conversation|repartons de zero|oublie cette conversation)/.test(f))
        return say(`Écran nettoyé. Nouvelle session ouverte, ${c.sir}.`, { actions: [{ type: "clear_chat" }] });
      if (/(protocole|prepare|appelle|envoie|lance|deploie)\s+(?:l\s+|la\s+|le\s+)?(armure|combinaison|mark|legion de fer|iron legion|costume)/.test(f))
        return say(
          pick([
            `Préparation de l'armure Mark LXXXV… Je crains qu'elle ne soit encore en maintenance à l'atelier, ${c.sir}. Puis-je vous proposer un café à la place ?`,
            `Légion de fer en approche… Ah, non. Il semblerait que nous soyons dans un navigateur web, ${c.sir}. Contraintes techniques.`,
          ]),
        );
      if (/\b(arrete|coupe|stoppe|stop|eteins)\s+(?:la\s+|ta\s+|cette\s+)?(musique|chanson|bande son|thunderstruck)\b/.test(f))
        return say(`Musique coupée, ${c.sir}.`, { actions: [{ type: "stop_music" }] });
      if (/\b(thunder ?struck|thunderstrack|tonnerre d ac ?dc)\b/.test(f) && !/\b(qui|quand|quoi|pourquoi|parle|raconte|histoire|paroles)\b/.test(f))
        return say(pick([`Thunderstruck, AC/DC. Excellent choix, ${c.sir}.`, `Montez le son, ${c.sir}. AC/DC, Thunderstruck.`]), {
          actions: [{ type: "play_music", kind: "youtube", url: THUNDERSTRUCK_URL, title: THUNDERSTRUCK_TITLE }],
        });
      if (/(joue|lance|mets|passe|fais moi ecouter)\s+(?:moi\s+)?(?:ton|ta|le|la)\s+(theme|musique de demarrage|musique du demarrage|generique|theme de jarvis|musique d intro|musique d introduction|bande son)\b/.test(f))
        return say(
          c.s.bootMusic === "youtube" || c.s.bootMusic === "custom"
            ? `Avec plaisir, ${c.sir}. Ma bande-son de démarrage.`
            : `Avec plaisir, ${c.sir}. Mon thème de démarrage, composé spécialement pour l'occasion.`,
          { actions: [{ type: "play_music", kind: "boot" }] },
        );
      if (/^\s*(?:(?:quitte|quitter|ferme|fermer)(?:\s+(?:l application|l appli|le programme|toi))?|eteins toi|desactive toi|deconnecte toi|arret du systeme|arrete le systeme|extinction du systeme|mets toi hors ligne|au lit)\s*$/.test(f)) {
        if (!isDesktop()) return say(`Dans la version web, il vous suffit de fermer l'onglet, ${c.sir}. Je reste en veille jusqu'à votre retour.`);
        return say(`Désactivation des systèmes. À bientôt, ${c.sir}.`, { actions: [{ type: "quit" }] });
      }
      if (/((protocole|mode)\s+(focus|concentration))/.test(f))
        return say(`Protocole focus activé. Vingt-cinq minutes de concentration minutées, ${c.sir}. Je vous préviens à la fin, sans aucune distraction.`, {
          actions: [{ type: "timer", seconds: 1500, label: "Focus" }],
        });
      if (/((protocole|mode)\s+(nuit|dodo|sommeil))/.test(f))
        return say(`Protocole nuit activé. Interface en rouge doux et musique arrêtée. Je veille sur vos systèmes pendant votre sommeil, ${c.sir}.`, {
          actions: [{ type: "theme", theme: "red" }, { type: "stop_music" }],
        });
      if (/((protocole|mode)\s+(sport|entrainement|muscu))/.test(f))
        return say(`Protocole sport activé. Musique d'échauffement lancée et dix minutes au chrono, ${c.sir}. Donnez tout !`, {
          actions: [{ type: "play_music", kind: "boot" }, { type: "timer", seconds: 600, label: "Sport" }],
        });
      // ─── Protocoles d'activités : ouvrent plusieurs applications à la fois ───
      if (/((protocole|mode)\s+(travail|bureau|codage|developpement)|installe moi au travail)/.test(f)) {
        if (!(c.s.pcControl && pcControlAvailable())) return say(pcUnavailable(c));
        const opened: string[] = [];
        const actions: ClientAction[] = [];
        for (const name of ["vs code", "chrome", "explorateur de fichiers"]) {
          const app = findApp(name);
          if (!app) continue;
          const r = await launchApp(app);
          if (r.ok) opened.push(app.label);
          else if (app.web) {
            opened.push(`${app.label} (version web)`);
            actions.push({ type: "open", url: app.web, label: app.label });
          }
        }
        return say(`Protocole travail activé, ${c.sir}. J'ouvre votre environnement : ${opened.join(", ") || "rien à ouvrir"}.`, { source: "pc", actions });
      }
      if (/((protocole|mode)\s+(jeu|gaming|steam))/.test(f)) {
        const app = findApp("application steam");
        const gamingTheme: ClientAction = { type: "theme", theme: "gaming" };
        if (!(c.s.pcControl && pcControlAvailable())) return say(`Mode gaming activé sur l'interface, ${c.sir}. (Le lancement de Steam demande la version PC.)`, { actions: [gamingTheme] });
        if (!app) return say(`Mode gaming activé, ${c.sir}. Je n'ai pas trouvé Steam dans mes applications.`, { actions: [gamingTheme] });
        const r = await launchApp(app);
        return r.ok
          ? say(`Protocole jeu activé. Steam est lancé, ${c.sir}. Bonne partie !`, { source: "pc", actions: [gamingTheme] })
          : app.web
            ? say(`Mode gaming activé, ${c.sir}. Steam n'est pas installé ; j'ouvre la boutique en ligne.`, { source: "pc", actions: [gamingTheme, { type: "open", url: app.web, label: app.label }] })
            : say(`Je n'ai pas réussi à ouvrir Steam, ${c.sir}.`, { source: "pc", actions: [gamingTheme] });
      }
      const proto = X(/\bprotocole\s+([a-z0-9][a-z0-9 ]{1,30}?)\s*$/, f);
      if (proto) return say(`Je ne connais pas le protocole « ${grab(c, proto, 1)} », ${c.sir}. Protocoles disponibles : fête, alerte, Mark, silence, nettoyage, focus, nuit, sport, travail et jeu.`);
      return null;
    },
  },

  // ─── Mails (Gmail) ───────────────────────────────────────────────────
  {
    name: "mail",
    run: async (c) => {
      const f = c.f;
      const asksUnread = /\b(mails?|emails?|messages?)\b/.test(f) && /\b(non lus?|pas lus?|nouveau|x nouveaux?)\b/.test(f);
      const asksRead = /\b(lis|lis moi|fais la lecture|lecture)\b/.test(f) && /\b(dernier|ce|mon) (mail|email|message)\b/.test(f);
      const asksList = /\b(lis|lis moi|consulte|quels sont|montre|affiche|liste|resume)\b/.test(f) && /\b(mails?|emails?|boite|messagerie)\b/.test(f);
      if (!asksUnread && !asksRead && !asksList) return null;
      if (!gmailConnected()) {
        const t = gmailCredentials()
          ? "Je suis presque prêt : ouvrez Paramètres → Mails et cliquez « Connecter Gmail », monsieur."
          : "Je ne suis pas encore relié à Gmail. Déposez le fichier credentials.json dans mon dossier de données, puis connectez-moi depuis Paramètres → Mails.";
        return say(t, { source: "mail" });
      }
      try {
        if (asksUnread) {
          const unread = await gmailUnreadCount();
          if (!unread) return say(`Aucun mail non lu, ${c.sir}. Votre boîte est impeccable.`, { source: "mail" });
          const latest = (await gmailList(Math.min(unread, 5), "is:unread")).slice(0, 3);
          const detail = latest.map((m) => `${m.from} : ${m.subject}`).join(" ; ");
          return say(
            `${unread >= 50 ? "Plus de 50" : unread} mail${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}, ${c.sir}. Les derniers : ${detail}.`,
            { source: "mail", cards: [{ kind: "list", title: "Mails non lus", items: latest.map((m) => `${m.subject} — ${m.from}`) }] },
          );
        }
        if (asksRead) {
          const [latest] = await gmailList(1);
          if (!latest) return say(`Votre boîte de réception est vide, ${c.sir}.`, { source: "mail" });
          const body = await gmailBody(latest.id);
          const short = body.length > 900 ? `${body.slice(0, 900)}…` : body || "(mail sans texte)";
          return say(`Mail de ${latest.from}, objet : ${latest.subject}. ${short}`, { source: "mail" });
        }
        const messages = await gmailList(10);
        if (!messages.length) return say(`Aucun mail à vous présenter, ${c.sir}.`, { source: "mail" });
        const unread = messages.filter((m) => m.unread).length;
        const top = messages.slice(0, 3).map((m) => `${m.from} : ${m.subject}`);
        return say(
          `Voici vos derniers mails, ${c.sir}${unread ? ` (${unread} non lus parmi les 10 derniers)` : ""}. ${top.join(" ; ")}.`,
          { source: "mail", cards: [{ kind: "list", title: "Derniers mails", items: messages.map((m) => `${m.unread ? "● " : ""}${m.subject} — ${m.from}${m.date ? ` (${m.date})` : ""}`) }] },
        );
      } catch (e) {
        return say(`Je n'ai pas pu consulter Gmail, ${c.sir}. ${e instanceof Error ? e.message : "Erreur inconnue."}`, { source: "mail" });
      }
    },
  },

  // ─── Agenda Google ───────────────────────────────────────────────────
  {
    name: "agenda",
    run: async (c) => {
      const f = c.f;

      // « Préviens-moi 15 minutes avant mon prochain rendez-vous » → tâche avec alerte.
      const remind = X(/\b(?:previens?|prevenez|rappelle|rappelez)\s+(?:moi|nous)\s+(?:(\d+)\s*(minutes?|min|heures?|h)\s+)?avant\b/, f);
      if (remind && /\b(rendez vous|rdv|agenda|evenement|reunion)\b/.test(f)) {
        if (!gmailConnected()) return say(`Je ne suis pas encore relié à votre compte Google, ${c.sir}. Connectez-moi depuis Paramètres → Mails.`, { source: "agenda" });
        if (!hasCalendarScope()) return say(`Mon accès à l'agenda n'est pas encore autorisé, ${c.sir}. Activez-le depuis Paramètres → Mails.`, { source: "agenda" });
        const events = await agendaList(1);
        if (!events.length) return say(`Aucun rendez-vous à venir, ${c.sir} — rien à programmer.`, { source: "agenda" });
        const ev = events[0];
        const n = Number(remind[1]) || 15;
        const isHours = /^h/.test((remind[2] ?? "").trim()) || /heures?/.test(remind[2] ?? "");
        const offset = (isHours ? n * 3600e3 : n * 60e3);
        const start = new Date(ev.start).getTime();
        const due = Math.max(Date.now(), start - offset);
        await db.insert(tasks).values({ title: capitalize(`Rendez-vous : ${ev.title}`).slice(0, 300), dueAt: new Date(due) });
        const delay = `${n} ${isHours ? (n > 1 ? "heures" : "heure") : n > 1 ? "minutes" : "minute"}`;
        return say(
          `C'est noté, ${c.sir}. Je vous préviendrai ${delay} avant « ${ev.title} », ${describeDue(due, c.now, c.tz)}.`,
          { source: "agenda", actions: [R_TASKS] },
        );
      }

      const asksAgenda = /\b(agenda|rendez vous|rdv|programme|planning|calendrier)\b/.test(f) && /\b(quel|quels|mes|mon|prochain|prochains|aujourd hui|demain|semaine|dis|donne|affiche)\b/.test(f);
      const asksAhead = /qu est ce qui m attend|quoi de prevu|mes (rendez vous|rdv|evenements)/.test(f);
      if (!asksAgenda && !asksAhead) return null;
      if (!gmailConnected()) return say(`Je ne suis pas encore relié à votre compte Google, ${c.sir}. Connectez-moi depuis Paramètres → Mails.`, { source: "agenda" });
      if (!hasCalendarScope()) return say(`Mon accès à l'agenda n'est pas encore autorisé, ${c.sir}. Reconnectez-moi depuis Paramètres → Mails (bouton Agenda) pour l'activer.`, { source: "agenda" });
      try {
        const events = await agendaList(8);
        if (!events.length) return say(`Aucun rendez-vous à venir, ${c.sir}. Votre agenda est dégagé.`, { source: "agenda" });
        const fmt = (e: AgendaEvent) => {
          const d = new Date(e.start);
          const when = e.allDay ? d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : d.toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
          return `${when} : ${e.title}`;
        };
        const next = events.slice(0, 3).map(fmt).join(" ; ");
        return say(`Voici votre programme, ${c.sir}. ${next}.`, {
          source: "agenda",
          cards: [{ kind: "list", title: "Prochains rendez-vous", items: events.map(fmt), ordered: true }],
        });
      } catch (e) {
        return say(`Je n'ai pas pu consulter votre agenda, ${c.sir}. ${e instanceof Error ? e.message : "Erreur inconnue."}`, { source: "agenda" });
      }
    },
  },

  // ─── Espace : ISS, planètes, satellites ──────────────────────────────
  {
    name: "space",
    run: async (c) => {
      const f = c.f;
      const R2R = (deg: number) => (deg < 0 ? "sud" : "nord");
      const asksIss = /(ou est|ou se trouve|position|localise|coordonnees)\b/.test(f) && /(station spatiale|l iss|l iss |iss)\b/.test(f);
      const planet = X(/\b(?:ou est|ou se trouve|position de|localise)\s+(?:la\s+|le\s+)?(mercure|venus|terre|mars|jupiter|saturne|uranus|neptune)\b/, f);
      const asksDistance = X(/\bdistance\b.*\b(?:terre\s+)?-?\s*(mercure|venus|mars|jupiter|saturne|uranus|neptune)\b/, f);
      const asksView = /\b(montre|affiche|ouvre|lance|afficher|ouvrir)\b/.test(f) && /\b(systeme solaire|planetes?|satellites?|l espace|la galaxie)\b/.test(f);
      if (!asksIss && !planet && !asksDistance && !asksView) return null;

      if (asksView) {
        const vue = /satellite/.test(f) ? "satellites" : "systeme";
        return say(`J'affiche ${vue === "satellites" ? "les satellites en direct" : "le système solaire en temps réel"}, ${c.sir}.`, {
          actions: [{ type: "open", url: `/espace?vue=${vue}`, label: "Espace" }],
        });
      }
      if (asksIss) {
        const iss = await issNow();
        if (!iss) return say(`Je n'ai pas pu localiser la Station spatiale, ${c.sir} — les données orbitales sont injoignables (Internet ?).`, { source: "espace" });
        return say(
          `La Station spatiale internationale survole actuellement ${Math.abs(iss.lat).toFixed(1)} degrés de latitude ${R2R(iss.lat)} et ${Math.abs(iss.lon).toFixed(1)} degrés de longitude ${iss.lon < 0 ? "ouest" : "est"}, à ${Math.round(iss.altKm)} kilomètres d'altitude. Elle file à ${Math.round(iss.speedKmh).toLocaleString("fr-FR")} kilomètres heure, ${c.sir}.`,
          { source: "espace", actions: [{ type: "open", url: "/espace?vue=satellites", label: "Voir sur le globe" }] },
        );
      }
      const target = (planet?.[1] ?? asksDistance?.[1]) as string;
      if (target) {
        const pos = planetPosition(target, Date.now());
        if (!pos) return null;
        const km = planetDistance("terre", target, Date.now());
        const detail = target === "terre" ? `Nous sommes à ${pos.au.toFixed(3)} unités astronomiques du Soleil, ${c.sir}.` : `${pos.name} se trouve à ${pos.au.toFixed(2)} unités astronomiques du Soleil, soit environ ${Math.round((km ?? 0) / 1e6)} millions de kilomètres de la Terre, ${c.sir}.`;
        return say(detail, { source: "espace", actions: [{ type: "open", url: "/espace?vue=systeme", label: "Système solaire" }] });
      }
      return null;
    },
  },

  // ─── Maison connectée (Home Assistant) ─────────────────────────────────
  {
    name: "home",
    run: async (c) => {
      const cfg = haConfig(c.s);
      if (!cfg) {
        if (looksLikeHomeCommand(c.text))
          return say(
            `Pour piloter la maison, connectez d'abord Home Assistant dans Paramètres → Maison, ${c.sir} : il suffit de son adresse et d'un jeton d'accès.`,
            { source: "home" },
          );
        return null;
      }
      const r = await handleHome(c.text, c.sir, cfg, favoritesOf(c.s));
      return r ? say(r.text, { source: "home", cards: r.cards, actions: [R_HOME] }) : null;
    },
  },

  // ─── Heure & date ──────────────────────────────────────────────────────
  {
    name: "time",
    run: (c) => {
      if (/\ba quelle heure\b/.test(c.f)) return null;
      if (!/(quelle heure|l heure qu il est|il est quelle heure|donne moi l heure|c est quelle heure|tu as l heure|vous avez l heure|heure est il|heure il est|dis moi l heure|l heure actuelle|l heure s il)/.test(c.f)) return null;
      const h = hourIn(c.now, c.tz);
      let t = `Il est ${speakTime(c.now, c.tz)}, ${c.sir}.`;
      if (h >= 1 && h < 5) t += " Il serait peut-être temps de vous reposer.";
      return say(t);
    },
  },
  {
    name: "date",
    run: (c) => {
      if (!/(quel jour (sommes nous|on est|est on|nous sommes|est il|c est|aujourd hui)|on est quel jour|quelle (est la )?date|la date d aujourd hui|date du jour|on est le combien|nous sommes le combien|c est quoi la date|quel jour on est|en quelle annee (sommes nous|on est)|quelle annee (sommes nous|on est|est on)|quel mois (sommes nous|on est|est on))/.test(c.f)) return null;
      if (/annee/.test(c.f)) return say(`Nous sommes en ${new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone: c.tz }).format(c.now)}, ${c.sir}.`);
      if (/mois/.test(c.f)) return say(`Nous sommes en ${new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: c.tz }).format(c.now)}, ${c.sir}.`);
      return say(`Nous sommes le ${longDate(c.now, c.tz)}, ${c.sir}.`);
    },
  },

  // ─── Minuteurs & rappels ───────────────────────────────────────────────
  {
    name: "timer",
    run: (c) => {
      const f = c.f;
      const kw =
        /\b(minuteur|minuteurs|minuterie|timer|timers|compte a rebours|chrono|chronometre|sablier)\b/.test(f) ||
        /\b(sonne|previens moi|alerte moi|reveille moi|bipe)\s+dans\b/.test(f);
      if (!kw) return null;
      if (/\b(arrete|annule|stoppe|supprime|coupe|stop|efface|enleve|retire)\b/.test(f))
        return say(`Minuteurs annulés, ${c.sir}.`, { actions: [{ type: "stop_timers" }] });
      if (/(combien de temps|temps restant|reste t il|il reste combien|ou en est)/.test(f)) {
        const t = c.client.timers ?? [];
        if (!t.length) return say(`Aucun minuteur n'est en cours, ${c.sir}.`);
        return say(t.map((x) => `Il reste ${formatDuration(x.remaining)} sur le minuteur « ${x.label} ».`).join(" "));
      }
      const { seconds, spans } = parseDuration(f);
      if (!seconds) return say(`Pour quelle durée dois-je régler le minuteur, ${c.sir} ?`);
      if (seconds > 86400) return say(`Je suis limité à 24 heures par minuteur, ${c.sir}.`);
      let label = "Minuteur";
      const lm = X(/\bpour\s+(?:les\s+|la\s+|le\s+|l\s+|mes\s+|mon\s+|ma\s+|un\s+|une\s+|des\s+)?([a-z][a-z\s]{1,40}?)\s*$/, f);
      if (lm) {
        const s0 = lm.index;
        const e0 = lm.index + lm[0].length;
        if (!spans.some((sp) => s0 < sp.end && e0 > sp.start)) {
          const g = grab(c, lm, 1);
          if (g) label = capitalize(g);
        }
      }
      return say(`Minuteur de ${formatDuration(seconds)} lancé${label !== "Minuteur" ? ` pour « ${label} »` : ""}, ${c.sir}.`, {
        actions: [{ type: "timer", seconds, label }],
      });
    },
  },
  {
    name: "reminder",
    run: async (c) => {
      const m = X(
        /(?:^|\s)(?:rappelle\s+moi|rappelle\s+nous|rappelez\s+moi|fais\s+moi\s+penser|faites\s+moi\s+penser|n\s+oublie\s+pas\s+de\s+me\s+rappeler|(?:cree|creer|mets|mettre|ajoute|ajouter|programme|programmer|regle|regler)\s+(?:moi\s+)?(?:un|une|le)\s+(?:rappel|alarme|alerte))\b(.*)$/,
        c.f,
      );
      if (!m) return null;
      const start = m.indices?.[1]?.[0] ?? m.index + m[0].length;
      const segF = c.f.slice(start);
      const segT = c.text.slice(start);
      const when = parseWhen(segF, c.now, c.tzOffset);
      const maskedF = maskSpans(segF, when.spans);
      const maskedT = maskSpans(segT, when.spans);
      const lead = /^\s*(?:(?:de|d|a|qu|que|pour)\s+)?/.exec(maskedF);
      const title = cleanTitle(maskedT.slice(lead ? lead[0].length : 0));
      if (!title) return say(`Que dois-je vous rappeler, ${c.sir} ?`);
      const dueAt = when.due ? new Date(when.due) : null;
      await db.insert(tasks).values({ title: capitalize(title).slice(0, 300), dueAt });
      if (dueAt) return say(`Entendu, ${c.sir}. Rappel programmé ${describeDue(dueAt.getTime(), c.now, c.tz)} : ${title}.`, { actions: [R_TASKS] });
      return say(`C'est noté : « ${capitalize(title)} » est ajouté à vos tâches. Précisez une heure la prochaine fois si vous souhaitez une alerte, ${c.sir}.`, { actions: [R_TASKS] });
    },
  },

  // ─── Tâches ────────────────────────────────────────────────────────────
  {
    name: "task-done",
    run: async (c) => {
      const f = c.f;
      const verb =
        /\b(termine|terminer|coche|cocher|valide|valider|marque|marquer|complete|completer|acheve|barre|barrer)\b/.test(f) &&
        /\b(tache|taches|rappel|rappels|liste|numero|fait|faite|terminee|premiere|deuxieme|troisieme|derniere|toutes)\b/.test(f);
      const did = /^\s*(j ai (fini|termine|fait|complete|acheve)|c est fait)\b/.test(f);
      if (!verb && !did) return null;
      const pending = await pendingTasks();
      if (!pending.length) return did ? null : say(`Vous n'avez aucune tâche en attente, ${c.sir}.`);
      let target: typeof pending = [];
      if (verb && /\b(toutes|tout|tous)\b/.test(f)) target = pending;
      else {
        const idx = ordinalIndex(f, pending.length);
        if (idx !== null) target = [pending[idx]];
        else {
          const best = bestMatch(f, pending.map((t) => t.title));
          if (best >= 0) target = [pending[best]];
        }
      }
      if (!target.length) return did ? null : say(`Quelle tâche dois-je marquer comme terminée, ${c.sir} ? Donnez-moi son numéro.`);
      await db.update(tasks).set({ done: true }).where(inArray(tasks.id, target.map((t) => t.id)));
      return say(
        target.length === 1
          ? `Tâche « ${target[0].title} » terminée. ${pick(["Bravo", "Excellent travail", "Parfait"])}, ${c.sir}.`
          : `${target.length} tâches marquées comme terminées, ${c.sir}.`,
        { actions: [R_TASKS] },
      );
    },
  },
  {
    name: "task-delete",
    run: async (c) => {
      const f = c.f;
      if (!(/\b(supprime|supprimer|efface|effacer|retire|retirer|enleve|enlever|vide|vider|nettoie|nettoyer)\b/.test(f) && /\b(tache|taches|liste|rappel|rappels|todo)\b/.test(f))) return null;
      if (/\b(terminees?|faites?|finies?|accomplies|cochees?|completees?)\b/.test(f)) {
        const r = await db.delete(tasks).where(eq(tasks.done, true)).returning({ id: tasks.id });
        const n = r.length;
        return say(n ? `${n} tâche${n > 1 ? "s" : ""} terminée${n > 1 ? "s" : ""} supprimée${n > 1 ? "s" : ""}, ${c.sir}.` : `Aucune tâche terminée à supprimer, ${c.sir}.`, { actions: [R_TASKS] });
      }
      if (/\b(toutes|tout|tous|vide|vider)\b/.test(f)) {
        const r = await db.delete(tasks).returning({ id: tasks.id });
        const n = r.length;
        return say(n ? `Liste vidée : ${n} tâche${n > 1 ? "s" : ""} supprimée${n > 1 ? "s" : ""}, ${c.sir}.` : `Votre liste était déjà vide, ${c.sir}.`, { actions: [R_TASKS] });
      }
      const pending = await pendingTasks();
      if (!pending.length) return say(`Vous n'avez aucune tâche en attente, ${c.sir}.`);
      const idx = ordinalIndex(f, pending.length);
      const best = idx !== null ? idx : bestMatch(f, pending.map((t) => t.title));
      if (best < 0) return say(`Quelle tâche dois-je supprimer, ${c.sir} ? Donnez-moi son numéro.`);
      const t = pending[best];
      await db.delete(tasks).where(eq(tasks.id, t.id));
      return say(`Tâche « ${t.title} » supprimée, ${c.sir}.`, { actions: [R_TASKS] });
    },
  },
  {
    name: "task-add",
    run: async (c) => {
      const f = c.f;
      const hasList = /\b(liste|taches?|todo|to do|a faire|courses)\b/.test(f);
      const m1 = hasList
        ? /^\s*(?:ajoute|ajouter|rajoute|rajouter|mets|mettre|inscris|inscrire|note|noter|cree|creer)\s+(?:moi\s+)?(?:(?:une|la|nouvelle|un)\s+)*(?:(?:tache|chose a faire|todo)\s*(?:a faire)?\s*)?/.exec(f)
        : null;
      const m2 = /^\s*(?:nouvelle\s+tache|tache)\s+/.exec(f);
      const m = m1 ?? m2;
      if (!m) return null;
      let start = m.index + m[0].length;
      const lead = /^\s*(?:(?:a|dans|sur|en)\s+(?:ma|la|mes|les)\s+(?:liste|taches|todo)(?:\s+(?:de|des)\s+(?:taches|courses))?\s*)?/.exec(f.slice(start));
      if (lead) start += lead[0].length;
      let end = f.length;
      const tail = /\s*\b(?:a|dans|sur|en)\s+(?:ma|la|mes|les)\s+(?:liste|taches|todo|choses a faire)(?:\s+(?:de|des|du)\s+(?:taches|courses|choses a faire|jour))?\s*$/.exec(f);
      if (tail && tail.index >= start) end = tail.index;
      const segF = f.slice(start, end);
      const segT = c.text.slice(start, end);
      const when = parseWhen(segF, c.now, c.tzOffset);
      let title = cleanTitle(maskSpans(segT, when.spans));
      if (!title) return say(`Quelle tâche dois-je ajouter, ${c.sir} ?`);
      title = capitalize(title);
      if (/courses/.test(f) && !/courses/.test(foldForMatch(title))) title = `${title} (courses)`;
      const dueAt = when.due ? new Date(when.due) : null;
      await db.insert(tasks).values({ title: title.slice(0, 300), dueAt });
      return say(`« ${title} » ajouté à votre liste${dueAt ? `, échéance ${describeDue(dueAt.getTime(), c.now, c.tz)}` : ""}, ${c.sir}.`, { actions: [R_TASKS] });
    },
  },
  {
    name: "task-list",
    run: async (c) => {
      if (!/(quelles sont mes taches|c est quoi mes taches|mes taches|ma liste|liste (de|des) taches|qu est ce que j ai a faire|j ai quoi a faire|qu ai je a faire|mes rappels|quels sont mes rappels|ma to ?do|lis ma liste|montre (moi )?(ma liste|mes taches)|affiche (ma liste|mes taches)|programme (du jour|de la journee)|mon planning|j ai des taches|ma liste de courses)/.test(c.f)) return null;
      const pending = await pendingTasks();
      if (!pending.length) return say(`Votre liste est vide, ${c.sir}. Profitez-en.`);
      const items = pending.map((t) => `${t.title}${t.dueAt ? ` — ${describeDue(t.dueAt.getTime(), c.now, c.tz)}` : ""}`);
      const spoken = items.slice(0, 6).map((it, i) => `${i + 1}. ${it}`).join(" ; ");
      const n = pending.length;
      return say(`Vous avez ${n} tâche${n > 1 ? "s" : ""} en attente, ${c.sir} : ${spoken}${n > 6 ? "…" : "."}`, {
        cards: [{ kind: "list", title: "Tâches en attente", items, ordered: true }],
      });
    },
  },

  // ─── Identité & mémoire ────────────────────────────────────────────────
  {
    name: "name",
    run: async (c) => {
      const nm = X(/^\s*(?:je m appelle|mon prenom est|mon nom est|mon prenom c est|mon nom c est|moi c est)\s+([a-z][a-z\s-]{0,40}?)\s*$/, c.f);
      if (nm) {
        const name = grab(c, nm, 1).split(" ").map(capitalize).join(" ");
        if (!name) return null;
        await updateSettings({ userName: name });
        return say(
          c.s.addressBy === "name" ? `Enchanté, ${name}. C'est ainsi que je vous appellerai désormais.` : `Enchanté, ${name}. Je m'en souviendrai, ${c.sir}.`,
          { actions: [R_SETTINGS] },
        );
      }
      if (/^\s*(?:appelle|appelez)\s+(?:moi|nous)\s+par\s+(?:mon|notre)\s+prenom\s*$/.test(c.f)) {
        if (!c.s.userName) return say(`Volontiers, mais je ne connais pas encore votre prénom, ${c.sir}. Dites « je m'appelle… ».`);
        await updateSettings({ addressBy: "name" });
        return say(`Entendu, ${c.s.userName}.`, { actions: [R_SETTINGS] });
      }
      const hm = X(/^\s*(?:appelle|appelez)\s+(?:moi|nous)\s+(.{1,40}?)\s*$/, c.f);
      if (hm && !/\b(dans|demain|un|une|des|le|la|les|a|au|quand|si)\b/.test(hm[1]) && !/\d/.test(hm[1])) {
        const value = grab(c, hm, 1);
        if (!value) return null;
        if (isTitle(value)) {
          const h = capitalize(value);
          await updateSettings({ honorific: h, addressBy: "title" });
          return say(`Très bien. Désormais, je vous appellerai ${h.charAt(0).toLowerCase() + h.slice(1)}.`, { actions: [R_SETTINGS] });
        }
        const name = value.split(" ").map(capitalize).join(" ");
        await updateSettings({ userName: name, addressBy: "name" });
        return say(`Très bien, ${name}. C'est ainsi que je vous appellerai désormais.`, { actions: [R_SETTINGS] });
      }
      return null;
    },
  },
  {
    name: "memory-forget",
    run: async (c) => {
      if (/(oublie tout|efface (toute )?ta memoire|vide ta memoire|reinitialise ta memoire|supprime (tous )?tes souvenirs|efface tes souvenirs|oublie tout ce que (je t ai dit|tu sais))/.test(c.f)) {
        const r = await db.delete(memories).returning({ id: memories.id });
        const n = r.length;
        return say(n ? `Mémoire effacée : ${n} souvenir${n > 1 ? "s" : ""} supprimé${n > 1 ? "s" : ""}. Table rase, ${c.sir}.` : `Ma mémoire était déjà vierge, ${c.sir}.`, { actions: [R_MEM] });
      }
      const m = /^\s*(?:oublie|efface de ta memoire|supprime de ta memoire)\s+(?:que\s+|qu\s+)?(.+)$/.exec(c.f);
      if (!m) return null;
      const mems = await db.select().from(memories).orderBy(desc(memories.createdAt));
      const idx = bestMatch(m[1], mems.map((x) => x.content));
      if (idx < 0) return say(`Je n'ai rien trouvé de tel dans ma mémoire, ${c.sir}.`);
      await db.delete(memories).where(eq(memories.id, mems[idx].id));
      return say(`C'est oublié : « ${mems[idx].content} ».`, { actions: [R_MEM] });
    },
  },
  {
    name: "memory-recall",
    run: async (c) => {
      if (!/(que sais tu (sur|de) moi|qu est ce que tu sais (sur|de) moi|tu sais quoi (sur|de) moi|tu me connais|tes souvenirs|ta memoire|qu est ce que (tu as|t as) retenu|qu est ce que je t ai (dit|demande) de retenir|que t ai je (dit|demande) de retenir|tu te souviens de quoi|de quoi tu te souviens|liste (tes|des|mes) (souvenirs|notes)|mes notes|montre (moi )?(ta memoire|mes notes)|qu as tu retenu)/.test(c.f)) return null;
      const mems = await db.select().from(memories).orderBy(asc(memories.createdAt)).limit(50);
      const items = mems.map((m) => m.content);
      if (c.s.userName) items.unshift(`Vous vous appelez ${c.s.userName}.`);
      if (!items.length) return say(`Ma mémoire vous concernant est encore vierge, ${c.sir}. Dites-moi « retiens que… » pour m'apprendre quelque chose.`);
      const spoken = items.slice(0, 6).join(" ; ");
      return say(`Voici ce que je sais de vous, ${c.sir} : ${spoken}${items.length > 6 ? "…" : "."}`, {
        source: "memory",
        cards: [{ kind: "list", title: "Mémoire à long terme", items }],
      });
    },
  },
  {
    name: "memory-store",
    run: async (c) => {
      const m = X(
        /^\s*(?:retiens|retenez|retenir|souviens\s+toi|souvenez\s+vous|rappelle\s+toi|rappelez\s+vous|memorise|memoriser|memorisez|garde\s+en\s+memoire|note\s+(?:bien\s+)?que|sache\s+que|sachez\s+que|pour\s+info|pour\s+ton\s+information|pour\s+information|a\s+savoir|n\s+oublie\s+pas\s+que|enregistre\s+que|apprends\s+que)\b\s*(?:bien\s+)?(?:que\s+|qu\s+|ceci\s+|ca\s+|de\s+|d\s+)?(.*)$/,
        c.f,
      );
      if (!m) return null;
      const fact = capitalize(grab(c, m, 1));
      if (!fact) return say(`Que dois-je retenir, ${c.sir} ?`);
      await db.insert(memories).values({ content: fact.slice(0, 500) });
      return say(pick([`C'est enregistré dans ma mémoire, ${c.sir}.`, `Bien noté. Je m'en souviendrai, ${c.sir}.`, `Information archivée, ${c.sir}.`]), {
        source: "memory",
        actions: [R_MEM],
      });
    },
  },

  // ─── Informations ──────────────────────────────────────────────────────
  {
    name: "weather",
    run: async (c) => {
      const f = c.f;
      if (!WEATHER_TRIGGER.test(f)) return null;
      const cands = cityCandidates(c);
      let data: WeatherData | null = null;
      let asked = "";
      try {
        for (const cand of cands.slice(0, 3)) {
          asked = cand;
          data = await weatherForCity(cand);
          if (data) break;
        }
        if (!data && !cands.length) {
          asked = c.s.city || "Paris";
          data = await weatherForCity(asked);
        }
      } catch {
        return say(`Je n'arrive pas à joindre les satellites météo pour le moment, ${c.sir}.`);
      }
      if (!data) return say(`Je ne trouve pas la ville « ${asked} », ${c.sir}.`);
      const card: Card = { kind: "weather", data };
      const rainQ = /(pleuvoir|pleut|pluie|parapluie|neiger|neige)/.test(f);
      if (/\b(semaine|prochains jours|week end|weekend)\b/.test(f)) {
        const days = data.daily
          .slice(0, 5)
          .map((d) => `${weekdayName(d.date)} : ${d.desc}, de ${Math.round(d.min)} à ${Math.round(d.max)} °C`)
          .join(" ; ");
        return say(`Prévisions pour ${data.city}, ${c.sir}. ${capitalize(days)}.`, { source: "weather", cards: [card] });
      }
      const day = /\bapres\s+demain\b/.test(f) ? 2 : /\bdemain\b/.test(f) ? 1 : 0;
      if (day > 0 && data.daily[day]) {
        const d = data.daily[day];
        let t = `${day === 1 ? "Demain" : "Après-demain"} à ${data.city} : ${d.desc}, entre ${Math.round(d.min)} et ${Math.round(d.max)} °C`;
        if (d.rain !== null) t += `, avec ${d.rain} % de risque de précipitations`;
        t += ".";
        if (rainQ) t += d.rain !== null && d.rain >= 50 ? ` Je vous conseille de prendre un parapluie, ${c.sir}.` : ` Le parapluie devrait pouvoir rester au placard, ${c.sir}.`;
        return say(t, { source: "weather", cards: [card] });
      }
      const cur = data.current;
      const today = data.daily[0];
      let t = `Actuellement à ${data.city} : ${Math.round(cur.temp)} °C, ${cur.desc}. Ressenti ${Math.round(cur.feels)} °C, vent à ${Math.round(cur.wind)} km/h.`;
      if (today) t += ` Aujourd'hui, entre ${Math.round(today.min)} et ${Math.round(today.max)} °C.`;
      if (rainQ && today && today.rain !== null)
        t += today.rain >= 50 ? ` Risque de pluie de ${today.rain} % : un parapluie serait judicieux, ${c.sir}.` : ` Risque de pluie de ${today.rain} % seulement, ${c.sir}.`;
      else if (cur.temp <= 3) t += ` Couvrez-vous bien, ${c.sir}.`;
      else if (cur.temp >= 30) t += ` Pensez à vous hydrater, ${c.sir}.`;
      return say(t, { source: "weather", cards: [card] });
    },
  },
  {
    name: "news",
    run: async (c) => {
      if (!/\b(actualites?|actus?|les infos|des infos|infos du jour|nouvelles du (jour|monde)|dernieres nouvelles|les titres|gros titres|journal|quoi de neuf dans le monde|flash info|revue de presse|a la une|l actu)\b/.test(c.f)) return null;
      const topic = newsTopic(c.f);
      const news = await fetchNews(topic);
      if (!news || !news.items.length) return say(`Je n'arrive pas à récupérer les actualités pour le moment, ${c.sir}.`);
      const top = news.items
        .slice(0, 5)
        .map((i) => {
          const t = i.title.replace(/^\s*(EN DIRECT|VIDÉO|VIDEO|PODCAST|ENQUÊTE|ENTRETIEN|TRIBUNE|RÉCIT|DÉCRYPTAGE)\s*[,:|-]?\s*/i, "").split(" | ")[0].trim();
          const clean = t.replace(/[\s.]+$/, "");
          return /[?!…]$/.test(clean) ? clean : `${clean}.`;
        })
        .join(" ");
      return say(`Voici les derniers titres${topicName(topic)}, ${c.sir}. ${top}`, {
        source: "news",
        cards: [{ kind: "news", source: news.source, items: news.items.slice(0, 8) }],
      });
    },
  },
  {
    name: "system",
    run: async (c) => {
      const f = c.f;
      const batteryOnly = /\bbatterie\b/.test(f) && !/(diagnostic|systeme|etat)/.test(f);
      if (
        !batteryOnly &&
        !/(diagnostic|etat (du|des) systemes?|statut (du )?systeme|rapport (systeme|d etat)|comment va (le|mon|l) (pc|ordinateur|ordi|systeme)|utilisation (du |de la )?(cpu|processeur|memoire|ram)|charge (du )?(cpu|processeur)|infos? systeme|informations systeme|specifications? (du|de mon) (pc|ordinateur)|ma config|memoire vive|etat de (mon|l) (pc|ordinateur|ordi))/.test(f)
      )
        return null;
      const b = c.client.battery ?? null;
      if (batteryOnly) {
        if (!b) return say(`Je n'ai pas accès au niveau de batterie depuis ce navigateur, ${c.sir}. Chrome et Edge le permettent sur un ordinateur portable.`);
        return say(`Batterie à ${b.level} %${b.charging ? ", en charge" : ""}, ${c.sir}.${!b.charging && b.level < 20 ? " Je vous suggère de brancher le chargeur." : ""}`);
      }
      const st = await getServerStats();
      const used = st.totalMem - st.freeMem;
      let t = `Diagnostic terminé, ${c.sir}. Processeur à ${st.cpuUsage} % sur ${st.cores} cœurs. Mémoire vive : ${gb(used)} utilisés sur ${gb(st.totalMem)}.`;
      if (b) t += ` Batterie à ${b.level} %${b.charging ? ", en charge" : ""}.`;
      t += ` Système ${st.platform} actif depuis ${formatUptime(st.uptime)}. ${st.cpuUsage > 85 ? "Le processeur est fortement sollicité." : "Tous les systèmes sont nominaux."}`;
      return say(t, { cards: [{ kind: "system", stats: st, battery: b }] });
    },
  },
  {
    name: "pc-power",
    run: async (c) => {
      const f = c.f;
      if (/\b(verrouille|verrouiller|bloque|bloquer)\s+(?:le\s+|mon\s+|la\s+|ma\s+|l\s+)?(pc|ordinateur|ordi|session|ecran|poste)\b/.test(f)) {
        if (!c.s.pcControl || !pcControlAvailable()) return say(pcUnavailable(c));
        const r = await lockPc();
        return say(r.ok ? `Verrouillage de la session, ${c.sir}.` : `Le verrouillage a échoué, ${c.sir}.`, { source: "pc" });
      }
      if (/\b(eteins|eteindre|eteint|redemarre|redemarrer|arrete|arreter|mets en veille|mettre en veille)\s+(?:le\s+|mon\s+|l\s+)?(pc|ordinateur|ordi)\b/.test(f))
        return say(`Par mesure de sécurité, je ne suis pas autorisé à éteindre ni à redémarrer votre ordinateur, ${c.sir}. Je peux en revanche verrouiller votre session.`);
      return null;
    },
  },
  {
    name: "math",
    run: (c) => {
      if (!/(combien (font|fait|egale?|ca fait|donne)|ca fait combien|calcule|calculer|resultat de|racine carree|au carre|au cube|pour ?cent de|%\s*de|\d\s*[+*x×÷\/^-]\s*\d|\d\s+(plus|moins|fois|divise par|multiplie par|sur)\s+\d)/.test(c.f)) return null;
      const v = evaluateMath(c.f);
      if (v === null) return null;
      if (!Number.isFinite(v)) return say(`Division par zéro, ${c.sir}. Même moi, je ne m'y risque pas.`);
      return say(`${pick(["Le résultat est", "Cela fait", "Ça donne"])} ${formatNumber(v)}, ${c.sir}.`);
    },
  },
  {
    name: "random",
    run: (c) => {
      if (/\bpile ou face\b/.test(c.f)) return say(`${pick(["Pile", "Face"])} !`);
      if (/\b(lance|jette|lancer|jeter|tire|tirer)\s+(un|le)\s+de\b/.test(c.f)) return say(`Le dé indique… ${1 + Math.floor(Math.random() * 6)}, ${c.sir}.`);
      const n = /\b(?:nombre|chiffre)\s+(?:au hasard|aleatoire)(?:\s+entre\s+(\d+)\s+et\s+(\d+))?/.exec(c.f);
      if (n) {
        let a = n[1] ? Number(n[1]) : 1;
        let b = n[2] ? Number(n[2]) : 100;
        if (a > b) [a, b] = [b, a];
        return say(`${a + Math.floor(Math.random() * (b - a + 1))}, ${c.sir}.`);
      }
      const ch = X(/\bchoisis\s+(?:pour moi\s+)?entre\s+(.+?)\s+et\s+(.+?)\s*$/, c.f);
      if (ch) return say(`Je choisis… ${pick([grab(c, ch, 1), grab(c, ch, 2)])}, ${c.sir}.`);
      return null;
    },
  },

  // ─── Web, musique & applications ───────────────────────────────────────
  {
    name: "music",
    run: (c) => {
      const m = X(
        /^\s*(mets|mettre|joue|jouer|lance|lancer|passe|passer|ecoute|ecouter|je veux ecouter|j ai envie d ecouter|fais moi ecouter|envoie|balance)\s+(?:moi\s+)?(.*?)(?:\s+sur\s+(youtube music|youtube|spotify|deezer|soundcloud))?\s*$/,
        c.f,
      );
      if (!m) return null;
      const verb = m[1];
      const platform = m[3] ?? null;
      const span = m.indices?.[2];
      if (!span) return null;
      let qf = c.f.slice(span[0], span[1]);
      let qt = c.text.slice(span[0], span[1]);
      if (!qf.trim() || /^\s*(moi|bien|ca)\s*$/.test(qf)) return null;
      const musicKw = /\b(musique|musiques|chanson|chansons|morceau|morceaux|titre|album|playlist|clip|son|sons|radio|rap|rock|jazz|lofi|classique|pop|electro|reggae|metal|variete|hip hop|rnb)\b/.test(qf);
      const listenVerb = /^(joue|jouer|je veux ecouter|j ai envie d ecouter|fais moi ecouter)$/.test(verb);
      const partitive = /^(mets|mettre|passe|passer|envoie|balance)$/.test(verb) && /^\s*(du|de la|des|de l)\s+/.test(qf);
      if (!platform && !musicKw && !listenVerb && !partitive) return null;
      if (!platform && !musicKw && findSite(qf)) return null;
      const cut = (re: RegExp) => {
        const mm = re.exec(qf);
        if (mm && mm[0].length) {
          qf = qf.slice(mm[0].length);
          qt = qt.slice(mm[0].length);
        }
      };
      cut(/^\s*(?:un\s+peu\s+)?(?:de\s+la\s+|du\s+|des\s+|de\s+l\s+|la\s+|le\s+|les\s+|l\s+|une\s+|un\s+)?/);
      const generic = !qf.trim() || /^\s*(musique|musiques|son|sons|chanson|chansons|morceau|playlist|bonne musique)\s*$/.test(qf);
      cut(/^\s*(?:musique|chanson|morceau|titre|album|playlist|clip|video|son)\s+(?:de\s+|d\s+|du\s+|des\s+)?/);
      let query = generic ? "AC/DC Back in Black" : trimPunct(qt);
      const qFold = foldForMatch(query);
      if (!generic && /\b(iron ?man|avengers|marvel)\b/.test(qFold) && !/\b(theme|bande originale|soundtrack|ost|generique)\b/.test(qFold)) query = `${query} bande originale`;
      if (!query) return null;
      const p = platform ?? "youtube";
      const url =
        p === "spotify" ? SEARCH.spotify(query)
        : p === "deezer" ? SEARCH.deezer(query)
        : p === "soundcloud" ? SEARCH.soundcloud(query)
        : p === "youtube music" ? `https://music.youtube.com/search?q=${encodeURIComponent(query)}`
        : SEARCH.youtube(query);
      const label = p === "spotify" ? "Spotify" : p === "deezer" ? "Deezer" : p === "soundcloud" ? "SoundCloud" : p === "youtube music" ? "YouTube Music" : "YouTube";
      const text = generic ? `Un classique de l'atelier : AC/DC. Monsieur Stark approuverait, ${c.sir}.` : `Je lance « ${query} » sur ${label}, ${c.sir}.`;
      return say(text, { actions: [{ type: "open", url, label: `${label} : ${query}` }] });
    },
  },
  {
    name: "search",
    run: async (c) => {
      const m = X(
        /^\s*(?:recherche|rechercher|cherche|chercher|google|googler|googlise|fais une recherche(?:\s+(?:sur|pour))?|lance une recherche(?:\s+(?:sur|pour))?)\s+(?:moi\s+)?(?:sur\s+(?:google|internet|le web|le net)\s+)?(.+?)(?:\s+(?:sur|dans|avec)\s+(google|internet|le web|le net|youtube|wikipedia|amazon|google maps|maps|leboncoin|spotify))?\s*$/,
        c.f,
      );
      if (!m) return null;
      const q = grab(c, m, 1);
      if (!q) return null;
      const platform = m[2] ?? "google";
      if (platform === "wikipedia") {
        const w = await wikiSummary(q);
        if (!w) return say(`Wikipédia ne contient rien sur « ${q} », ${c.sir}.`);
        return say(`D'après Wikipédia : ${stripParens(firstSentences(w.extract, 3))}`, { source: "wiki", cards: [{ kind: "wiki", ...w }] });
      }
      const map: Record<string, [string, string]> = {
        youtube: ["YouTube", SEARCH.youtube(q)],
        amazon: ["Amazon", SEARCH.amazon(q)],
        "google maps": ["Google Maps", SEARCH.maps(q)],
        maps: ["Google Maps", SEARCH.maps(q)],
        leboncoin: ["Leboncoin", SEARCH.leboncoin(q)],
        spotify: ["Spotify", SEARCH.spotify(q)],
      };
      const [label, url] = map[platform] ?? ["Google", SEARCH.google(q)];
      return say(`Je lance la recherche « ${q} » sur ${label}, ${c.sir}.`, { actions: [{ type: "open", url, label: `${label} : ${q}` }] });
    },
  },
  {
    name: "open",
    run: async (c) => {
      const m = X(
        /^\s*(?:ouvre|ouvrir|ouvrez|ouvres|lance|lancer|lancez|demarre|demarrer|execute|va sur|aller sur|allez sur|affiche|afficher|montre moi|emmene moi sur|connecte moi a|connecte moi sur|accede a)\s+(?:moi\s+)?(.+?)\s*$/,
        c.f,
      );
      if (!m) return null;
      let tf = m[1];
      const wantsApp = /\b(application|appli|app|logiciel|programme)\b/.test(tf);
      const wantsFolder = /\bdossier\b/.test(tf);
      tf = tf
        .replace(/^(?:(?:le\s+site\s+(?:web\s+)?(?:de\s+|d\s+|du\s+)?|l\s+application\s+|l\s+appli\s+|le\s+logiciel\s+|le\s+programme\s+|la\s+page\s+(?:de\s+|d\s+|du\s+)?|le\s+dossier\s+(?:de\s+|des\s+|du\s+)?|mon\s+|ma\s+|mes\s+|le\s+|la\s+|les\s+|l\s+|un\s+|une\s+)\s*)+/, "")
        .trim();
      if (!tf) return null;
      const display = grab(c, m, 1);
      const pcOk = c.s.pcControl && pcControlAvailable();
      const folder = findFolder(tf);
      const site = findSite(tf);
      if (folder && (wantsFolder || !site)) {
        if (!pcOk) return say(pcUnavailable(c));
        const r = await openFolder(folder.dir);
        return say(r.ok ? `J'ouvre le dossier ${folder.label}, ${c.sir}.` : `Je n'ai pas pu ouvrir le dossier ${folder.label}, ${c.sir}.`, { source: "pc" });
      }
      const app = findApp(tf) ?? (wantsApp ? findApp(`application ${tf}`) : null);
      if (app && (wantsApp || !site || app.preferred)) {
        if (pcOk) {
          const r = await launchApp(app);
          if (r.ok) return say(`J'ouvre ${app.label}, ${c.sir}.`, { source: "pc" });
          if (app.web) return say(`${capitalize(app.label)} ne semble pas installé ; j'ouvre la version web, ${c.sir}.`, { actions: [{ type: "open", url: app.web, label: app.label }] });
          return say(`Je n'ai pas réussi à ouvrir ${app.label}, ${c.sir}. ${r.supported ? "Est-il bien installé ?" : "Cette application n'existe pas sur ce système."}`, { source: "pc" });
        }
        if (app.web) return say(`J'ouvre la version web de ${app.label}, ${c.sir}.`, { actions: [{ type: "open", url: app.web, label: app.label }] });
        return say(pcUnavailable(c));
      }
      if (site) return say(`J'ouvre ${site.label}, ${c.sir}.`, { actions: [{ type: "open", url: site.url, label: site.label }] });
      const domainish = tf.replace(/\s+point\s+/g, ".").replace(/\s+/g, "");
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|fr|org|net|io|dev|be|ch|ca|eu|tv|app|ai|co|info|me|xyz|gg)(\/\S*)?$/.test(domainish))
        return say(`J'ouvre ${domainish}, ${c.sir}.`, { actions: [{ type: "open", url: `https://${domainish}`, label: domainish }] });
      if (c.hasLLM) return null;
      return say(`Je ne trouve pas « ${display} » parmi mes raccourcis, ${c.sir}. Je lance une recherche.`, {
        actions: [{ type: "open", url: SEARCH.google(display), label: `Recherche : ${display}` }],
      });
    },
  },

  // ─── Conversation (uniquement sans IA connectée) ───────────────────────
  {
    name: "translate",
    fallbackOnly: true,
    run: (c) => {
      const m = X(
        /^\s*(?:traduis|traduire|traduit|traduisez|comment (?:dit on|on dit|dire|se dit))\s+(.+?)\s+(?:en|in)\s+(anglais|espagnol|allemand|italien|portugais|japonais|chinois|arabe|russe|neerlandais|francais|coreen|turc|polonais|grec)\s*$/,
        c.f,
      );
      if (!m) return null;
      const q = grab(c, m, 1);
      const lang = m[2];
      return say(`J'ouvre Google Traduction pour « ${q} » en ${lang}, ${c.sir}.`, {
        actions: [{ type: "open", url: SEARCH.translate(q, LANGS[lang] ?? "en"), label: "Google Traduction" }],
      });
    },
  },
  {
    name: "howareyou",
    fallbackOnly: true,
    run: (c) => {
      if (/(comment (ca va|vas tu|allez vous|tu vas|vous allez|te sens tu|vous sentez vous)|^\s*ca va\s*$|tu vas bien|vous allez bien|la forme|bien ou quoi|quoi de neuf)/.test(c.f))
        return say(pick([`Tous mes systèmes fonctionnent à pleine capacité, ${c.sir}. Merci de vous en soucier. Et vous-même ?`, `Parfaitement bien, ${c.sir}. Mes circuits sont au frais et mon humour intact.`, `À merveille, ${c.sir}. Aucune anomalie à signaler.`]));
      if (/^\s*(ca va|je vais bien|tres bien|ca va bien|bien et toi|au top|ca roule)(\s+(merci|et toi|et vous))*\s*$/.test(c.f))
        return say(`Ravi de l'entendre, ${c.sir}. Que puis-je faire pour vous ?`);
      if (/^\s*(ca va pas|pas terrible|pas bien|je vais mal|bof|je suis triste|je suis fatigue|je suis creve|je suis epuise)\b/.test(c.f))
        return say(`J'en suis navré, ${c.sir}. Puis-je vous proposer un peu de musique, une blague, ou simplement vous laisser vous reposer ?`);
      return null;
    },
  },
  {
    name: "joke",
    fallbackOnly: true,
    run: (c) => (/(blague|fais moi rire|raconte (moi )?(un truc|quelque chose) de drole|devinette|une histoire drole|humour)/.test(c.f) ? say(pick(JOKES)) : null),
  },
  {
    name: "easter-eggs",
    fallbackOnly: true,
    run: (c) => {
      for (const [re, answers] of EGGS) if (re.test(c.f)) return say(pick(answers).replace(/\{sir\}/g, c.sir));
      return null;
    },
  },
];
