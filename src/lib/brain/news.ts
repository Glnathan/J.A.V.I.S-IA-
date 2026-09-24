// Headlines from Le Monde RSS feeds (no API key needed).

const FEEDS = {
  une: { label: "Le Monde — À la une", url: "https://www.lemonde.fr/rss/une.xml", name: "" },
  international: { label: "Le Monde — International", url: "https://www.lemonde.fr/international/rss_full.xml", name: " à l'international" },
  politique: { label: "Le Monde — Politique", url: "https://www.lemonde.fr/politique/rss_full.xml", name: " en politique" },
  economie: { label: "Le Monde — Économie", url: "https://www.lemonde.fr/economie/rss_full.xml", name: " en économie" },
  sport: { label: "Le Monde — Sport", url: "https://www.lemonde.fr/sport/rss_full.xml", name: " du sport" },
  tech: { label: "Le Monde — Pixels (tech)", url: "https://www.lemonde.fr/pixels/rss_full.xml", name: " de la tech" },
  culture: { label: "Le Monde — Culture", url: "https://www.lemonde.fr/culture/rss_full.xml", name: " de la culture" },
  sciences: { label: "Le Monde — Sciences", url: "https://www.lemonde.fr/sciences/rss_full.xml", name: " des sciences" },
  planete: { label: "Le Monde — Planète", url: "https://www.lemonde.fr/planete/rss_full.xml", name: " de la planète" },
} as const;

export type NewsTopic = keyof typeof FEEDS;

export function newsTopic(f: string): NewsTopic {
  if (/\b(sport|sports|foot|football|rugby|tennis)\b/.test(f)) return "sport";
  if (/\b(international|monde entier|etranger|mondiale?s?)\b/.test(f)) return "international";
  if (/\b(politique|gouvernement|elections?)\b/.test(f)) return "politique";
  if (/\b(economie|eco|economiques?|bourse|finance)\b/.test(f)) return "economie";
  if (/\b(tech|technologie|technologies|high tech|numerique|informatique|jeux video|ia)\b/.test(f)) return "tech";
  if (/\b(culture|cinema|musique|livres?)\b/.test(f)) return "culture";
  if (/\b(science|sciences|scientifiques?|espace)\b/.test(f)) return "sciences";
  if (/\b(planete|ecologie|climat|environnement)\b/.test(f)) return "planete";
  return "une";
}

export function topicName(t: NewsTopic): string {
  return FEEDS[t].name;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_m: string, n: string) => String.fromCharCode(Number(n)))
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return "";
  return m[1].replace(/^\s*<!\[CDATA\[/, "").replace(/\]\]>\s*$/, "").trim();
}

const cache = new Map<string, { at: number; data: { source: string; items: { title: string; link: string }[] } }>();

export async function fetchNews(topic: NewsTopic): Promise<{ source: string; items: { title: string; link: string }[] } | null> {
  const feed = FEEDS[topic];
  const hit = cache.get(topic);
  if (hit && Date.now() - hit.at < 5 * 60000) return hit.data;
  try {
    const r = await fetch(feed.url, {
      headers: { "User-Agent": "Mozilla/5.0 (JarvisAssistant/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const xml = await r.text();
    const items = Array.from(xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g))
      .slice(0, 10)
      .map((m) => ({ title: decode(tag(m[0], "title")), link: decode(tag(m[0], "link")) }))
      .filter((i) => i.title);
    const data = { source: feed.label, items };
    cache.set(topic, { at: Date.now(), data });
    return data;
  } catch {
    return null;
  }
}
