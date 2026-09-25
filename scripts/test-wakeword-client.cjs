// Évalue le vrai setWakeWord/wakeRe de recognition.ts (TS dépouillé) sur des phrases réelles.
const fs = require("fs");
const s = fs.readFileSync("src/lib/client/recognition.ts", "utf8");
const i = s.indexOf("export const WAKE_RE");
const j = s.indexOf("export interface BrowserInfo");
let block = s.slice(i, j)
  .replace(/export (const|function|let)/g, "$1")
  .replace(/: RegExp(?=\s*=)/, "")
  .replace(/function setWakeWord\(word: string\): void/, "function setWakeWord(word)")
  .replace(/function wakeRe\(\): RegExp/, "function wakeRe()");
const mod = { exports: {} };
new Function("module", block + "\nmodule.exports = { setWakeWord, wakeRe, WAKE_RE };")(mod);
const { setWakeWord, wakeRe, WAKE_RE } = mod.exports;

const fold = (x) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? "OK " : "FAIL"} ${label} => ${actual}${ok ? "" : " (attendu " + expected + ")"}`);
};

setWakeWord("Vendredi");
for (const t of ["vendredi ouvre youtube", "Vendredi, quelle heure", "dvendredi", "vendredis", "vendredi", "vendrediii"]) check(`mot "${t}"`, wakeRe().test(fold(t)), true);
for (const t of ["jarvis ouvre youtube", "quel temps", "prend le contrôle"]) check(`bruit "${t}"`, wakeRe().test(fold(t)), false);
setWakeWord("");
check("reset → vendredi", wakeRe().test(fold("vendredi")), false);
check("reset → jarvis", wakeRe().test(fold("jarvis ouvre youtube")), true);
setWakeWord("Ω");
check("Ω (lettre grecque filtrée → défaut)", wakeRe() === WAKE_RE, true);
setWakeWord("ab");
check("2 lettres valides", wakeRe().test(fold("ab")), true);
console.log(`\n${pass} OK, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
