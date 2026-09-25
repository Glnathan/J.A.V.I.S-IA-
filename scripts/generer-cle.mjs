#!/usr/bin/env node
/**
 * Générateur de clés Premium J.A.R.V.I.S. (pour le vendeur uniquement).
 *
 *   node scripts/generer-cle.mjs ["Nom du client"]
 *
 * Fabrique une clé valide au format JARVIS-XXXXX-XXXXX-XX (même algorithme de
 * somme de contrôle que src/lib/premium.ts) et l'ajoute au registre local
 * `cles-vendues.csv` (ignoré par Git — ne jamais le publier).
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const GROUP = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans I, L, O, 0, 1 pour éviter les confusions
const LEDGER = path.resolve(process.cwd(), "cles-vendues.csv");

function group(n) {
  let out = "";
  for (let i = 0; i < n; i++) out += GROUP[crypto.randomInt(GROUP.length)];
  return out;
}

/** Même somme de contrôle que premium.ts : somme pondérée des codes, modulo 97. */
function checksum(chars) {
  let sum = 0;
  for (let i = 0; i < chars.length; i++) sum += chars.charCodeAt(i) * (i + 7);
  return String(sum % 97).padStart(2, "0");
}

function verify(key) {
  const m = /^JARVIS-([A-Z2-9]{5})-([A-Z2-9]{5})-(\d{2})$/.exec(key);
  return Boolean(m) && checksum(`${m[1]}${m[2]}`) === m[3];
}

const name = (process.argv[2] ?? "").trim() || "client";
const a = group(5);
const b = group(5);
const key = `JARVIS-${a}-${b}-${checksum(`${a}${b}`)}`;

if (!verify(key)) throw new Error("Clé générée invalide — bug du générateur, n'utilisez pas cette clé.");

const line = `${new Date().toISOString()};${name.replace(/[;\n\r]/g, " ")};${key}`;
if (existsSync(LEDGER)) appendFileSync(LEDGER, `\n${line}`, "utf8");
else writeFileSync(LEDGER, `date;client;cle\n${line}`, "utf8");

console.log(`\nClé Premium générée${name !== "client" ? ` pour « ${name} »` : ""} :\n`);
console.log(`  ${key}\n`);
console.log(`Vérification : ${verify(key) ? "valide" : "INVALIDE"}`);
console.log(`Registre     : ${LEDGER}\n`);
