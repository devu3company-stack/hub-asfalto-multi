"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { audit, requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { GATILHOS, GRUPOS, MODELOS, PASSOS, novoId, type Passo } from "@/lib/automacoes/definicoes";
import { sendMessage } from "@/lib/whatsapp/service";
import type { FormMsg } from "@/components/ActionForm";

const A = schema.automacoes, X = schema.automacaoExecucoes, AP = schema.automacaoAprovacoes;

export async function usarModelo(f: FormData) {
  const u = await requireModule("automacoes", "edit");
  const m = MODELOS.find((x) => x.chave === String(f.get("modelo")));
  if (!m) return;
  const [a] = await db.insert(A).values({ nome: m.nome, grupo: m.grupo, gatilho: m.gatilho, gatilhoConfig: m.gatilhoConfig, modelo: m.chave, ativa: false,
    passos: m.passos.map((p) => ({ ...p, id: novoId() })) }).returning({ id: A.id });
  await audit(u.id, "automacoes.criar", m.nome);
  redirect(`/automacoes/${a.id}?novo=1`);
}

export async function criarEmBranco() {
  await requireModule("automacoes", "edit");
  const [a] = await db.insert(A).values({ nome: "Nova automação", gatilho: "whatsapp.mensagem", passos: [] }).returning({ id: A.id });
  redirect(`/automacoes/${a.id}?novo=1`);
}

export async function salvar(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("automacoes", "edit");
  let d: { nome: string; grupo: string; gatilho: string; gatilhoConfig: Record<string, unknown>; passos: Passo[]; ativa: boolean };
  try { d = JSON.parse(String(f.get("dados"))); } catch { return { ok: false, message: "Dados inválidos." }; }
  if (!d.nome?.trim()) return { ok: false, message: "Dê um nome para a automação." };
  if (!GATILHOS[d.gatilho]) return { ok: false, message: "Escolha o gatilho." };
  const passos = (d.passos ?? []).filter((p) => PASSOS[p.tipo]).map((p) => ({ id: p.id || novoId(), tipo: p.tipo, config: p.config ?? {} }));
  if (d.ativa && !passos.length) return { ok: false, message: "Adicione pelo menos um passo antes de ativar." };
  if (d.ativa && passos.some((p) => p.tipo === "whatsapp" && !String(p.config.texto ?? "").trim())) return { ok: false, message: "Tem passo de WhatsApp sem mensagem." };
  await db.update(A).set({ nome: d.nome.trim(), grupo: GRUPOS[d.grupo] ? d.grupo : "geral", gatilho: d.gatilho, gatilhoConfig: d.gatilhoConfig ?? {}, passos, ativa: !!d.ativa, updatedAt: new Date() })
    .where(eq(A.id, String(f.get("id"))));
  await audit(u.id, "automacoes.salvar", d.nome);
  revalidatePath("/automacoes");
  return { ok: true, message: d.ativa ? "Salva e ativa." : "Salva (desligada)." };
}

export async function alternar(f: FormData) {
  await requireModule("automacoes", "edit");
  const a = await db.query.automacoes.findFirst({ where: eq(A.id, String(f.get("id"))) });
  if (a && (a.ativa || a.passos.length)) await db.update(A).set({ ativa: !a.ativa, updatedAt: new Date() }).where(eq(A.id, a.id));
  revalidatePath("/automacoes");
}

export async function excluir(f: FormData) {
  const u = await requireModule("automacoes", "edit");
  await db.delete(A).where(eq(A.id, String(f.get("id"))));
  await audit(u.id, "automacoes.excluir", String(f.get("id")));
  redirect("/automacoes");
}

export async function cancelarExecucao(f: FormData) {
  await requireModule("automacoes", "edit");
  await db.update(X).set({ status: "cancelada", updatedAt: new Date() }).where(and(eq(X.id, String(f.get("id"))), inArray(X.status, ["ativa", "esperando", "erro"])));
  revalidatePath(`/automacoes/${String(f.get("automacaoId"))}`);
}

export async function aprovar(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("whatsapp", "edit");
  const ap = await db.query.automacaoAprovacoes.findFirst({ where: and(eq(AP.id, String(f.get("id"))), eq(AP.status, "pendente")) });
  if (!ap) return { ok: false, message: "Já foi decidida." };
  if (f.get("decisao") === "descartar") {
    await db.update(AP).set({ status: "descartada", decididaPor: u.id, decididaEm: new Date() }).where(eq(AP.id, ap.id));
  } else {
    const texto = String(f.get("texto") ?? "").trim();
    if (!texto) return { ok: false, message: "A mensagem está vazia." };
    try { await sendMessage(ap.chat, texto, "humano", { userId: u.id, conexao: ap.conexaoId }); }
    catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Não enviou." }; }
    await db.update(AP).set({ status: "enviada", texto, decididaPor: u.id, decididaEm: new Date() }).where(eq(AP.id, ap.id));
  }
  revalidatePath("/automacoes/aprovar");
  return { ok: true, message: f.get("decisao") === "descartar" ? "Descartada." : "Enviada." };
}
