import "server-only";
import { and, arrayOverlaps, eq, gte, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import { db, schema } from "../db";
import { getConfig } from "../integrations/store";
import { clientesShopify, pedidosShopify } from "../integrations/shopify";
import { listarClientes, listarPedidosVenda } from "../integrations/omie";
import { linhasDaPlanilha } from "../produtos";
import { chaveLoja, nomeLoja, type LojaId } from "../lojas";

const K = schema.contatos;
export type Contato = typeof K.$inferSelect;
export type Origem = "shopify" | "omie" | "whatsapp" | "planilha" | "formulario" | "manual";
export const ORIGENS: Record<Origem, string> = {
  shopify: "Shopify", omie: "Omie", whatsapp: "WhatsApp", planilha: "Planilha", formulario: "Formulário do site", manual: "Cadastro manual",
};

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
export const emailValido = (e: string) => EMAIL_RE.test(e) && e.length <= 254;
const limpa = (s: unknown) => { const t = String(s ?? "").trim(); return t || null; };

export type NovoContato = {
  email: string; nome?: string | null; telefone?: string | null; cidade?: string | null; uf?: string | null;
  origem: Origem; loja?: LojaId; tags?: string[]; consentimento?: string | null; descadastrado?: boolean;
  shopifyId?: string | null; omieId?: string | null;
};

/** Cria ou completa um contato. Não apaga dados que já existem; descadastro nunca é desfeito aqui. */
export async function salvarContato(n: NovoContato) {
  const email = n.email.trim().toLowerCase();
  if (!emailValido(email)) return null;
  const atual = await db.query.contatos.findFirst({ where: eq(K.email, email) });
  if (!atual) {
    const [c] = await db.insert(K).values({
      email, nome: limpa(n.nome), telefone: limpa(n.telefone), cidade: limpa(n.cidade), uf: limpa(n.uf)?.toUpperCase() ?? null,
      origens: [n.origem], lojas: n.loja ? [n.loja] : [], tags: n.tags ?? [], consentimento: limpa(n.consentimento),
      descadastradoEm: n.descadastrado ? new Date() : null, shopifyId: n.shopifyId ?? null, omieId: n.omieId ?? null,
    }).onConflictDoNothing().returning();
    return c ?? null;
  }
  const [c] = await db.update(K).set({
    nome: atual.nome ?? limpa(n.nome), telefone: atual.telefone ?? limpa(n.telefone),
    cidade: atual.cidade ?? limpa(n.cidade), uf: atual.uf ?? (limpa(n.uf)?.toUpperCase() ?? null),
    origens: Array.from(new Set([...atual.origens, n.origem])),
    lojas: Array.from(new Set([...atual.lojas, ...(n.loja ? [n.loja] : [])])),
    tags: Array.from(new Set([...atual.tags, ...(n.tags ?? [])])),
    consentimento: atual.consentimento ?? limpa(n.consentimento),
    descadastradoEm: atual.descadastradoEm ?? (n.descadastrado ? new Date() : null),
    shopifyId: atual.shopifyId ?? n.shopifyId ?? null, omieId: atual.omieId ?? n.omieId ?? null,
    updatedAt: new Date(),
  }).where(eq(K.id, atual.id)).returning();
  return c;
}

/** Registra uma compra no histórico do contato (para reativação e segmentos). */
export async function registrarCompra(contatoId: string, quando: Date, valor: number) {
  await db.update(K).set({
    totalPedidos: sql`${K.totalPedidos} + 1`, totalGasto: sql`${K.totalGasto} + ${valor}`,
    ultimaCompraEm: sql`greatest(${K.ultimaCompraEm}, ${quando.toISOString()}::timestamptz)`, updatedAt: new Date(),
  }).where(eq(K.id, contatoId));
}

/* ---------------------------------- Shopify ---------------------------------- */

export async function sincronizarShopify(loja: LojaId) {
  const cfg = await getConfig(chaveLoja("shopify", loja));
  if (!cfg) throw new Error(`Conecte a Shopify da ${nomeLoja(loja)} em Integrações.`);
  let total = 0;
  for await (const lote of clientesShopify(cfg)) {
    for (const c of lote) {
      if (!c.email) continue;
      const estado = c.email_marketing_consent?.state;
      const ok = await salvarContato({
        email: c.email, nome: [c.first_name, c.last_name].filter(Boolean).join(" "), telefone: c.phone ?? c.default_address?.phone,
        cidade: c.default_address?.city, uf: c.default_address?.province_code, origem: "shopify", loja, shopifyId: String(c.id),
        consentimento: estado === "subscribed" ? "Aceitou marketing na Shopify" : "Cliente da loja",
        descadastrado: estado === "unsubscribed",
      });
      if (ok) total++;
    }
  }
  // histórico de compras dos últimos 2 anos (recalcula do zero para quem veio da Shopify)
  const desde = new Date(Date.now() - 730 * 86400_000);
  const porEmail = new Map<string, { n: number; v: number; ult: Date }>();
  for await (const lote of pedidosShopify(cfg, desde)) {
    for (const p of lote) {
      if (!p.email || p.cancelled_at) continue;
      const k = p.email.toLowerCase();
      const a = porEmail.get(k) ?? { n: 0, v: 0, ult: new Date(0) };
      const d = new Date(p.created_at);
      porEmail.set(k, { n: a.n + 1, v: a.v + (Number(p.total_price) || 0), ult: d > a.ult ? d : a.ult });
    }
  }
  for (const [email, h] of Array.from(porEmail)) {
    await db.update(K).set({
      totalPedidos: sql`greatest(${K.totalPedidos}, ${h.n})`, totalGasto: sql`greatest(${K.totalGasto}, ${h.v})`,
      ultimaCompraEm: sql`greatest(${K.ultimaCompraEm}, ${h.ult.toISOString()}::timestamptz)`,
    }).where(eq(K.email, email));
  }
  return { total, comPedidos: porEmail.size };
}

/* ----------------------------------- Omie ----------------------------------- */

export async function sincronizarOmieClientes(loja: LojaId) {
  const cfg = await getConfig(chaveLoja("omie", loja));
  if (!cfg) throw new Error(`Conecte o Omie da ${nomeLoja(loja)} em Integrações.`);
  const clientes = await listarClientes(cfg);
  const porCodigo = new Map<number, string>();
  let total = 0;
  for (const c of clientes) {
    // o campo pode ter mais de um e-mail separado por vírgula ou ponto e vírgula
    const email = String(c.email ?? "").split(/[;,\s]+/).find((e) => emailValido(e.trim()));
    if (!email || c.inativo === "S") continue;
    const ok = await salvarContato({
      email, nome: c.nome_fantasia || c.razao_social, cidade: c.cidade, uf: c.estado,
      telefone: c.telefone1_numero ? `${c.telefone1_ddd ?? ""}${c.telefone1_numero}`.replace(/\D/g, "") : null,
      origem: "omie", loja, omieId: c.codigo_cliente_omie ? String(c.codigo_cliente_omie) : null, consentimento: "Cliente no Omie",
    });
    if (ok) { total++; if (c.codigo_cliente_omie) porCodigo.set(c.codigo_cliente_omie, ok.id); }
  }
  // última compra pelos pedidos de venda dos últimos 2 anos (não impede a sincronização se falhar)
  let comPedidos = 0;
  try {
    const pedidos = await listarPedidosVenda(cfg, new Date(Date.now() - 730 * 86400_000));
    const hist = new Map<string, { n: number; v: number; ult: Date }>();
    for (const p of pedidos) {
      const id = p.cabecalho?.codigo_cliente ? porCodigo.get(p.cabecalho.codigo_cliente) : undefined;
      if (!id || p.infoCadastro?.cancelado === "S") continue;
      const [dd, mm, yy] = String(p.infoCadastro?.dInc ?? p.cabecalho?.data_previsao ?? "").split("/").map(Number);
      if (!yy) continue;
      const d = new Date(yy, mm - 1, dd);
      const a = hist.get(id) ?? { n: 0, v: 0, ult: new Date(0) };
      hist.set(id, { n: a.n + 1, v: a.v + (p.total_pedido?.valor_total_pedido ?? 0), ult: d > a.ult ? d : a.ult });
    }
    for (const [id, h] of Array.from(hist)) {
      await db.update(K).set({
        totalPedidos: sql`greatest(${K.totalPedidos}, ${h.n})`, totalGasto: sql`greatest(${K.totalGasto}, ${h.v})`,
        ultimaCompraEm: sql`greatest(${K.ultimaCompraEm}, ${h.ult.toISOString()}::timestamptz)`,
      }).where(eq(K.id, id));
    }
    comPedidos = hist.size;
  } catch (e) {
    console.error("Omie pedidos:", e instanceof Error ? e.message : e);
  }
  return { total, comPedidos };
}

/* --------------------------------- WhatsApp --------------------------------- */

/** Procura e-mails que os clientes escreveram nas conversas. */
export async function extrairDoWhatsApp(loja: LojaId) {
  const msgs = await db.select({ chat: schema.waMessages.chat, text: schema.waMessages.text, nome: schema.waChats.name })
    .from(schema.waMessages)
    .leftJoin(schema.waChats, eq(schema.waChats.chat, schema.waMessages.chat))
    .where(and(eq(schema.waMessages.fromMe, false), sql`${schema.waMessages.text} ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}'`));
  let total = 0;
  for (const m of msgs) {
    for (const email of m.text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) {
      const ok = await salvarContato({
        email, nome: m.nome, telefone: /^\d+$/.test(m.chat) ? m.chat : null, origem: "whatsapp", loja,
        consentimento: "Informou o e-mail no WhatsApp",
      });
      if (ok) total++;
    }
  }
  return { total };
}

/* --------------------------------- Planilha --------------------------------- */

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const COL: Record<string, (h: string) => boolean> = {
  email: (h) => h === "email" || h === "e mail" || h.startsWith("email") || h.startsWith("e mail"),
  nome: (h) => h === "nome" || h === "name" || h.startsWith("nome completo") || h === "razao social" || h === "cliente",
  telefone: (h) => h.includes("celular") || h.includes("whatsapp") || h.startsWith("telefone") || h === "fone",
  cidade: (h) => h === "cidade" || h === "city",
  uf: (h) => h === "uf" || h === "estado" || h === "state",
  tags: (h) => h === "tags" || h === "tag" || h === "etiquetas",
};

/** Importa contatos de planilha (.xlsx/.csv), inclusive a exportação de leads do RD Station. */
export async function importarContatos(arquivo: File, tagsExtra: string[], consentimento: string, loja: LojaId) {
  const rows = await linhasDaPlanilha(arquivo);
  let h = -1, mapa: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const hs = rows[i].map(norm);
    const m: Record<string, number> = {};
    for (const [k, t] of Object.entries(COL)) { const j = hs.findIndex(t); if (j >= 0) m[k] = j; }
    if (m.email !== undefined) { h = i; mapa = m; break; }
  }
  if (h < 0) throw new Error("Não achei a coluna de e-mail na planilha.");
  let total = 0, invalidos = 0;
  for (const r of rows.slice(h + 1)) {
    const g = (k: string) => (mapa[k] === undefined ? null : String(r[mapa[k]] ?? "").trim() || null);
    const email = g("email");
    if (!email) continue;
    const tags = [...tagsExtra, ...(g("tags")?.split(/[,;|]/).map((t) => t.trim().toLowerCase()).filter(Boolean) ?? [])];
    const ok = await salvarContato({
      email, nome: g("nome"), telefone: g("telefone")?.replace(/\D/g, "") || null, cidade: g("cidade"), uf: g("uf")?.slice(0, 2),
      origem: "planilha", loja, tags, consentimento,
    });
    if (ok) total++; else invalidos++;
  }
  return { total, invalidos };
}

