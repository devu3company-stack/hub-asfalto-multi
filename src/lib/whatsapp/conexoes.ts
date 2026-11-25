import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getSetting } from "../settings";

const K = schema.waConexoes, C = schema.waChats;
export type Conexao = typeof K.$inferSelect;

export const conexaoDoUsuario = (userId: string) => `u_${userId.replace(/[^a-z0-9]/gi, "").slice(0, 36)}`;

export async function conexao(id: string) {
  return db.query.waConexoes.findFirst({ where: eq(K.id, id) });
}

/** Cria (se não existir) a conexão do usuário. */
export async function garantirConexaoDoUsuario(u: { id: string; name: string }) {
  const ja = await db.query.waConexoes.findFirst({ where: eq(K.userId, u.id) });
  if (ja) return ja;
  const [c] = await db.insert(K).values({ id: conexaoDoUsuario(u.id), nome: u.name, userId: u.id }).onConflictDoNothing().returning();
  return c ?? (await conexao(conexaoDoUsuario(u.id)))!;
}

/** Números que o usuário pode ver: administrador vê todos; os demais, só o(s) próprio(s). */
export async function conexoesVisiveis(u: { id: string; role: string }) {
  return u.role === "ADMIN" ? db.query.waConexoes.findMany() : db.query.waConexoes.findMany({ where: eq(K.userId, u.id) });
}

/** Número usado para avisos do sistema (entregadores, automações sem vendedor). */
export async function conexaoPadrao() {
  return (await getSetting("whatsapp.conexaoPadrao")) || "principal";
}

/**
 * Por qual número falar com este cliente:
 * 1) o pedido explícito; 2) o número do vendedor indicado (se conectado/existente);
 * 3) o número da conversa mais recente com o cliente; 4) o número padrão.
 */
export async function conexaoPara(chat: string, pref: { conexaoId?: string | null; userId?: string | null } = {}) {
  if (pref.conexaoId) return pref.conexaoId;
  if (pref.userId) {
    const c = await db.query.waConexoes.findFirst({ where: eq(K.userId, pref.userId) });
    if (c) return c.id;
  }
  const ultima = await db.query.waChats.findFirst({ where: eq(C.chat, chat), orderBy: desc(C.lastAt) });
  return ultima?.conexaoId ?? (await conexaoPadrao());
}

export async function iaLigadaEm(conexaoId: string) {
  return !!(await db.query.waConexoes.findFirst({ where: and(eq(K.id, conexaoId), eq(K.iaLigada, true)), columns: { id: true } }));
}

export async function idsVisiveis(u: { id: string; role: string }) {
  return (await conexoesVisiveis(u)).map((c) => c.id);
}
