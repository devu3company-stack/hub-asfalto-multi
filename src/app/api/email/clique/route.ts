import { and, eq, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { conferir } from "@/lib/email/envio";

export const dynamic = "force-dynamic";

/** Registra o clique e redireciona. Só redireciona para URLs que foram assinadas pelo hub. */
export async function GET(req: NextRequest) {
  const v = conferir(req.nextUrl.searchParams.get("t"));
  const m = v?.match(/^e:([^|]+)\|(https?:\/\/.+)$/);
  if (!m) return NextResponse.redirect("https://asfaltomulti.com.br");
  const now = new Date();
  await db.update(schema.emailEnvios).set({ clicadoEm: now })
    .where(and(eq(schema.emailEnvios.id, m[1]), isNull(schema.emailEnvios.clicadoEm))).catch(() => {});
  await db.update(schema.emailEnvios).set({ abertoEm: now })
    .where(and(eq(schema.emailEnvios.id, m[1]), isNull(schema.emailEnvios.abertoEm))).catch(() => {});
  return NextResponse.redirect(m[2]);
}
