import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type Database = NodePgDatabase;

const g = globalThis as typeof globalThis & {
  __jarvisDb?: Database;
  __arenaNextJsPostgresqlPool?: Pool;
};

/**
 * Registers the active database. The PC version calls this at startup with its embedded
 * PGlite database (see src/lib/desktop/embedded-db.ts, run from src/instrumentation.ts).
 */
export function setDatabase(instance: Database): void {
  g.__jarvisDb = instance;
}

/** Real Drizzle instance (PostgreSQL or PGlite), e.g. for the migrator. */
export function getDb(): Database {
  if (g.__jarvisDb) return g.__jarvisDb;
  const embeddedError = (globalThis as { __jarvisDbError?: string }).__jarvisDbError;
  if (embeddedError) throw new Error(`Base de données embarquée indisponible : ${embeddedError}`);
  if (process.env.JARVIS_DB === "pglite") {
    throw new Error("La base de données embarquée de JARVIS est en cours d'initialisation. Réessayez dans un instant.");
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const pool = g.__arenaNextJsPostgresqlPool ?? new Pool({ connectionString: databaseUrl });
  g.__arenaNextJsPostgresqlPool = pool;
  const instance = drizzle(pool);
  g.__jarvisDb = instance;
  return instance;
}

/**
 * Lazily-initialised Drizzle client:
 * - web version: PostgreSQL server (DATABASE_URL);
 * - PC version: embedded PGlite database (JARVIS_DB=pglite), no server to install.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
});
