import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { cancelarFila, conferir } from "./envio";

/** Descadastra pelo token do link. Devolve o e-mail descadastrado (ou null se o link for inválido). */
export async function descadastrarPorToken(token: string | null) {
  const v = conferir(token);
  if (!v?.startsWith("c:")) return null;
  const id = v.slice(2);
  const c = await db.query.contatos.findFirst({ where: eq(schema.contatos.id, id) });
  if (!c) return null;
  if (!c.descadastradoEm) await db.update(schema.contatos).set({ descadastradoEm: new Date(), updatedAt: new Date() }).where(eq(schema.contatos.id, id));
  await cancelarFila({ contatoId: id });
  return c.email;
}
