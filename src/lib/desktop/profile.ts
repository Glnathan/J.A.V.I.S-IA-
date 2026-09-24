// PC version: profile shared with the Windows installer and preferences read by the launcher.
//  - profil-installation.ini : written by the installer (first name chosen during installation), applied once at startup;
//  - profil.ini              : kept up to date by JARVIS, read by the installer to prefill its page on updates;
//  - lanceur.json            : browser used for the JARVIS window (read by desktop/launcher.js).
import fs from "node:fs";
import path from "node:path";
import { detectAudio, getBootMusic, saveBootMusic } from "@/lib/boot-music";
import { readRemoteConfig } from "@/lib/remote-config";
import { dataDir } from "@/lib/runtime";

export interface DesktopProfile {
  userName: string;
  addressBy: string;
  honorific: string;
  desktopBrowser: string;
  bootMusic: string;
  /** Colonne ai_keys (JSON) : pré-remplit la page « Clés IA » de l'installateur lors des mises à jour. */
  aiKeys?: string;
}

export interface ProfilePatch {
  userName?: string;
  addressBy?: string;
  honorific?: string;
  bootMusic?: string;
  /** Clés IA saisies dans l'installateur, une par fournisseur (fusionnées avec les clés existantes). */
  aiKeys?: Record<string, string>;
}

function writeUtf16(file: string, text: string): void {
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]));
}

/** Reads a small INI file written by NSIS (UTF-16 LE with BOM) or by hand (UTF-8). */
export function readIni(file: string): Record<string, string> | null {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(file);
  } catch {
    return null;
  }
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.subarray(2).toString("utf16le") : buf.toString("utf8").replace(/^\uFEFF/, "");
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([\w-]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1].toLowerCase()] = m[2];
  }
  return out;
}

export function appellationOf(p: { addressBy: string; honorific: string }): string {
  if (p.addressBy === "name") return "prenom";
  const h = p.honorific.trim().toLowerCase();
  return h === "monsieur" ? "monsieur" : h === "madame" ? "madame" : "autre";
}

/** Boot music as understood by the installer page ("youtube" | "fichier" | "theme" | "aucune"). */
export function musicModeOf(bootMusic: string): string {
  if (bootMusic === "youtube") return "youtube";
  if (bootMusic === "custom") return getBootMusic() ? "fichier" : "theme";
  return bootMusic === "off" ? "aucune" : "theme";
}

export function writeDesktopFiles(p: DesktopProfile): void {
  const dir = dataDir();
  const clean = (v: string) => v.replace(/[\r\n[\]=]/g, " ").trim();
  // Clés IA (une par fournisseur) : l'installateur les ré-affiche lors d'une mise à jour.
  let keyLines = "";
  try {
    const keys = JSON.parse(p.aiKeys || "{}") as Record<string, unknown>;
    for (const [id, iniName] of [
      ["gemini", "cle_gemini"],
      ["groq", "cle_groq"],
      ["anthropic", "cle_anthropic"],
    ] as const) {
      const k = typeof keys[id] === "string" ? (keys[id] as string).replace(/[\r\n[\]=;]/g, "").trim().slice(0, 500) : "";
      if (k) keyLines += `${iniName}=${k}\r\n`;
    }
  } catch {
    /* pas de clés enregistrées */
  }
  writeUtf16(
    path.join(dir, "profil.ini"),
    `[profil]\r\nprenom=${clean(p.userName)}\r\nappellation=${appellationOf(p)}\r\nautre=${clean(p.honorific)}\r\nmusique=${musicModeOf(p.bootMusic)}\r\n${keyLines}`,
  );
  fs.writeFileSync(path.join(dir, "lanceur.json"), JSON.stringify({ navigateur: p.desktopBrowser || "auto", acces: readRemoteConfig().mode }, null, 2));
}

/** Applies the first name chosen in the installer (then deletes the file). */
export async function applyInstallerProfile(update: (patch: ProfilePatch) => Promise<unknown>): Promise<boolean> {
  const file = path.join(dataDir(), "profil-installation.ini");
  const ini = readIni(file);
  if (!ini) return false;
  const name = (ini.prenom ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  const mode = (ini.appellation ?? "prenom").trim().toLowerCase();
  const patch: ProfilePatch = {};
  if (name) patch.userName = name;
  if (mode === "monsieur") Object.assign(patch, { addressBy: "title", honorific: "Monsieur" });
  else if (mode === "madame") Object.assign(patch, { addressBy: "title", honorific: "Madame" });
  else if (name) patch.addressBy = "name";

  // Boot music chosen in the installer (the audio file itself was copied next to the ini file).
  const music = (ini.musique ?? "").trim().toLowerCase();
  if (music === "youtube") patch.bootMusic = "youtube";
  else if (music === "theme") patch.bootMusic = "theme";
  else if (music === "aucune") patch.bootMusic = "off";
  else if (music === "fichier") {
    const ext = (ini.musique_ext ?? "").replace(/[^a-z0-9]/gi, "").toLowerCase() || "mp3";
    const src = path.join(dataDir(), `musique-installation.${ext}`);
    if (fs.existsSync(src)) {
      const original = (ini.musique_fichier ?? "").trim() || `musique.${ext}`;
      const audio = detectAudio(original, "") ?? detectAudio(src, "");
      if (audio) {
        saveBootMusic(fs.readFileSync(src), original, audio);
        patch.bootMusic = "custom";
      } else console.warn(`[jarvis] Format audio non pris en charge : ${original}`);
      fs.rmSync(src, { force: true });
    }
  }

  // Clés IA choisies dans l'installateur (une par fournisseur, seules les clés renseignées sont appliquées).
  const iniKeys: [string, string][] = [
    ["cle_gemini", "gemini"],
    ["cle_groq", "groq"],
    ["cle_anthropic", "anthropic"],
  ];
  const aiKeys: Record<string, string> = {};
  for (const [iniKey, provider] of iniKeys) {
    const key = (ini[iniKey] ?? "").trim().slice(0, 500);
    if (key) aiKeys[provider] = key;
  }
  if (Object.keys(aiKeys).length) patch.aiKeys = aiKeys;

  if (Object.keys(patch).length) await update(patch);
  fs.rmSync(file, { force: true });
  console.log(
    `[jarvis] Profil choisi à l'installation appliqué : ${name || "(sans prénom)"} (${mode}, musique : ${music || "inchangée"}, clés IA : ${
      Object.keys(aiKeys).join(", ") || "aucune"
    }).`,
  );
  return true;
}
