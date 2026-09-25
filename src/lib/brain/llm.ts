// Multi-provider LLM connector with streaming (OpenAI-compatible APIs + native Anthropic).
import { getProvider, PROVIDERS, type ProviderId } from "@/lib/providers";
import { aiKeysOf, type SettingsRow } from "./settings";

export interface ResolvedAI {
  provider: ProviderId;
  label: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  origin: "settings" | "env";
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const AUTO_ORDER: ProviderId[] = ["openai", "anthropic", "groq", "gemini", "mistral", "openrouter", "deepseek", "xai"];

function envKey(keys: string[]): string {
  for (const k of keys) {
    const v = process.env[k];
    if (v && v.trim()) return v.trim();
  }
  return "";
}

export function detectEnvProviders(): ProviderId[] {
  const found: ProviderId[] = PROVIDERS.filter((p) => p.envKeys.length > 0 && envKey(p.envKeys)).map((p) => p.id);
  if (process.env.OLLAMA_URL || process.env.OLLAMA_HOST) found.push("ollama");
  return found;
}

function normalizeBase(id: ProviderId, url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//i.test(u)) u = `http://${u}`;
  if (id === "ollama" && u && !/\/v1$/.test(u)) u += "/v1";
  return u;
}

export function resolveAI(s: SettingsRow): ResolvedAI | null {
  const pref = s.aiProvider || "auto";
  if (pref === "local") return null;

  if (pref !== "auto") {
    const p = getProvider(pref);
    if (!p) return null;
    const model = s.aiModel.trim() || p.defaultModel;
    if (!p.needsKey) {
      const fromEnv = p.id === "ollama" ? process.env.OLLAMA_URL || process.env.OLLAMA_HOST || "" : "";
      const base = normalizeBase(p.id, s.aiBaseUrl.trim() || fromEnv || p.baseUrl);
      return { provider: p.id, label: p.label, model, apiKey: s.aiApiKey.trim() || p.id, baseUrl: base, origin: "settings" };
    }
    const own = s.aiApiKey.trim() || aiKeysOf(s)[p.id] || "";
    const key = own || envKey(p.envKeys);
    if (!key) return null;
    return { provider: p.id, label: p.label, model, apiKey: key, baseUrl: p.baseUrl, origin: own ? "settings" : "env" };
  }

  for (const id of AUTO_ORDER) {
    const p = getProvider(id);
    if (!p) continue;
    const fromSettings = aiKeysOf(s)[id] || "";
    const key = fromSettings || envKey(p.envKeys);
    if (key) {
      return {
        provider: p.id,
        label: p.label,
        model: process.env.JARVIS_MODEL?.trim() || p.defaultModel,
        apiKey: key,
        baseUrl: p.baseUrl,
        origin: fromSettings ? "settings" : "env",
      };
    }
  }
  const ollama = process.env.OLLAMA_URL || process.env.OLLAMA_HOST;
  if (ollama) {
    const p = getProvider("ollama");
    if (p) {
      return {
        provider: "ollama",
        label: p.label,
        model: process.env.JARVIS_MODEL?.trim() || p.defaultModel,
        apiKey: "ollama",
        baseUrl: normalizeBase("ollama", ollama),
        origin: "env",
      };
    }
  }
  return null;
}

/**
 * Chaîne de secours : l'IA choisie d'abord, puis toutes les autres IA dont une clé
 * est disponible (modèle par défaut de chacune). Si une panne survient (503, réseau…),
 * la conversation bascule sur la suivante.
 */
export function aiChain(s: SettingsRow): ResolvedAI[] {
  const primary = resolveAI(s);
  if (!primary) return [];
  const chain: ResolvedAI[] = [primary];
  const seen = new Set<string>([primary.provider]);
  for (const p of PROVIDERS) {
    if (seen.has(p.id) || !p.needsKey) continue;
    const key = aiKeysOf(s)[p.id] || envKey(p.envKeys);
    if (!key) continue;
    chain.push({ provider: p.id, label: p.label, model: p.defaultModel, apiKey: key, baseUrl: p.baseUrl, origin: "settings" });
    seen.add(p.id);
  }
  return chain;
}

/** Merge consecutive same-role turns and make sure the conversation starts with the user. */
export function normalizeHistory(h: ChatTurn[]): ChatTurn[] {
  const out: ChatTurn[] = [];
  for (const m of h) {
    const content = m.content.trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${content}`;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

async function errorText(res: Response): Promise<string> {
  let t = "";
  try {
    t = await res.text();
    const j = JSON.parse(t) as { error?: { message?: string } | string; message?: string };
    const e = typeof j.error === "string" ? j.error : j.error?.message;
    t = e || j.message || t;
  } catch {
    /* keep raw text */
  }
  return `HTTP ${res.status}${t ? ` — ${String(t).slice(0, 220)}` : ""}`;
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (line.startsWith("data:")) yield line.slice(5).trim();
      }
    }
    const rest = buf.trim();
    if (rest.startsWith("data:")) yield rest.slice(5).trim();
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
}

/** Découpe une URL de données « data:image/jpeg;base64,… » en (type mime, base64). */
function splitDataUrl(url: string): { mediaType: string; data: string } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(url.trim());
  return m ? { mediaType: m[1], data: m[2] } : null;
}

export async function* streamChat(
  ai: ResolvedAI,
  system: string,
  history: ChatTurn[],
  signal?: AbortSignal,
  image?: string,
): AsyncGenerator<string> {
  if (image) {
    // Vision (écran ou caméra) : l'image rejoint le dernier message de l'utilisateur.
    const img = splitDataUrl(image);
    if (!img) throw new Error("Format d'image non pris en charge.");
    const last = history.length - 1;
    if (last < 0 || history[last].role !== "user") history.push({ role: "user", content: "Décris cette image." });
    if (ai.provider === "anthropic") {
      const messages = history.map((h, i) =>
        i === last && h.role === "user"
          ? {
              role: "user" as const,
              content: [
                { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } },
                { type: "text", text: h.content },
              ],
            }
          : { role: h.role, content: h.content },
      );
      const res = await fetch(`${ai.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": ai.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: ai.model, max_tokens: 1500, system, messages, stream: true }),
        signal,
      });
      if (!res.ok || !res.body) throw new Error(await errorText(res));
      for await (const data of sseData(res.body)) {
        let j: { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } };
        try {
          j = JSON.parse(data);
        } catch {
          continue;
        }
        if (j.type === "content_block_delta" && j.delta?.type === "text_delta" && j.delta.text) yield j.delta.text;
        if (j.type === "error") throw new Error(j.error?.message || "Erreur Anthropic");
      }
      return;
    }
    const messages = history.map((h, i) =>
      i === last && h.role === "user"
        ? {
            role: "user" as const,
            content: [
              { type: "text", text: h.content },
              { type: "image_url", image_url: { url: image } },
            ],
          }
        : { role: h.role, content: h.content },
    );
    const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${ai.apiKey}` };
    if (ai.provider === "openrouter") {
      headers["HTTP-Referer"] = "http://localhost:3000";
      headers["X-Title"] = "JARVIS";
    }
    const res = await fetch(`${ai.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: ai.model, messages: [{ role: "system", content: system }, ...messages], stream: true }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(await errorText(res));
    for await (const data of sseData(res.body)) {
      if (data === "[DONE]") break;
      let j: { choices?: { delta?: { content?: string | null } }[]; error?: { message?: string } };
      try {
        j = JSON.parse(data);
      } catch {
        continue;
      }
      if (j.error) throw new Error(j.error.message || "Erreur du fournisseur IA");
      const t = j.choices?.[0]?.delta?.content;
      if (t) yield t;
    }
    return;
  }
  if (ai.provider === "anthropic") {
    const res = await fetch(`${ai.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": ai.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: ai.model, max_tokens: 1500, system, messages: history, stream: true }),
      signal,
    });
    if (!res.ok || !res.body) throw new Error(await errorText(res));
    for await (const data of sseData(res.body)) {
      let j: { type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } };
      try {
        j = JSON.parse(data);
      } catch {
        continue;
      }
      if (j.type === "content_block_delta" && j.delta?.type === "text_delta" && j.delta.text) yield j.delta.text;
      if (j.type === "error") throw new Error(j.error?.message || "Erreur Anthropic");
    }
    return;
  }

  const headers: Record<string, string> = { "content-type": "application/json", authorization: `Bearer ${ai.apiKey}` };
  if (ai.provider === "openrouter") {
    headers["HTTP-Referer"] = "http://localhost:3000";
    headers["X-Title"] = "JARVIS";
  }
  const res = await fetch(`${ai.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: ai.model, messages: [{ role: "system", content: system }, ...history], stream: true }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(await errorText(res));
  for await (const data of sseData(res.body)) {
    if (data === "[DONE]") break;
    let j: { choices?: { delta?: { content?: string | null } }[]; error?: { message?: string } };
    try {
      j = JSON.parse(data);
    } catch {
      continue;
    }
    if (j.error) throw new Error(j.error.message || "Erreur du fournisseur IA");
    const t = j.choices?.[0]?.delta?.content;
    if (t) yield t;
  }
}

export function shortReason(r: string): string {
  if (/401|403|invalid.*key|unauthori[sz]ed|incorrect api key|permission/i.test(r)) return "clé API invalide ou non autorisée";
  if (/429|rate.?limit|quota|exceeded/i.test(r)) return "quota ou limite de requêtes atteint";
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|EAI_AGAIN|network|timeout|aborted/i.test(r)) return "serveur d'IA injoignable";
  if (/404|model/i.test(r)) return "modèle introuvable, vérifiez son nom dans les paramètres";
  return r.slice(0, 140);
}
