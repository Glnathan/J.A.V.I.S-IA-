// Satellites en direct : éléments orbitaux TLE de Celestrak (cache 2 h) + propagation SGP4 via satellite.js.
import { eciToGeodetic, gstime, propagate, twoline2satrec } from "satellite.js";

export interface Tle {
  name: string;
  group: string;
  l1: string;
  l2: string;
}

export interface IssPosition {
  name: string;
  lat: number;
  lon: number;
  altKm: number;
  speedKmh: number;
}

// [groupe Celestrak, nombre max de satellites (0 = tous)]
const GROUPS: [string, number][] = [
  ["stations", 0],
  ["gps-ops", 0],
  ["starlink", 70],
];

let cache: { at: number; tles: Tle[] } | null = null;
const TLE_CACHE_MS = 2 * 3600_000;

/** Éléments orbitaux des stations, GPS et d'un échantillon de Starlink (cache 2 h, sans clé API). */
export async function fetchTles(): Promise<Tle[]> {
  if (cache && Date.now() - cache.at < TLE_CACHE_MS) return cache.tles;
  const out: Tle[] = [];
  for (const [group, max] of GROUPS) {
    try {
      const r = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`, {
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) continue;
      const text = (await r.text()).trim();
      const lines = text.split(/\r?\n/);
      for (let i = 0; i + 2 < lines.length + 1; i += 3) {
        const [name, l1, l2] = [lines[i], lines[i + 1], lines[i + 2]];
        if (!name || !l1 || !l2 || !l1.startsWith("1 ") || !l2.startsWith("2 ")) continue;
        out.push({ name: name.trim(), group, l1: l1.trim(), l2: l2.trim() });
        if (max && out.filter((t) => t.group === group).length >= max) break;
      }
    } catch {
      /* groupe indisponible : on continue */
    }
  }
  if (out.length) cache = { at: Date.now(), tles: out };
  return cache?.tles ?? [];
}

/** Positions géographiques de tous les satellites (SGP4 côté serveur — la page /espace les redessine). */
export async function positionsNow(atMs?: number): Promise<{ name: string; group: string; lat: number; lon: number }[]> {
  const tles = await fetchTles();
  const now = atMs ? new Date(atMs) : new Date();
  const gmst = gstime(now);
  const out: { name: string; group: string; lat: number; lon: number }[] = [];
  for (const t of tles) {
    try {
      const rec = twoline2satrec(t.l1, t.l2);
      const pv = propagate(rec, now);
      if (!pv || typeof pv.position === "boolean" || !pv.position) continue;
      const geo = eciToGeodetic(pv.position, gmst);
      out.push({ name: t.name, group: t.group, lat: (geo.latitude * 180) / Math.PI, lon: (geo.longitude * 180) / Math.PI });
    } catch {
      /* élément invalide : on l'ignore */
    }
  }
  return out;
}

/** Position de la Station spatiale internationale en ce instant (latitude/longitude en degrés). */
export async function issNow(): Promise<IssPosition | null> {
  const tles = await fetchTles();
  const iss = tles.find((t) => /ISS \(ZARYA\)|ISS \(ZARYA\)|CSS \(TIANHE\)/i.test(t.name) && t.name.includes("ISS"));
  const rec = iss ? twoline2satrec(iss.l1, iss.l2) : null;
  if (!rec) return null;
  const now = new Date();
  const pv = propagate(rec, now);
  if (!pv || typeof pv.position === "boolean" || !pv.position) return null;
  const gmst = gstime(now);
  const geo = eciToGeodetic(pv.position, gmst);
  const speed = pv.velocity && typeof pv.velocity !== "boolean" ? Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z) : 0;
  return {
    name: iss?.name ?? "ISS",
    lat: (geo.latitude * 180) / Math.PI,
    lon: (geo.longitude * 180) / Math.PI,
    altKm: geo.height,
    speedKmh: speed * 3600,
  };
}
