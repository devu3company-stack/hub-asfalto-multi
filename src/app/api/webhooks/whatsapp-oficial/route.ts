import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/integrations/store";
import { baixarMidiaOficial, verifyMetaSignature } from "@/lib/whatsapp/oficial";
import { MAX_MIDIA, paraOuvir, type Midia, type TipoMidia } from "@/lib/whatsapp/midia";
import { handleIncoming } from "@/lib/whatsapp/service";

export const dynamic = "force-dynamic";

/** Verificação do webhook pela Meta (feita uma vez ao cadastrar a URL). */
export async function GET(req: NextRequest) {
  const cfg = await getConfig("whatsapp_oficial");
  const p = req.nextUrl.searchParams;
  if (cfg?.verifyToken && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === cfg.verifyToken) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

type MetaMidia = { id: string; mime_type?: string; caption?: string; filename?: string; voice?: boolean };
type MetaMsg = { id: string; from: string; type: string; image?: MetaMidia; audio?: MetaMidia; video?: MetaMidia; document?: MetaMidia; sticker?: MetaMidia; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } } };

export async function POST(req: NextRequest) {
  const cfg = await getConfig("whatsapp_oficial");
  const raw = await req.text();
  if (!cfg?.appSecret || !verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), cfg.appSecret)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }
  const body = JSON.parse(raw);
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const names: Record<string, string> = {};
      for (const c of v.contacts ?? []) names[c.wa_id] = c.profile?.name;
      for (const m of (v.messages ?? []) as MetaMsg[]) {
        const TIPOS: Record<string, TipoMidia> = { image: "imagem", audio: "audio", video: "video", document: "documento", sticker: "figurinha" };
        const tipo = TIPOS[m.type];
        const info = tipo ? (m[m.type as "image"] as MetaMidia | undefined) : undefined;
        const text =
          m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ??
          info?.caption ?? (tipo ? "" : m.type === "location" ? "[localização]" : null);
        if (text === null || text === undefined) continue;
        let midia: Midia | null = null;
        if (tipo && info?.id) {
          try {
            const d = await baixarMidiaOficial(cfg, info.id);
            if (d.buffer.length <= MAX_MIDIA) midia = await paraOuvir({ buffer: d.buffer, mime: info.mime_type ?? d.mime, nome: info.filename ?? null, tipo });
          } catch (e) { console.error("mídia oficial:", e instanceof Error ? e.message : e); }
        }
        await handleIncoming({ conexaoId: "oficial", id: `of_${m.id}`, chat: m.from, channel: "oficial", fromMe: false, name: names[m.from] ?? null, text, midia,
          midiaFalhou: tipo && !midia ? { tipo, nome: info?.filename ?? null } : undefined });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
