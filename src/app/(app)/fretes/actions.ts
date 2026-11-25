"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { cotar, type Item, type Opcao } from "@/lib/frete";
import { numBR } from "@/lib/frete/motor";
import { lojaValida } from "@/lib/lojas";
import { produtosPorIds, semMedidas, volumes } from "@/lib/produtos";
import { chatKey, sendMessage } from "@/lib/whatsapp/service";

export type CotarState =
  | { ok: false; message: string }
  | { ok: true; id: string; opcoes: Opcao[]; erros: string[]; resumo: string }
  | undefined;

const n = (v: FormDataEntryValue | null) => numBR(v ?? "");

export async function cotarFrete(_p: CotarState, form: FormData): Promise<CotarState> {
  const u = await requireModule("fretes", "edit");
  const cepOrigem = String(form.get("cepOrigem") ?? "").replace(/\D/g, "");
  const cepDestino = String(form.get("cepDestino") ?? "").replace(/\D/g, "");
  if (cepOrigem.length !== 8 || cepDestino.length !== 8) return { ok: false, message: "Informe CEPs de origem e destino com 8 dígitos." };

  const itens: Item[] = [];
  const total = Number(form.get("linhas") ?? 0);
  const ids = Array.from({ length: Math.min(total, 20) }, (_, i) => String(form.get(`produto_${i}`) ?? "")).filter(Boolean);
  const cadastro = await produtosPorIds(ids);
  const volumesTxt: string[] = [];
  for (let i = 0; i < Math.min(total, 20); i++) {
    const prod = cadastro.get(String(form.get(`produto_${i}`) ?? ""));
    const quantidade = n(form.get(`quantidade_${i}`));
    if (prod) {
      if (!Number.isInteger(quantidade) || quantidade <= 0) return { ok: false, message: `Informe a quantidade de ${prod.descricao}.` };
      if (semMedidas(prod)) return { ok: false, message: `${prod.descricao} está sem peso ou medidas. Complete em Fretes › Produtos.` };
      const valorForm = n(form.get(`valor_${i}`));
      const v = volumes(prod, quantidade, Number.isFinite(valorForm) && valorForm >= 0 && String(form.get(`valor_${i}`) ?? "").trim() ? valorForm : prod.valorUnit);
      for (const it of v.itens) itens.push({ descricao: prod.descricao, ...it });
      volumesTxt.push(`${prod.descricao}: ${v.resumo}`);
      continue;
    }
    const it: Item = {
      descricao: String(form.get(`descricao_${i}`) ?? "").trim() || `Item ${i + 1}`,
      quantidade,
      pesoKg: n(form.get(`peso_${i}`)),
      alturaCm: n(form.get(`altura_${i}`)),
      larguraCm: n(form.get(`largura_${i}`)),
      comprimentoCm: n(form.get(`comprimento_${i}`)),
      valorUnit: n(form.get(`valor_${i}`)),
    };
    if (!it.quantidade && !it.pesoKg) continue; // linha vazia
    const ok = z.object({
      quantidade: z.number().int().positive(), pesoKg: z.number().positive(),
      alturaCm: z.number().positive(), larguraCm: z.number().positive(), comprimentoCm: z.number().positive(),
      valorUnit: z.number().nonnegative(),
    }).safeParse(it);
    if (!ok.success) return { ok: false, message: `Confira os números do item ${i + 1} (quantidade, peso, medidas e valor).` };
    itens.push(it);
  }
  if (!itens.length) return { ok: false, message: "Adicione pelo menos um item." };

  const { opcoes, erros } = await cotar(cepOrigem, cepDestino, itens);
  const peso = itens.reduce((s, it) => s + it.pesoKg * it.quantidade, 0);
  const valor = itens.reduce((s, it) => s + it.valorUnit * it.quantidade, 0);
  const cliente = String(form.get("cliente") ?? "").trim() || null;

  const [row] = await db.insert(schema.freteCotacoes).values({
    userId: u.id, loja: lojaValida(String(form.get("loja") ?? "")), cliente, cepOrigem, cepDestino,
    valorMercadoria: valor.toFixed(2), pesoTotal: peso.toFixed(2),
    itens, opcoes,
  }).returning({ id: schema.freteCotacoes.id });
  await audit(u.id, "frete.cotar", `${cepOrigem} → ${cepDestino} · ${opcoes.length} opções`);
  revalidatePath("/fretes");

  const resumo = `${itens.reduce((s, it) => s + it.quantidade, 0)} volume(s) · ${peso.toLocaleString("pt-BR")} kg · mercadoria ${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}${volumesTxt.length ? ` · ${volumesTxt.join("; ")}` : ""}`;
  return { ok: true, id: row.id, opcoes, erros, resumo };
}

export type EnviarState = { ok?: boolean; message?: string } | undefined;

const fmtCep = (c: string) => c.replace(/^(\d{5})(\d{3})$/, "$1-$2");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Manda ao cliente, pelo WhatsApp, a opção de frete escolhida. */
export async function enviarCotacaoWhatsApp(_p: EnviarState, form: FormData): Promise<EnviarState> {
  const u = await requireModule("fretes", "edit");
  await requireModule("whatsapp", "edit");
  const id = String(form.get("cotacaoId"));
  const idx = Number(form.get("opcao"));
  const numero = chatKey(String(form.get("numero") ?? ""));
  if (numero.length < 10) return { ok: false, message: "Informe o WhatsApp do cliente com DDD." };

  const c = await db.query.freteCotacoes.findFirst({ where: eq(schema.freteCotacoes.id, id) });
  const op = (c?.opcoes as Opcao[] | undefined)?.[idx];
  if (!c || !op) return { ok: false, message: "Escolha uma opção de frete." };

  const texto =
    `Olá${c.cliente ? `, ${c.cliente}` : ""}! Segue a cotação de frete da Asfalto Multi:\n\n` +
    `Destino: CEP ${fmtCep(c.cepDestino)}\n` +
    `Transportadora: ${op.transportadora}${op.servico ? ` (${op.servico})` : ""}\n` +
    `Valor do frete: ${brl(op.valor)}\n` +
    (op.prazoDias != null ? `Prazo: ${op.prazoDias} dia(s) útil(eis) após a coleta\n` : "") +
    `\nValores sujeitos a confirmação no fechamento do pedido.`;

  try {
    await sendMessage(numero, texto, "humano", { userId: u.id, vendedorId: u.id });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao enviar." };
  }
  await audit(u.id, "frete.enviar_whatsapp", `${id} → ${numero}`);
  return { ok: true, message: "Cotação enviada pelo WhatsApp." };
}
