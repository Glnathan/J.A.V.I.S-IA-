// Service de licences J.A.R.V.I.S. Premium — fonction Vercel, zéro dépendance.
// Activation : POST { key } → si la clé figure dans KEYS_JSON (variables d'environ
// Vercel), le service renvoie un jeton signé Ed25519 valable un an. JARVIS le
// vérifie localement (clé publique embarquée) et le renouvelle automatiquement.
import { createPrivateKey, sign as cryptoSign } from "node:crypto";

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

/** Charge la clé privée Ed25519 quel que soit le formatage collé dans Vercel
 *  (retours à la ligne réels, littéraux \n, ou tout mis sur une seule ligne). */
function loadPrivateKey() {
  const raw = process.env.SIGNING_KEY || "";
  if (!raw) throw new Error("SIGNING_KEY absente.");
  try {
    return createPrivateKey(raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw);
  } catch {
    // Corps base64 seul (en-têtes et blancs retirés) → DER pkcs8.
    const body = raw.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
    return createPrivateKey({ key: Buffer.from(body, "base64"), format: "der", type: "pkcs8" });
  }
}

function json(code, body) {
  return new Response(JSON.stringify(body), { status: code, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
}

function issueToken(key) {
  const privateKey = loadPrivateKey();
  const exp = Date.now() + TOKEN_DAYS * 24 * 3600 * 1000;
  const payload = Buffer.from(JSON.stringify({ key, exp })).toString("base64url");
  const sig = cryptoSign(null, Buffer.from(payload), privateKey).toString("base64url");
  return { token: `JARVIS-PREM.${payload}.${sig}`, exp, days: TOKEN_DAYS };
}

export default async function handler(req) {
  try {
    if (req.method === "OPTIONS")
      return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, GET", "Access-Control-Allow-Headers": "Content-Type" } });
    let key = "";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        key = normalize(body.key);
      } catch {
        return json(400, { error: "Requête invalide." });
      }
    } else {
      key = normalize(new URL(req.url).searchParams.get("key"));
    }
    if (!KEY_RE.test(key)) return json(400, { error: "Format de clé invalide." });
    if (!issuedKeys().includes(key)) return json(403, { error: "Clé inconnue — contactez le vendeur si vous venez de l'acheter." });
    return json(200, { ok: true, key, ...issueToken(key) });
  } catch (e) {
    return json(500, { error: `Service de licences indisponible : ${e instanceof Error ? e.message : "erreur inconnue"}` });
  }
}
