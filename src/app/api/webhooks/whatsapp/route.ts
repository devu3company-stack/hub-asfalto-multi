import { NextResponse, type NextRequest } from "next/server";
import { gatewayTokenOk } from "@/lib/whatsapp/gateway";
import { chatKey, handleIncoming } from "@/lib/whatsapp/service";

export const dynamic = "force-dynamic";

/** Mensagens da conexão por QR code (vem só da rede interna, com token). */
export async function POST(req: NextRequest) {
  if (!gatewayTokenOk(req.headers.get("x-gateway-token"))) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.chat || typeof b.text !== "string") return NextResponse.json({ error: "inválido" }, { status: 400 });
  await handleIncoming({
    id: b.id ? `qr_${b.id}` : undefined,
    chat: chatKey(String(b.chat)),
    channel: "qr",
    fromMe: Boolean(b.fromMe),
    name: b.name ?? null,
    text: String(b.text).slice(0, 8000),
  });
  return NextResponse.json({ ok: true });
}
