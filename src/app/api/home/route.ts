import { callService, haConfig, haErrorMessage, listEntities, serviceFor, testConnection, type HomeCommand } from "@/lib/brain/home-assistant";
import { favoritesOf, getSettings, updateSettings } from "@/lib/brain/settings";
import { isDesktop } from "@/lib/runtime";
import type { HomePayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMMANDS = new Set<string>(["on", "off", "toggle", "open", "close", "stop", "activate", "set_temp", "brightness"]);

export async function GET() {
  const s = await getSettings();
  const cfg = haConfig(s);
  const base = { enabled: s.haEnabled, desktop: isDesktop(), allowSensitive: Boolean(cfg?.allowSensitive) };
  if (!cfg) return Response.json({ ...base, configured: false, entities: [] } satisfies HomePayload);
  try {
    const entities = await listEntities(cfg, favoritesOf(s), 2000);
    return Response.json({ ...base, configured: true, entities } satisfies HomePayload);
  } catch (e) {
    return Response.json({ ...base, configured: true, entities: [], error: haErrorMessage(e) } satisfies HomePayload);
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; entityId?: unknown; command?: unknown; value?: unknown; favorite?: unknown };
  const s = await getSettings();

  if (body.action === "favorite") {
    if (typeof body.entityId !== "string") return Response.json({ error: "Appareil manquant" }, { status: 400 });
    const fav = new Set(favoritesOf(s));
    if (body.favorite === false) fav.delete(body.entityId);
    else fav.add(body.entityId);
    await updateSettings({ haFavorites: JSON.stringify([...fav].slice(0, 100)) });
    return Response.json({ ok: true });
  }

  const cfg = haConfig(s);
  if (body.action === "test") {
    if (!cfg) return Response.json({ ok: false, message: "Activez l'intégration, renseignez l'adresse et le jeton d'accès, puis enregistrez." });
    return Response.json(await testConnection(cfg));
  }

  if (body.action === "service") {
    if (!cfg) return Response.json({ error: "Home Assistant n'est pas configuré." }, { status: 400 });
    const command = typeof body.command === "string" && COMMANDS.has(body.command) ? (body.command as HomeCommand) : null;
    if (typeof body.entityId !== "string" || !command) return Response.json({ error: "Commande invalide" }, { status: 400 });
    try {
      const entities = await listEntities(cfg, [], 3000);
      const entity = entities.find((x) => x.id === body.entityId);
      if (!entity) return Response.json({ error: "Appareil introuvable" }, { status: 404 });
      const value = typeof body.value === "number" && Number.isFinite(body.value) ? body.value : undefined;
      const call = serviceFor(entity, command, value, cfg.allowSensitive);
      if (call === "blocked") {
        return Response.json(
          { error: isDesktop() ? "Action bloquée par sécurité : autorisez-la dans Paramètres → Maison." : "Action réservée à la version PC de JARVIS." },
          { status: 403 },
        );
      }
      if (!call) return Response.json({ error: "Action non disponible pour cet appareil." }, { status: 400 });
      await callService(cfg, call);
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json({ error: haErrorMessage(e) }, { status: 502 });
    }
  }

  return Response.json({ error: "Action inconnue" }, { status: 400 });
}
