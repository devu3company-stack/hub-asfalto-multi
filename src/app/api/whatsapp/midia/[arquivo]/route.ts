import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { lerMidia } from "@/lib/whatsapp/midia";

export const dynamic = "force-dynamic";

/** Foto, áudio, vídeo ou documento de uma conversa (só para quem está logado). */
export async function GET(req: Request, { params }: { params: { arquivo: string } }) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const m = await db.query.waMessages.findFirst({ where: eq(schema.waMessages.midia, params.arquivo) });
  if (!m) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  const buf = await lerMidia(params.arquivo).catch(() => null);
  if (!buf) return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 });
  const baixar = new URL(req.url).searchParams.has("baixar");
  const nome = m.midiaNome || params.arquivo;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": (m.midiaMime ?? "application/octet-stream").split(";")[0],
      "Content-Length": String(buf.length),
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, max-age=86400",
      "Accept-Ranges": "none",
    },
  });
}
