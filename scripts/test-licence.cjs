// Test du jeton de licence : signer comme le service (clé privée locale),
// vérifier comme JARVIS (verifyPremiumToken extrait du vrai fichier source).
const fs = require("fs");
const { createPrivateKey, sign: cryptoSign } = require("crypto");

const src = fs.readFileSync("src/lib/premium.ts", "utf8");
const start = src.indexOf("export function verifyPremiumToken");
const end = src.indexOf("/** Édition Premium active ?");
let fn = src.slice(start, end);
fn = fn.replace("export function verifyPremiumToken(raw: string): LicenceToken | null {", "function verifyPremiumToken(raw) {")
  .replace(/ as \{[^}]*\}/g, "")
  .replace(/: ReturnType<typeof createPublicKey>/, "");
const prelude = src.slice(src.indexOf("const VERIFY_PUB"), src.indexOf("export interface LicenceToken")).replace(/: string(\[\])?/g, "");
const mod = { exports: {} };
new Function("require", "module", "Date", "JSON", "Buffer",
  "const { createPublicKey, verify: cryptoVerify } = require(\"crypto\");\n" + prelude + "\n" + fn + "\nmodule.exports = { verifyPremiumToken };")(
  require, mod, Date, JSON, Buffer,
);
const { verifyPremiumToken } = mod.exports;

const privPem = fs.readFileSync("licences/.signing-private.pem", "utf8");
const privateKey = createPrivateKey(privPem);

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  console.log(`${ok ? "OK " : "FAIL"} ${label} => ${JSON.stringify(actual)}${ok ? "" : " (attendu " + JSON.stringify(expected) + ")"}`);
};

function makeToken(key, expMs) {
  const payload = Buffer.from(JSON.stringify({ key, exp: Date.now() + expMs })).toString("base64url");
  const sig = cryptoSign(null, Buffer.from(payload), privateKey).toString("base64url");
  return `JARVIS-PREM.${payload}.${sig}`;
}

// 1. Jeton valide (1 an)
const t1 = makeToken("JARVIS-FCK6D-WPAPZ-87", 365 * 24 * 3600 * 1000);
const v1 = verifyPremiumToken(t1);
check("jeton valide → clé", v1 ? v1.key : null, "JARVIS-FCK6D-WPAPZ-87");
check("jeton valide → exp présent", v1 ? typeof v1.exp : null, "number");

// 2. Jeton expiré
const t2 = makeToken("JARVIS-FCK6D-WPAPZ-87", -1000);
check("jeton expiré → null", verifyPremiumToken(t2), null);

// 3. Signature falsifiée (payload modifié)
const parts = makeToken("JARVIS-FCK6D-WPAPZ-87", 365 * 24 * 3600 * 1000).split(".");
const forged = Buffer.from(JSON.stringify({ key: "JARVIS-AAAAA-AAAAA-42", exp: Date.now() + 365 * 86400000 })).toString("base64url");
check("payload falsifié → null", verifyPremiumToken(`JARVIS-PREM.${forged}.${parts[2]}`), null);

// 4. Jeton signé avec une AUTRE clé (usurpation impossible)
const { generateKeyPairSync } = require("crypto");
const other = generateKeyPairSync("ed25519");
const otherSig = cryptoSign(null, Buffer.from(parts[1]), other.privateKey).toString("base64url");
check("signature d'une autre clé privée → null", verifyPremiumToken(`JARVIS-PREM.${parts[1]}.${otherSig}`), null);

// 5. Déchets
check("chaîne aléatoire → null", verifyPremiumToken("JARVIS-PREM.nimportequoi.autrechose"), null);
check("ancien format (mod-97) → null", verifyPremiumToken("JARVIS-FCK6D-WPAPZ-87"), null);

console.log(`\n${pass} OK, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
