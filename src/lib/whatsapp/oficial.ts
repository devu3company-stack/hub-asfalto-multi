import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { Config } from "../integrations/store";

/** WhatsApp Cloud API (API oficial da Meta). */
const graph = (cfg: Config) => `https://graph.facebook.com/${cfg.apiVersion || "v21.0"}`;

export async function testOficial(cfg: Config) {
  if (!cfg.phoneNumberId || !cfg.accessToken) throw new Error("Informe o ID do número e o token de acesso.");
  const r = await fetch(`${graph(cfg)}/${cfg.phoneNumberId}?fields=display_phone_number,verified_name`, {
    headers: { Authorization: `Bearer ${cfg.accessToken}` }, cache: "no-store",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error?.message ?? `Meta respondeu ${r.status}`);
  return `Conectado ao número ${data.display_phone_number} (${data.verified_name}).`;
}

export async function oficialSend(cfg: Config, to: string, text: string): Promise<{ id?: string }> {
  const r = await fetch(`${graph(cfg)}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/\D/g, ""), type: "text", text: { body: text.slice(0, 4096) } }),
    cache: "no-store",
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message ?? `Meta respondeu ${r.status}`;
    // 131047: fora da janela de 24h — só template aprovado pode ser enviado.
    if (data?.error?.code === 131047) throw new Error("Fora da janela de 24h da API oficial: o cliente precisa mandar mensagem antes, ou use um template aprovado.");
    throw new Error(msg);
  }
  return { id: data?.messages?.[0]?.id };
}

/** Confere a assinatura X-Hub-Signature-256 enviada pela Meta. */
export function verifyMetaSignature(raw: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const digest = "sha256=" + createHmac("sha256", appSecret).update(raw, "utf8").digest("hex");
  const a = Buffer.from(digest), b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
