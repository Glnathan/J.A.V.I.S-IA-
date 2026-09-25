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

    // Édition Premium : sauvegarde quotidienne automatique du dossier de données.
    if (!g.__jarvisDbError) {
      try {
        const { getSettings } = await import("./lib/brain/settings");
        const { hasPremium } = await import("./lib/premium");
        const { createBackup, listBackups } = await import("./lib/backup");
        const DAILY_MS = 24 * 3600 * 1000;
        const autoBackup = async () => {
          try {
            if (!hasPremium(await getSettings())) return;
            const last = listBackups()[0]?.createdAt ?? 0;
            if (Date.now() - last < DAILY_MS) return;
            console.log(`[jarvis] Sauvegarde Premium automatique : ${createBackup().id}`);
          } catch (e) {
            console.error("[jarvis] Sauvegarde automatique :", e);
          }
        };
        const backupTimer = setInterval(() => void autoBackup(), 3600 * 1000);
        backupTimer.unref?.();
        void autoBackup();
      } catch (e) {
        console.error("[jarvis] Planification des sauvegardes :", e);
      }
    }

    // Édition Premium : mise à jour automatique dès qu'une release est publiée (installation silencieuse au démarrage).
    if (!g.__jarvisDbError) {
      try {
        const { getSettings } = await import("./lib/brain/settings");
        const { hasPremium } = await import("./lib/premium");
        const { checkUpdate, downloadAndInstall } = await import("./lib/updates");
        const s = await getSettings();
        if (hasPremium(s)) {
          const upd = await checkUpdate();
          if (upd.downloadUrl) {
            console.log(`[jarvis] Mise à jour Premium ${upd.latest} disponible : installation automatique.`);
            const r = await downloadAndInstall(upd.downloadUrl);
            if (r.ok) console.log("[jarvis] Mise à jour installée dans 15 secondes ; J.A.R.V.I.S. va redémarrer.");
            else console.error("[jarvis] Échec du téléchargement de la mise à jour :", r.error);
          }
        }
      } catch (e) {
        console.error("[jarvis] Vérification de mise à jour Premium :", e);
      }
    }
  }
}
