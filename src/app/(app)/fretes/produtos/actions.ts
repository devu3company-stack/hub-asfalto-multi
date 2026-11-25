"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { numBR } from "@/lib/frete/motor";
import { atualizarEstoque, importarPlanilha, sincronizarOmie, sincronizarShopifyProdutos } from "@/lib/produtos";
import { lojaValida, nomeLoja } from "@/lib/lojas";
import type { FormMsg } from "../transportadoras/actions";

const requireAdmin = () => requireModule("integracoes", "edit");
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const dec = (f: FormData, k: string) => { const s = txt(f, k); if (!s) return 0; const n = numBR(s); return Number.isFinite(n) && n >= 0 ? n : NaN; };

function refresh() { revalidatePath("/fretes"); revalidatePath("/fretes/produtos"); }

export async function sincronizar(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireAdmin();
  const loja = lojaValida(txt(f, "loja"));
  const fonte = txt(f, "fonte");
  try {
    if (fonte === "estoque") {
      const r = await atualizarEstoque(loja, f.get("enviarShopify") === "sim");
      await audit(u.id, "produtos.estoque", `${nomeLoja(loja)}: ${r.casados}/${r.total}`);
      refresh();
      return { ok: true, message: `Estoque atualizado em ${r.casados} de ${r.total} produto(s)${r.enviados ? `; ${r.enviados} enviado(s) para a Shopify` : ""}.` };
    }
    const r = fonte === "shopify" ? await sincronizarShopifyProdutos(loja) : await sincronizarOmie(loja);
    await audit(u.id, `produtos.sincronizar_${fonte}`, `${nomeLoja(loja)}: ${r.total}`);
    refresh();
    return { ok: true, message: `${r.total} produto(s) lidos da ${fonte === "shopify" ? "Shopify" : "Omie"}: ${r.novos} novo(s), ${r.atualizados} atualizado(s).` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao sincronizar." };
  }
}

export async function importar(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireAdmin();
  const arq = f.get("arquivo");
  if (!(arq instanceof File) || !arq.size) return { ok: false, message: "Escolha a planilha (.xlsx ou .csv)." };
  if (arq.size > 5_000_000) return { ok: false, message: "Planilha muito grande (máx. 5 MB)." };
  try {
    const r = await importarPlanilha(arq, lojaValida(txt(f, "loja")));
    await audit(u.id, "produtos.importar_planilha", `${r.novos} novos, ${r.atualizados} atualizados`);
    refresh();
    return { ok: true, message: `Planilha importada: ${r.novos} produto(s) novo(s), ${r.atualizados} atualizado(s).` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Não consegui ler a planilha." };
  }
}

export async function salvarProduto(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireAdmin();
  const id = txt(f, "id");
  const dados = {
    descricao: txt(f, "descricao"), codigo: txt(f, "codigo") || null,
    pesoKg: dec(f, "pesoKg"), alturaCm: dec(f, "alturaCm"), larguraCm: dec(f, "larguraCm"), comprimentoCm: dec(f, "comprimentoCm"),
    valorUnit: dec(f, "valorUnit"),
    paleteQtd: Math.round(dec(f, "paleteQtd")), paletePesoKg: dec(f, "paletePesoKg"),
    paleteAlturaCm: dec(f, "paleteAlturaCm"), paleteLarguraCm: dec(f, "paleteLarguraCm"), paleteComprimentoCm: dec(f, "paleteComprimentoCm"),
    estoqueMinimo: dec(f, "estoqueMinimo"),
    ativo: f.get("ativo") !== "nao",
  };
  if (!dados.descricao) return { ok: false, message: "Informe a descrição." };
  if (Object.values(dados).some((v) => typeof v === "number" && !Number.isFinite(v))) return { ok: false, message: "Há um número inválido." };
  if (dados.paleteQtd > 0 && (!dados.paleteAlturaCm || !dados.paleteLarguraCm || !dados.paleteComprimentoCm))
    return { ok: false, message: "Para paletizar, informe as medidas do palete montado." };

  if (id) {
    const atual = await db.query.produtos.findFirst({ where: eq(schema.produtos.id, id) });
    if (!atual) return { ok: false, message: "Produto não encontrado." };
    const mudouMedidas = ["pesoKg", "alturaCm", "larguraCm", "comprimentoCm"].some((k) => atual[k as "pesoKg"] !== dados[k as "pesoKg"]);
    await db.update(schema.produtos).set({ ...dados, medidasNoHub: atual.medidasNoHub || (mudouMedidas && Boolean(atual.omieId || atual.shopifyVariantId)), atualizadoEm: new Date() })
      .where(eq(schema.produtos.id, id));
  } else {
    await db.insert(schema.produtos).values({ ...dados, loja: lojaValida(txt(f, "loja")) });
  }
  await audit(u.id, id ? "produtos.editar" : "produtos.criar", dados.descricao);
  refresh();
  if (id) redirect(`/fretes/produtos?loja=${lojaValida(txt(f, "loja"))}`);
  return { ok: true, message: "Produto cadastrado." };
}

export async function excluirProduto(f: FormData) {
  const u = await requireAdmin();
  const id = txt(f, "id");
  await db.delete(schema.produtos).where(eq(schema.produtos.id, id));
  await audit(u.id, "produtos.excluir", id);
  refresh();
  redirect(`/fretes/produtos?loja=${lojaValida(txt(f, "loja"))}`);
}

/** Volta a usar peso e medidas do Omie na próxima sincronização. */
export async function usarMedidasOmie(f: FormData) {
  await requireAdmin();
  await db.update(schema.produtos).set({ medidasNoHub: false }).where(eq(schema.produtos.id, txt(f, "id")));
  refresh();
}
