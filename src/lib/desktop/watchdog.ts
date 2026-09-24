// PC version: stops the local server when no JARVIS window has been open for a while.
import { lastActivity, touchActivity } from "@/lib/runtime";

const g = globalThis as typeof globalThis & { __jarvisWatchdog?: ReturnType<typeof setInterval> };

export function startIdleWatchdog(): void {
  if (g.__jarvisWatchdog) return;
  const minutes = Number(process.env.JARVIS_IDLE_EXIT_MINUTES ?? "5");
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  touchActivity();
  g.__jarvisWatchdog = setInterval(() => {
    if (Date.now() - lastActivity() > minutes * 60000) {
      console.log(`[jarvis] Aucune fenêtre JARVIS active depuis ${minutes} min : arrêt du serveur local.`);
      process.exit(0);
    }
  }, 20000);
}
