import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { getConfig } from "./integrations/store";
import { listarEstoque, listarProdutos } from "./integrations/omie";
import { definirEstoque, localPrincipal, variantesShopify } from "./integrations/shopify";
import { chaveLoja, nomeLoja, type LojaId } from "./lojas";
import { omieDaLoja } from "./lojas-server";
import { numBR, type ItemCalc } from "./frete/motor";

export type Produto = typeof schema.produtos.$inferSelect;

const pos = (n: unknown) => { const v = numBR(n); return Number.isFinite(v) && v > 0 ? v : 0; };

/* ------------------------- Sincronizar com o Omie ------------------------- */

export async function sincronizarOmie(loja: LojaId) {
  const cfg = await getConfig(chaveLoja("omie", loja));
  if (!cfg) throw new Error(`Conecte o Omie da ${nomeLoja(loja)} em Integrações para sincronizar os produtos.`);
  const lista = (await listarProdutos(cfg)).filter((p) => p.codigo_produto && p.descricao);
  const atuais = await db.query.produtos.findMany({ where: eq(schema.produtos.loja, loja) });
  const porOmie = new Map(atuais.filter((p) => p.omieId).map((p) => [p.omieId!, p]));
  let novos = 0, atualizados = 0;

  for (const o of lista) {
    const omieId = String(o.codigo_produto);
    const base = {
      codigo: o.codigo ?? null, descricao: o.descricao!.trim(), unidade: o.unidade ?? null,
      valorUnit: pos(o.valor_unitario), ativo: o.inativo !== "S", atualizadoEm: new Date(),
    };
    const medidas = {
      pesoKg: pos(o.peso_bruto) || pos(o.peso_liq), alturaCm: pos(o.altura),
      larguraCm: pos(o.largura), comprimentoCm: pos(o.profundidade),
    };
    const atual = porOmie.get(omieId);
    if (!atual) {
      await db.insert(schema.produtos).values({ loja, omieId, ...base, ...medidas });
      novos++;
    } else {
      // medidas editadas no hub têm prioridade; medidas vazias no Omie não apagam as do hub
      const m = atual.medidasNoHub ? {} : Object.fromEntries(Object.entries(medidas).filter(([, v]) => v > 0));
      await db.update(schema.produtos).set({ ...base, ...m }).where(eq(schema.produtos.id, atual.id));
      atualizados++;
    }
  }
  return { total: lista.length, novos, atualizados };
}

/* ------------------------ Sincronizar com a Shopify ------------------------ */

const kg = (w: { unit: string; value: number } | null | undefined) => {
  if (!w) return 0;
  const f: Record<string, number> = { KILOGRAMS: 1, GRAMS: 0.001, POUNDS: 0.453592, OUNCES: 0.0283495 };
  return Math.round(w.value * (f[w.unit] ?? 1) * 1000) / 1000;
};

/** Produtos (variantes) da Shopify da loja: peso vem da Shopify; altura/largura/comprimento dos metacampos custom.* ou do hub. */
export async function sincronizarShopifyProdutos(loja: LojaId) {
  const cfg = await getConfig(chaveLoja("shopify", loja));
  if (!cfg) throw new Error(`Conecte a Shopify da ${nomeLoja(loja)} em Integrações.`);
  const vars = await variantesShopify(cfg);
  const atuais = await db.query.produtos.findMany({ where: eq(schema.produtos.loja, loja) });
  const porVar = new Map(atuais.filter((p) => p.shopifyVariantId).map((p) => [p.shopifyVariantId!, p]));
  let novos = 0, atualizados = 0;
  for (const v of vars) {
    const descricao = v.title && v.title !== "Default Title" ? `${v.product.title} — ${v.title}` : v.product.title;
    const base = {
      codigo: v.sku || null, descricao, valorUnit: pos(v.price), ativo: v.product.status === "ACTIVE",
      shopifyInventoryItemId: v.inventoryItem.id, atualizadoEm: new Date(),
    };
    const medidas = {
      pesoKg: kg(v.inventoryItem.measurement?.weight), alturaCm: pos(v.altura?.value),
      larguraCm: pos(v.largura?.value), comprimentoCm: pos(v.comprimento?.value),
    };
    const atual = porVar.get(v.id);
    if (!atual) {
      await db.insert(schema.produtos).values({ loja, shopifyVariantId: v.id, ...base, ...medidas });
      novos++;
    } else {
      const m = atual.medidasNoHub ? {} : Object.fromEntries(Object.entries(medidas).filter(([, x]) => x > 0));
      await db.update(schema.produtos).set({ ...base, ...m }).where(eq(schema.produtos.id, atual.id));
      atualizados++;
    }
  }
  return { total: vars.length, novos, atualizados };
}

