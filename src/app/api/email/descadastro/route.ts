import { NextResponse, type NextRequest } from "next/server";
import { descadastrarPorToken } from "@/lib/email/descadastrar";

export const dynamic = "force-dynamic";

/** Descadastro em um clique (cabeçalho List-Unsubscribe-Post do Gmail/Outlook). */
export async function POST(req: NextRequest) {
  const ok = await descadastrarPorToken(req.nextUrl.searchParams.get("t"));
  return NextResponse.json({ ok: Boolean(ok) }, { status: ok ? 200 : 400 });
}
