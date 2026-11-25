import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { lerArquivo } from "@/lib/manuais";

export const dynamic = "force-dynamic";

/** Abre o PDF (só para quem está logado). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await getCurrentUser())) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const m = await db.query.manuais.findFirst({ where: eq(schema.manuais.id, params.id) });
  if (!m) return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  const buf = await lerArquivo(m.arquivo).catch(() => null);
  if (!buf) return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(m.nomeOriginal)}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
