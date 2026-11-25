import "server-only";
import ExcelJS from "exceljs";
import { and, between, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { getSetting, setSetting } from "../settings";

const H = schema.freteHistorico;

/** Tipos de veículo e capacidade aproximada (aba CONFIGURAÇÃO da planilha). */
export const VEICULOS = [
  { nome: "Fiorino", eixos: 2, kg: 600 },
  { nome: "Van", eixos: 2, kg: 2000 },
  { nome: "Vuc", eixos: 2, kg: 3500 },
  { nome: "Toco", eixos: 2, kg: 6000 },
  { nome: "Truck", eixos: 3, kg: 12500 },
  { nome: "Bi Truck", eixos: 4, kg: 16000 },
  { nome: "Carreta LS", eixos: 6, kg: 25000 },
  { nome: "Carreta 4º Eixo", eixos: 6, kg: 39000 },
  { nome: "Bi Trem", eixos: 7, kg: 39000 },
  { nome: "RodoTrem", eixos: 9, kg: 50000 },
] as const;

const chave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
/** "VUC", "Vuc ", "RodoTrem " → nome padrão. Desconhecido: mantém como veio (sem espaços sobrando). */
export function normalizarVeiculo(v: string | null | undefined) {
  const t = String(v ?? "").trim();
  if (!t) return "";
  return VEICULOS.find((x) => chave(x.nome) === chave(t))?.nome ?? t;
}

// ───────── Parâmetros (os mesmos da aba CONFIGURAÇÃO) ─────────

export type Parametros = { minAmostra: number; pesoTol: number; distTol: number; mesmaUF: boolean };
const PADRAO: Parametros = { minAmostra: 10, pesoTol: 30, distTol: 17, mesmaUF: false };

export async function parametros(): Promise<Parametros> {
  try { return { ...PADRAO, ...JSON.parse(await getSetting("frete.analise")) }; } catch { return PADRAO; }
}
export async function salvarParametros(p: Parametros) {
  await setSetting("frete.analise", JSON.stringify(p));
}

// ───────── Estatística ─────────

/** Quartil como o QUARTIL/QUARTILE.INC do Excel (a planilha usa esse método). */
function quantil(ord: number[], q: number) {
  if (!ord.length) return 0;
  const pos = 1 + (ord.length - 1) * q;
  const i = Math.floor(pos);
  return ord[i - 1] + (pos - i) * ((ord[i] ?? ord[i - 1]) - ord[i - 1]);
}
const media = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export type Avaliacao = { texto: string; tom: "green" | "yellow" | "orange" | "red" | "gray" };

export type Analise = {
  n: number;
  suficiente: boolean;
  minAmostra: number;
  rsKm: { medio: number; min: number; max: number };
  orcamento: { medio: number; min: number; max: number; mediana: number; q1: number; q3: number };
  custoMediano: number;
  maisPraticado: { valor: number; vezes: number; empate: boolean } | null;
  sugerido: number; // para publicar ao entregador: mediana do custo pago
  avaliacao?: Avaliacao & { maisPraticado: boolean; saving: number; savingPct: number; rsTon: number; rsKmCotado: number };
  exemplos: { data: Date; cidade: string | null; uf: string | null; kg: number; distanciaKm: number; orcamento: number; custo: number }[];
};

export type Pedido = { kg: number; km: number; veiculo: string; uf?: string | null; cotado?: number | null };

/**
 * Procura fretes parecidos no histórico — mesmo veículo, peso e distância dentro da tolerância
 * (e mesma UF, se configurado) — e calcula as faixas, como a aba COTAÇÃO da planilha.
 */
export async function analisar(p: Pedido): Promise<Analise> {
  const cfg = await parametros();
  const veiculo = normalizarVeiculo(p.veiculo);
  const kgT = cfg.pesoTol / 100, kmT = cfg.distTol / 100;
  const rows = await db.select().from(H).where(and(
    eq(H.veiculo, veiculo),
    between(H.kg, p.kg * (1 - kgT), p.kg * (1 + kgT)),
    between(H.distanciaKm, p.km * (1 - kmT), p.km * (1 + kmT)),
    cfg.mesmaUF && p.uf ? sql`upper(${H.uf}) = ${p.uf.toUpperCase()}` : undefined,
  ));
  const orc = rows.map((r) => r.orcamento).sort((a, b) => a - b);
  const custos = rows.map((r) => r.custo).sort((a, b) => a - b);
  const rsKm = rows.filter((r) => r.distanciaKm > 0).map((r) => r.custo / r.distanciaKm);

  // Valor mais praticado: o orçamento que mais se repete (só conta se repetir).
  const freq = new Map<number, number>();
  for (const v of orc) freq.set(v, (freq.get(v) ?? 0) + 1);
  const maxVezes = Math.max(0, ...freq.values());
  const modas = [...freq].filter(([, c]) => c === maxVezes).map(([v]) => v);
  const maisPraticado = maxVezes > 1 ? { valor: Math.max(...modas), vezes: maxVezes, empate: modas.length > 1 } : null;

  const a: Analise = {
    n: rows.length,
    suficiente: rows.length >= cfg.minAmostra,
    minAmostra: cfg.minAmostra,
    rsKm: { medio: media(rsKm), min: rsKm.length ? Math.min(...rsKm) : 0, max: rsKm.length ? Math.max(...rsKm) : 0 },
    orcamento: { medio: media(orc), min: orc[0] ?? 0, max: orc[orc.length - 1] ?? 0, mediana: quantil(orc, 0.5), q1: quantil(orc, 0.25), q3: quantil(orc, 0.75) },
    custoMediano: quantil(custos, 0.5),
    maisPraticado,
    sugerido: Math.round(quantil(custos, 0.5) / 10) * 10,
    exemplos: rows.sort((x, y) => y.data.getTime() - x.data.getTime()).slice(0, 15)
      .map((r) => ({ data: r.data, cidade: r.cidade, uf: r.uf, kg: r.kg, distanciaKm: r.distanciaKm, orcamento: r.orcamento, custo: r.custo })),
  };

  if (p.cotado && p.cotado > 0) {
    const c = p.cotado, o = a.orcamento;
    const av: Avaliacao =
      !a.n ? { texto: "Sem fretes parecidos para comparar", tom: "gray" }
      : c > o.max ? { texto: "Acima do maior valor que já pagamos", tom: "red" }
      : c < o.q1 ? { texto: "Excelente — abaixo de 75% dos fretes parecidos", tom: "green" }
      : c < o.mediana ? { texto: "Bom — abaixo da mediana", tom: "green" }
      : c <= o.mediana * 1.05 ? { texto: "Na média do que praticamos", tom: "yellow" }
      : c <= o.q3 ? { texto: "Acima da média — dá para negociar", tom: "orange" }
      : { texto: "Caro — acima de 75% dos fretes parecidos", tom: "red" };
    const saving = a.n ? c - a.custoMediano : 0;
    a.avaliacao = { ...av, maisPraticado: !!maisPraticado && c === maisPraticado.valor, saving, savingPct: c ? saving / c : 0,
      rsTon: p.kg ? c / (p.kg / 1000) : 0, rsKmCotado: p.km ? c / p.km : 0 };
  }
  return a;
}

// ───────── Importação da planilha ─────────

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && v && "result" in v) return num((v as { result: unknown }).result);
  const s = String(v).replace(/[R$\s]/g, "");
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : null;
};
const texto = (v: unknown) => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && v && "result" in v) return String((v as { result: unknown }).result ?? "").trim();
  if (typeof v === "object" && v && "richText" in v) return (v as { richText: { text: string }[] }).richText.map((x) => x.text).join("").trim();
  return String(v).trim();
};
const dataDe = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  const n = num(v);
  if (n && n > 20000 && n < 80000) return new Date(Math.round((n - 25569) * 86400_000)); // serial do Excel
  const m = texto(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return new Date(Date.UTC(Number(m[3].length === 2 ? "20" + m[3] : m[3]), Number(m[2]) - 1, Number(m[1]), 12));
  return null;
};

