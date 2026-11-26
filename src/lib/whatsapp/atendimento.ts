import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getSetting, setSetting } from "../settings";
import { sendMessage } from "./service";
import { conexao } from "./conexoes";

const C = schema.waChats, NPS = schema.npsRespostas;
const daConversa = (cx: string, chat: string) => and(eq(C.conexaoId, cx), eq(C.chat, chat));

// ───────── Expediente ─────────

export const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export type Expediente = { ativo: boolean; mensagem: string; dias: ({ abre: string; fecha: string } | null)[] };
const EXP_PADRAO: Expediente = {
  ativo: false,
  mensagem: "Olá! Nosso atendimento é de segunda a sexta, das 8h às 18h, e sábado das 8h às 12h. Recebemos sua mensagem e respondemos assim que abrirmos. 😉",
  dias: [null, { abre: "08:00", fecha: "18:00" }, { abre: "08:00", fecha: "18:00" }, { abre: "08:00", fecha: "18:00" }, { abre: "08:00", fecha: "18:00" }, { abre: "08:00", fecha: "18:00" }, { abre: "08:00", fecha: "12:00" }],
};

export async function expediente(): Promise<Expediente> {
  try { return { ...EXP_PADRAO, ...JSON.parse(await getSetting("whatsapp.expediente")) }; } catch { return EXP_PADRAO; }
}
export const salvarExpediente = (e: Expediente) => setSetting("whatsapp.expediente", JSON.stringify(e));

function agoraSP(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d).map((x) => [x.type, x.value]));
  return { dia: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday), hhmm: `${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}` };
}

export function aberto(e: Expediente, d = new Date()) {
  const { dia, hhmm } = agoraSP(d);
  const h = e.dias[dia];
  return !!h && hhmm >= h.abre && hhmm < h.fecha;
}

/** Fora do expediente: responde uma vez a cada 12 horas por conversa. Nos números com IA ligada, a IA atende e o aviso não sai. */
export async function avisarForaDoExpediente(conexaoId: string, chat: string, iaLigada: boolean) {
  if (iaLigada) return false;
  const e = await expediente();
  if (!e.ativo || !e.mensagem.trim() || aberto(e)) return false;
  const c = await db.query.waChats.findFirst({ where: daConversa(conexaoId, chat), columns: { foraEnviadoEm: true } });
  if (c?.foraEnviadoEm && Date.now() - c.foraEnviadoEm.getTime() < 12 * 3600_000) return false;
  await db.update(C).set({ foraEnviadoEm: new Date() }).where(daConversa(conexaoId, chat));
  await sendMessage(chat, e.mensagem.trim(), "auto", { conexao: conexaoId });
  return true;
}

// ───────── NPS ─────────

export type NpsConfig = { ativo: boolean; pergunta: string; agradece: string; melhoria: string; obrigadoComentario: string };
const NPS_PADRAO: NpsConfig = {
  ativo: true,
  pergunta: "Antes de encerrar: de *0 a 10*, quanto você recomendaria a Asfalto Multi para um amigo ou colega? Responda só com o número. 🙂",
  agradece: "Muito obrigado pela avaliação! 🙏",
  melhoria: "Obrigado por responder! O que poderíamos ter feito melhor?",
  obrigadoComentario: "Anotado! Obrigado por nos ajudar a melhorar. 🙏",
};
export async function npsConfig(): Promise<NpsConfig> {
  try { return { ...NPS_PADRAO, ...JSON.parse(await getSetting("whatsapp.nps")) }; } catch { return NPS_PADRAO; }
}
export const salvarNpsConfig = (c: NpsConfig) => setSetting("whatsapp.nps", JSON.stringify(c));

/** Manda a pergunta de 0 a 10 e fica esperando a nota nesta conversa. */
export async function enviarNps(conexaoId: string, chat: string, origem: "atendimento" | "automacao", userId?: string | null) {
  const cfg = await npsConfig();
  if (!cfg.ativo) return false;
  const cx = await conexao(conexaoId);
  const conversa = await db.query.waChats.findFirst({ where: daConversa(conexaoId, chat) });
  const [r] = await db.insert(NPS).values({ conexaoId, chat, nome: conversa?.name ?? null, userId: userId ?? cx?.userId ?? null, origem }).returning({ id: NPS.id });
  await sendMessage(chat, cfg.pergunta, "auto", { conexao: conexaoId });
  await db.update(C).set({ npsEtapa: "nota", npsId: r.id }).where(daConversa(conexaoId, chat));
  return true;
}

