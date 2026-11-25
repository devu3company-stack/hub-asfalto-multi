import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { qrStatus } from "@/lib/whatsapp/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || !can(u.role, "whatsapp")) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  return NextResponse.json(await qrStatus());
}
