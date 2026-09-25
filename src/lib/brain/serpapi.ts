// Recherche Google lue par l'IA (SerpAPI) : la clé reste sur le PC, les
// résultats sont résumés à voix haute au lieu d'un simple onglet.
import type { SettingsRow } from "./settings";

export interface SerpResult {
  title: string;
  snippet: string;
  link: string;
}

export interface SerpAnswer {
  /** Réponse directe extraite par Google (answer box), si présente. */
  answer: string | null;
  results: SerpResult[];
}

/** Clé SerpAPI enregistrée dans les réglages (vide = désactivé). */
export function serpKeyOf(s: Pick<SettingsRow, "serpApiKey">): string {
  return s.serpApiKey.trim();
}

/** Recherche Google via SerpAPI. null = erreur réseau ou clé invalide. */
export async function googleSearch(q: string, key: string): Promise<SerpAnswer | null> {
  if (!key) return null;
  try {
    const r = await fetch(
      `https://serpapi.com/search.json?engine=google&hl=fr&gl=fr&num=6&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as {
      answer_box?: { answer?: string; snippet?: string; result?: string };
      organic_results?: { title?: string; snippet?: string; link?: string }[];
    };
    const ab = j.answer_box;
    const answer = (ab && typeof (ab.answer ?? ab.snippet ?? ab.result) === "string" ? String(ab.answer ?? ab.snippet ?? ab.result) : null)?.trim() ?? null;
    const results = (j.organic_results ?? [])
      .filter((o) => o.title && o.link)
      .slice(0, 5)
      .map((o) => ({ title: String(o.title), snippet: String(o.snippet ?? "").trim(), link: String(o.link) }));
    return { answer, results };
  } catch {
    return null;
  }
}
