// Coffre Obsidian (Premium, version PC) : ajout et lecture des notes Markdown.
import { getSettings } from "@/lib/brain/settings";
import { appendNote, recentNotes } from "@/lib/brain/obsidian";
import { hasPremium } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSettings();
  if (!hasPremium(s)) return Response.json({ error: "Le coffre Obsidian est réservé à l'édition Premium." }, { status: 403 });
  const r = await recentNotes(s);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}

export async function POST(req: Request) {
  const s = await getSettings();
  if (!hasPremium(s)) return Response.json({ error: "Le coffre Obsidian est réservé à l'édition Premium." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { note?: unknown };
  const note = typeof body.note === "string" ? body.note : "";
  if (!note.trim()) return Response.json({ error: "Note vide." }, { status: 400 });
  const r = await appendNote(s, note);
  return Response.json(r, { status: r.ok ? 200 : 400 });
}
