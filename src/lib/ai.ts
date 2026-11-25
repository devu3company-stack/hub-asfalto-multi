import "server-only";
import type { Config } from "./integrations/store";

/**
 * Provedores de IA do atendente. Cada um é uma integração própria (aba Integrações);
 * a tela WhatsApp escolhe qual deles responde.
 *   ia         → Claude (Anthropic)
 *   ia_openai  → ChatGPT (OpenAI)
 *   ia_gemini  → Gemini (Google)
 *   ia_compat  → qualquer API compatível com OpenAI (DeepSeek, Groq, OpenRouter, Ollama...)
 */
export const AI_PROVIDERS = ["ia", "ia_openai", "ia_gemini", "ia_compat"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const AI_LABELS: Record<AiProvider, string> = {
  ia: "Claude (Anthropic)",
  ia_openai: "ChatGPT (OpenAI)",
  ia_gemini: "Gemini (Google)",
  ia_compat: "Outra IA (compatível com OpenAI)",
};

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  ia: "claude-sonnet-5-5",
  ia_openai: "gpt-4o-mini",
  ia_gemini: "gemini-2.5-flash",
  ia_compat: "",
};

export const HANDOFF = "[HUMANO]";

type Msg = { role: "user" | "assistant"; content: string };

async function readJson(r: Response) {
  return r.json().catch(() => ({}));
}

async function callAnthropic(cfg: Config, system: string, messages: Msg[], maxTokens: number) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: cfg.model || DEFAULT_MODELS.ia, max_tokens: maxTokens, system, messages }),
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  const data = await readJson(r);
  if (!r.ok) throw new Error(data?.error?.message ?? `Claude respondeu ${r.status}`);
  return (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
}

async function callOpenAICompatible(baseUrl: string, cfg: Config, model: string, system: string, messages: Msg[], maxTokens: number) {
  const r = await fetch(baseUrl.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: "system", content: system }, ...messages] }),
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  const data = await readJson(r);
  if (!r.ok) throw new Error(data?.error?.message ?? `A IA respondeu ${r.status}`);
  return String(data?.choices?.[0]?.message?.content ?? "");
}

async function callGemini(cfg: Config, system: string, messages: Msg[], maxTokens: number) {
  const model = cfg.model || DEFAULT_MODELS.ia_gemini;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": cfg.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: maxTokens },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  const data = await readJson(r);
  if (!r.ok) throw new Error(data?.error?.message ?? `Gemini respondeu ${r.status}`);
  return (data?.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
}

async function call(provider: AiProvider, cfg: Config, system: string, messages: Msg[], maxTokens = 600) {
  if (!cfg.apiKey && provider !== "ia_compat") throw new Error("Informe a chave da API.");
  let text: string;
  switch (provider) {
    case "ia":
      text = await callAnthropic(cfg, system, messages, maxTokens);
      break;
    case "ia_openai":
      text = await callOpenAICompatible("https://api.openai.com/v1", cfg, cfg.model || DEFAULT_MODELS.ia_openai, system, messages, maxTokens);
      break;
    case "ia_gemini":
      text = await callGemini(cfg, system, messages, maxTokens);
      break;
    case "ia_compat":
      if (!cfg.baseUrl || !cfg.model) throw new Error("Informe a URL da API e o modelo.");
      text = await callOpenAICompatible(cfg.baseUrl, cfg, cfg.model, system, messages, maxTokens);
      break;
  }
  return text.trim();
}

export function makeTester(provider: AiProvider) {
  return async (cfg: Config) => {
    await call(provider, cfg, "Responda apenas: ok", [{ role: "user", content: "teste" }], 10);
    return `${AI_LABELS[provider]} conectada (modelo ${cfg.model || DEFAULT_MODELS[provider]}).`;
  };
}

/** Gera a resposta do atendente a partir do histórico da conversa (mais antiga primeiro). */
export async function replyAsAgent(
  provider: AiProvider,
  cfg: Config,
  instructions: string,
  history: { fromCustomer: boolean; text: string }[],
) {
  const system =
    instructions.trim() +
    "\n\nRegras fixas: você conversa pelo WhatsApp, então escreva mensagens curtas, sem markdown e sem listas longas. " +
    `Se o cliente pedir para falar com uma pessoa, reclamar, ou se você não tiver certeza da resposta, escreva uma mensagem curta avisando que um atendente vai continuar e termine com ${HANDOFF}.`;

  // As APIs exigem alternância começando pelo usuário: junta mensagens seguidas do mesmo lado.
  const msgs: Msg[] = [];
  for (const h of history) {
    const role = h.fromCustomer ? "user" : "assistant";
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content += "\n" + h.text;
    else msgs.push({ role, content: h.text });
  }
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;

  const text = await call(provider, cfg, system, msgs);
  const handoff = text.includes(HANDOFF);
  return { text: text.replace(HANDOFF, "").trim(), handoff };
}
