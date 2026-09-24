import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Identifiant invalide" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { done?: unknown; title?: unknown; notified?: unknown; dueAt?: unknown };
  const patch: Partial<typeof tasks.$inferInsert> = {};
  if (typeof body.done === "boolean") patch.done = body.done;
  if (typeof body.notified === "boolean") patch.notified = body.notified;
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 300);
  if (body.dueAt === null) {
    patch.dueAt = null;
    patch.notified = false;
  } else if (typeof body.dueAt === "string") {
    const d = new Date(body.dueAt);
    if (!Number.isNaN(d.getTime())) {
      patch.dueAt = d;
      patch.notified = false;
    }
  }
  if (!Object.keys(patch).length) return Response.json({ error: "Rien à modifier" }, { status: 400 });
  const [row] = await db.update(tasks).set(patch).where(eq(tasks.id, id)).returning();
  if (!row) return Response.json({ error: "Tâche introuvable" }, { status: 404 });
  return Response.json(row);
}

export async function DELETE(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Identifiant invalide" }, { status: 400 });
  await db.delete(tasks).where(eq(tasks.id, id));
  return Response.json({ ok: true });
}
