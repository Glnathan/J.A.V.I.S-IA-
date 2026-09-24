import { fetchTles, issNow, positionsNow } from "@/lib/satellites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "tles";

  if (action === "tles") {
    const tles = await fetchTles();
    return Response.json({ tles, count: tles.length, at: new Date().toISOString() });
  }
  if (action === "positions") {
    const t = Number(url.searchParams.get("t"));
    const positions = await positionsNow(Number.isFinite(t) && t > 0 ? t : undefined);
    return Response.json({ positions, at: new Date().toISOString() });
  }
  if (action === "iss") {
    const iss = await issNow();
    if (!iss) return Response.json({ error: "Position ISS indisponible (données TLE ou Internet)." }, { status: 503 });
    return Response.json(iss);
  }
  return Response.json({ error: "Action inconnue" }, { status: 400 });
}
