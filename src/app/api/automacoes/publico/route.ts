import { NextResponse } from "next/server";
import { audit, getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { gerarCsv, pessoas, SEGMENTOS } from "@/lib/automacoes/publicos";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || !can(u.role, "automacoes", "edit")) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const q = new URL(req.url).searchParams;
  const seg = q.get("segmento") ?? "", formato = q.get("formato") === "google" ? "google" : "meta";
  if (!SEGMENTOS[seg]) return NextResponse.json({ error: "segmento inválido" }, { status: 400 });
  const { csv } = gerarCsv(await pessoas(seg, q.get("tag") ?? undefined), formato);
  await audit(u.id, "automacoes.publico.exportar", `${seg} ${formato}`);
  return new NextResponse("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="publico-${seg}-${formato}.csv"`, "Cache-Control": "no-store" } });
}
