// Positions planétaires en temps réel (éphémérides képlériennes simplifiées, méthode de Paul Schlyter).
// Purement mathématique : aucune requête, utilisable côté serveur (voix) et navigateur (page /espace).

export interface PlanetInfo {
  id: string;
  name: string;
  color: string;
  /** Demi-grand axe (UA) — pour dessiner l'orbite. */
  a: number;
  size: number;
}

export const PLANETS: PlanetInfo[] = [
  { id: "mercure", name: "Mercure", color: "#c9c2b8", a: 0.387098, size: 3 },
  { id: "venus", name: "Vénus", color: "#e8c46b", a: 0.723330, size: 4.5 },
  { id: "terre", name: "Terre", color: "#4da6ff", a: 1.0, size: 4.5 },
  { id: "mars", name: "Mars", color: "#ff7a59", a: 1.523688, size: 3.5 },
  { id: "jupiter", name: "Jupiter", color: "#e0b080", a: 5.20256, size: 8 },
  { id: "saturne", name: "Saturne", color: "#e8d9a0", a: 9.55475, size: 7 },
  { id: "uranus", name: "Uranus", color: "#9fe3e0", a: 19.18171, size: 5.5 },
  { id: "neptune", name: "Neptune", color: "#6a8cff", a: 30.05826, size: 5.5 },
];

interface Elements {
  N: [number, number];
  i: [number, number];
  w: [number, number];
  a: number;
  e: [number, number];
  M: [number, number];
}

const D2R = Math.PI / 180;
const AU_KM = 149_597_870;

const ELEMENTS: Record<string, Elements> = {
  mercure: { N: [48.3313, 3.24587e-5], i: [7.0047, 5.0e-8], w: [29.1241, 1.01444e-5], a: 0.387098, e: [0.205635, 5.59e-10], M: [168.6562, 4.0923344368] },
  venus: { N: [76.6799, 2.4659e-5], i: [3.3946, 2.75e-8], w: [54.891, 1.38374e-5], a: 0.72333, e: [0.006773, -1.302e-9], M: [48.0052, 1.6021302244] },
  terre: { N: [0, 0], i: [0, 0], w: [282.9404, 1.7192e-5], a: 1.0, e: [0.016709, -1.151e-9], M: [356.047, 0.9856002585] },
  mars: { N: [49.5574, 2.31698e-5], i: [1.8497, -1.78e-8], w: [286.5016, 2.92961e-5], a: 1.523688, e: [0.093405, 2.516e-9], M: [18.6021, 0.5240207766] },
  jupiter: { N: [100.4542, 2.76854e-5], i: [1.303, -1.087e-7], w: [273.8777, 1.64505e-5], a: 5.20256, e: [0.048498, 4.469e-9], M: [19.895, 0.0830853001] },
  saturne: { N: [113.6634, 2.3898e-5], i: [2.4886, -1.081e-7], w: [339.3939, 2.97661e-5], a: 9.55475, e: [0.055546, -9.499e-9], M: [316.967, 0.0334442282] },
  uranus: { N: [74.0005, 1.3978e-5], i: [0.7733, 1.9e-8], w: [96.6612, 3.0565e-5], a: 19.18171, e: [0.047318, 7.45e-9], M: [142.5905, 0.011725806] },
  neptune: { N: [131.7806, 3.0173e-5], i: [1.77, -2.55e-7], w: [272.8461, -6.027e-6], a: 30.05826, e: [0.008606, 2.15e-9], M: [260.2471, 0.005995147] },
};

export interface PlanetPosition {
  id: string;
  name: string;
  color: string;
  size: number;
  a: number;
  /** Position héliocentrique écliptique (UA). */
  x: number;
  y: number;
  z: number;
  /** Distance au Soleil (UA). */
  au: number;
}

/** Position héliocentrique d'une planète (repère écliptique J2000), date en ms epoch. */
export function planetPosition(id: string, dateMs: number): PlanetPosition | null {
  const el = ELEMENTS[id];
  const meta = PLANETS.find((p) => p.id === id);
  if (!el || !meta) return null;
  const d = dateMs / 86_400_000 - 1.5; // jours depuis J2000 (2000 jan 0.0)
  const N = (el.N[0] + el.N[1] * d) * D2R;
  const i = (el.i[0] + el.i[1] * d) * D2R;
  const w = (el.w[0] + el.w[1] * d) * D2R;
  const a = el.a;
  const e = el.e[0] + el.e[1] * d;
  let M = (el.M[0] + el.M[1] * d) % 360;
  if (M > 180) M -= 360;
  if (M < -180) M += 360;
  M *= D2R;
  // Équation de Kepler (itération de Newton).
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xv = a * (Math.cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv);
  const r = Math.hypot(xv, yv);
  const vw = v + w;
  return {
    id,
    name: meta.name,
    color: meta.color,
    size: meta.size,
    a,
    x: r * (Math.cos(N) * Math.cos(vw) - Math.sin(N) * Math.sin(vw) * Math.cos(i)),
    y: r * (Math.sin(N) * Math.cos(vw) + Math.cos(N) * Math.sin(vw) * Math.cos(i)),
    z: r * Math.sin(vw) * Math.sin(i),
    au: r,
  };
}

/** Toutes les planètes à une date donnée. */
export function solarSystem(dateMs: number): PlanetPosition[] {
  return PLANETS.map((p) => planetPosition(p.id, dateMs)).filter((p): p is PlanetPosition => p !== null);
}

/** Distance entre deux planètes (en km) — « distance Terre-Mars » à la voix. */
export function planetDistance(idA: string, idB: string, dateMs: number): number | null {
  const a = planetPosition(idA, dateMs);
  const b = planetPosition(idB, dateMs);
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * AU_KM;
}
