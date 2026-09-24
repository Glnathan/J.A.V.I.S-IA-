import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db
    .select()
    .from(tasks)
    .orderBy(asc(tasks.done), sql`${tasks.dueAt} asc nulls last`, asc(tasks.createdAt))
    .limit(200);
  return Response.json(rows);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { title?: unknown; dueAt?: unknown };
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
  if (!title) return Response.json({ error: "Titre requis" }, { status: 400 });
  let dueAt: Date | null = null;
  if (typeof body.dueAt === "string" && body.dueAt) {
    const d = new Date(body.dueAt);
    if (!Number.isNaN(d.getTime())) dueAt = d;
  }
  const [row] = await db.insert(tasks).values({ title, dueAt }).returning();
  return Response.json(row, { status: 201 });
}

export async function DELETE(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope");
  if (scope === "all") await db.delete(tasks);
  else await db.delete(tasks).where(eq(tasks.done, true));
  return Response.json({ ok: true });
}
