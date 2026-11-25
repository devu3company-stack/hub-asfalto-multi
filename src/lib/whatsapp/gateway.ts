import "server-only";

/** Conexão por QR code (container whatsapp-gateway, rede interna do Docker). */
const base = () => (process.env.WA_GATEWAY_URL ?? "http://whatsapp:3100").replace(/\/$/, "");
const headers = () => ({ "Content-Type": "application/json", "x-gateway-token": process.env.WA_GATEWAY_TOKEN ?? "" });

export type QrStatus = {
  status: "desconectado" | "aguardando_qr" | "conectando" | "conectado" | "indisponivel";
  qr: string | null;
  number: string | null;
  name: string | null;
};

export async function qrStatus(): Promise<QrStatus> {
  try {
    const r = await fetch(base() + "/status", { headers: headers(), cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error();
    return r.json();
  } catch {
    return { status: "indisponivel", qr: null, number: null, name: null };
  }
}

export async function qrSend(to: string, text: string): Promise<{ id?: string }> {
  const r = await fetch(base() + "/send", {
    method: "POST", headers: headers(), cache: "no-store",
    body: JSON.stringify({ to, text }), signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Conexão QR respondeu ${r.status}`);
  return data;
}

export async function qrLogout() {
  await fetch(base() + "/logout", { method: "POST", headers: headers(), cache: "no-store", signal: AbortSignal.timeout(10000) });
}

export function gatewayTokenOk(got: string | null) {
  const want = process.env.WA_GATEWAY_TOKEN ?? "";
  return want.length >= 24 && got === want;
}
