import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { Config } from "../integrations/store";
import type { Midia, TipoMidia } from "./midia";

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

const TIPO_META: Record<TipoMidia, string> = { imagem: "image", audio: "audio", video: "video", documento: "document", figurinha: "sticker" };

/** Sobe o arquivo para a Meta e devolve o id da mídia. */
async function subirMidia(cfg: Config, m: Midia) {
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", m.mime.split(";")[0]);
  fd.append("file", new Blob([new Uint8Array(m.buffer)], { type: m.mime.split(";")[0] }), m.nome || "arquivo");
  const r = await fetch(`${graph(cfg)}/${cfg.phoneNumberId}/media`, { method: "POST", headers: { Authorization: `Bearer ${cfg.accessToken}` }, body: fd, cache: "no-store" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.id) throw new Error(data?.error?.message ?? `Meta recusou o arquivo (${r.status})`);
  return String(data.id);
}

/** Baixa uma mídia recebida pela API oficial. */
export async function baixarMidiaOficial(cfg: Config, mediaId: string) {
  const auth = { Authorization: `Bearer ${cfg.accessToken}` };
  const info = await fetch(`${graph(cfg)}/${mediaId}`, { headers: auth, cache: "no-store" }).then((r) => r.json());
  if (!info?.url) throw new Error("mídia sem url");
  const r = await fetch(info.url, { headers: auth, cache: "no-store" });
  if (!r.ok) throw new Error(`download ${r.status}`);
  return { buffer: Buffer.from(await r.arrayBuffer()), mime: String(info.mime_type ?? "application/octet-stream") };
}

export async function oficialSend(cfg: Config, to: string, text: string, midia?: Midia): Promise<{ id?: string }> {
  let msg: Record<string, unknown> = { type: "text", text: { body: text.slice(0, 4096) } };
  if (midia) {
    const t = TIPO_META[midia.tipo];
    const obj: Record<string, unknown> = { id: await subirMidia(cfg, midia) };
    if (text && t !== "audio" && t !== "sticker") obj.caption = text.slice(0, 1024);
    if (t === "document") obj.filename = midia.nome || "arquivo";
    msg = { type: t, [t]: obj };
  }
  const r = await fetch(`${graph(cfg)}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/\D/g, ""), ...msg }),
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