/* --------------------------------- Segmentos --------------------------------- */

export type Segmento = {
  origens?: Origem[]; // qualquer uma
  tags?: string[]; // qualquer uma
  compras?: "todos" | "compraram" | "nunca";
  semCompraDias?: number; // última compra há mais de N dias
  compraUltimosDias?: number; // comprou nos últimos N dias
  uf?: string;
  loja?: LojaId; // só contatos ligados a esta loja
};

export function filtroSegmento(s: Segmento): SQL {
  const conds: SQL[] = [isNull(K.descadastradoEm), eq(K.bounce, false)];
  if (s.origens?.length) conds.push(arrayOverlaps(K.origens, s.origens));
  if (s.tags?.length) conds.push(arrayOverlaps(K.tags, s.tags));
  if (s.compras === "compraram") conds.push(isNotNull(K.ultimaCompraEm));
  if (s.compras === "nunca") conds.push(isNull(K.ultimaCompraEm));
  if (s.semCompraDias) conds.push(lt(K.ultimaCompraEm, new Date(Date.now() - s.semCompraDias * 86400_000)));
  if (s.compraUltimosDias) conds.push(gte(K.ultimaCompraEm, new Date(Date.now() - s.compraUltimosDias * 86400_000)));
  if (s.uf) conds.push(eq(K.uf, s.uf.toUpperCase()));
  if (s.loja) conds.push(arrayOverlaps(K.lojas, [s.loja]));
  return and(...conds)!;
}

export async function contarSegmento(s: Segmento) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(K).where(filtroSegmento(s));
  return n;
}

export async function todasTags() {
  const r = await db.execute<{ tag: string }>(sql`select distinct unnest(tags) as tag from contatos order by 1`);
  return (r as unknown as { tag: string }[]).map((x) => x.tag);
}

