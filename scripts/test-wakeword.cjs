// Test de l'intention "wakeword" + cleanCommand avec mot personnalisé.
// Regex et logique transcrites de src/lib/brain/{intents,index}.ts — à relancer après toute modification.
const fs = require("fs");
const s = fs.readFileSync("src/lib/brain/intents.ts", "utf8");
const i = s.indexOf('name: "wakeword"');
const start = s.indexOf("= /", i) + 3;
const end = s.indexOf("/.exec(c.f)", start);
const re = new RegExp(s.slice(start, end), "");

const fold = (x) =>
  x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019'`´]/g, " ")
    .replace(/([a-z])-(?=[a-z])/g, "$1 ");

const WAKE_DEFAULT = "(?:jarvis|jarvi|djarvis|jarvisse|jarviss)";
function wakeGroup(custom) {
  const w = (custom ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "").trim();
  if (w.length < 2) return WAKE_DEFAULT;
  const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `(?:${WAKE_DEFAULT}|${escaped}|d${escaped}|${escaped}s?e?)`;
}

function cleanCommand(input, wakeCustom) {
  let t = input.normalize("NFC").replace(/\s+/g, " ").trim();
  const WAKE = wakeGroup(wakeCustom);
  const strip = (re2) => {
    const f = fold(t);
    const m = re2.exec(f);
    if (m && m[0].length) t = `${t.slice(0, m.index)} ${t.slice(m.index + m[0].length)}`.replace(/\s+/g, " ").trim();
  };
  strip(new RegExp(`^\\s*(?:(?:ok|okay|dis|hey|he|eh|yo|allo)\\s+)?${WAKE}\\b[\\s,]*`));
  strip(new RegExp(`[\\s,]*\\b(?<!\\b(?:a|au|aux|de|du|de la) )${WAKE}\\s*$`));
  return t.replace(/^[\s,.;:!?]+/, "").trim();
}

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? "OK " : "FAIL"} ${label} => ${JSON.stringify(actual)}${ok ? "" : " (attendu " + JSON.stringify(expected) + ")"}`);
};

// Intention : (entrée après cleanCommand, wakeCustom courant) => mot capté
const intentTests = [
  ["réponds à vendredi", "", "vendredi"],
  ["jarvis réponds à vendredi", "", "vendredi"], // cleanCommand retire « jarvis »
  ["vendredi réponds à Omega", "vendredi", "omega"], // mot personnalisé en tête
  ["réponds au mot Alpha", "", "alpha"],
  ["réveille-toi quand je dis chatou", "", "chatou"],
  ["surnomme-toi Vendredi", "", "vendredi"],
  ["réponds à Jarvis", "omega", "jarvis"], // reset
  ["nouveau mot d'activation nuage", "", "nuage"],
  ["tu peux répondre à Omega s'il te plaît", "", "omega"], // filtre de queue
  ["réponds à Alpha 7", "", "alpha"],
  ["désormais réponds à Furet", "", "furet"],
  ["quel temps fera-t-il vendredi", "", null],
  ["ouvre youtube", "", null],
  ["appelle le restaurant d'à côté", "", null],
];
for (const [input, custom, expected] of intentTests) {
  const cleaned = cleanCommand(input, custom);
  const m = re.exec(fold(cleaned));
  let word = null;
  if (m) {
    const rest = m[1].replace(/\s+(desormais|maintenant|stp|svp|s il te plait|merci|voila|dorenavant)\s*$/, "").trim();
    const tokens = rest.split(/\s+/);
    for (let k = tokens.length - 1; k >= 0; k--) {
      if (/^[a-z]{2,20}$/.test(tokens[k])) { word = tokens[k]; break; }
    }
    if (m[1] && !word) word = m[1];
  }
  check(`${JSON.stringify(input)}${custom ? " [mot=" + custom + "]" : ""}`, word, expected);
}

// cleanCommand avec mot personnalisé
const cleanTests = [
  ["vendredi ouvre youtube", "vendredi", "ouvre youtube"],
  ["ok vendredi, quelle heure", "vendredi", "quelle heure"],
  ["vendredi!", "vendredi", ""],
  ["quel temps fera-t-il vendredi", "vendredi", "quel temps fera-t-il"], // strip en queue : cohérent avec le client
  ["jarvis ouvre youtube", "", "ouvre youtube"],
];
for (const [input, custom, expected] of cleanTests) {
  check(`clean ${JSON.stringify(input)}${custom ? " [mot=" + custom + "]" : ""}`, cleanCommand(input, custom), expected);
}

console.log(`\n${pass} OK, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
