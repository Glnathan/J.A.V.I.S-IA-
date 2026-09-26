// Service de licences J.A.R.V.I.S. Premium — fonction Vercel, zéro dépendance.
// Format CJS classique (handler req/res) : le plus compatible tous runtimes.
// Activation : POST { key } (ou GET ?key=) → si la clé figure dans KEYS_JSON,
// renvoie un jeton signé Ed25519 valable un an.
const { createPrivateKey, sign: cryptoSign } = require("node:crypto");

const GROUP = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const KEY_RE = new RegExp(`^JARVIS-([${GROUP}]{5})-([${GROUP}]{5})-(\\d{2})$`);
const TOKEN_DAYS = 365;

function normalize(raw) {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function issuedKeys() {
  try {
    const list = JSON.parse(process.env.KEYS_JSON || "[]");
    return Array.isArray(list) ? list.map(normalize).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/** Charge la clé privée Ed25519 quel que soit le formatage collé dans Vercel. */
function loadPrivateKey() {
  const raw = process.env.SIGNING_KEY || "";
  if (!raw) throw new Error("SIGNING_KEY absente.");
  try {
    return createPrivateKey(raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw);
  } catch {
    const body = raw.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
    return createPrivateKey({ key: Buffer.from(body, "base64"), format: "der", type: "pkcs8" });
  }
}

function issueToken(key) {
  const privateKey = loadPrivateKey();
  const exp = Date.now() + TOKEN_DAYS * 24 * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ key, exp })).toString("base64url");
  const sig = cryptoSign(null, Buffer.from(payload), privateKey).toString("base64url");
  return { token: `JARVIS-PREM.${payload}.${sig}`, exp, days: TOKEN_DAYS };
}

module.exports = async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      return res.status(204).end();
    }
    let key = "";
    if (req.method === "POST") {
      const body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
      key = normalize(body.key);
    } else {
      key = normalize((req.url || "").split("key=")[1] || "");
    }
    if (!KEY_RE.test(key)) return res.status(400).json({ error: "Format de clé invalide." });
    if (!issuedKeys().includes(key)) return res.status(403).json({ error: "Clé inconnue — contactez le vendeur si vous venez de l'acheter." });
    return res.status(200).json({ ok: true, key, ...issueToken(key) });
  } catch (e) {
    return res.status(500).json({ error: `Service de licences indisponible : ${e instanceof Error ? e.message : "erreur inconnue"}` });
  }
};
