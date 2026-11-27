"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { numBR, parseFaixas } from "@/lib/frete/motor";
import { setSetting } from "@/lib/settings";

export type FormMsg = { ok: boolean; message: string } | undefined;

/** Cadastro de transportadoras e tabelas: só quem administra integrações. */
const requireAdmin = () => requireModule("integracoes", "edit");

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const cep8 = (v: string) => v.replace(/\D/g, "");
const dec = (f: FormData, k: string, def = 0) => {
  const s = txt(f, k);
  if (!s) return def;
  const n = numBR(s);
  return Number.isFinite(n) ? n : NaN;
};

function refresh(id?: string) {
  revalidatePath("/fretes");
  revalidatePath("/fretes/transportadoras");
  revalidatePath("/fretes/planilhas");
  if (id) revalidatePath(`/fretes/transportadoras/${id}`);
}

/* ------------------------------ CEP de origem ------------------------------ */

export async function salvarCepOrigem(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireAdmin();
  const cep = cep8(txt(f, "cepOrigem"));
  if (cep && cep.length !== 8) return { ok: false, message: "O CEP precisa ter 8 dígitos." };
  await setSetting("frete.cepOrigem", cep);
  await audit(u.id, "frete.cep_origem", cep);
  refresh();
  return { ok: true, message: "CEP de origem salvo." };
}

/* ------------------------------ Transportadoras ------------------------------ */

function dadosTransportadora(f: FormData) {
  const nome = txt(f, "nome");
  const fator = dec(f, "fatorCubagem", 300);
  const prazoExtra = Math.round(dec(f, "prazoExtra", 0));
  if (!nome) return { erro: "Informe o nome da transportadora." } as const;
  if (!Number.isFinite(fator) || fator <= 0) return { erro: "Fator de cubagem inválido (ex.: 300)." } as const;
  if (!Number.isFinite(prazoExtra) || prazoExtra < 0) return { erro: "Prazo extra inválido." } as const;
  return {
    dados: {
      nome, cnpj: txt(f, "cnpj") || null, fatorCubagem: fator, prazoExtra,
      observacao: txt(f, "observacao") || null, ativo: f.get("ativo") !== "nao",
    },
  } as const;
}

export async function criarTransportadora(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireAdmin();
  const r = dadosTransportadora(f);
  if ("erro" in r) return { ok: false, message: r.erro! };
  const [t] = await db.insert(schema.transportadoras).values(r.dados).returning({ id: schema.transportadoras.id });
  await audit(u.id, "frete.transportadora_criar", r.dados.nome);
  refresh();
  redirect(`/fretes/transportadoras/${t.id}`);
}

export async function atualizarTransportadora(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireAdmin();
  const id = txt(f, "id");
  const r = dadosTransportadora(f);
  if ("erro" in r) return { ok: false, message: r.erro! };
  await db.update(schema.transportadoras).set(r.dados).where(eq(schema.transportadoras.id, id));
  await audit(u.id, "frete.transportadora_editar", r.dados.nome);
  refresh(id);
  return { ok: true, message: "Transportadora salva." };
}

export async function excluirTransportadora(f: FormData) {
  const u = await requireAdmin();
  const id = txt(f, "id");
  const t = await db.query.transportadoras.findFirst({ where: eq(schema.transportadoras.id, id) });
  if (t) {
    await db.delete(schema.transportadoras).where(eq(schema.transportadoras.id, id));
    await audit(u.id, "frete.transportadora_excluir", t.nome);
  }
  refresh();
  redirect("/fretes/transportadoras");
}

/* ---------------------------------- Rotas ---------------------------------- */

type RotaIn = typeof schema.freteRotas.$inferInsert;

function validarRota(r: Omit<RotaIn, "transportadoraId">): string | null {
  if (!r.nome) return "Informe o nome da rota (ex.: Capital SP).";
  if (r.cepInicio.length !== 8 || r.cepFim.length !== 8) return "CEP inicial e final precisam ter 8 dígitos.";
  if (r.cepInicio > r.cepFim) return "O CEP inicial precisa ser menor ou igual ao final.";
  if (!(r.faixas as unknown[]).length && !r.excedenteKg) return "Informe as faixas de peso ou o valor por kg.";
  const nums = [r.prazoDias, r.excedenteKg, r.freteMinimo, r.adValoremPct, r.grisPct, r.grisMin, r.pedagioPor100kg, r.taxaDespacho, r.outrasTaxas, r.icmsPct];
  if (nums.some((n) => n !== undefined && (!Number.isFinite(n) || n < 0))) return "Há um número inválido na rota.";
  if ((r.icmsPct ?? 0) >= 100) return "ICMS precisa ser menor que 100%.";
  return null;
}

function rotaDoForm(f: FormData): Omit<RotaIn, "transportadoraId"> {
  return {
    nome: txt(f, "nome"),
    cepInicio: cep8(txt(f, "cepInicio")),
    cepFim: cep8(txt(f, "cepFim")),
    prazoDias: Math.round(dec(f, "prazoDias")),
    faixas: parseFaixas(txt(f, "faixas")),
    excedenteKg: dec(f, "excedenteKg"),
    freteMinimo: dec(f, "freteMinimo"),
    adValoremPct: dec(f, "adValoremPct"),
    grisPct: dec(f, "grisPct"),
    grisMin: dec(f, "grisMin"),
    pedagioPor100kg: dec(f, "pedagioPor100kg"),
    taxaDespacho: dec(f, "taxaDespacho"),
    outrasTaxas: dec(f, "outrasTaxas"),
    icmsPct: dec(f, "icmsPct"),
    ativo: f.get("ativo") !== "nao",
  };
}

