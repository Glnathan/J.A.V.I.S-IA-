import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memories } from "@/db/schema";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Identifiant invalide" }, { status: 400 });
  await db.delete(memories).where(eq(memories.id, id));
  return Response.json({ ok: true });
}
