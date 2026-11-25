import "server-only";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { AUTOMACOES, type AutomacaoChave, type AutomacaoConfig } from "./modelos";
import { cancelarFila, enfileirar, podeReceber } from "./envio";
import { filtroSegmento, registrarCompra, salvarContato, type Segmento } from "./contatos";
import { LOJAS, type LojaId } from "../lojas";

const A = schema.emailAutomacoes;

export async function lerAutomacao(chave: AutomacaoChave, loja: LojaId) {
  const row = await db.query.emailAutomacoes.findFirst({ where: eq(A.chave, `${chave}@${loja}`) });
  return { ativo: row?.ativo ?? false, config: (row?.config as AutomacaoConfig | undefined) ?? AUTOMACOES[chave].padrao };
}

export async function salvarAutomacao(chave: AutomacaoChave, loja: LojaId, ativo: boolean, config: AutomacaoConfig) {
  await db.insert(A).values({ chave: `${chave}@${loja}`, ativo, config })
    .onConflictDoUpdate({ target: A.chave, set: { ativo, config, updatedAt: new Date() } });
}

/* ------------------------------- Eventos da Shopify ------------------------------- */

type Checkout = {
  token?: string; email?: string | null; abandoned_checkout_url?: string; total_price?: string; completed_at?: string | null;
  customer?: { first_name?: string | null; last_name?: string | null } | null;
  billing_address?: { first_name?: string; last_name?: string; city?: string; province_code?: string; phone?: string } | null;
  line_items?: { title?: string; quantity?: number }[];
};

/** checkouts/create e checkouts/update: guarda o carrinho para a automação. */
export async function aoCheckout(loja: LojaId, c: Checkout) {
  if (!c.token || c.completed_at) return;
  const nome = [c.customer?.first_name ?? c.billing_address?.first_name, c.customer?.last_name ?? c.billing_address?.last_name].filter(Boolean).join(" ") || null;
  const dados = {
    email: c.email?.toLowerCase() ?? null, nome, url: c.abandoned_checkout_url ?? null, valor: Number(c.total_price) || 0,
    itens: (c.line_items ?? []).map((i) => ({ titulo: i.title, qtd: i.quantity })), updatedAt: new Date(),
  };
  await db.insert(schema.carrinhos).values({ id: c.token, loja, ...dados })
    .onConflictDoUpdate({ target: schema.carrinhos.id, set: dados });
}

