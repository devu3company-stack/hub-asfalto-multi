import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { qrStatus } from "@/lib/whatsapp/gateway";
import { conexao } from "@/lib/whatsapp/conexoes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const u = await getCurrentUser();
  if (!u || !can(u.role, "whatsapp")) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("c") ?? "";
  const cx = await conexao(id);
  if (!cx || (u.role !== "ADMIN" && cx.userId !== u.id)) return NextResponse.json({ error: "não autorizado" }, { status: 403 });
  return NextResponse.json(await qrStatus(id));
}
