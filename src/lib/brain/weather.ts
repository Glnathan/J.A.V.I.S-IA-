import type { WeatherData } from "@/lib/types";

const WMO: Record<number, [string, string, string?]> = {
  0: ["ciel dégagé", "☀️", "🌙"],
  1: ["ciel plutôt dégagé", "🌤️", "🌙"],
  2: ["partiellement nuageux", "⛅", "☁️"],
  3: ["ciel couvert", "☁️"],
  45: ["brouillard", "🌫️"],
  48: ["brouillard givrant", "🌫️"],
  51: ["bruine légère", "🌦️"],
  53: ["bruine", "🌦️"],
  55: ["bruine dense", "🌧️"],
  56: ["bruine verglaçante", "🌧️"],
  57: ["bruine verglaçante dense", "🌧️"],
  61: ["pluie faible", "🌦️"],
  63: ["pluie", "🌧️"],
  65: ["forte pluie", "🌧️"],
  66: ["pluie verglaçante", "🌧️"],
  67: ["forte pluie verglaçante", "🌧️"],
  71: ["neige faible", "🌨️"],
  73: ["neige", "🌨️"],
  75: ["forte neige", "❄️"],
  77: ["grains de neige", "🌨️"],
  80: ["averses légères", "🌦️"],
  81: ["averses", "🌧️"],
  82: ["violentes averses", "⛈️"],
  85: ["averses de neige", "🌨️"],
  86: ["fortes averses de neige", "❄️"],
  95: ["orage", "⛈️"],
  96: ["orage avec grêle", "⛈️"],
  99: ["violent orage avec grêle", "⛈️"],
};

export function describeCode(code: number, isDay = true): { desc: string; icon: string } {
  const w = WMO[code] ?? ["conditions inconnues", "🌡️"];
  return { desc: w[0], icon: !isDay && w[2] ? w[2] : w[1] };
}

const cache = new Map<string, { at: number; data: unknown }>();

async function cached<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  const data = await fn();
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 300) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
  return data;
}

interface GeoResult {
  name: string;
  country?: string;
  lat: number;
  lon: number;
}

export async function geocode(name: string): Promise<GeoResult | null> {
  return cached(`geo:${name.toLowerCase()}`, 86400000, async () => {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=fr&format=json`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`geocoding ${r.status}`);
    const j = (await r.json()) as {
      results?: { name: string; country?: string; latitude: number; longitude: number }[];
    };
    const g = j.results?.[0];
    return g ? { name: g.name, country: g.country, lat: g.latitude, lon: g.longitude } : null;
  });
}

interface ForecastResponse {
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    is_day: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max?: (number | null)[];
  };
}

export async function forecast(lat: number, lon: number): Promise<Omit<WeatherData, "city" | "country">> {
  return cached(`fc:${lat.toFixed(2)},${lon.toFixed(2)}`, 10 * 60000, async () => {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`forecast ${r.status}`);
    const j = (await r.json()) as ForecastResponse;
    const isDay = j.current.is_day === 1;
    const cur = describeCode(j.current.weather_code, isDay);
    return {
      current: {
        temp: j.current.temperature_2m,
        feels: j.current.apparent_temperature,
        humidity: j.current.relative_humidity_2m,
        wind: j.current.wind_speed_10m,
        code: j.current.weather_code,
        isDay,
        desc: cur.desc,
        icon: cur.icon,
      },
      daily: j.daily.time.map((date, i) => {
        const d = describeCode(j.daily.weather_code[i]);
        const rain = j.daily.precipitation_probability_max?.[i];
        return {
          date,
          min: j.daily.temperature_2m_min[i],
          max: j.daily.temperature_2m_max[i],
          code: j.daily.weather_code[i],
          desc: d.desc,
          icon: d.icon,
          rain: typeof rain === "number" ? rain : null,
        };
      }),
    };
  });
}

export async function weatherForCity(name: string): Promise<WeatherData | null> {
  const g = await geocode(name);
  if (!g) return null;
  const f = await forecast(g.lat, g.lon);
  return { city: g.name, country: g.country, ...f };
}