/**
 * Lê a aba de histórico (cabeçalho com DATA, CIDADE, UF, PRODUTO, QTD, KG, DISTÂNCIA, TIPO DE VEÍCULO, ORÇAMENTO, CUSTO TOTAL)
 * e substitui o que veio de planilha antes. Fretes registrados pelo app dos entregadores não são apagados.
 */
export async function importarHistorico(arquivo: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arquivo as unknown as ArrayBuffer);
  let aba: ExcelJS.Worksheet | undefined, cab = 0;
  const col: Record<string, number> = {};
  for (const ws of wb.worksheets) {
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const nomes: Record<string, number> = {};
      ws.getRow(r).eachCell((c, i) => { nomes[chave(texto(c.value))] = i; });
      if (nomes.kg && nomes.distancia && (nomes.tipodeveiculo || nomes.veiculo) && (nomes.custototal || nomes.custo)) {
        aba = ws; cab = r;
        Object.assign(col, {
          data: nomes.data, cidade: nomes.cidade ?? nomes.destino, uf: nomes.uf, produto: nomes.produto, qtd: nomes.qtd ?? nomes.quantidade,
          kg: nomes.kg, km: nomes.distancia, veiculo: nomes.tipodeveiculo ?? nomes.veiculo,
          orcamento: nomes.orcamento ?? nomes.custototal, custo: nomes.custototal ?? nomes.custo,
        });
        break;
      }
    }
    if (aba) break;
  }
  if (!aba) throw new Error("Não achei a aba de histórico (precisa das colunas KG, DISTÂNCIA, TIPO DE VEÍCULO e CUSTO TOTAL).");

  const linhas: (typeof H.$inferInsert)[] = [];
  let ignoradas = 0;
  for (let r = cab + 1; r <= aba.rowCount; r++) {
    const row = aba.getRow(r);
    const v = (k: string) => (col[k] ? row.getCell(col[k]).value : null);
    const kg = num(v("kg")), km = num(v("km")), custo = num(v("custo")), orc = num(v("orcamento")) ?? custo;
    const veiculo = normalizarVeiculo(texto(v("veiculo")));
    const data = dataDe(v("data"));
    if (!kg || !km || !custo || !orc || !veiculo || !data) { if (texto(v("cidade")) || kg) ignoradas++; continue; }
    linhas.push({ data, cidade: texto(v("cidade")) || null, uf: texto(v("uf")).toUpperCase() || null, produto: texto(v("produto")) || null,
      qtd: num(v("qtd")), kg, distanciaKm: km, veiculo, orcamento: orc, custo, origem: "planilha" });
  }
  if (!linhas.length) throw new Error("A aba de histórico está vazia.");
  await db.transaction(async (tx) => {
    await tx.delete(H).where(eq(H.origem, "planilha"));
    for (let i = 0; i < linhas.length; i += 500) await tx.insert(H).values(linhas.slice(i, i + 500));
  });
  return { importadas: linhas.length, ignoradas, aba: aba.name };
}

/** Frete entregue pelo app entra no histórico e passa a contar na análise. */
export async function registrarNoHistorico(e: typeof schema.entregas.$inferSelect) {
  if (!e.veiculo || !e.kg || !e.distanciaKm) return;
  await db.delete(H).where(eq(H.entregaId, e.id));
  await db.insert(H).values({ data: e.entregueEm ?? new Date(), cidade: e.destino, uf: e.uf, produto: e.produto, qtd: e.qtd,
    kg: e.kg, distanciaKm: e.distanciaKm, veiculo: normalizarVeiculo(e.veiculo), orcamento: e.valor + e.valorDescarga, custo: e.valor + e.valorDescarga, origem: "entrega", entregaId: e.id });
}
