import { env } from "../config/env.js";

export type LlmProviderName = "openai" | "gemini" | "openai-compatible" | "none";

export interface LlmConfig {
  configured: boolean;
  provider: LlmProviderName;
  model: string | null;
  baseUrl: string | null;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

function normalizeProvider(raw: string): LlmProviderName {
  const value = raw.trim().toLowerCase();
  if (value === "openai") return "openai";
  if (value === "gemini" || value === "google") return "gemini";
  if (value === "openai-compatible" || value === "local" || value === "ollama") return "openai-compatible";
  if (value) return "openai-compatible";
  return "none";
}

function defaultBaseUrl(provider: LlmProviderName, configured: string): string | null {
  if (configured) return configured.replace(/\/+$/, "");
  if (provider === "openai") return "https://api.openai.com/v1";
  if (provider === "gemini") return "https://generativelanguage.googleapis.com/v1beta";
  return null;
}

export function getLlmConfig(): LlmConfig {
  const key = env.USER_LLM_API_KEY.trim();
  const provider = normalizeProvider(env.USER_LLM_PROVIDER);
  const model = env.USER_LLM_MODEL.trim() || null;
  const baseUrl = defaultBaseUrl(provider === "none" && key ? "openai-compatible" : provider, env.USER_LLM_BASE_URL.trim());
  const inferredProvider: LlmProviderName =
    provider === "none" && key ? (baseUrl?.includes("generativelanguage") ? "gemini" : "openai-compatible") : provider;
  const configured = Boolean(key && (inferredProvider === "gemini" ? model : baseUrl && model));
  return {
    configured,
    provider: configured ? inferredProvider : "none",
    model: configured ? model : null,
    baseUrl: configured ? baseUrl : null,
  };
}

function extractOpenAiText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

function extractGeminiText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> }).candidates;
  const text = candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" ? text : "";
}

export async function completeChat(messages: ChatMessage[], timeoutMs = 12_000): Promise<string> {
  const config = getLlmConfig();
  if (!config.configured || !config.model) {
    throw new Error("LLM_UNAVAILABLE");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (config.provider === "gemini") {
      const url = `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(env.USER_LLM_API_KEY.trim())}`;
      const system = messages.find((message) => message.role === "system")?.content ?? "";
      const user = messages.filter((message) => message.role === "user").map((message) => message.content).join("\n");
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
        }),
      });
      if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
      return extractGeminiText(await res.json());
    }

    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.USER_LLM_API_KEY.trim()}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        temperature: 0.2,
        max_tokens: 600,
        messages,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) throw new Error(`LLM_HTTP_${res.status}`);
    return extractOpenAiText(await res.json());
  } finally {
    clearTimeout(timer);
  }
}
