import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db, schema } from "@/lib/db";
import { lerCanhoto } from "@/lib/entregas";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await getCurrentUser();
  if (!u || !can(u.role, "entregas")) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const e = await db.query.entregas.findFirst({ where: eq(schema.entregas.id, params.id), columns: { canhoto: true } });
  if (!e?.canhoto) return NextResponse.json({ error: "sem comprovante" }, { status: 404 });
  const buf = await lerCanhoto(e.canhoto).catch(() => null);
  if (!buf) return NextResponse.json({ error: "arquivo não encontrado" }, { status: 404 });
  const ext = e.canhoto.split(".").pop()!.toLowerCase();
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg", "Cache-Control": "private, max-age=86400" } });
}
