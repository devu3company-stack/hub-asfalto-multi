"use server";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { audit, requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { AI_PROVIDERS } from "@/lib/ai";
import { qrIniciar, qrLogout } from "@/lib/whatsapp/gateway";
import { chatKey, sendMessage, setAiPaused } from "@/lib/whatsapp/service";
import { conexao, garantirConexaoDoUsuario } from "@/lib/whatsapp/conexoes";
import { MAX_MIDIA, paraVozWhatsApp, tipoDoMime, type Midia } from "@/lib/whatsapp/midia";

export type SendState = { ok?: boolean; message?: string } | undefined;
const K = schema.waConexoes;

/** Só o dono do número ou um administrador mexe nele. */
async function podeUsar(u: { id: string; role: string }, conexaoId: string) {
  if (u.role === "ADMIN") return true;
  return (await conexao(conexaoId))?.userId === u.id;
}

export async function enviar(_p: SendState, form: FormData): Promise<SendState> {
  const u = await requireModule("whatsapp", "edit");
  const chat = chatKey(String(form.get("chat") ?? ""));
  const cx = String(form.get("conexao") ?? "") || (await garantirConexaoDoUsuario(u)).id;
  if (!(await podeUsar(u, cx))) return { ok: false, message: "Você só pode enviar pelo seu número." };
  const text = String(form.get("text") ?? "").trim();
  const arq = form.get("arquivo");
  const temArquivo = arq instanceof File && arq.size > 0;
  if (!chat || (!text && !temArquivo)) return { ok: false, message: "Escreva a mensagem ou anexe um arquivo." };
  try {
    let midia: Midia | undefined;
    if (temArquivo) {
      if (arq.size > MAX_MIDIA) return { ok: false, message: "Arquivo grande demais (máximo 16 MB)." };
      const mime = arq.type || "application/octet-stream";
      midia = { buffer: Buffer.from(await arq.arrayBuffer()), mime, nome: arq.name, tipo: tipoDoMime(mime) };
      if (form.get("voz") === "1") midia = await paraVozWhatsApp(midia);
      else if (midia.tipo === "figurinha") midia.tipo = "imagem";
      else if (midia.tipo === "video" && !/mp4|3gpp/.test(mime)) midia.tipo = "documento";
    }
    await sendMessage(chat, text, "humano", { userId: u.id, conexao: cx, midia });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao enviar." };
  }
  revalidatePath("/whatsapp");
  return { ok: true };
}

export async function alternarIAConversa(form: FormData) {
  const u = await requireModule("whatsapp", "edit");
  const chat = String(form.get("chat")), cx = String(form.get("conexao"));
  if (!(await podeUsar(u, cx))) return;
  const pausar = form.get("pausar") === "1";
  await setAiPaused(chat, pausar, cx);
  await audit(u.id, pausar ? "whatsapp.ia.pausar" : "whatsapp.ia.retomar", chat);
  revalidatePath("/whatsapp");
}

/** Liga o número (gera o QR). */
export async function conectar(form: FormData) {
  const u = await requireModule("whatsapp");
  const cx = String(form.get("conexao") ?? "") || (await garantirConexaoDoUsuario(u)).id;
  if (!(await podeUsar(u, cx))) return;
  await qrIniciar(cx);
  revalidatePath("/whatsapp/conectar");
}

export async function desconectar(form: FormData) {
  const u = await requireModule("whatsapp");
  const cx = String(form.get("conexao"));
  if (!(await podeUsar(u, cx))) return;
  await qrLogout(cx);
  await audit(u.id, "whatsapp.desconectar", cx);
  revalidatePath("/whatsapp/conectar");
  revalidatePath("/whatsapp/config");
}

/** Liga/desliga IA e automações num número (o dono escolhe). */
export async function alternarIA(form: FormData) {
  const u = await requireModule("whatsapp");
  const cx = await conexao(String(form.get("conexao")));
  if (!cx || !(await podeUsar(u, cx.id))) return;
  await db.update(K).set({ iaLigada: !cx.iaLigada }).where(eq(K.id, cx.id));
  await audit(u.id, cx.iaLigada ? "whatsapp.ia.desligar" : "whatsapp.ia.ligar", cx.id);
  revalidatePath("/whatsapp/conectar");
  revalidatePath("/whatsapp/config");
}

export async function salvarConfig(form: FormData) {
  const u = await requireModule("integracoes", "edit");
  const prov = String(form.get("provedor") ?? "");
  if ((AI_PROVIDERS as readonly string[]).includes(prov)) await setSetting("ia.provedor", prov);
  const instr = String(form.get("instrucoes") ?? "").trim();
  if (instr) await setSetting("ia.instrucoes", instr.slice(0, 6000));
  const padrao = String(form.get("padrao") ?? "");
  if (padrao && (await conexao(padrao))) await setSetting("whatsapp.conexaoPadrao", padrao);
  await audit(u.id, "whatsapp.config");
  revalidatePath("/whatsapp/config");
}

/** Define de quem é um número que não foi criado por um usuário (o "principal" que já existia, ou a API oficial). */
export async function definirDono(form: FormData) {
  const u = await requireModule("usuarios", "edit");
  const cx = await conexao(String(form.get("conexao")));
  if (!cx) return;
  const dono = String(form.get("userId") ?? "") || null;
  // Número por QR leva o nome do dono; número oficial mantém o nome dado no cadastro.
  const nome = dono && cx.tipo === "qr" ? (await db.query.users.findFirst({ where: eq(schema.users.id, dono), columns: { name: true } }))?.name ?? cx.nome : cx.nome;
  await db.update(K).set({ userId: dono, nome }).where(eq(K.id, cx.id));
  await audit(u.id, "whatsapp.dono", `${cx.id} → ${dono ?? "ninguém"}`);
  revalidatePath("/whatsapp/config");
}

// ───────── Finalizar, transferir, expediente e NPS ─────────

export async function finalizarConversa(form: FormData) {
  const u = await requireModule("whatsapp", "edit");
  const chat = String(form.get("chat")), cx = String(form.get("conexao"));
  if (!(await podeUsar(u, cx))) return;
  const { finalizar } = await import("@/lib/whatsapp/atendimento");
  await finalizar(cx, chat, u.id, form.get("nps") === "1");
  await audit(u.id, "whatsapp.finalizar", chat);
  revalidatePath("/whatsapp");
}

export async function transferirConversa(_p: SendState, form: FormData): Promise<SendState> {
  const u = await requireModule("whatsapp", "edit");
  const chat = String(form.get("chat")), cx = String(form.get("conexao")), para = String(form.get("para") ?? "");
  if (!(await podeUsar(u, cx))) return { ok: false, message: "Você só pode transferir conversas do seu número." };
  if (!para) return { ok: false, message: "Escolha para quem transferir." };
  if (para === u.id) return { ok: false, message: "Escolha outra pessoa." };
  const { transferir } = await import("@/lib/whatsapp/atendimento");
  try {
    const r = await transferir({ deConexao: cx, chat, deUserId: u.id, paraUserId: para, nota: String(form.get("nota") ?? "").trim(),
      avisarCliente: form.get("avisar") === "1" ? String(form.get("textoAviso") ?? "").trim() || null : null,
      apresentacao: form.get("chamar") === "1" ? String(form.get("textoApresentacao") ?? "").trim() || null : null });
    await audit(u.id, "whatsapp.transferir", `${chat} → ${r.para}`);
    revalidatePath("/whatsapp");
    return { ok: true, message: r.chamou ? `Transferido para ${r.para}, que já chamou o cliente pelo próprio número.`
      : r.semNumero ? `Transferido para ${r.para}. O WhatsApp dessa pessoa ainda não está conectado: ela vê a tarefa no funil e o histórico desta conversa.`
      : `Transferido para ${r.para}. O WhatsApp dessa pessoa está desconectado agora; ela chama o cliente quando conectar.` };
  } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Não deu para transferir." }; }
}

export async function salvarExpedienteNps(form: FormData) {
  const u = await requireModule("integracoes", "edit");
  const { salvarExpediente, salvarNpsConfig } = await import("@/lib/whatsapp/atendimento");
  const hora = (v: FormDataEntryValue | null, p: string) => (/^\d{2}:\d{2}$/.test(String(v ?? "")) ? String(v) : p);
  await salvarExpediente({
    ativo: form.get("expAtivo") === "1",
    mensagem: String(form.get("expMensagem") ?? "").slice(0, 1000),
    dias: [0, 1, 2, 3, 4, 5, 6].map((d) => (form.get(`aberto${d}`) === "1" ? { abre: hora(form.get(`abre${d}`), "08:00"), fecha: hora(form.get(`fecha${d}`), "18:00") } : null)),
  });
  const t = (k: string) => String(form.get(k) ?? "").trim().slice(0, 600);
  await salvarNpsConfig({ ativo: form.get("npsAtivo") === "1", pergunta: t("npsPergunta"), agradece: t("npsAgradece"), melhoria: t("npsMelhoria"), obrigadoComentario: t("npsObrigado") });
  await audit(u.id, "whatsapp.expediente_nps");
  revalidatePath("/whatsapp/config");
}

// ───────── Números da API oficial ─────────

export async function salvarOficial(_p: SendState, form: FormData): Promise<SendState> {
  const u = await requireModule("integracoes", "edit");
  const { encrypt } = await import("@/lib/crypto");
  const id = String(form.get("id") ?? "");
  const nome = String(form.get("nome") ?? "").trim();
  const pid = String(form.get("phoneNumberId") ?? "").replace(/\D/g, "");
  const token = String(form.get("token") ?? "").trim();
  const dono = String(form.get("userId") ?? "") || null;
  const numero = String(form.get("numero") ?? "").replace(/\D/g, "") || null;
  if (!nome) return { ok: false, message: "Dê um nome para o número (ex.: Comercial, Loja do Asfalto)." };
  if (pid.length < 8) return { ok: false, message: "Informe o ID do número de telefone (Meta › WhatsApp › Configuração da API)." };
  const outro = await db.query.waConexoes.findFirst({ where: eq(K.phoneNumberId, pid) });
  if (outro && outro.id !== id) return { ok: false, message: `Esse ID já está cadastrado como "${outro.nome}".` };
  const dados = { nome, phoneNumberId: pid, userId: dono, numero, ...(token ? { tokenCripto: encrypt(token) } : {}) };
  if (id) {
    const cx = await conexao(id);
    if (!cx || cx.tipo !== "oficial") return { ok: false, message: "Número não encontrado." };
    await db.update(K).set(dados).where(eq(K.id, id));
  } else {
    await db.insert(K).values({ id: `of_${pid}`, tipo: "oficial", ...dados });
  }
  await audit(u.id, "whatsapp.oficial.salvar", `${nome} (${pid})`);
  revalidatePath("/whatsapp/config");
  return { ok: true, message: id ? "Número atualizado." : `Número "${nome}" cadastrado.` };
}

export async function removerOficial(form: FormData) {
  const u = await requireModule("integracoes", "edit");
  const cx = await conexao(String(form.get("conexao")));
  if (!cx || cx.tipo !== "oficial") return;
  await db.delete(K).where(eq(K.id, cx.id));
  await audit(u.id, "whatsapp.oficial.remover", cx.nome);
  revalidatePath("/whatsapp/config");
}
