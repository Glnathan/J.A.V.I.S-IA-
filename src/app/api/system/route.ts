import { getServerStats } from "@/lib/brain/system";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getServerStats(), { headers: { "Cache-Control": "no-store" } });
}
