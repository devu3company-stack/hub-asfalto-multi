"use server";
import { and, asc, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { lojaValida } from "@/lib/lojas";
import { moverEtapa, registrar, TIPOS_TAREFA } from "@/lib/crm";
import { numBR } from "@/lib/frete/motor";
import { setSetting } from "@/lib/settings";
import { salvarContato } from "@/lib/email/contatos";
import type { FormMsg } from "@/components/ActionForm";

const N = schema.crmNegociacoes, T = schema.crmTarefas, E = schema.crmEtapas;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const editar = () => requireModule("crm", "edit");
const dataBR = (s: string, tz: number) => (s ? new Date(Date.parse(`${s.length === 10 ? s + "T12:00" : s}:00Z`) + tz * 60_000) : null);
const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function dados(f: FormData) {
  const valor = numBR(txt(f, "valor") || "0");
  return {
    titulo: txt(f, "titulo"), contato: txt(f, "contato") || null, empresa: txt(f, "empresa") || null,
    telefone: txt(f, "telefone").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "") || null,
    documento: txt(f, "documento").replace(/\D/g, "") || null, email: txt(f, "email").toLowerCase() || null,
    valor: Number.isFinite(valor) ? valor : 0, qualificacao: Math.max(0, Math.min(5, Number(txt(f, "qualificacao")) || 0)),
    fonte: txt(f, "fonte") || null, loja: lojaValida(txt(f, "loja")),
    previsaoFechamento: dataBR(txt(f, "previsao"), Number(txt(f, "tz")) || 180),
    responsavelId: txt(f, "responsavelId") || null,
  };
}

export async function criarNegociacao(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await editar();
  const d = dados(f);
  if (!d.contato && !d.empresa && !d.telefone && !d.titulo) return { ok: false, message: "Informe pelo menos o nome ou o telefone do lead." };
  const interesse = txt(f, "interesse");
  if (!d.titulo) d.titulo = `${d.empresa || d.contato || d.telefone}${interesse ? ` — ${interesse.split("\n")[0].slice(0, 50)}` : ""}`;
  const etapaId = txt(f, "etapaId");
  const etapa = await db.query.crmEtapas.findFirst({ where: eq(E.id, etapaId) });
  if (!etapa) return { ok: false, message: "Escolha a etapa." };
  const [{ m }] = await db.select({ m: max(N.ordem) }).from(N).where(eq(N.etapaId, etapaId));
  const [n] = await db.insert(N).values({ ...d, responsavelId: d.responsavelId ?? u.id, funilId: etapa.funilId, etapaId, ordem: (m ?? 0) + 1 }).returning({ id: N.id });
  await registrar(n.id, u.id, "criada", `Lead cadastrado manualmente${d.fonte ? ` (origem: ${d.fonte})` : ""} em "${etapa.nome}"`);
  if (interesse) await registrar(n.id, u.id, "nota", interesse);
  if (txt(f, "retorno") === "1") {
    const amanha = new Date(Date.now() + 24 * 3600_000);
    const quando = new Date(`${new Date(amanha.getTime() - 3 * 3600_000).toISOString().slice(0, 10)}T12:00:00Z`); // 9h de Brasília
    await db.insert(schema.crmTarefas).values({ negociacaoId: n.id, tipo: d.fonte === "WhatsApp" ? "whatsapp" : "ligacao",
      descricao: "Retornar o contato", quando, responsavelId: d.responsavelId ?? u.id });
  }
  if (d.email) await salvarContato({ email: d.email, nome: d.contato, telefone: d.telefone, origem: "manual", loja: d.loja }).catch(() => null);
  await audit(u.id, "crm.criar", d.titulo);
  revalidatePath("/crm");
  redirect(`/crm/${n.id}`);
}

export async function salvarNegociacao(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await editar();
  const id = txt(f, "id");
  const d = dados(f);
  if (!d.titulo) return { ok: false, message: "O nome não pode ficar vazio." };
  await db.update(N).set({ ...d, updatedAt: new Date() }).where(eq(N.id, id));
  await registrar(id, u.id, "edicao", "Dados da negociação atualizados");
  revalidatePath(`/crm/${id}`);
  revalidatePath("/crm");
  return { ok: true, message: "Salvo." };
}

/** Chamado pelo arrastar e soltar do quadro. */
export async function mover(id: string, etapaId: string, ordem: number) {
  const u = await editar();
  await moverEtapa(id, etapaId, ordem, u.id);
  revalidatePath("/crm");
}

export async function mudarEtapa(f: FormData) {
  const u = await editar();
  const id = txt(f, "id");
  await moverEtapa(id, txt(f, "etapaId"), Date.now() / 1e9, u.id);
  revalidatePath(`/crm/${id}`);
  revalidatePath("/crm");
}

export async function nota(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await editar();
  const id = txt(f, "id");
  const t = txt(f, "texto");
  if (!t) return { ok: false, message: "Escreva a anotação." };
  await registrar(id, u.id, "nota", t);
  revalidatePath(`/crm/${id}`);
  return { ok: true, message: "Anotação salva." };
}

