import { getSettings } from "@/lib/brain/settings";
import { weatherForCity } from "@/lib/brain/weather";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let city = new URL(req.url).searchParams.get("city")?.trim().slice(0, 80);
  if (!city) city = (await getSettings()).city || "Paris";
  try {
    const data = await weatherForCity(city);
    if (!data) return Response.json({ error: `Ville introuvable : ${city}` }, { status: 404 });
    return Response.json({ data });
  } catch {
    return Response.json({ error: "Service météo indisponible" }, { status: 502 });
  }
}
