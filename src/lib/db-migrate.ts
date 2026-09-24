// Web version: creates / updates the PostgreSQL tables automatically when the server starts,
// so a brand-new database works without running `drizzle-kit push` by hand.
import path from "node:path";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb } from "@/db";
import { resourcesDir } from "@/lib/runtime";

export async function ensurePostgresSchema(): Promise<void> {
  const database = getDb();
  const res = await database.execute(
    sql`select to_regclass('public.settings')::text as settings, to_regclass('drizzle.__drizzle_migrations')::text as journal`,
  );
  const row = res.rows[0] as { settings: string | null; journal: string | null } | undefined;
  if (row?.settings && !row.journal) {
    // Tables created earlier with `drizzle-kit push`: keep managing them that way.
    console.log("[jarvis] Tables PostgreSQL déjà présentes (drizzle-kit push) : migrations automatiques ignorées.");
    return;
  }
  const started = Date.now();
  await migrate(database, { migrationsFolder: path.join(resourcesDir(), "drizzle") });
  console.log(`[jarvis] Schéma PostgreSQL à jour (${Date.now() - started} ms).`);
}
