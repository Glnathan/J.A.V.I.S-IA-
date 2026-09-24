import { db } from "@/db";
import { sql } from "drizzle-orm";
import { isDesktop, touchActivity, touchRemote } from "@/lib/runtime";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (new URL(req.url).searchParams.has("hb")) {
    touchActivity();
    if (req.headers.get("x-jarvis-remote") === "auth") touchRemote();
  }
  try {
    await db.execute(sql`select 1`);
    const warning = (globalThis as { __jarvisDbWarning?: string }).__jarvisDbWarning;
    return Response.json({ ok: true, app: "jarvis", version: process.env.JARVIS_VERSION || APP_VERSION, desktop: isDesktop(), ...(warning ? { warning } : {}) });
  } catch (e) {
    return Response.json({ ok: false, app: "jarvis", error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
