import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { conferir } from "@/lib/email/envio";
import { lerCanhoto } from "@/lib/entregas";

export const dynamic = "force-dynamic";

/** Foto do canhoto para o cliente (link assinado enviado no aviso de entrega). */
export async function GET(_req: Request, { params }: { params: { t: string } }) {
  const v = conferir(decodeURIComponent(params.t));
  if (!v?.startsWith("e:")) return new NextResponse("Link inválido.", { status: 404 });
  const e = await db.query.entregas.findFirst({ where: eq(schema.entregas.id, v.slice(2)), columns: { canhoto: true } });
  const buf = e?.canhoto ? await lerCanhoto(e.canhoto).catch(() => null) : null;
  if (!buf) return new NextResponse("Comprovante não encontrado.", { status: 404 });
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}
