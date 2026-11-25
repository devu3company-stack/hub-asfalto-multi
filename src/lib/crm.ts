import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { getSetting } from "./settings";

/** Funil de vendas no estilo do RD Station CRM: funis, etapas, negociações, tarefas e histórico. */

export const ETAPAS_PADRAO = ["Sem contato", "Contato feito", "Orçamento enviado", "Negociação", "Fechamento"];
export const MOTIVOS_PADRAO = ["Preço", "Frete caro", "Prazo de entrega", "Comprou do concorrente", "Sem resposta", "Desistiu da obra", "Outro"];
export const FONTES = ["WhatsApp", "Site", "Loja (Shopify)", "Telefone", "Indicação", "Google Ads", "Instagram", "Outro"];
export const TIPOS_TAREFA: Record<string, string> = {
  ligacao: "Ligação", whatsapp: "WhatsApp", email: "E-mail", reuniao: "Reunião", visita: "Visita", tarefa: "Tarefa",
};

const F = schema.crmFunis, E = schema.crmEtapas, N = schema.crmNegociacoes;

export async function garantirFunil() {
  const funis = await db.query.crmFunis.findMany({ orderBy: asc(F.ordem) });
  if (funis.length) return funis;
  const [f] = await db.insert(F).values({ nome: "Vendas" }).returning();
  await db.insert(E).values(ETAPAS_PADRAO.map((nome, ordem) => ({ funilId: f.id, nome, ordem })));
  return [f];
}

export async function motivosPerda() {
  const s = await getSetting("crm.motivosPerda");
  return s ? s.split("\n").map((x) => x.trim()).filter(Boolean) : MOTIVOS_PADRAO;
}

export type Filtro = { funilId: string; responsavelId?: string; status?: string; busca?: string; loja?: string };

export async function quadro(f: Filtro) {
  const etapas = await db.query.crmEtapas.findMany({ where: eq(E.funilId, f.funilId), orderBy: asc(E.ordem) });
  const conds = [eq(N.funilId, f.funilId), eq(N.status, f.status || "andamento")];
  if (f.responsavelId) conds.push(eq(N.responsavelId, f.responsavelId));
  if (f.loja) conds.push(eq(N.loja, f.loja));
  if (f.busca) conds.push(sql`(${N.titulo} ilike ${"%" + f.busca + "%"} or ${N.contato} ilike ${"%" + f.busca + "%"} or ${N.empresa} ilike ${"%" + f.busca + "%"} or ${N.telefone} like ${"%" + f.busca.replace(/\D/g, "") + "%"})`);
  const negs = await db.query.crmNegociacoes.findMany({
    where: and(...conds), orderBy: [asc(N.ordem), asc(N.createdAt)], limit: 1000,
    with: { responsavel: { columns: { name: true } } },
  });
  // próxima tarefa aberta de cada negociação (para o aviso no cartão)
  const ids = negs.map((n) => n.id);
  const prox = ids.length ? await db.execute<{ negociacao_id: string; quando: Date }>(sql`
    select distinct on (negociacao_id) negociacao_id, quando from crm_tarefas
    where not concluida and negociacao_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    order by negociacao_id, quando`) : [];
  const proxPor = new Map((prox as unknown as { negociacao_id: string; quando: Date }[]).map((r) => [r.negociacao_id, new Date(r.quando)]));
  return {
    etapas: etapas.map((e) => {
      const lista = negs.filter((n) => n.etapaId === e.id).map((n) => ({ ...n, proximaTarefa: proxPor.get(n.id) ?? null }));
      return { ...e, negociacoes: lista, total: lista.reduce((s, n) => s + n.valor, 0) };
    }),
  };
}

export async function registrar(negociacaoId: string, userId: string | null, tipo: string, texto: string) {
  await db.insert(schema.crmHistorico).values({ negociacaoId, userId, tipo, texto: texto.slice(0, 2000) });
}

export async function moverEtapa(id: string, etapaId: string, ordem: number, userId: string) {
  const n = await db.query.crmNegociacoes.findFirst({ where: eq(N.id, id), with: { etapa: true } });
  const e = await db.query.crmEtapas.findFirst({ where: eq(E.id, etapaId) });
  if (!n || !e || e.funilId !== n.funilId) return;
  await db.update(N).set({ etapaId, ordem, updatedAt: new Date() }).where(eq(N.id, id));
  if (n.etapaId !== etapaId) await registrar(id, userId, "etapa", `Moveu de "${n.etapa.nome}" para "${e.nome}"`);
}

/** Negociações em andamento ligadas a um telefone (para o atalho na conversa do WhatsApp). */
export async function negociacoesDoTelefone(tel: string) {
  const d = tel.replace(/\D/g, "");
  if (d.length < 8) return [];
  return db.query.crmNegociacoes.findMany({
    where: and(eq(N.status, "andamento"), sql`right(${N.telefone}, 8) = ${d.slice(-8)}`),
    columns: { id: true, titulo: true }, limit: 5,
  });
}

export async function tarefasAbertas(userId?: string) {
  const T = schema.crmTarefas;
  return db.query.crmTarefas.findMany({
    where: and(eq(T.concluida, false), userId ? eq(T.responsavelId, userId) : undefined),
    orderBy: asc(T.quando), limit: 50,
    with: { negociacao: { columns: { id: true, titulo: true, status: true } } },
  });
}

