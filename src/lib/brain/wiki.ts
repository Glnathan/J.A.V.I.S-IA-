const HEADERS = {
  "User-Agent": "JarvisAssistant/1.0 (assistant personnel; https://localhost)",
  "Api-User-Agent": "JarvisAssistant/1.0",
};

export interface WikiSummary {
  title: string;
  extract: string;
  url: string;
  thumbnail?: string;
}

export async function wikiSummary(query: string, lang = "fr"): Promise<WikiSummary | null> {
  const q = query.trim();
  if (!q) return null;
  const url =
    `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search` +
    `&gsrsearch=${encodeURIComponent(q)}&gsrlimit=1&prop=extracts%7Cpageimages%7Cinfo&exintro=1&explaintext=1` +
    `&exsentences=4&inprop=url&pithumbsize=320&redirects=1`;
  try {
    const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      query?: { pages?: { title: string; extract?: string; fullurl?: string; thumbnail?: { source: string } }[] };
    };
    const p = j.query?.pages?.[0];
    if (!p || !p.extract || !p.extract.trim()) return null;
    return {
      title: p.title,
      extract: p.extract.trim(),
      url: p.fullurl ?? `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
      thumbnail: p.thumbnail?.source,
    };
  } catch {
    return null;
  }
}
