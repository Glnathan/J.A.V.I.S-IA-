import { listDownloads } from "@/lib/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(listDownloads(), { headers: { "Cache-Control": "no-store" } });
}