/* --------------------------------- Estoque --------------------------------- */

/**
 * Lê o saldo no Omie que atende a loja e grava nos produtos da loja (casando pelo código/SKU).
 * Se a loja tiver Shopify e `enviarShopify`, atualiza o estoque disponível lá também.
 */
export async function atualizarEstoque(loja: LojaId, enviarShopify: boolean) {
  const { cfg, destino } = await omieDaLoja(loja);
  if (!cfg) throw new Error(`Nenhum Omie conectado para a ${nomeLoja(loja)}.`);
  const saldos = await listarEstoque(cfg);
  const porCodigo = new Map<string, number>();
  const porId = new Map<string, number>();
  for (const s of saldos) {
    const q = Number(s.nSaldo ?? s.fisico ?? 0);
    if (s.cCodigo) porCodigo.set(s.cCodigo.trim().toLowerCase(), q);
    if (s.nCodProd) porId.set(String(s.nCodProd), q);
  }
  const prods = await db.query.produtos.findMany({ where: eq(schema.produtos.loja, loja) });
  const paraShopify: { inventoryItemId: string; quantity: number }[] = [];
  let casados = 0;
  for (const p of prods) {
    const q = (loja === destino && p.omieId ? porId.get(p.omieId) : undefined) ?? (p.codigo ? porCodigo.get(p.codigo.trim().toLowerCase()) : undefined);
    if (q === undefined) continue;
    casados++;
    await db.update(schema.produtos).set({ estoque: q, estoqueEm: new Date() }).where(eq(schema.produtos.id, p.id));
    if (p.shopifyInventoryItemId) paraShopify.push({ inventoryItemId: p.shopifyInventoryItemId, quantity: q });
  }
  let enviados = 0;
  if (enviarShopify && paraShopify.length) {
    const shop = await getConfig(chaveLoja("shopify", loja));
    if (shop) {
      const local = await localPrincipal(shop);
      await definirEstoque(shop, local.id, paraShopify);
      enviados = paraShopify.length;
    }
  }
  return { casados, total: prods.length, enviados };
}

export async function estoqueBaixo(loja?: LojaId) {
  const rows = await db.query.produtos.findMany({ where: loja ? eq(schema.produtos.loja, loja) : undefined });
  return rows.filter((p) => p.ativo && p.estoque !== null && p.estoqueMinimo > 0 && p.estoque <= p.estoqueMinimo);
}

/* ---------------------- Importar planilha (Omie ou própria) ---------------------- */

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Qual coluna é qual, pelo nome do cabeçalho (aceita o relatório "Relação de Produtos" do Omie). */
const COLUNAS: Record<string, (h: string) => boolean> = {
  codigo: (h) => h === "codigo" || h === "codigo do produto" || h === "sku" || h === "cod",
  descricao: (h) => h.startsWith("descricao") && !h.includes("detalhada") || h === "produto" || h === "nome",
  unidade: (h) => h === "unidade" || h === "un",
  peso: (h) => h.includes("peso bruto") || h === "peso" || h === "peso kg",
  pesoLiq: (h) => h.includes("peso liquido"),
  altura: (h) => h.startsWith("altura"),
  largura: (h) => h.startsWith("largura"),
  comprimento: (h) => h.startsWith("profundidade") || h.startsWith("comprimento"),
  valor: (h) => h.includes("preco unitario") || h.includes("valor unitario") || h === "preco" || h === "valor" || h.includes("preco de venda"),
  paleteQtd: (h) => h.includes("palete") && (h.includes("qtd") || h.includes("quantidade") || h.includes("unidades")),
};

export async function linhasDaPlanilha(arquivo: File): Promise<unknown[][]> {
  const nome = arquivo.name.toLowerCase();
  if (nome.endsWith(".xlsx")) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await arquivo.arrayBuffer());
    const ws = wb.worksheets[0];
    const rows: unknown[][] = [];
    ws?.eachRow((row) => {
      const vals = (row.values as unknown[]).slice(1).map((v) =>
        v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result
          : v && typeof v === "object" && "text" in (v as object) ? (v as { text: unknown }).text : v);
      rows.push(vals);
    });
    return rows;
  }
  if (nome.endsWith(".xls")) throw new Error("Salve a planilha como .xlsx ou .csv e tente de novo.");
  const txt = (await arquivo.text()).replace(/^﻿/, "");
  const sep = (txt.split("\n")[0].match(/;/g)?.length ?? 0) >= (txt.split("\n")[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  return txt.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, "$1")));
}

