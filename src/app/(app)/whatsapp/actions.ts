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
  if (dono && (await db.query.waConexoes.findFirst({ where: eq(K.userId, dono) }))?.id !== cx.id) {
    // O usuário já tinha um número vazio próprio: esse sai para ele assumir este.
    const antigo = await db.query.waConexoes.findFirst({ where: eq(K.userId, dono) });
    if (antigo && antigo.id !== cx.id) await db.update(K).set({ userId: null }).where(eq(K.id, antigo.id));
  }
  const nome = dono ? (await db.query.users.findFirst({ where: eq(schema.users.id, dono), columns: { name: true } }))?.name ?? cx.nome : cx.nome;
  await db.update(K).set({ userId: dono, nome }).where(eq(K.id, cx.id));
  await audit(u.id, "whatsapp.dono", `${cx.id} → ${dono ?? "ninguém"}`);
  revalidatePath("/whatsapp/config");
}
