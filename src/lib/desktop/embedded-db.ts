// Embedded PostgreSQL (PGlite) for the PC version: no database server to install.
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { setDatabase, type Database } from "@/db";
import { dataDir, resourcesDir } from "@/lib/runtime";

const g = globalThis as typeof globalThis & { __jarvisDbWarning?: string };

async function open(target: string) {
  const client = await PGlite.create(target);
  const instance = drizzle(client);
  await migrate(instance, { migrationsFolder: path.join(resourcesDir(), "drizzle") });
  return instance;
}

export async function initEmbeddedDatabase(): Promise<void> {
  const dir = path.join(dataDir(), "db");
  fs.mkdirSync(dir, { recursive: true });
  const started = Date.now();
  try {
    const instance = await open(dir);
    setDatabase(instance as unknown as Database);
    console.log(`[jarvis] Base de données embarquée prête en ${Date.now() - started} ms : ${dir}`);
  } catch (e) {
    // Safety net: keep JARVIS usable even if the data folder cannot be used (data kept in memory only).
    console.error(`[jarvis] Impossible d'ouvrir la base dans ${dir}, passage en mémoire volatile :`, e);
    const instance = await open("memory://");
    setDatabase(instance as unknown as Database);
    g.__jarvisDbWarning = `Base de données en mémoire volatile (dossier ${dir} inaccessible) : les données seront perdues à la fermeture.`;
  }
}
