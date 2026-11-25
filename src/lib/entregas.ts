import "server-only";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { appUrl } from "./email/envio";
import { registrarNoHistorico } from "./frete/historico";
import { sendMessage, setAiPaused } from "./whatsapp/service";
import { dispararDepois, linkComprovante } from "./automacoes/motor";

/** Avisa as automações do cliente (entregador confirmado, saiu, entregue). */
async function eventoEntrega(id: string, status: string) {
  const e = await db.query.entregas.findFirst({ where: eq(E.id, id), with: { entregador: { columns: { nome: true } } } });
  if (!e) return;
  const tel = (e.telefoneCliente || e.contatoCliente || "").replace(/\D/g, "");
  dispararDepois("entrega.status", { status, entregaId: e.id, nome: e.cliente, telefone: tel.length >= 10 ? tel : null, destino: `${e.destino}${e.uf ? `/${e.uf}` : ""}`,
    entregador: e.entregador?.nome ?? "", linkComprovante: status === "entregue" ? await linkComprovante(e.id) : "", loja: e.loja }, `${e.id}:${status}`);
}

const E = schema.entregas;
const D = schema.entregadores;

export const STATUS: Record<string, { rotulo: string; tom: "orange" | "blue" | "yellow" | "green" | "gray" }> = {
  publicado: { rotulo: "Aguardando entregador", tom: "orange" },
  aceito: { rotulo: "Aceito", tom: "blue" },
  coletado: { rotulo: "Em rota", tom: "yellow" },
  entregue: { rotulo: "Entregue", tom: "green" },
  cancelado: { rotulo: "Cancelado", tom: "gray" },
};

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const kgTxt = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
const diaTxt = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }) : "a combinar");

type Entrega = typeof E.$inferSelect;

export function resumo(e: Entrega) {
  return [
    `${e.origem} → ${e.destino}${e.uf ? `/${e.uf}` : ""}${e.distanciaKm ? ` (${Math.round(e.distanciaKm)} km)` : ""}`,
    [e.kg ? kgTxt(e.kg) : null, e.produto ? `${e.qtd ? `${e.qtd} ` : ""}${e.produto}` : null, e.veiculo].filter(Boolean).join(" · "),
    `Valor: *${reais(e.valor)}*`,
    `Coleta: ${diaTxt(e.coletaEm)}`,
  ].join("\n");
}

/** Entregadores ativos que rodam com o veículo pedido (quem não marcou veículo recebe todos). */
async function candidatos(veiculo: string | null) {
  const todos = await db.query.entregadores.findMany({ where: eq(D.ativo, true) });
  return todos.filter((d) => !veiculo || !d.veiculos.length || d.veiculos.includes(veiculo));
}

async function whats(telefone: string, texto: string, userId?: string | null) {
  await sendMessage(telefone, texto, "humano", { userId: userId ?? undefined });
  await setAiPaused(telefone, true).catch(() => null); // a IA não responde aos entregadores
}

/** Avisa pelo WhatsApp os entregadores que podem levar o frete. */
export async function avisar(entregaId: string, userId?: string | null) {
  const e = await db.query.entregas.findFirst({ where: eq(E.id, entregaId) });
  if (!e || e.status !== "publicado") return 0;
  const lista = await candidatos(e.veiculo);
  const msg = `🚚 *Frete disponível — Asfalto Multi*\n\n${resumo(e)}\n\nPara ver e aceitar: ${appUrl()}/entregador/f/${e.id}\n_Quem aceitar primeiro leva._`;
  let ok = 0;
  for (const d of lista) {
    try { await whats(d.telefone, msg, userId); ok++; } catch (err) { console.error("aviso entregador:", d.nome, err instanceof Error ? err.message : err); }
    await new Promise((r) => setTimeout(r, 1500)); // espaça as mensagens para o WhatsApp não bloquear o número
  }
  await db.update(E).set({ avisados: ok }).where(eq(E.id, e.id));
  return ok;
}

export async function aceitar(entregaId: string, entregadorId: string) {
  const d = await db.query.entregadores.findFirst({ where: eq(D.id, entregadorId) });
  const e0 = await db.query.entregas.findFirst({ where: eq(E.id, entregaId) });
  if (!d || !e0) return { ok: false as const, message: "Frete não encontrado." };
  if (e0.veiculo && d.veiculos.length && !d.veiculos.includes(e0.veiculo)) return { ok: false as const, message: `Este frete pede ${e0.veiculo}.` };
  // Só um ganha: a troca de status só acontece se ainda estiver publicado.
  const [e] = await db.update(E).set({ status: "aceito", entregadorId, aceitoEm: new Date() })
    .where(and(eq(E.id, entregaId), eq(E.status, "publicado"))).returning();
  if (!e) return { ok: false as const, message: e0.entregadorId === entregadorId ? "Você já aceitou este frete." : "Outro entregador aceitou primeiro." };
  const end = [e.endereco, e.cliente ? `Cliente: ${e.cliente}` : null, e.contatoCliente ? `Contato: ${e.contatoCliente}` : null].filter(Boolean).join("\n");
  whats(d.telefone, `✅ *O frete é seu!*\n\n${resumo(e)}${end ? `\n\n${end}` : ""}\n\nMarque a coleta e a entrega pelo app: ${appUrl()}/entregador/f/${e.id}`)
    .catch((err) => console.error("confirmação entregador:", err instanceof Error ? err.message : err));
  await eventoEntrega(e.id, "aceito");
  return { ok: true as const };
}

export async function coletar(entregaId: string, entregadorId: string) {
  const [e] = await db.update(E).set({ status: "coletado", coletadoEm: new Date() })
    .where(and(eq(E.id, entregaId), eq(E.entregadorId, entregadorId), eq(E.status, "aceito"))).returning({ id: E.id });
  if (e) await eventoEntrega(e.id, "coletado");
  return !!e;
}

const pasta = () => path.join(path.dirname(process.env.MANUAIS_DIR ?? "/app/data/manuais"), "entregas");

export async function entregar(entregaId: string, entregadorId: string, p: { foto: Buffer; ext: string; lat?: number | null; lng?: number | null; precisao?: number | null; recebedor?: string | null }) {
  await mkdir(pasta(), { recursive: true });
  const arquivo = `${createId()}.${p.ext}`;
  await writeFile(path.join(pasta(), arquivo), p.foto);
  const [e] = await db.update(E).set({ status: "entregue", entregueEm: new Date(), canhoto: arquivo, recebedor: p.recebedor ?? null,
    entregaLat: p.lat ?? null, entregaLng: p.lng ?? null, entregaPrecisao: p.precisao ?? null })
    .where(and(eq(E.id, entregaId), eq(E.entregadorId, entregadorId), inArray(E.status, ["aceito", "coletado"]))).returning();
  if (!e) return false;
  await registrarNoHistorico(e);
  await eventoEntrega(e.id, "entregue");
  return true;
}

export async function lerCanhoto(arquivo: string) {
  if (!/^[a-z0-9]+\.(jpg|jpeg|png|webp|heic)$/i.test(arquivo)) throw new Error("nome inválido");
  return readFile(path.join(pasta(), arquivo));
}
