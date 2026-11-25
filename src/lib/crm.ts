import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { getSetting } from "./settings";
import { dispararDepois } from "./automacoes/motor";

/** Funil de vendas no estilo do RD Station CRM: funis, etapas, negociações, tarefas e histórico. */

export const ETAPAS_PADRAO = ["Sem contato", "Contato feito", "Orçamento enviado", "Negociação", "Fechamento"];
export const MOTIVOS_PADRAO = ["Preço", "Frete caro", "Prazo de entrega", "Comprou do concorrente", "Sem resposta", "Desistiu da obra", "Outro"];
export const FONTES = ["WhatsApp", "Telefone", "Loja física", "Site", "Loja (Shopify)", "Indicação", "Google Ads", "Instagram", "Outro"];
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
  if (f.busca) {
    const t = "%" + f.busca + "%", dig = f.busca.replace(/\D/g, "");
    const porNumero = dig.length >= 3 ? sql` or ${N.telefone} like ${"%" + dig + "%"} or ${N.documento} like ${"%" + dig + "%"}` : sql``;
    conds.push(sql`(${N.titulo} ilike ${t} or ${N.contato} ilike ${t} or ${N.empresa} ilike ${t}${porNumero})`);
  }
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
  if (n.etapaId !== etapaId) {
    await registrar(id, userId, "etapa", `Moveu de "${n.etapa.nome}" para "${e.nome}"`);
    dispararDepois("crm.etapa", { negociacaoId: id, etapaId, etapa: e.nome, nome: n.contato, telefone: n.telefone, email: n.email, loja: n.loja }, `${id}:${etapaId}:${Date.now()}`);
  }
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


// ───────── Lead automático pelo WhatsApp (CPF/CNPJ na conversa) ─────────

function cpfValido(d: string) {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  for (const t of [9, 10]) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(d[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(d[t])) return false;
  }
  return true;
}
function cnpjValido(d: string) {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  for (const t of [12, 13]) {
    let s = 0, p = t - 7;
    for (let i = 0; i < t; i++) { s += Number(d[i]) * p--; if (p < 2) p = 9; }
    const dv = s % 11 < 2 ? 0 : 11 - (s % 11);
    if (dv !== Number(d[t])) return false;
  }
  return true;
}

/** Procura um CPF ou CNPJ válido no texto (com ou sem pontuação). */
export function acharDocumento(texto: string): { tipo: "CPF" | "CNPJ"; numero: string } | null {
  const candidatos = texto.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g) ?? [];
  for (const c of candidatos) {
    const d = c.replace(/\D/g, "");
    if (d.length === 14 && cnpjValido(d)) return { tipo: "CNPJ", numero: d };
    if (d.length === 11 && cpfValido(d)) return { tipo: "CPF", numero: d };
  }
  return null;
}

export const formatarDoc = (d: string) =>
  d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
  : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;

/** Nome da empresa na Receita (BrasilAPI, gratuita). Se falhar, segue sem. */
async function empresaDoCnpj(cnpj: string) {
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return { nome: String(j.nome_fantasia || j.razao_social || "").trim() || null, razao: j.razao_social ?? null, cidade: j.municipio ?? null, uf: j.uf ?? null };
  } catch { return null; }
}

/**
 * Chamado a cada mensagem do cliente. Se ele mandou CPF/CNPJ e ainda não há negociação em andamento
 * para esse telefone ou documento, cria o lead na primeira etapa do funil principal.
 */
const filaLead = new Map<string, Promise<unknown>>();
export function leadDoWhatsApp(p: { chat: string; nome?: string | null; texto: string }) {
  // Uma mensagem por conversa de cada vez, para duas mensagens seguidas não criarem dois leads.
  const antes = filaLead.get(p.chat) ?? Promise.resolve();
  const agora = antes.catch(() => null).then(() => criarLeadDoWhatsApp(p));
  filaLead.set(p.chat, agora);
  agora.finally(() => { if (filaLead.get(p.chat) === agora) filaLead.delete(p.chat); }).catch(() => null);
  return agora;
}

async function criarLeadDoWhatsApp(p: { chat: string; nome?: string | null; texto: string }) {
  if ((await getSetting("crm.leadAutomatico")) === "nao") return null;
  const doc = acharDocumento(p.texto);
  if (!doc) return null;
  const tel = p.chat.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  const abertas = await negociacoesDoTelefone(tel);
  if (abertas.length) {
    // Já existe: só anota o documento, se faltar.
    await db.update(N).set({ documento: doc.numero }).where(and(eq(N.id, abertas[0].id), sql`${N.documento} is null`));
    return null;
  }
  if (await db.query.crmNegociacoes.findFirst({ where: and(eq(N.status, "andamento"), eq(N.documento, doc.numero)), columns: { id: true } })) return null;

  const [funil] = await garantirFunil();
  const etapa = await db.query.crmEtapas.findFirst({ where: eq(schema.crmEtapas.funilId, funil.id), orderBy: asc(schema.crmEtapas.ordem) });
  if (!etapa) return null;
  const emp = doc.tipo === "CNPJ" ? await empresaDoCnpj(doc.numero) : null;
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(${N.ordem}), 0)` }).from(N).where(eq(N.etapaId, etapa.id));
  const titulo = `${emp?.nome || p.nome || formatarDoc(doc.numero)} — WhatsApp`;
  const [n] = await db.insert(N).values({
    funilId: funil.id, etapaId: etapa.id, titulo, contato: p.nome ?? null, empresa: emp?.razao ?? null,
    telefone: tel, documento: doc.numero, fonte: "WhatsApp", valor: 0, ordem: Number(m) + 1,
  }).returning({ id: N.id });
  await registrar(n.id, null, "criada",
    `Lead criado automaticamente: o cliente informou o ${doc.tipo} ${formatarDoc(doc.numero)} no WhatsApp.` +
    (emp ? ` Empresa: ${emp.razao}${emp.cidade ? ` (${emp.cidade}/${emp.uf})` : ""}.` : ""));
  const P = schema.pedidos;
  const [{ q }] = await db.select({ q: sql<number>`count(*)::int` }).from(P).where(sql`regexp_replace(coalesce(${P.documento}, ''), '\\D', '', 'g') = ${doc.numero}`);
  if (q > 0) await registrar(n.id, null, "nota", `Já é cliente: ${q} pedido(s) anteriores com esse ${doc.tipo}.`);
  dispararDepois("crm.lead_criado", { negociacaoId: n.id, etapaId: etapa.id, etapa: etapa.nome, nome: p.nome ?? null, telefone: tel, chat: p.chat }, n.id);
  return n.id;
}