/** Se a conversa está esperando a nota (ou o comentário), guarda a resposta. Devolve true quando a mensagem foi usada pela pesquisa. */
export async function tratarRespostaNps(conexaoId: string, chat: string, texto: string) {
  const c = await db.query.waChats.findFirst({ where: daConversa(conexaoId, chat) });
  if (!c?.npsEtapa || !c.npsId) return false;
  const r = await db.query.npsRespostas.findFirst({ where: eq(NPS.id, c.npsId) });
  const limpar = () => db.update(C).set({ npsEtapa: null, npsId: null }).where(daConversa(conexaoId, chat));
  if (!r || Date.now() - r.createdAt.getTime() > 3 * 86400_000) { await limpar(); return false; } // pesquisa velha: ignora
  const cfg = await npsConfig();
  if (c.npsEtapa === "nota") {
    const m = texto.trim().match(/^(10|[0-9])(\s*\/\s*10)?\s*[.!]*$/);
    if (!m) { await limpar(); return false; } // respondeu outra coisa: segue o atendimento normal
    const nota = Number(m[1]);
    await db.update(NPS).set({ nota, respondidaEm: new Date() }).where(eq(NPS.id, r.id));
    if (nota <= 8) {
      await db.update(C).set({ npsEtapa: "comentario" }).where(daConversa(conexaoId, chat));
      await sendMessage(chat, cfg.melhoria, "auto", { conexao: conexaoId });
    } else {
      await limpar();
      await sendMessage(chat, cfg.agradece, "auto", { conexao: conexaoId });
    }
    return true;
  }
  if (c.npsEtapa === "comentario") {
    await db.update(NPS).set({ comentario: texto.slice(0, 2000) }).where(eq(NPS.id, r.id));
    await limpar();
    await sendMessage(chat, cfg.obrigadoComentario, "auto", { conexao: conexaoId });
    return true;
  }
  return false;
}

/** NPS = % promotores (9–10) − % detratores (0–6). */
export function calcularNps(notas: number[]) {
  if (!notas.length) return { nps: null as number | null, promotores: 0, neutros: 0, detratores: 0, total: 0 };
  const p = notas.filter((n) => n >= 9).length, d = notas.filter((n) => n <= 6).length;
  return { nps: Math.round(((p - d) / notas.length) * 100), promotores: p, neutros: notas.length - p - d, detratores: d, total: notas.length };
}

// ───────── Atendimento: finalizar e transferir ─────────

export async function finalizar(conexaoId: string, chat: string, userId: string, comNps: boolean) {
  await db.update(C).set({ status: "finalizado" }).where(daConversa(conexaoId, chat));
  if (comNps) await enviarNps(conexaoId, chat, "atendimento", userId);
}

/** Cliente voltou a escrever numa conversa finalizada: reabre. */
export async function reabrirSePreciso(conexaoId: string, chat: string) {
  await db.update(C).set({ status: "aberto" }).where(and(daConversa(conexaoId, chat), eq(C.status, "finalizado")));
}

/**
 * Passa o atendimento para outro usuário: avisa o cliente (opcional), o colega chama pelo número dele
 * (se estiver conectado), registra a nota interna e muda o responsável da negociação.
 */
export async function transferir(p: { deConexao: string; chat: string; deUserId: string; paraUserId: string; nota: string; avisarCliente: string | null; apresentacao: string | null }) {
  const para = await db.query.users.findFirst({ where: eq(schema.users.id, p.paraUserId), columns: { id: true, name: true } });
  if (!para) throw new Error("Usuário não encontrado.");
  const destino = await db.query.waConexoes.findFirst({ where: eq(schema.waConexoes.userId, para.id) });
  const conversa = await db.query.waChats.findFirst({ where: daConversa(p.deConexao, p.chat) });
  await db.insert(schema.waTransferencias).values({ chat: p.chat, nome: conversa?.name ?? null, deConexao: p.deConexao, deUserId: p.deUserId, paraUserId: para.id,
    paraConexao: destino?.id ?? null, nota: p.nota || null });

  if (p.avisarCliente) await sendMessage(p.chat, p.avisarCliente, "humano", { conexao: p.deConexao, userId: p.deUserId });
  let chamou = false;
  if (destino && destino.id !== p.deConexao && p.apresentacao) {
    try { await sendMessage(p.chat, p.apresentacao, "humano", { conexao: destino.id, userId: para.id }); chamou = true; }
    catch { /* número do colega desconectado: ele chama depois */ }
    if (conversa?.name) await db.update(C).set({ name: conversa.name }).where(daConversa(destino.id, p.chat));
  }
  await db.update(C).set({ status: "finalizado" }).where(daConversa(p.deConexao, p.chat));

  // Funil: a negociação passa para o colega, com tarefa para ele.
  const tel = p.chat.replace(/^55(?=\d{10,11}$)/, "");
  const neg = await db.query.crmNegociacoes.findFirst({ where: and(eq(schema.crmNegociacoes.telefone, tel), eq(schema.crmNegociacoes.status, "andamento")), orderBy: desc(schema.crmNegociacoes.createdAt) });
  if (neg) {
    await db.update(schema.crmNegociacoes).set({ responsavelId: para.id, updatedAt: new Date() }).where(eq(schema.crmNegociacoes.id, neg.id));
    await db.insert(schema.crmHistorico).values({ negociacaoId: neg.id, userId: p.deUserId, tipo: "nota", texto: `Atendimento transferido para ${para.name}${p.nota ? `: ${p.nota}` : ""}` });
    await db.insert(schema.crmTarefas).values({ negociacaoId: neg.id, tipo: "whatsapp", descricao: `Atendimento transferido${p.nota ? `: ${p.nota}` : ""}`, quando: new Date(), responsavelId: para.id });
  }
  return { para: para.name, chamou, semNumero: !destino };
}

/** Transferências recebidas por este usuário para esta conversa (dão acesso de leitura à conversa original). */
export async function transferidaPara(userId: string, chat: string) {
  return db.query.waTransferencias.findMany({ where: and(eq(schema.waTransferencias.paraUserId, userId), eq(schema.waTransferencias.chat, chat)),
    orderBy: desc(schema.waTransferencias.createdAt), with: { de: { columns: { name: true } } }, limit: 5 });
}