export async function salvarRota(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireAdmin();
  const transportadoraId = txt(f, "transportadoraId");
  const rotaId = txt(f, "rotaId");
  const r = rotaDoForm(f);
  if (txt(f, "faixas") && !(r.faixas as unknown[]).length) return { ok: false, message: 'Faixas de peso no formato "até kg:valor", ex.: 10:45,00 | 30:62,50' };
  const erro = validarRota(r);
  if (erro) return { ok: false, message: erro };
  if (rotaId) {
    await db.update(schema.freteRotas).set(r).where(eq(schema.freteRotas.id, rotaId));
  } else {
    await db.insert(schema.freteRotas).values({ ...r, transportadoraId });
  }
  await audit(u.id, rotaId ? "frete.rota_editar" : "frete.rota_criar", `${r.nome} ${r.cepInicio}-${r.cepFim}`);
  refresh(transportadoraId);
  if (rotaId) redirect(`/fretes/transportadoras/${transportadoraId}`);
  return { ok: true, message: "Rota adicionada." };
}

export async function excluirRota(f: FormData) {
  const u = await requireAdmin();
  const id = txt(f, "rotaId");
  const transportadoraId = txt(f, "transportadoraId");
  await db.delete(schema.freteRotas).where(eq(schema.freteRotas.id, id));
  await audit(u.id, "frete.rota_excluir", id);
  refresh(transportadoraId);
}

/* ------------------------------- Importar CSV ------------------------------- */

const COLS = ["nome", "cep_inicio", "cep_fim", "prazo", "faixas", "excedente_kg", "minimo", "advalorem_pct", "gris_pct", "gris_min", "pedagio_100kg", "taxa_despacho", "outras", "icms_pct"] as const;

export async function importarCsv(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireAdmin();
  const transportadoraId = txt(f, "transportadoraId");
  const arquivo = f.get("arquivo");
  let conteudo = txt(f, "texto");
  if (arquivo instanceof File && arquivo.size > 0) {
    if (arquivo.size > 2_000_000) return { ok: false, message: "Arquivo muito grande (máx. 2 MB)." };
    conteudo = await arquivo.text();
  }
  conteudo = conteudo.replace(/^﻿/, "");
  if (!conteudo.trim()) return { ok: false, message: "Escolha o arquivo CSV ou cole as linhas." };

  const linhas = conteudo.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rotas: RotaIn[] = [];
  const erros: string[] = [];
  linhas.forEach((linha, i) => {
    const cols = linha.split(";").map((c) => c.trim().replace(/^"(.*)"$/, "$1"));
    if (i === 0 && /cep/i.test(linha) && !/\d{5}/.test(cols[1] ?? "")) return; // cabeçalho
    const v = Object.fromEntries(COLS.map((k, j) => [k, cols[j] ?? ""])) as Record<(typeof COLS)[number], string>;
    const n = (s: string) => (s ? numBR(s) : 0);
    const r: Omit<RotaIn, "transportadoraId"> = {
      nome: v.nome, cepInicio: cep8(v.cep_inicio), cepFim: cep8(v.cep_fim),
      prazoDias: Math.round(n(v.prazo)), faixas: parseFaixas(v.faixas),
      excedenteKg: n(v.excedente_kg), freteMinimo: n(v.minimo), adValoremPct: n(v.advalorem_pct),
      grisPct: n(v.gris_pct), grisMin: n(v.gris_min), pedagioPor100kg: n(v.pedagio_100kg),
      taxaDespacho: n(v.taxa_despacho), outrasTaxas: n(v.outras), icmsPct: n(v.icms_pct), ativo: true,
    };
    const erro = validarRota(r);
    if (erro) erros.push(`Linha ${i + 1}: ${erro}`);
    else rotas.push({ ...r, transportadoraId });
  });

  if (erros.length) return { ok: false, message: `Nada foi importado. ${erros.slice(0, 5).join(" · ")}${erros.length > 5 ? ` (+${erros.length - 5})` : ""}` };
  if (!rotas.length) return { ok: false, message: "Nenhuma rota encontrada no arquivo." };

  const substituir = f.get("substituir") === "sim";
  await db.transaction(async (tx) => {
    if (substituir) await tx.delete(schema.freteRotas).where(eq(schema.freteRotas.transportadoraId, transportadoraId));
    for (let i = 0; i < rotas.length; i += 500) await tx.insert(schema.freteRotas).values(rotas.slice(i, i + 500));
  });
  await audit(u.id, "frete.importar_csv", `${rotas.length} rotas${substituir ? " (substituindo)" : ""}`);
  refresh(transportadoraId);
  return { ok: true, message: `${rotas.length} rota(s) importada(s)${substituir ? ", substituindo as anteriores" : ""}.` };
}
