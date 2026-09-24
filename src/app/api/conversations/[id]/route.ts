import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Identifiant invalide" }, { status: 400 });
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conv) return Response.json({ error: "Conversation introuvable" }, { status: 404 });
  const rows = await db.select().from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.id));
  return Response.json({ conversation: conv, messages: rows });
}

export async function DELETE(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Identifiant invalide" }, { status: 400 });
  await db.delete(conversations).where(eq(conversations.id, id));
  return Response.json({ ok: true });
}
