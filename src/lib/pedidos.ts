import "server-only";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db, schema } from "./db";
import { call } from "./integrations/omie";
import { getConfig, type Config } from "./integrations/store";
import { getSetting } from "./settings";
import { chaveLoja, LOJAS, nomeLoja, type LojaId } from "./lojas";
import { omieDaLoja } from "./lojas-server";
import { atualizarEstoque } from "./produtos";

/** Fase 2: pedidos da Shopify entrando no Omie. */

type Endereco = { first_name?: string; last_name?: string; company?: string | null; address1?: string; address2?: string | null; city?: string;
  province_code?: string; zip?: string; phone?: string | null; name?: string };
export type PedidoShopify = {
  id: number; name: string; email?: string | null; created_at: string; total_price?: string; financial_status?: string; cancelled_at?: string | null;
  note?: string | null; note_attributes?: { name: string; value: string }[];
  customer?: { first_name?: string | null; last_name?: string | null; phone?: string | null; note?: string | null } | null;
  billing_address?: Endereco | null; shipping_address?: Endereco | null;
  line_items: { id: number; sku?: string | null; title: string; variant_title?: string | null; quantity: number; price: string;
    total_discount?: string; discount_allocations?: { amount: string }[] }[];
  shipping_lines?: { price: string; title?: string }[];
};

const P = schema.pedidos;
const so = (s?: string | null) => String(s ?? "").replace(/\D/g, "");

/** CPF/CNPJ: campos extras do checkout (note_attributes), empresa do endereço ou observação. */
export function documentoDo(o: PedidoShopify) {
  const cand = [
    ...(o.note_attributes ?? []).filter((a) => /cpf|cnpj|documento/i.test(a.name)).map((a) => a.value),
    o.billing_address?.company, o.shipping_address?.company, o.note, o.customer?.note,
  ];
  for (const c of cand) {
    const m = String(c ?? "").match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    if (m) { const d = so(m[0]); if (d.length === 11 || d.length === 14) return d; }
  }
  return null;
}

/** Recebe/atualiza o pedido vindo do webhook. Se o envio automático estiver ligado e o pedido estiver pago, já manda para o Omie. */
export async function registrarPedido(loja: LojaId, o: PedidoShopify) {
  if (!o?.id) return;
  const nome = [o.customer?.first_name ?? o.billing_address?.first_name, o.customer?.last_name ?? o.billing_address?.last_name].filter(Boolean).join(" ");
  const dados = {
    numero: o.name, cliente: nome || null, email: o.email ?? null, total: Number(o.total_price) || 0,
    pagamento: o.financial_status ?? null, payload: o as unknown as Record<string, unknown>, updatedAt: new Date(),
  };
  const atual = await db.query.pedidos.findFirst({ where: and(eq(P.loja, loja), eq(P.shopifyId, String(o.id))) });
  let id = atual?.id;
  if (!atual) {
    const [r] = await db.insert(P).values({
      loja, shopifyId: String(o.id), ...dados, documento: documentoDo(o), criadoNaLoja: new Date(o.created_at),
      status: o.cancelled_at ? "ignorado" : "pendente",
    }).onConflictDoNothing().returning({ id: P.id });
    id = r?.id;
  } else {
    await db.update(P).set({ ...dados, documento: atual.documento ?? documentoDo(o), ...(o.cancelled_at && atual.status === "pendente" ? { status: "ignorado" } : {}) })
      .where(eq(P.id, atual.id));
  }
  if (id && o.financial_status === "paid" && !o.cancelled_at && (await getSetting(`pedidos.${loja}.automatico`)) === "sim") {
    const p = await db.query.pedidos.findFirst({ where: eq(P.id, id) });
    if (p && (p.status === "pendente" || (p.status === "erro" && p.tentativas < 3))) await enviarAoOmie(id).catch(() => {});
  }
}

/* ------------------------------- Envio ao Omie ------------------------------- */

