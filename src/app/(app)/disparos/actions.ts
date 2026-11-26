"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, count, eq, inArray } from "drizzle-orm";
import { audit, requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { adicionarDaBase, importarLista } from "@/lib/disparos";
import { MAX_MIDIA, salvarMidia, tipoDoMime } from "@/lib/whatsapp/midia";
import type { FormMsg } from "@/components/ActionForm";

const D = schema.disparos, DC = schema.disparoContatos;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const int = (f: FormData, k: string, min: number, max: number, padrao: number) => {
  const n = Math.round(Number(txt(f, k).replace(",", ".")));
  return Number.isFinite(n) && txt(f, k) !== "" ? Math.min(max, Math.max(min, n)) : padrao;
};
const atualizar = (id: string) => { revalidatePath(`/disparos/${id}`); revalidatePath("/disparos"); };

async function editavel(id: string) {
  const d = await db.query.disparos.findFirst({ where: eq(D.id, id) });
  if (!d) throw new Error("Disparo não encontrado.");
  return d;
}

export async function criar() {
  const u = await requireModule("disparos", "edit");
  const [d] = await db.insert(D).values({ nome: `Disparo ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, criadoPor: u.id,
    mensagens: ["{Olá|Oi}, {{primeiro_nome}}! Tudo bem?\n\n"] }).returning({ id: D.id });
  redirect(`/disparos/${d.id}`);
}

export async function salvar(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("disparos", "edit");
  const id = txt(f, "id");
  const d = await editavel(id);
  if (d.status === "enviando") return { ok: false, message: "Pause o disparo para editar." };
  const mensagens = f.getAll("mensagem").map((x) => String(x).trim()).filter(Boolean).slice(0, 5);
  const iMin = int(f, "intervaloMin", 10, 3600, 45), iMax = int(f, "intervaloMax", 10, 3600, 120);
  const jIni = int(f, "janelaInicio", 0, 23, 9), jFim = int(f, "janelaFim", 1, 24, 19);
  const dados: Partial<typeof D.$inferInsert> = {
    nome: txt(f, "nome") || d.nome, mensagens, rodapeSair: f.get("rodapeSair") === "1", conferirNumero: f.get("conferirNumero") === "1",
    conexoes: f.getAll("conexoes").map(String), intervaloMin: Math.min(iMin, iMax), intervaloMax: Math.max(iMin, iMax),
    loteTamanho: int(f, "loteTamanho", 1, 500, 15), lotePausa: int(f, "lotePausa", 0, 720, 20), limiteDia: int(f, "limiteDia", 1, 2000, 100),
    janelaInicio: Math.min(jIni, jFim - 1), janelaFim: Math.max(jFim, jIni + 1), sabado: f.get("sabado") === "1", domingo: f.get("domingo") === "1",
    inicioEm: txt(f, "inicioEm") ? new Date(`${txt(f, "inicioEm")}:00-03:00`) : null, updatedAt: new Date(),
  };
  const arq = f.get("anexo");
  if (arq instanceof File && arq.size > 0) {
    if (arq.size > MAX_MIDIA) return { ok: false, message: "Anexo grande demais (máximo 16 MB)." };
    const mime = arq.type || "application/octet-stream";
    let tipo = tipoDoMime(mime);
    if (tipo === "figurinha" || tipo === "audio") tipo = tipo === "audio" ? "documento" : "imagem";
    const arquivo = await salvarMidia({ buffer: Buffer.from(await arq.arrayBuffer()), mime, nome: arq.name, tipo });
    Object.assign(dados, { midia: arquivo, midiaTipo: tipo, midiaMime: mime, midiaNome: arq.name });
  }
  if (f.get("tirarAnexo") === "1") Object.assign(dados, { midia: null, midiaTipo: null, midiaMime: null, midiaNome: null });
  await db.update(D).set(dados).where(eq(D.id, id));
  await audit(u.id, "disparos.salvar", id);
  atualizar(id);
  return { ok: true, message: "Salvo." };
}

export async function importar(_p: FormMsg, f: FormData): Promise<FormMsg> {
  await requireModule("disparos", "edit");
  const id = txt(f, "id");
  const arq = f.get("arquivo");
  if (!(arq instanceof File) || !arq.size) return { ok: false, message: "Escolha a planilha (.xlsx ou .csv)." };
  try {
    const r = await importarLista(id, arq);
    atualizar(id);
    return { ok: true, message: `${r.adicionados} contato(s) adicionados${r.repetidos ? `, ${r.repetidos} já estavam na lista` : ""}${r.invalidos ? `, ${r.invalidos} telefone(s) inválido(s) ignorados` : ""}.${r.colunas.length ? ` Variáveis da planilha: ${r.colunas.map((c) => `{{${c}}}`).join(", ")}` : ""}` };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Não consegui ler a planilha." }; }
}

export async function daBase(_p: FormMsg, f: FormData): Promise<FormMsg> {
  await requireModule("disparos", "edit");
  const id = txt(f, "id");
  const r = await adicionarDaBase(id, txt(f, "origem"), txt(f, "filtro"));
  atualizar(id);
  return { ok: true, message: `${r.adicionados} contato(s) adicionados (${r.encontrados} encontrados com telefone).` };
}

export async function iniciar(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("disparos", "edit");
  const d = await editavel(txt(f, "id"));
  if (!d.mensagens.length) return { ok: false, message: "Escreva a mensagem e salve antes de iniciar." };
  if (!d.conexoes.length) return { ok: false, message: "Escolha pelo menos um número e salve." };
  const [{ n }] = await db.select({ n: count() }).from(DC).where(and(eq(DC.disparoId, d.id), eq(DC.status, "pendente")));
  if (!n) return { ok: false, message: "A lista não tem contatos pendentes." };
  await db.update(D).set({ status: "enviando", motivoPausa: null, updatedAt: new Date() }).where(eq(D.id, d.id));
  await audit(u.id, "disparos.iniciar", `${d.nome} (${n} contatos)`);
  atualizar(d.id);
  return { ok: true, message: d.inicioEm && d.inicioEm > new Date() ? "Agendado." : "Disparo iniciado." };
}

export async function mudarStatus(f: FormData) {
  const u = await requireModule("disparos", "edit");
  const id = txt(f, "id"), acao = txt(f, "acao");
  if (acao === "pausar") await db.update(D).set({ status: "pausado", motivoPausa: "Pausado manualmente.", updatedAt: new Date() }).where(and(eq(D.id, id), eq(D.status, "enviando")));
  if (acao === "cancelar") {
    await db.update(D).set({ status: "cancelado", updatedAt: new Date() }).where(eq(D.id, id));
    await db.update(DC).set({ status: "pulado", erro: "Disparo cancelado" }).where(and(eq(DC.disparoId, id), eq(DC.status, "pendente")));
  }
  if (acao === "reenviar") await db.update(DC).set({ status: "pendente", erro: null, conexaoId: null }).where(and(eq(DC.disparoId, id), eq(DC.status, "falhou")));
  if (acao === "limpar") await db.delete(DC).where(and(eq(DC.disparoId, id), inArray(DC.status, ["pendente", "pulado", "falhou"])));
  await audit(u.id, `disparos.${acao}`, id);
  atualizar(id);
}

export async function duplicar(f: FormData) {
  const u = await requireModule("disparos", "edit");
  const d = await editavel(txt(f, "id"));
  const { id: _id, createdAt: _c, updatedAt: _u, status: _s, motivoPausa: _m, ...resto } = d;
  void _id; void _c; void _u; void _s; void _m;
  const [n] = await db.insert(D).values({ ...resto, nome: `${d.nome} (cópia)`, criadoPor: u.id, inicioEm: null }).returning({ id: D.id });
  redirect(`/disparos/${n.id}`);
}

export async function excluir(f: FormData) {
  await requireModule("disparos", "edit");
  await db.delete(D).where(eq(D.id, txt(f, "id")));
  redirect("/disparos");
}