export async function novaTarefa(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await editar();
  const id = txt(f, "id");
  const tipo = txt(f, "tipo") in TIPOS_TAREFA ? txt(f, "tipo") : "tarefa";
  const quando = dataBR(`${txt(f, "data")}${txt(f, "hora") ? "T" + txt(f, "hora") : ""}`, Number(txt(f, "tz")) || 180);
  if (!quando || Number.isNaN(quando.getTime())) return { ok: false, message: "Escolha a data da tarefa." };
  const descricao = txt(f, "descricao") || TIPOS_TAREFA[tipo];
  await db.insert(T).values({ negociacaoId: id, tipo, descricao, quando, responsavelId: txt(f, "responsavelId") || u.id });
  await registrar(id, u.id, "tarefa", `Tarefa criada: ${TIPOS_TAREFA[tipo]} — ${descricao} (${fmt(quando)})`);
  revalidatePath(`/crm/${id}`);
  revalidatePath("/crm");
  return { ok: true, message: "Tarefa criada." };
}

export async function concluirTarefa(f: FormData) {
  const u = await editar();
  const t = await db.query.crmTarefas.findFirst({ where: eq(T.id, txt(f, "tarefaId")) });
  if (!t) return;
  await db.update(T).set({ concluida: !t.concluida, concluidaEm: t.concluida ? null : new Date() }).where(eq(T.id, t.id));
  if (!t.concluida) await registrar(t.negociacaoId, u.id, "tarefa", `Tarefa concluída: ${TIPOS_TAREFA[t.tipo] ?? t.tipo} — ${t.descricao}`);
  revalidatePath(`/crm/${t.negociacaoId}`);
  revalidatePath("/crm");
}

export async function marcar(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await editar();
  const id = txt(f, "id");
  const status = txt(f, "status");
  if (!["ganha", "perdida", "andamento"].includes(status)) return { ok: false, message: "Situação inválida." };
  const motivo = txt(f, "motivo");
  if (status === "perdida" && !motivo) return { ok: false, message: "Escolha o motivo da perda." };
  await db.update(N).set({
    status, motivoPerda: status === "perdida" ? motivo : null, fechadaEm: status === "andamento" ? null : new Date(), updatedAt: new Date(),
  }).where(eq(N.id, id));
  await registrar(id, u.id, "status", status === "ganha" ? "Marcada como VENDA" : status === "perdida" ? `Marcada como PERDA: ${motivo}${txt(f, "obs") ? ` — ${txt(f, "obs")}` : ""}` : "Negociação reaberta");
  await audit(u.id, `crm.${status}`, id);
  revalidatePath(`/crm/${id}`);
  revalidatePath("/crm");
  return { ok: true, message: status === "ganha" ? "Venda registrada!" : status === "perdida" ? "Perda registrada." : "Reaberta." };
}

export async function excluirNegociacao(f: FormData) {
  const u = await requireModule("crm", "edit");
  const id = txt(f, "id");
  await db.delete(N).where(eq(N.id, id));
  await audit(u.id, "crm.excluir", id);
  revalidatePath("/crm");
  redirect("/crm");
}

/* --------------------------------- Configuração --------------------------------- */

export async function salvarFunil(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("crm", "edit");
  const funilId = txt(f, "funilId");
  const nomeFunil = txt(f, "nomeFunil");
  const linhas = txt(f, "etapas").split("\n").map((x) => x.trim()).filter(Boolean);
  if (linhas.length < 2) return { ok: false, message: "O funil precisa de pelo menos 2 etapas." };
  let id = funilId;
  if (!id) id = (await db.insert(schema.crmFunis).values({ nome: nomeFunil || "Novo funil" }).returning({ id: schema.crmFunis.id }))[0].id;
  else if (nomeFunil) await db.update(schema.crmFunis).set({ nome: nomeFunil }).where(eq(schema.crmFunis.id, id));
  const atuais = await db.query.crmEtapas.findMany({ where: eq(E.funilId, id), orderBy: asc(E.ordem) });
  // casa por nome: renomear = apagar e criar; etapa com negociações não pode sumir
  for (const [i, nome] of linhas.entries()) {
    const e = atuais.find((a) => a.nome === nome);
    if (e) await db.update(E).set({ ordem: i }).where(eq(E.id, e.id));
    else await db.insert(E).values({ funilId: id, nome, ordem: i });
  }
  const remover = atuais.filter((a) => !linhas.includes(a.nome));
  const bloqueadas: string[] = [];
  for (const e of remover) {
    const tem = await db.query.crmNegociacoes.findFirst({ where: and(eq(N.etapaId, e.id)) });
    if (tem) { bloqueadas.push(e.nome); await db.update(E).set({ ordem: 999 }).where(eq(E.id, e.id)); }
    else await db.delete(E).where(eq(E.id, e.id));
  }
  await audit(u.id, "crm.funil", nomeFunil);
  revalidatePath("/crm");
  revalidatePath("/crm/config");
  return bloqueadas.length
    ? { ok: false, message: `Salvo, mas estas etapas têm negociações e continuam no fim do funil: ${bloqueadas.join(", ")}. Mova as negociações e salve de novo.` }
    : { ok: true, message: "Funil salvo." };
}

export async function salvarLeadAuto(_p: FormMsg, f: FormData): Promise<FormMsg> {
  await editar();
  await setSetting("crm.leadAutomatico", f.get("ligado") === "sim" ? "sim" : "nao");
  revalidatePath("/crm/config");
  return { ok: true, message: "Salvo." };
}

export async function salvarMotivos(_p: FormMsg, f: FormData): Promise<FormMsg> {
  await requireModule("crm", "edit");
  await setSetting("crm.motivosPerda", txt(f, "motivos"));
  revalidatePath("/crm/config");
  return { ok: true, message: "Motivos salvos." };
}