async function codigoClienteOmie(cfg: Config, o: PedidoShopify, documento: string) {
  const e = o.billing_address ?? o.shipping_address ?? {};
  const nome = [e.first_name, e.last_name].filter(Boolean).join(" ") || [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(" ") || "Cliente Shopify";
  const tel = so(e.phone ?? o.customer?.phone).replace(/^55(?=\d{10,11}$)/, "");
  const r = await call<{ codigo_cliente_omie: number }>(cfg, "geral/clientes/", "UpsertClienteCpfCnpj", {
    cnpj_cpf: documento, razao_social: (documento.length === 14 && e.company && !/\d{5}/.test(e.company) ? e.company : nome).slice(0, 60),
    nome_fantasia: nome.slice(0, 100), email: o.email ?? "", pessoa_fisica: documento.length === 11 ? "S" : "N",
    telefone1_ddd: tel.slice(0, 2), telefone1_numero: tel.slice(2),
    endereco: (e.address1 ?? "").slice(0, 60), complemento: (e.address2 ?? "").slice(0, 60),
    cidade: e.city ?? "", estado: e.province_code ?? "", cep: so(e.zip), codigo_pais: "1058",
  });
  return r.codigo_cliente_omie;
}

async function codigoProdutoOmie(cfg: Config, destino: LojaId, sku: string) {
  const local = await db.query.produtos.findFirst({ where: and(eq(schema.produtos.loja, destino), eq(schema.produtos.codigo, sku)) });
  if (local?.omieId) return Number(local.omieId);
  const r = await call<{ codigo_produto: number }>(cfg, "geral/produtos/", "ConsultarProduto", { codigo: sku });
  return r.codigo_produto;
}

const hojeBR = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export async function enviarAoOmie(pedidoId: string) {
  const p = await db.query.pedidos.findFirst({ where: eq(P.id, pedidoId) });
  if (!p) throw new Error("Pedido não encontrado.");
  if (p.status === "enviado") return p;
  const loja = p.loja as LojaId;
  const o = p.payload as unknown as PedidoShopify;
  const falha = async (msg: string) => {
    await db.update(P).set({ status: "erro", erro: msg.slice(0, 500), tentativas: p.tentativas + 1, updatedAt: new Date() }).where(eq(P.id, p.id));
    throw new Error(msg);
  };
  const { cfg, destino } = await omieDaLoja(loja);
  if (!cfg) return falha(`Nenhum Omie conectado para receber os pedidos da ${nomeLoja(loja)}.`);
  const [contaCorrente, categoria] = await Promise.all([getSetting(`pedidos.${loja}.contaCorrente`), getSetting(`pedidos.${loja}.categoria`)]);
  if (!contaCorrente || !categoria) return falha("Escolha a conta corrente e a categoria em Pedidos › Configuração.");
  if (!p.documento) return falha("Pedido sem CPF/CNPJ. Informe o documento no pedido e envie de novo.");
  const semSku = o.line_items.filter((i) => !i.sku);
  if (semSku.length) return falha(`Item sem SKU na Shopify: ${semSku.map((i) => i.title).join(", ")}. O SKU precisa ser igual ao código do produto no Omie.`);

  try {
    const cliente = await codigoClienteOmie(cfg, o, p.documento);
    const det = [];
    for (let n = 0; n < o.line_items.length; n++) { const i = o.line_items[n];
      const desconto = (i.discount_allocations ?? []).reduce((s, d) => s + Number(d.amount || 0), 0) || Number(i.total_discount || 0);
      det.push({
        ide: { codigo_item_integracao: `${o.id}-${i.id}` },
        produto: {
          codigo_produto: await codigoProdutoOmie(cfg, destino, i.sku!.trim()),
          quantidade: i.quantity, valor_unitario: Number(i.price),
          ...(desconto > 0 ? { tipo_desconto: "V", valor_desconto: Math.round(desconto * 100) / 100 } : {}),
        },
        inf_adic: { item_pedido_compra: n + 1 },
      });
    }
    const frete = (o.shipping_lines ?? []).reduce((s, l) => s + Number(l.price || 0), 0);
    const r = await call<{ codigo_pedido: number; numero_pedido: string }>(cfg, "produtos/pedido/", "IncluirPedido", {
      cabecalho: {
        codigo_cliente: cliente, codigo_pedido_integracao: `${loja}-${o.id}`, data_previsao: hojeBR(),
        etapa: "10", codigo_parcela: "000", quantidade_itens: det.length,
      },
      det,
      frete: frete > 0 ? { modalidade: "0", valor_frete: Math.round(frete * 100) / 100 } : { modalidade: "9" },
      informacoes_adicionais: { codigo_categoria: categoria, codigo_conta_corrente: Number(contaCorrente), consumidor_final: "S", enviar_email: "N" },
      observacoes: { obs_venda: `Pedido ${o.name} da ${nomeLoja(loja)} (Shopify)` },
    });
    await db.update(P).set({
      status: "enviado", omieDestino: destino, omiePedido: String(r.codigo_pedido), omieNumero: r.numero_pedido ?? null,
      erro: null, tentativas: p.tentativas + 1, updatedAt: new Date(),
    }).where(eq(P.id, p.id));
    return { ...p, status: "enviado" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/já (foi )?cadastrad|already/i.test(msg)) {
      await db.update(P).set({ status: "enviado", omieDestino: destino, erro: null, updatedAt: new Date() }).where(eq(P.id, p.id));
      return { ...p, status: "enviado" };
    }
    return falha(`Omie: ${msg}`);
  }
}

/* ----------------------------- Importar e rotinas ----------------------------- */

/** Traz os pedidos dos últimos N dias da Shopify (para quem ainda não tinha o webhook). */
export async function importarPedidos(loja: LojaId, dias = 30) {
  const cfg = await getConfig(chaveLoja("shopify", loja));
  if (!cfg) throw new Error(`Conecte a Shopify da ${nomeLoja(loja)}.`);
  const shop = cfg.shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
  let url: string | null = `https://${shop}/admin/api/${cfg.apiVersion || "2025-01"}/orders.json?status=any&limit=250&created_at_min=${new Date(Date.now() - dias * 86400_000).toISOString()}`;
  let n = 0;
  for (let i = 0; url && i < 40; i++) {
    const res: Response = await fetch(url, { headers: { "X-Shopify-Access-Token": cfg.accessToken }, cache: "no-store" });
    if (!res.ok) throw new Error(`Shopify respondeu ${res.status}`);
    const { orders } = (await res.json()) as { orders: PedidoShopify[] };
    for (const o of orders) {
      const ja = await db.query.pedidos.findFirst({ where: and(eq(P.loja, loja), eq(P.shopifyId, String(o.id))) });
      if (!ja) { await registrarPedido(loja, o); n++; }
    }
    url = res.headers.get("link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }
  return n;
}

const ultima: Record<string, number> = {};

/** Rodado pelo worker a cada minuto: reenvia erros temporários e sincroniza estoque a cada hora. */
export async function rotinasPedidos() {
  for (const l of LOJAS) {
    if ((await getSetting(`pedidos.${l.id}.automatico`)) === "sim") {
      const pendentes = await db.query.pedidos.findMany({
        where: and(eq(P.loja, l.id), inArray(P.status, ["pendente", "erro"]), lt(P.tentativas, 3), eq(P.pagamento, "paid"),
          lt(P.updatedAt, new Date(Date.now() - 10 * 60_000))),
        orderBy: desc(P.criadoNaLoja), limit: 10,
      });
      for (const p of pendentes) await enviarAoOmie(p.id).catch(() => {});
    }
    if ((await getSetting(`estoque.${l.id}.automatico`)) === "sim" && Date.now() - (ultima[l.id] ?? 0) > 3600_000) {
      ultima[l.id] = Date.now();
      await atualizarEstoque(l.id, true).catch((e) => console.error("estoque:", e instanceof Error ? e.message : e));
    }
  }
}

/* ---------------------------- Listas do Omie (config) ---------------------------- */

export async function contasECategorias(loja: LojaId) {
  const { cfg } = await omieDaLoja(loja);
  if (!cfg) return null;
  const [cc, cat] = await Promise.all([
    call<{ ListarContasCorrentes?: { nCodCC: number; descricao: string; inativo?: string }[] }>(cfg, "geral/contacorrente/", "ListarContasCorrentes",
      { pagina: 1, registros_por_pagina: 100, apenas_importado_api: "N" }).catch(() => ({ ListarContasCorrentes: [] })),
    call<{ categoria_cadastro?: { codigo: string; descricao: string; conta_inativa?: string; conta_receita?: string }[] }>(cfg, "geral/categorias/", "ListarCategorias",
      { pagina: 1, registros_por_pagina: 500 }).catch(() => ({ categoria_cadastro: [] })),
  ]);
  return {
    contas: (cc.ListarContasCorrentes ?? []).filter((c) => c.inativo !== "S").map((c) => ({ id: String(c.nCodCC), nome: c.descricao })),
    categorias: (cat.categoria_cadastro ?? []).filter((c) => c.conta_inativa !== "S" && (c.conta_receita === "S" || c.codigo.startsWith("1."))).map((c) => ({ id: c.codigo, nome: `${c.codigo} · ${c.descricao}` })),
  };
}
