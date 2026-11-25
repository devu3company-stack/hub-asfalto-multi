import { NextResponse, type NextRequest } from "next/server";
import { gatewayTokenOk } from "@/lib/whatsapp/gateway";
import { chatKey, handleIncoming } from "@/lib/whatsapp/service";
import { MAX_MIDIA, paraOuvir, type Midia, type TipoMidia } from "@/lib/whatsapp/midia";

export const dynamic = "force-dynamic";

/** Mensagens da conexão por QR code (vem só da rede interna, com token). */
export async function POST(req: NextRequest) {
  if (!gatewayTokenOk(req.headers.get("x-gateway-token"))) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.chat || typeof b.text !== "string") return NextResponse.json({ error: "inválido" }, { status: 400 });
  const tipos: TipoMidia[] = ["imagem", "audio", "video", "documento", "figurinha"];
  const tipo = tipos.includes(b.media?.tipo) ? (b.media.tipo as TipoMidia) : null;
  let midia: Midia | null = null;
  if (tipo && typeof b.media.base64 === "string") {
    const buffer = Buffer.from(b.media.base64, "base64");
    if (buffer.length <= MAX_MIDIA) midia = await paraOuvir({ buffer, mime: String(b.media.mimetype ?? "application/octet-stream"), nome: b.media.fileName ?? null, tipo });
  }
  await handleIncoming({
    id: b.id ? `qr_${b.id}` : undefined,
    chat: chatKey(String(b.chat)),
    channel: "qr",
    fromMe: Boolean(b.fromMe),
    name: b.name ?? null,
    text: String(b.text).slice(0, 8000),
    midia,
    midiaFalhou: tipo && !midia ? { tipo, nome: b.media.fileName ?? null } : undefined,
  });
  return NextResponse.json({ ok: true });
}
