import "server-only";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { contextoManuais } from "./manuais";
import { nomeLoja, type LojaId } from "./lojas";
import { shopifyDaLoja } from "./lojas-server";
import { pedidoPorNumero } from "./integrations/shopify";
import type { PedidoShopify } from "./pedidos";

/**
 * Fase 5: dados reais do hub para a IA do WhatsApp responder (estoque, preço, status de pedido, manuais).
 * O texto volta pronto para ser anexado às instruções do atendente.
 */

const so = (s?: string | null) => String(s ?? "").replace(/\D/g, "");
const mesmoTelefone = (a: string, b: string) => a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function produtos(texto: string) {
  const palavras = Array.from(new Set(texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{4,}/g) ?? [])).slice(0, 8);
  if (!palavras.length) return "";
  const P = schema.produtos;
  const rows = await db.select().from(P)
    .where(and(eq(P.ativo, true), or(...palavras.map((w) => ilike(sql`unaccent(${P.descricao})`, `%${w}%`)))))
    .limit(8);
  if (!rows.length) return "";
  return rows.map((p) => {
    const est = p.estoque === null ? "estoque não informado" : p.estoque > 0 ? `${p.estoque} em estoque` : "SEM estoque no momento";
    return `- ${p.descricao} (${nomeLoja(p.loja)}): ${p.valorUnit ? brl(p.valorUnit) : "preço sob consulta"}, ${est}${p.pesoKg ? `, ${p.pesoKg} kg` : ""}`;
  }).join("\n");
}

async function pedidos(texto: string, chat: string) {
  const nums = Array.from(new Set((texto.match(/(?:#|pedido\s*(?:n[ºo°.]?\s*)?)(\d{3,7})/gi) ?? []).map((m) => m.replace(/\D/g, "")))).slice(0, 2);
  if (!nums.length) return "";
  const linhas: string[] = [];
  for (const n of nums) {
    const p = await db.query.pedidos.findFirst({ where: or(eq(schema.pedidos.numero, `#${n}`), eq(schema.pedidos.numero, n)) });
    if (!p) { linhas.push(`- Pedido ${n}: não encontrado no sistema.`); continue; }
    const o = p.payload as unknown as PedidoShopify;
    const tels = [o.customer?.phone, o.billing_address?.phone, o.shipping_address?.phone].map(so);
    if (!tels.some((t) => mesmoTelefone(t, so(chat)))) {
      linhas.push(`- Pedido ${p.numero}: existe, mas o telefone desta conversa não é o do pedido. NÃO informe dados do pedido; peça que um atendente confirme.`);
      continue;
    }
    let envio = "";
    const cfg = await shopifyDaLoja(p.loja as LojaId);
    if (cfg) {
      const s = await pedidoPorNumero(cfg, p.numero).catch(() => null);
      const rastreio = s?.fulfillments.flatMap((f) => f.trackingInfo).find((t) => t.number);
      if (s) envio = `, entrega: ${s.displayFulfillmentStatus}${rastreio ? `, rastreio ${rastreio.company ?? ""} ${rastreio.number}${rastreio.url ? ` (${rastreio.url})` : ""}` : ""}`;
    }
    linhas.push(`- Pedido ${p.numero} (${nomeLoja(p.loja)}), cliente ${p.cliente ?? ""}: pagamento ${p.pagamento ?? "?"}${envio}${p.omieNumero ? `, pedido ${p.omieNumero} no ERP` : ""}.`);
  }
  return linhas.join("\n");
}

export async function contextoIA(ultimasDoCliente: string, chat: string) {
  const [prods, peds, manuais] = await Promise.all([
    produtos(ultimasDoCliente).catch(() => ""),
    pedidos(ultimasDoCliente, chat).catch(() => ""),
    contextoManuais(ultimasDoCliente).catch(() => ""),
  ]);
  const partes = [
    prods && `Produtos encontrados no sistema:\n${prods}`,
    peds && `Pedidos citados:\n${peds}`,
    manuais && `Trechos dos manuais técnicos:\n${manuais}`,
  ].filter(Boolean);
  if (!partes.length) return "";
  return `\n\nINFORMAÇÕES DO SISTEMA (atualizadas agora; use só o que for relevante para a pergunta e não invente nada além disso. Frete e prazo de entrega: não calcule, diga que o vendedor envia o orçamento):\n${partes.join("\n\n")}`;
}
