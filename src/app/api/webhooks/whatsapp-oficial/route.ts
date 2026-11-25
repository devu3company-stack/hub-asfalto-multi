import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@/lib/integrations/store";
import { verifyMetaSignature } from "@/lib/whatsapp/oficial";
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

type MetaMsg = { id: string; from: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string }; list_reply?: { title: string } } };

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
        const text =
          m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ??
          ({ image: "[imagem]", audio: "[áudio]", video: "[vídeo]", document: "[documento]", sticker: "[figurinha]", location: "[localização]" } as Record<string, string>)[m.type];
        if (!text) continue;
        await handleIncoming({ id: `of_${m.id}`, chat: m.from, channel: "oficial", fromMe: false, name: names[m.from] ?? null, text });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
