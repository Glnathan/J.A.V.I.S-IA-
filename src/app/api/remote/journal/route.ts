import { getSettings } from "@/lib/brain/settings";
import { hasPremium } from "@/lib/premium";
import { readJournal } from "@/lib/access-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Journal des connexions distantes — consultation réservée à l'édition Premium. */
export async function GET() {
  const s = await getSettings();
  if (!hasPremium(s))
    return Response.json({ error: "Le journal des connexions est réservé à l'édition Premium.", premium: false }, { status: 403 });
  return Response.json({ premium: true, entries: readJournal().slice(0, 20) });
}
