// Tests v1.25 : intentions Obsidian et scan de sécurité (regex extraites du fichier source).
const fs = require("fs");
const s = fs.readFileSync("src/lib/brain/intents.ts", "utf8");
const fold = (x) =>
  x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019'`´]/g, " ")
    .replace(/([a-z])-(?=[a-z])/g, "$1 ");

function extract(marker) {
  const i = s.indexOf(marker);
  const start = s.indexOf("/^", i);
  const end = s.indexOf("/.exec(c.f)", start);
  return new RegExp(s.slice(start + 1, end), "");
}

const obsidianWrite = extract('name: "obsidian"');
const obsidianRead = s.slice(s.indexOf('name: "obsidian"'));
const readIdx = obsidianRead.indexOf("/^\\s*(?:relis");
const readEnd = obsidianRead.indexOf("/.test(c.f)", readIdx);
const obsidianReadRe = new RegExp(obsidianRead.slice(readIdx + 1, readEnd), "");
// deuxième alternative : « mes dernières notes obsidian »
const read2Idx = obsidianRead.indexOf("/^\\s*(?:mes\\s+)?dernieres?");
const read2End = obsidianRead.indexOf("/.test(c.f)", read2Idx);
const obsidianRead2Re = new RegExp(obsidianRead.slice(read2Idx + 1, read2End), "");
const securityRe = (() => {
  const i = s.indexOf('name: "security"');
  const start = s.indexOf("/^\\s*(?:scanne", i);
  const end = s.indexOf("/.test(f)", start);
  return new RegExp(s.slice(start + 1, end), "");
})();

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? "OK " : "FAIL"} ${label} => ${JSON.stringify(actual)}${ok ? "" : " (attendu " + JSON.stringify(expected) + ")"}`);
};

// Obsidian — écriture
const writeTests = [
  ["note dans Obsidian : RDV dentiste lundi", "rdv dentiste lundi"],
  ["note dans obsidian rdv dentiste lundi", "rdv dentiste lundi"],
  ["écris dans mon coffre que le wifi du salon est en panne", "le wifi du salon est en panne"],
  ["ajoute à mes notes Obsidian idée appli", "idee appli"],
  ["enregistre dans Obsidian liste de courses", "liste de courses"],
];
for (const [input, expected] of writeTests) {
  const m = obsidianWrite.exec(fold(input));
  check(`write "${input}"`, m ? m[1] : null, expected);
}
// Obsidian — lecture
check("read « relis mon coffre »", obsidianReadRe.test(fold("relis mon coffre")), true);
check("read « relis mon coffre obsidian »", obsidianReadRe.test(fold("relis mon coffre obsidian")), true);
check("read « mes dernières notes obsidian »", obsidianRead2Re.test(fold("mes dernières notes obsidian")), true);
check("read bruit « retiens que »", obsidianWrite.test(fold("retiens que j'aime le thé")), false);

// Sécurité
const secTests = [
  ["lance un scan antivirus", true],
  ["scanne mon pc", true],
  ["analyse mon système", true],
  ["vérifie mon système", true],
  ["cherche les virus sur mon pc", true],
  ["quel temps fait-il", false],
  ["état du système", false], // reste au diagnostic système existant
  ["ouvre youtube", false],
];
for (const [input, expected] of secTests) {
  const anti = /antivirus|virus|malware|logiciels malveillants|menaces?/.test(fold(input));
  const verb = /\b(scan|scannes?|analyse|verifie|cherche|lance|detecte|fais)\b/.test(fold(input));
  const secIt = anti && verb ? true : securityRe.test(fold(input));
  check(`security "${input}"`, secIt, expected);
}

// PowerShell : octets du script (String.raw ne doit contenir ni backspace ni backslash simple mal formé)
const sec = fs.readFileSync("src/lib/brain/security.ts", "utf8");
const ps = sec.slice(sec.indexOf("String.raw`"), sec.indexOf("`;", sec.indexOf("String.raw`")));
const hasBackspace = ps.includes(String.fromCharCode(8));
const doubleBS = (ps.match(/\\\\/g) || []).length;
check("PS sans backspace corrompu", hasBackspace, false);
check("PS contient les échappements regex (\\\\temp\\\\)", doubleBS > 0, true);

console.log(`\n${pass} OK, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
