import { NextResponse, type NextRequest } from "next/server";
import { salvarContato } from "@/lib/email/contatos";
import { lojaValida } from "@/lib/lojas";

export const dynamic = "force-dynamic";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
const hits = new Map<string, number[]>();

export function OPTIONS() { return new Response(null, { status: 204, headers: CORS }); }

/** Formulário de cadastro do site (Elementor/HTML). Aceita JSON ou form-data. */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "?";
  const agora = Date.now();
  const lista = (hits.get(ip) ?? []).filter((t) => agora - t < 3600_000);
  if (lista.length >= 20) return NextResponse.json({ ok: false, erro: "Muitas tentativas." }, { status: 429, headers: CORS });
  hits.set(ip, [...lista, agora]);

  let d: Record<string, string> = {};
  const tipo = req.headers.get("content-type") ?? "";
  try {
    if (tipo.includes("json")) d = await req.json();
    else d = Object.fromEntries(Array.from((await req.formData()).entries()).map(([k, v]) => [k, String(v)]));
  } catch { return NextResponse.json({ ok: false, erro: "Dados inválidos." }, { status: 400, headers: CORS }); }

  if (d.site_url) return NextResponse.json({ ok: true }, { headers: CORS }); // campo isca para robôs
  if (!["on", "true", "sim", "1"].includes(String(d.aceite ?? "").toLowerCase()))
    return NextResponse.json({ ok: false, erro: "É preciso aceitar receber e-mails." }, { status: 400, headers: CORS });
  const c = await salvarContato({
    email: String(d.email ?? ""), nome: d.nome, telefone: d.telefone?.replace(/\D/g, ""), cidade: d.cidade,
    origem: "formulario", loja: lojaValida(d.loja), tags: d.tag ? [String(d.tag).toLowerCase().slice(0, 40)] : [],
    consentimento: `Formulário do site em ${new Date().toLocaleDateString("pt-BR")}`,
  });
  if (!c) return NextResponse.json({ ok: false, erro: "E-mail inválido." }, { status: 400, headers: CORS });
  const volta = d.redirect && /^https:\/\//.test(d.redirect) ? d.redirect : null;
  if (volta && !tipo.includes("json")) return NextResponse.redirect(volta, 303);
  return NextResponse.json({ ok: true }, { headers: CORS });
}
