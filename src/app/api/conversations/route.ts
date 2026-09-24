import { desc } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select({ id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt })
    .from(conversations)
    .orderBy(desc(conversations.updatedAt))
    .limit(60);
  return Response.json(rows);
}

export async function DELETE() {
  await db.delete(conversations);
  return Response.json({ ok: true });
}