type Pedido = {
  id?: number; name?: string; email?: string | null; created_at?: string; total_price?: string; checkout_token?: string | null;
  buyer_accepts_marketing?: boolean; cancelled_at?: string | null;
  customer?: { id?: number; first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
  shipping_address?: { city?: string; province_code?: string; phone?: string } | null;
};

/** orders/create: para o carrinho abandonado, registra a compra e começa o pós-compra. */
export async function aoPedido(loja: LojaId, p: Pedido) {
  if (p.checkout_token) {
    await db.update(schema.carrinhos).set({ recuperado: true, updatedAt: new Date() }).where(eq(schema.carrinhos.id, p.checkout_token));
    await cancelarFila({ referencia: `checkout:${p.checkout_token}` });
  }
  if (!p.email || p.cancelled_at) return;
  const contato = await salvarContato({
    email: p.email, nome: [p.customer?.first_name, p.customer?.last_name].filter(Boolean).join(" "),
    telefone: p.customer?.phone ?? p.shipping_address?.phone, cidade: p.shipping_address?.city, uf: p.shipping_address?.province_code,
    origem: "shopify", loja, shopifyId: p.customer?.id ? String(p.customer.id) : null,
    consentimento: p.buyer_accepts_marketing ? "Aceitou marketing na Shopify" : "Cliente da loja",
  });
  if (!contato) return;
  const ref = `pedido:${loja}:${p.id}`;
  const ja = await db.query.emailEnvios.findFirst({ where: eq(schema.emailEnvios.referencia, ref) });
  if (ja) return; // webhook repetido
  await registrarCompra(contato.id, p.created_at ? new Date(p.created_at) : new Date(), Number(p.total_price) || 0);
  // quem comprou não recebe mais a reativação que estava na fila
  await cancelarFila({ contatoId: contato.id, automacaoPrefixo: "reativacao" });

  const { ativo, config } = await lerAutomacao("poscompra", loja);
  if (!ativo) return;
  const base = Date.now();
  for (let i = 0; i < config.passos.length; i++) { const passo = config.passos[i];
    await enfileirar(contato, passo.assunto, passo.conteudo, {
      loja, automacao: `poscompra:${i}`, referencia: ref, agendadoPara: new Date(base + passo.esperaHoras * 3600_000),
      extra: { pedido: p.name ?? String(p.id ?? "") },
    });
  }
}

/* ------------------------------- Rotinas periódicas ------------------------------- */

/** Carrinhos parados há mais do que a espera do 1º passo entram na sequência. */
async function rodarCarrinho(loja: LojaId) {
  const { ativo, config } = await lerAutomacao("carrinho", loja);
  if (!ativo || !config.passos.length) return;
  const limite = new Date(Date.now() - config.passos[0].esperaHoras * 3600_000);
  const lista = await db.query.carrinhos.findMany({
    where: and(eq(schema.carrinhos.loja, loja), eq(schema.carrinhos.recuperado, false), eq(schema.carrinhos.automacaoIniciada, false),
      lte(schema.carrinhos.updatedAt, limite), gte(schema.carrinhos.updatedAt, new Date(Date.now() - 7 * 86400_000))),
    limit: 200,
  });
  for (const c of lista) {
    await db.update(schema.carrinhos).set({ automacaoIniciada: true }).where(eq(schema.carrinhos.id, c.id));
    if (!c.email || !c.url) continue;
    const contato = await salvarContato({ email: c.email, nome: c.nome, origem: "shopify", loja, consentimento: "Iniciou compra na loja" });
    if (!contato || !podeReceber(contato)) continue;
    const inicio = c.updatedAt.getTime();
    for (let i = 0; i < config.passos.length; i++) { const passo = config.passos[i];
      await enfileirar(contato, passo.assunto, passo.conteudo, {
        loja, automacao: `carrinho:${i}`, referencia: `checkout:${c.id}`,
        agendadoPara: new Date(Math.max(Date.now(), inicio + passo.esperaHoras * 3600_000)),
        extra: { link_carrinho: c.url },
      });
    }
  }
}

const ultimaReativacao: Record<string, number> = {};

/** Uma vez a cada 6 horas: quem não compra há N dias e não recebeu reativação no intervalo. */
async function rodarReativacao(loja: LojaId) {
  if (Date.now() - (ultimaReativacao[loja] ?? 0) < 6 * 3600_000) return;
  ultimaReativacao[loja] = Date.now();
  const { ativo, config } = await lerAutomacao("reativacao", loja);
  if (!ativo || !config.passos.length) return;
  const dias = config.diasSemCompra ?? 120;
  const intervalo = config.intervaloDias ?? 90;
  const seg: Segmento = { semCompraDias: dias, loja };
  const K = schema.contatos;
  const candidatos = await db.select().from(K).where(and(
    filtroSegmento(seg),
    sql`not exists (select 1 from email_envios e where e.contato_id = ${K.id} and e.automacao like 'reativacao%'
         and e.loja = ${loja} and e.created_at > now() - make_interval(days => ${intervalo}))`,
  )).limit(300);
  for (const c of candidatos) {
    for (let i = 0; i < config.passos.length; i++) { const passo = config.passos[i];
      await enfileirar(c, passo.assunto, passo.conteudo, {
        loja, automacao: `reativacao:${i}`, agendadoPara: new Date(Date.now() + passo.esperaHoras * 3600_000),
      });
    }
  }
}

/** Campanhas agendadas cuja hora chegou: gera a fila de envio. */
export async function dispararCampanha(id: string) {
  const C = schema.emailCampanhas;
  const camp = await db.query.emailCampanhas.findFirst({ where: eq(C.id, id) });
  if (!camp || !["agendada", "rascunho"].includes(camp.status)) return 0;
  await db.update(C).set({ status: "enviando" }).where(eq(C.id, id));
  const lista = await db.select().from(schema.contatos).where(filtroSegmento({ ...(camp.segmento as Segmento), loja: camp.loja as LojaId }));
  let n = 0;
  for (const c of lista) {
    if (await enfileirar(c, camp.assunto, camp.conteudo as never, { loja: camp.loja as LojaId, campanhaId: camp.id })) n++;
  }
  await db.update(C).set({ totalDestinatarios: n, ...(n === 0 ? { status: "enviada", enviadaEm: new Date() } : {}) }).where(eq(C.id, id));
  return n;
}

async function rodarCampanhasAgendadas() {
  const C = schema.emailCampanhas;
  const prontas = await db.query.emailCampanhas.findMany({ where: and(eq(C.status, "agendada"), lte(C.agendadaPara, new Date())) });
  for (const c of prontas) await dispararCampanha(c.id);
}

export async function rodarAutomacoes() {
  await rodarCampanhasAgendadas();
  for (const l of LOJAS) {
    await rodarCarrinho(l.id);
    await rodarReativacao(l.id);
  }
}

