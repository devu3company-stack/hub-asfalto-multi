import "server-only";
import type { Midia } from "./midia";

/** Conexões por QR code (container whatsapp-gateway, rede interna do Docker). Uma sessão por número. */
const base = () => (process.env.WA_GATEWAY_URL ?? "http://whatsapp:3100").replace(/\/$/, "");
const headers = () => ({ "Content-Type": "application/json", "x-gateway-token": process.env.WA_GATEWAY_TOKEN ?? "" });
const url = (conexao: string, acao: string) => `${base()}/s/${encodeURIComponent(conexao)}/${acao}`;

export type QrStatus = {
  status: "desconectado" | "aguardando_qr" | "conectando" | "conectado" | "indisponivel";
  qr: string | null;
  number: string | null;
  name: string | null;
};
const INDISPONIVEL: QrStatus = { status: "indisponivel", qr: null, number: null, name: null };

export async function qrStatus(conexao = "principal"): Promise<QrStatus> {
  try {
    const r = await fetch(url(conexao, "status"), { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error();
    return r.json();
  } catch { return INDISPONIVEL; }
}

/** Situação de todas as sessões abertas no serviço (uma chamada só). */
export async function qrSessoes(): Promise<Record<string, QrStatus>> {
  try {
    const r = await fetch(`${base()}/sessoes`, { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error();
    const lista = (await r.json()) as (QrStatus & { id: string })[];
    return Object.fromEntries(lista.map((s) => [s.id, s]));
  } catch { return {}; }
}

/** Liga a sessão (gera o QR se o número ainda não estiver pareado). */
export async function qrIniciar(conexao: string): Promise<QrStatus> {
  try {
    const r = await fetch(url(conexao, "start"), { method: "POST", headers: headers(), cache: "no-store", signal: AbortSignal.timeout(8000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "falha");
    return d;
  } catch { return INDISPONIVEL; }
}

export async function qrSend(conexao: string, to: string, text: string, midia?: Midia): Promise<{ id?: string }> {
  const media = midia ? { base64: midia.buffer.toString("base64"), mimetype: midia.mime, fileName: midia.nome, tipo: midia.tipo, voz: midia.voz } : undefined;
  const r = await fetch(url(conexao, "send"), {
    method: "POST", headers: headers(), cache: "no-store",
    body: JSON.stringify({ to, text, media }), signal: AbortSignal.timeout(midia ? 90000 : 15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Conexão respondeu ${r.status}`);
  return data;
}

export async function qrLogout(conexao: string) {
  await fetch(url(conexao, "logout"), { method: "POST", headers: headers(), cache: "no-store", signal: AbortSignal.timeout(10000) });
}

export function gatewayTokenOk(got: string | null) {
  const want = process.env.WA_GATEWAY_TOKEN ?? "";
  return want.length >= 24 && got === want;
}
