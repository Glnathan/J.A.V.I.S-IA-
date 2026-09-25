// AI providers supported by J.A.R.V.I.S. (shared: no secrets here).

export type ProviderId =
  | "groq"
  | "gemini"
  | "openai"
  | "anthropic"
  | "mistral"
  | "openrouter"
  | "deepseek"
  | "ollama"
  | "custom";

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  description: string;
  baseUrl: string;
  defaultModel: string;
  envKeys: string[];
  needsKey: boolean;
  needsBaseUrl?: boolean;
  keyUrl?: string;
  free?: boolean;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "groq",
    label: "Groq",
    description: "Ultra-rapide, clé gratuite (Llama 3.3 70B).",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    envKeys: ["GROQ_API_KEY"],
    needsKey: true,
    keyUrl: "https://console.groq.com/keys",
    free: true,
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "Clé gratuite via Google AI Studio.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-3.8-flash",
    envKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
    needsKey: true,
    keyUrl: "https://aistudio.google.com/apikey",
    free: true,
  },
  {
    id: "openai",
    label: "OpenAI (ChatGPT)",
    description: "Les modèles GPT d'OpenAI (payant).",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    envKeys: ["OPENAI_API_KEY"],
    needsKey: true,
    keyUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    description: "Les modèles Claude d'Anthropic (payant).",
    baseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-4-5",
    envKeys: ["ANTHROPIC_API_KEY"],
    needsKey: true,
    keyUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    description: "L'IA française (offre gratuite limitée).",
    baseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    envKeys: ["MISTRAL_API_KEY"],
    needsKey: true,
    keyUrl: "https://console.mistral.ai/api-keys",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    description: "Accès à des centaines de modèles avec une seule clé.",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    envKeys: ["OPENROUTER_API_KEY"],
    needsKey: true,
    keyUrl: "https://openrouter.ai/keys",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "Modèles DeepSeek, très économiques.",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    envKeys: ["DEEPSEEK_API_KEY"],
    needsKey: true,
    keyUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "ollama",
    label: "Ollama (100 % local)",
    description: "IA installée sur votre PC, gratuite et privée. Aucune clé requise.",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    envKeys: [],
    needsKey: false,
    needsBaseUrl: true,
    keyUrl: "https://ollama.com/download",
  },
  {
    id: "custom",
    label: "Compatible OpenAI (LM Studio…)",
    description: "N'importe quel serveur compatible OpenAI (LM Studio, vLLM, LocalAI…).",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "local-model",
    envKeys: [],
    needsKey: false,
    needsBaseUrl: true,
  },
];

export function getProvider(id: string): ProviderInfo | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
