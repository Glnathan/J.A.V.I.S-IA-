// Coffre Obsidian (Premium, version PC) : JARVIS écrit ses notes dans un fichier
// Markdown de votre coffre (JARVIS.md) et sait les relire à voix haute.
import fs from "node:fs/promises";
import path from "node:path";
import { isDesktop } from "@/lib/runtime";
import type { SettingsRow } from "./settings";

const FILE = "JARVIS.md";

/** Dossier du coffre enregistré (vide = désactivé). */
export function vaultOf(s: Pick<SettingsRow, "obsidianVault">): string {
  return s.obsidianVault.trim();
}

async function vaultDir(s: SettingsRow): Promise<string | null> {
  const v = vaultOf(s);
  if (!v || !isDesktop()) return null;
  try {
    const st = await fs.stat(v);
    if (!st.isDirectory()) return null;
    return v;
  } catch {
    return null;
  }
}

/** Ajoute une note horodatée au coffre. Retourne une erreur claire si impossible. */
export async function appendNote(s: SettingsRow, text: string): Promise<{ ok: boolean; error?: string }> {
  const dir = await vaultDir(s);
  if (!dir) return { ok: false, error: "Coffre introuvable" };
  const clean = text.trim().replace(/\s+/g, " ").slice(0, 500);
  if (!clean) return { ok: false, error: "Note vide" };
  const now = new Date();
  const d = now.toLocaleDateString("fr-FR");
  const t = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  try {
    const file = path.join(dir, FILE);
    let head = "";
    try {
      await fs.access(file);
    } catch {
      head = `# Notes de J.A.R.V.I.S.\n\n_Notes dictées par J.A.R.V.I.S. — dites « note dans Obsidian… » pour en ajouter._\n\n`;
    }
    await fs.appendFile(file, `${head}## ${d} — ${t}\n\n- ${clean}\n\n`, "utf8");
    return { ok: true };
  } catch {
    return { ok: false, error: "Écriture impossible (dossier protégé ?)" };
  }
}

/** Dernières notes du coffre (les plus récentes en premier). */
export async function recentNotes(s: SettingsRow, limit = 5): Promise<{ ok: boolean; entries: string[]; error?: string }> {
  const dir = await vaultDir(s);
  if (!dir) return { ok: false, entries: [], error: "Coffre introuvable" };
  try {
    const raw = await fs.readFile(path.join(dir, FILE), "utf8");
    const blocks = raw.split(/^## /m).filter((b) => b.trim());
    const entries = blocks
      .slice(-limit)
      .reverse()
      .map((b) => b.split("\n").filter((l) => l.trim().startsWith("-")).join(" ").replace(/^- /g, "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    return { ok: true, entries };
  } catch {
    return { ok: false, entries: [], error: "Aucune note" };
  }
}
