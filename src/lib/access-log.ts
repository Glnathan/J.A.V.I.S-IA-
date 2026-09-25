// Journal des connexions distantes (édition Premium) : tentatives de connexion
// au JARVIS depuis un téléphone ou un autre ordinateur, réussies ou refusées.
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/runtime";

const MAX = 50;

export interface AccessEntry {
  at: number;
  ok: boolean;
  ip: string;
  /** Brève description de l'appareil (User-Agent tronqué). */
  device: string;
}

function journalPath(): string {
  return path.join(dataDir(), "acces-distant-journal.json");
}

/** Enregistre une tentative de connexion (succès ou échec), en gardant les MAX dernières. */
export function logAccess(entry: Omit<AccessEntry, "at">): void {
  try {
    const list = readJournal();
    list.unshift({ at: Date.now(), ...entry });
    fs.writeFileSync(journalPath(), JSON.stringify(list.slice(0, MAX), null, 2), "utf8");
  } catch {
    /* le journal ne doit jamais bloquer une connexion */
  }
}

export function readJournal(): AccessEntry[] {
  try {
    const raw = JSON.parse(fs.readFileSync(journalPath(), "utf8")) as AccessEntry[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}
