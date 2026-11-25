"use server";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { audit, requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { lojaValida } from "@/lib/lojas";
import { appUrl } from "@/lib/email/envio";
import { avisar } from "@/lib/entregas";
import { normalizarTelefone } from "@/lib/entregador-auth";
import { analisar, normalizarVeiculo, VEICULOS } from "@/lib/frete/historico";
import { sendMessage, setAiPaused } from "@/lib/whatsapp/service";
import type { FormMsg } from "@/components/ActionForm";
import type { AnaliseJSON } from "@/components/AnaliseFrete";

const E = schema.entregas, D = schema.entregadores;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const s = txt(f, k).replace(/[R$\s]/g, "");
  const v = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(v) ? v : 0;
};

export async function sugerir(p: { kg: number; km: number; veiculo: string; uf?: string }): Promise<AnaliseJSON | null> {
  await requireModule("entregas");
  if (!p.kg || !p.km || !p.veiculo) return null;
  const a = await analisar({ kg: p.kg, km: p.km, veiculo: p.veiculo, uf: p.uf || null });
  return { ...a, exemplos: [] };
}

export async function publicar(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("entregas", "edit");
  const destino = txt(f, "destino"), valor = num(f, "valor");
  if (!destino) return { ok: false, message: "Informe a cidade de destino." };
  if (!(valor > 0)) return { ok: false, message: "Informe o valor que será pago ao entregador." };
  const data = txt(f, "coleta");
  const [e] = await db.insert(E).values({
    loja: lojaValida(txt(f, "loja")), origem: txt(f, "origem") || "Mogi Mirim-SP", destino, uf: txt(f, "uf").toUpperCase() || null,
    endereco: txt(f, "endereco") || null, cliente: txt(f, "cliente") || null, contatoCliente: txt(f, "contatoCliente") || null,
    telefoneCliente: normalizarTelefone(txt(f, "telefoneCliente")) || null,
    produto: txt(f, "produto") || null, qtd: num(f, "qtd") || null, kg: num(f, "kg"), distanciaKm: num(f, "km"),
    veiculo: normalizarVeiculo(txt(f, "veiculo")) || null, valor, observacao: txt(f, "observacao") || null,
    coletaEm: data ? new Date(`${data}T12:00:00Z`) : null, criadoPor: u.id,
  }).returning({ id: E.id });
  await audit(u.id, "entregas.publicar", `${destino} R$ ${valor}`);
  avisar(e.id, u.id).catch((err) => console.error("avisar:", err));
  redirect(`/entregas/${e.id}?publicado=1`);
}

export async function cancelar(f: FormData) {
  const u = await requireModule("entregas", "edit");
  const id = txt(f, "id");
  await db.update(E).set({ status: "cancelado" }).where(and(eq(E.id, id), inArray(E.status, ["publicado", "aceito", "coletado"])));
  await audit(u.id, "entregas.cancelar", id);
  revalidatePath(`/entregas/${id}`);
}

/** Tira o frete do entregador e devolve para a lista de disponíveis. */
export async function liberar(f: FormData) {
  const u = await requireModule("entregas", "edit");
  const id = txt(f, "id");
  await db.update(E).set({ status: "publicado", entregadorId: null, aceitoEm: null, coletadoEm: null })
    .where(and(eq(E.id, id), inArray(E.status, ["aceito", "coletado", "cancelado"])));
  await audit(u.id, "entregas.liberar", id);
  if (f.get("avisar") === "1") avisar(id, u.id).catch(() => null);
  revalidatePath(`/entregas/${id}`);
}

export async function reavisar(f: FormData) {
  const u = await requireModule("entregas", "edit");
  await avisar(txt(f, "id"), u.id);
  revalidatePath(`/entregas/${txt(f, "id")}`);
}

const novoPin = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

async function enviarAcesso(nome: string, telefone: string, pin: string, userId: string) {
  const msg = `Olá, ${nome.split(" ")[0]}! 👋\nVocê foi cadastrado no *app de fretes da Asfalto Multi*. Por ele você recebe e aceita os fretes disponíveis.\n\nAcesse: ${appUrl()}/entregador\nTelefone: ${telefone.replace(/^55/, "")}\nSenha: *${pin}*\n\nDica: no celular, abra o link e escolha "Adicionar à tela inicial".`;
  await sendMessage(telefone, msg, "humano", { userId });
  await setAiPaused(telefone, true).catch(() => null);
}

export async function salvarEntregador(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("entregas", "edit");
  const id = txt(f, "id");
  const nome = txt(f, "nome"), telefone = normalizarTelefone(txt(f, "telefone"));
  if (!nome || telefone.length < 12) return { ok: false, message: "Informe nome e WhatsApp com DDD." };
  const veiculos = f.getAll("veiculos").map(String).filter((v) => VEICULOS.some((x) => x.nome === v));
  const dados = { nome, telefone, placa: txt(f, "placa").toUpperCase() || null, documento: txt(f, "documento").replace(/\D/g, "") || null, veiculos };
  const outro = await db.query.entregadores.findFirst({ where: eq(D.telefone, telefone) });
  if (outro && outro.id !== id) return { ok: false, message: `Esse WhatsApp já é do entregador ${outro.nome}.` };
  if (id) {
    await db.update(D).set(dados).where(eq(D.id, id));
    revalidatePath("/entregas/entregadores");
    return { ok: true, message: "Entregador atualizado." };
  }
  const pin = novoPin();
  await db.insert(D).values({ ...dados, pinHash: await bcrypt.hash(pin, 10) });
  await audit(u.id, "entregas.entregador.criar", nome);
  revalidatePath("/entregas/entregadores");
  if (f.get("enviar") === "1") {
    try { await enviarAcesso(nome, telefone, pin, u.id); return { ok: true, message: `${nome} cadastrado. O acesso foi enviado pelo WhatsApp.` }; }
    catch { return { ok: true, message: `${nome} cadastrado, mas o WhatsApp não enviou. Senha: ${pin} — passe para ele.` }; }
  }
  return { ok: true, message: `${nome} cadastrado. Senha de acesso: ${pin} (anote; ela não aparece de novo).` };
}

export async function trocarSenha(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("entregas", "edit");
  const d = await db.query.entregadores.findFirst({ where: eq(D.id, txt(f, "id")) });
  if (!d) return { ok: false, message: "Entregador não encontrado." };
  const pin = novoPin();
  await db.update(D).set({ pinHash: await bcrypt.hash(pin, 10) }).where(eq(D.id, d.id));
  await audit(u.id, "entregas.entregador.senha", d.nome);
  try { await enviarAcesso(d.nome, d.telefone, pin, u.id); return { ok: true, message: "Nova senha enviada pelo WhatsApp." }; }
  catch { return { ok: true, message: `Nova senha: ${pin} — o WhatsApp não enviou, passe para ele.` }; }
}

export async function alternarAtivo(f: FormData) {
  await requireModule("entregas", "edit");
  const d = await db.query.entregadores.findFirst({ where: eq(D.id, txt(f, "id")) });
  if (d) await db.update(D).set({ ativo: !d.ativo }).where(eq(D.id, d.id));
  revalidatePath("/entregas/entregadores");
}
