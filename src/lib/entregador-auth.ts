import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";

/** Sessão do app dos entregadores: cookie e chave próprios, separados do login da equipe. */
export const ENTREGADOR_COOKIE = "hub_entregador";
export const ENTREGADOR_MAX_AGE = 60 * 60 * 24 * 60; // 60 dias: entregador não precisa logar toda hora

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ausente ou curto.");
  return new TextEncoder().encode(s + ":entregador");
}

export async function assinarEntregador(id: string) {
  return new SignJWT({ typ: "entregador" }).setProtectedHeader({ alg: "HS256" }).setSubject(id).setIssuedAt()
    .setExpirationTime(`${ENTREGADOR_MAX_AGE}s`).sign(key());
}

export async function entregadorAtual() {
  const t = cookies().get(ENTREGADOR_COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, key());
    if (payload.typ !== "entregador" || !payload.sub) return null;
    const e = await db.query.entregadores.findFirst({ where: eq(schema.entregadores.id, payload.sub) });
    return e && e.ativo ? e : null;
  } catch { return null; }
}

export async function exigirEntregador() {
  const e = await entregadorAtual();
  if (!e) redirect("/entregador/entrar");
  return e;
}

/** Telefone só com dígitos e DDI 55. */
export function normalizarTelefone(t: string) {
  const d = t.replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? "55" + d : d;
}
