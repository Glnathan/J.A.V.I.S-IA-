import { openPath, pcControlAvailable } from "@/lib/brain/pc";
import { createPlugin, listPlugins, reloadPlugins } from "@/lib/brain/plugins";
import { getSettings } from "@/lib/brain/settings";
import { pluginsDir } from "@/lib/runtime";
import type { PluginsPayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function payload(force = false, extra: Partial<PluginsPayload> = {}): Promise<PluginsPayload> {
  const s = await getSettings();
  const canOpen = pcControlAvailable();
  try {
    const data = force ? await reloadPlugins() : await listPlugins();
    return { enabled: s.pluginsEnabled, canOpen, ...data, ...extra };
  } catch (e) {
    return {
      enabled: s.pluginsEnabled,
      canOpen,
      dir: pluginsDir(),
      python: { found: false },
      plugins: [],
      error: e instanceof Error ? e.message : String(e),
      ...extra,
    };
  }
}

export async function GET() {
  return Response.json(await payload());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; name?: unknown };
  if (body.action === "reload") return Response.json(await payload(true));
  if (body.action === "create") {
    try {
      const file = createPlugin(typeof body.name === "string" ? body.name : "");
      return Response.json(await payload(false, { created: file }));
    } catch (e) {
      return Response.json(await payload(false, { error: e instanceof Error ? e.message : String(e) }));
    }
  }
  if (body.action === "open") {
    if (!pcControlAvailable()) {
      return Response.json({ ok: false, error: "L'ouverture du dossier n'est possible que dans la version PC de JARVIS." }, { status: 400 });
    }
    return Response.json(await openPath(pluginsDir()));
  }
  return Response.json({ error: "Action inconnue" }, { status: 400 });
}
