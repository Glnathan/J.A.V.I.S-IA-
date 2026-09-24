import { fetchTles, issNow, positionsNow, catalogueInfo } from "@/lib/satellites";

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
    const at=Number.isFinite(t)&&t>0?t:Date.now();
    if(Math.abs(at-Date.now())>366*86400000)return Response.json({error:'Date limitée à un an autour de maintenant.'},{status:400});
    const positions=await positionsNow(at);
    return Response.json({positions,at:new Date(at).toISOString(),catalogue:catalogueInfo()});
  }
  if (action === "iss") {
    const iss = await issNow();
    if (!iss) return Response.json({ error: "Position ISS indisponible (données TLE ou Internet)." }, { status: 503 });
    return Response.json(iss);
  }
  return Response.json({ error: "Action inconnue" }, { status: 400 });
}
