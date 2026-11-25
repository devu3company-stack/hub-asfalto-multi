"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { assinarEntregador, ENTREGADOR_COOKIE, ENTREGADOR_MAX_AGE, exigirEntregador, normalizarTelefone } from "@/lib/entregador-auth";
import { aceitar as aceitarFrete, coletar as coletarFrete, entregar as entregarFrete } from "@/lib/entregas";

export type Msg = { ok: boolean; message: string } | undefined;

// Limite simples contra chute de senha: 5 erros em 15 minutos por telefone.
const erros = new Map<string, { n: number; ate: number }>();

export async function entrar(_p: Msg, f: FormData): Promise<Msg> {
  const tel = normalizarTelefone(String(f.get("telefone") ?? ""));
  const pin = String(f.get("senha") ?? "").replace(/\D/g, "");
  const e = erros.get(tel);
  if (e && e.ate > Date.now() && e.n >= 5) return { ok: false, message: "Muitas tentativas. Espere 15 minutos ou peça uma nova senha à Asfalto Multi." };
  const d = await db.query.entregadores.findFirst({ where: eq(schema.entregadores.telefone, tel) });
  if (!d || !d.ativo || !(await bcrypt.compare(pin, d.pinHash))) {
    erros.set(tel, { n: (e && e.ate > Date.now() ? e.n : 0) + 1, ate: Date.now() + 15 * 60_000 });
    return { ok: false, message: "Telefone ou senha incorretos." };
  }
  erros.delete(tel);
  await db.update(schema.entregadores).set({ ultimoAcesso: new Date() }).where(eq(schema.entregadores.id, d.id));
  cookies().set(ENTREGADOR_COOKIE, await assinarEntregador(d.id), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: ENTREGADOR_MAX_AGE,
  });
  const volta = String(f.get("volta") ?? "");
  redirect(volta.startsWith("/entregador/") ? volta : "/entregador");
}

export async function sair() {
  cookies().delete(ENTREGADOR_COOKIE);
  redirect("/entregador/entrar");
}

export async function aceitar(_p: Msg, f: FormData): Promise<Msg> {
  const d = await exigirEntregador();
  const id = String(f.get("id"));
  const r = await aceitarFrete(id, d.id);
  revalidatePath(`/entregador/f/${id}`);
  return r.ok ? { ok: true, message: "Frete aceito! Os detalhes da entrega também foram enviados no seu WhatsApp." } : r;
}

export async function coletar(_p: Msg, f: FormData): Promise<Msg> {
  const d = await exigirEntregador();
  const id = String(f.get("id"));
  const ok = await coletarFrete(id, d.id);
  revalidatePath(`/entregador/f/${id}`);
  return ok ? { ok: true, message: "Coleta registrada. Boa viagem!" } : { ok: false, message: "Não deu para registrar a coleta." };
}

export async function entregar(_p: Msg, f: FormData): Promise<Msg> {
  const d = await exigirEntregador();
  const id = String(f.get("id"));
  const foto = f.get("foto");
  if (!(foto instanceof File) || !foto.size) return { ok: false, message: "Tire a foto do canhoto assinado." };
  if (foto.size > 15 * 1024 * 1024) return { ok: false, message: "Foto muito grande. Tente de novo." };
  const ext = /png/.test(foto.type) ? "png" : /webp/.test(foto.type) ? "webp" : "jpg";
  const n = (k: string) => { const v = Number(f.get(k)); return f.get(k) && Number.isFinite(v) ? v : null; };
  const ok = await entregarFrete(id, d.id, { foto: Buffer.from(await foto.arrayBuffer()), ext, lat: n("lat"), lng: n("lng"), precisao: n("precisao"),
    recebedor: String(f.get("recebedor") ?? "").trim() || null });
  revalidatePath(`/entregador/f/${id}`);
  return ok ? { ok: true, message: "Entrega finalizada. Obrigado!" } : { ok: false, message: "Não deu para finalizar este frete." };
}