export async function importarPlanilha(arquivo: File, loja: LojaId) {
  const rows = await linhasDaPlanilha(arquivo);
  // o cabeçalho é a primeira linha (entre as 15 primeiras) que tem descrição e alguma medida/peso
  let hIdx = -1;
  let mapa: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const hs = rows[i].map(norm);
    const m: Record<string, number> = {};
    for (const [k, test] of Object.entries(COLUNAS)) { const j = hs.findIndex(test); if (j >= 0) m[k] = j; }
    if (m.descricao !== undefined && (m.peso !== undefined || m.pesoLiq !== undefined || m.altura !== undefined)) { hIdx = i; mapa = m; break; }
  }
  if (hIdx < 0) throw new Error("Não achei as colunas. A planilha precisa ter Descrição e Peso Bruto (ou Altura/Largura/Profundidade).");

  const atuais = await db.query.produtos.findMany({ where: eq(schema.produtos.loja, loja) });
  const porCodigo = new Map(atuais.filter((p) => p.codigo).map((p) => [p.codigo!.trim().toLowerCase(), p]));
  const porDesc = new Map(atuais.map((p) => [norm(p.descricao), p]));
  const get = (r: unknown[], k: string) => (mapa[k] === undefined ? undefined : r[mapa[k]]);
  let novos = 0, atualizados = 0;

  for (const r of rows.slice(hIdx + 1)) {
    const descricao = String(get(r, "descricao") ?? "").trim();
    if (!descricao) continue;
    const codigo = String(get(r, "codigo") ?? "").trim() || null;
    const dados = {
      descricao, codigo, unidade: String(get(r, "unidade") ?? "").trim() || null,
      pesoKg: pos(get(r, "peso")) || pos(get(r, "pesoLiq")),
      alturaCm: pos(get(r, "altura")), larguraCm: pos(get(r, "largura")), comprimentoCm: pos(get(r, "comprimento")),
      valorUnit: pos(get(r, "valor")), paleteQtd: Math.round(pos(get(r, "paleteQtd"))),
    };
    const limpo = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== null && v !== 0 && v !== "")) as Partial<typeof dados>;
    const atual = (codigo && porCodigo.get(codigo.toLowerCase())) || porDesc.get(norm(descricao));
    if (atual) {
      await db.update(schema.produtos).set({ ...limpo, atualizadoEm: new Date() }).where(eq(schema.produtos.id, atual.id));
      atualizados++;
    } else {
      await db.insert(schema.produtos).values({ ...dados, descricao, loja });
      novos++;
    }
  }
  return { novos, atualizados };
}

/* ------------------------------ Paletização ------------------------------ */

export function semMedidas(p: Pick<Produto, "pesoKg" | "alturaCm" | "larguraCm" | "comprimentoCm">) {
  return !p.pesoKg || !p.alturaCm || !p.larguraCm || !p.comprimentoCm;
}

/**
 * Transforma "N unidades do produto" nos volumes que a transportadora recebe:
 * paletes cheios (se o produto tiver paletização) + unidades soltas.
 */
export function volumes(p: Produto, quantidade: number, valorUnit = p.valorUnit): { itens: ItemCalc[]; resumo: string } {
  const solto = (q: number): ItemCalc => ({ quantidade: q, pesoKg: p.pesoKg, alturaCm: p.alturaCm, larguraCm: p.larguraCm, comprimentoCm: p.comprimentoCm, valorUnit });
  const temPalete = p.paleteQtd > 0 && p.paleteAlturaCm > 0 && p.paleteLarguraCm > 0 && p.paleteComprimentoCm > 0;
  if (!temPalete || quantidade < p.paleteQtd) return { itens: [solto(quantidade)], resumo: `${quantidade} ${p.unidade?.toLowerCase() || "un"} solto(s)` };
  const paletes = Math.floor(quantidade / p.paleteQtd);
  const resto = quantidade - paletes * p.paleteQtd;
  const itens: ItemCalc[] = [{
    quantidade: paletes,
    pesoKg: p.paletePesoKg || p.paleteQtd * p.pesoKg,
    alturaCm: p.paleteAlturaCm, larguraCm: p.paleteLarguraCm, comprimentoCm: p.paleteComprimentoCm,
    valorUnit: valorUnit * p.paleteQtd,
  }];
  if (resto) itens.push(solto(resto));
  return { itens, resumo: `${paletes} palete(s) de ${p.paleteQtd}${resto ? ` + ${resto} solto(s)` : ""}` };
}

export async function produtosPorIds(ids: string[]) {
  if (!ids.length) return new Map<string, Produto>();
  const rows = await db.query.produtos.findMany({ where: inArray(schema.produtos.id, ids) });
  return new Map(rows.map((p) => [p.id, p]));
}
