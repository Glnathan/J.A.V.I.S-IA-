// Runs once when the server starts (before any request is handled).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as typeof globalThis & { __jarvisDbError?: string };

  if (process.env.JARVIS_DB === "pglite") {
    // PC version: embedded database (PGlite) + migrations.
    try {
      const { initEmbeddedDatabase } = await import("./lib/desktop/embedded-db");
      await initEmbeddedDatabase();
    } catch (e) {
      console.error("[jarvis] Échec de l'initialisation de la base embarquée :", e);
      g.__jarvisDbError = e instanceof Error ? e.message : String(e);
    }
  } else if (process.env.DATABASE_URL && process.env.JARVIS_DESKTOP_BUILD !== "1") {
    // Web version: PostgreSQL server — create / update the tables automatically.
    try {
      const { ensurePostgresSchema } = await import("./lib/db-migrate");
      await ensurePostgresSchema();
    } catch (e) {
      console.error("[jarvis] Création automatique des tables PostgreSQL impossible :", e);
    }
  }

  if (process.env.JARVIS_DESKTOP === "1") {
    if (!g.__jarvisDbError) {
      try {
        const { applyInstallerProfile, writeDesktopFiles } = await import("./lib/desktop/profile");
        const { getSettings, updateSettings } = await import("./lib/brain/settings");
        await applyInstallerProfile(updateSettings);
        writeDesktopFiles(await getSettings());
      } catch (e) {
        console.error("[jarvis] Profil de l'installation :", e);
      }
    }
    const { startIdleWatchdog } = await import("./lib/desktop/watchdog");
    startIdleWatchdog();
  }
}
