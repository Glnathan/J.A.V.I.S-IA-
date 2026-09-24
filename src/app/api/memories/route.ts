import { desc } from "drizzle-orm";
import { db } from "@/db";
import { memories } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(memories).orderBy(desc(memories.createdAt)).limit(200);
  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { content?: unknown };
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 500) : "";
  if (!content) return Response.json({ error: "Contenu requis" }, { status: 400 });
  const [row] = await db.insert(memories).values({ content }).returning();
  return Response.json(row, { status: 201 });
}

export async function DELETE() {
  await db.delete(memories);
  return Response.json({ ok: true });
}
