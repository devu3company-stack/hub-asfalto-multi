import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "../db";

/** Motor de cálculo de frete com as tabelas próprias das transportadoras (padrão de frete fracionado/rodoviário). */

export type Faixa = { ateKg: number; valor: number };

export type ItemCalc = { quantidade: number; pesoKg: number; alturaCm: number; larguraCm: number; comprimentoCm: number; valorUnit: number };

export type Detalhe = {
  pesoReal: number;
  pesoCubado: number;
  pesoTaxado: number;
  valorNF: number;
  fretePeso: number;
  adValorem: number;
  gris: number;
  pedagio: number;
  taxas: number;
  subtotal: number;
  minimoAplicado: boolean;
  icms: number;
  total: number;
  rota: string;
};

type Rota = typeof schema.freteRotas.$inferSelect;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function totais(itens: ItemCalc[], fatorCubagem: number) {
  let pesoReal = 0, m3 = 0, valorNF = 0;
  for (const it of itens) {
    pesoReal += it.pesoKg * it.quantidade;
    m3 += (it.alturaCm * it.larguraCm * it.comprimentoCm) / 1_000_000 * it.quantidade;
    valorNF += it.valorUnit * it.quantidade;
  }
  const pesoCubado = m3 * fatorCubagem;
  return { pesoReal, pesoCubado, pesoTaxado: Math.max(pesoReal, pesoCubado), valorNF };
}

/** Frete-peso: valor da faixa que cobre o peso; acima da última faixa, soma o excedente por kg. */
export function fretePeso(faixas: Faixa[], excedenteKg: number, peso: number) {
  const ord = [...faixas].sort((a, b) => a.ateKg - b.ateKg);
  if (!ord.length) return excedenteKg * peso;
  const f = ord.find((x) => peso <= x.ateKg);
  if (f) return f.valor;
  const ult = ord[ord.length - 1];
  return ult.valor + (peso - ult.ateKg) * excedenteKg;
}

export function calcular(rota: Rota, fatorCubagem: number, itens: ItemCalc[]): Detalhe {
  const t = totais(itens, fatorCubagem);
  const fp = fretePeso(rota.faixas as Faixa[], rota.excedenteKg, t.pesoTaxado);
  const adValorem = (t.valorNF * rota.adValoremPct) / 100;
  const gris = Math.max((t.valorNF * rota.grisPct) / 100, rota.grisPct > 0 || rota.grisMin > 0 ? rota.grisMin : 0);
  const pedagio = Math.ceil(t.pesoTaxado / 100) * rota.pedagioPor100kg;
  const taxas = rota.taxaDespacho + rota.outrasTaxas;
  const soma = fp + adValorem + gris + pedagio + taxas;
  const minimoAplicado = soma < rota.freteMinimo;
  const subtotal = Math.max(soma, rota.freteMinimo);
  const total = rota.icmsPct > 0 && rota.icmsPct < 100 ? subtotal / (1 - rota.icmsPct / 100) : subtotal;
  return {
    pesoReal: round2(t.pesoReal), pesoCubado: round2(t.pesoCubado), pesoTaxado: round2(t.pesoTaxado), valorNF: round2(t.valorNF),
    fretePeso: round2(fp), adValorem: round2(adValorem), gris: round2(gris), pedagio: round2(pedagio), taxas: round2(taxas),
    subtotal: round2(subtotal), minimoAplicado, icms: round2(total - subtotal), total: round2(total), rota: rota.nome,
  };
}

/** Uma opção por transportadora ativa que atende o CEP (se houver várias rotas, vale a faixa de CEP mais específica). */
export async function cotarTabelaPropria(cepDestino: string, itens: ItemCalc[]) {
  const cep = cepDestino.replace(/\D/g, "").padStart(8, "0");
  const rows = await db
    .select({ rota: schema.freteRotas, t: schema.transportadoras })
    .from(schema.freteRotas)
    .innerJoin(schema.transportadoras, eq(schema.freteRotas.transportadoraId, schema.transportadoras.id))
    .where(and(
      eq(schema.freteRotas.ativo, true), eq(schema.transportadoras.ativo, true),
      lte(schema.freteRotas.cepInicio, cep), gte(schema.freteRotas.cepFim, cep),
    ));

  const porTransp = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const atual = porTransp.get(r.t.id);
    const amplitude = (x: typeof r) => Number(x.rota.cepFim) - Number(x.rota.cepInicio);
    if (!atual || amplitude(r) < amplitude(atual)) porTransp.set(r.t.id, r);
  }

  return Array.from(porTransp.values()).map(({ rota, t }) => {
    const d = calcular(rota, t.fatorCubagem, itens);
    return { transportadora: t.nome, servico: rota.nome, prazoDias: rota.prazoDias + t.prazoExtra, valor: d.total, detalhe: d };
  });
}

/* ------------------------- leitura de números BR ------------------------- */

/** "1.234,56" → 1234.56 · "389.90" → 389.9 · "45" → 45 */
export function numBR(v: unknown): number {
  if (typeof v === "number") return v;
  let s = String(v ?? "").trim().replace(/[R$\s%]/g, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** "10:45,00 | 30:62,50 | 50:80" → [{ateKg:10,valor:45}, ...] */
export function parseFaixas(txt: string): Faixa[] {
  const out: Faixa[] = [];
  for (const part of txt.split(/[|\n;]+/)) {
    const [kg, val] = part.split(/[:=]/).map((x) => x?.trim());
    if (!kg || !val) continue;
    const a = numBR(kg), v = numBR(val);
    if (Number.isFinite(a) && Number.isFinite(v) && a > 0 && v >= 0) out.push({ ateKg: a, valor: v });
  }
  return out.sort((a, b) => a.ateKg - b.ateKg);
}

export function faixasTexto(f: Faixa[]) {
  return f.map((x) => `${String(x.ateKg).replace(".", ",")}:${x.valor.toFixed(2).replace(".", ",")}`).join(" | ");
}
