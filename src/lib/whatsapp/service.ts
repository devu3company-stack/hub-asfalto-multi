import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getConfig } from "../integrations/store";
import { getSetting } from "../settings";
import { AI_PROVIDERS, replyAsAgent, type AiProvider } from "../ai";
import { qrSend } from "./gateway";
import { contextoIA } from "../ia-contexto";
import { oficialSend } from "./oficial";
import { leadDoWhatsApp } from "../crm";
import { disparar } from "../automacoes/motor";
import { rotuloMidia, salvarMidia, type Midia } from "./midia";
import { conexao, conexaoPara, iaLigadaEm } from "./conexoes";
import { avisarForaDoExpediente, reabrirSePreciso, tratarRespostaNps } from "./atendimento";

export type Channel = "qr" | "oficial";
const M = schema.waMessages;
const C = schema.waChats;
const daConversa = (conexaoId: string, chat: string) => and(eq(C.conexaoId, conexaoId), eq(C.chat, chat));

/** Converte o identificador do WhatsApp na chave da conversa (número só com dígitos quando possível). */
export function chatKey(jidOrNumber: string) {
  if (jidOrNumber.endsWith("@s.whatsapp.net")) return jidOrNumber.split("@")[0].split(":")[0];
  if (jidOrNumber.includes("@")) return jidOrNumber;
  return jidOrNumber.replace(/\D/g, "");
}

async function touchChat(conexaoId: string, chat: string, channel: Channel, text: string, name?: string | null) {
  await db.insert(C).values({ conexaoId, chat, channel, name: name ?? null, lastText: text, lastAt: new Date() })
    .onConflictDoUpdate({ target: [C.conexaoId, C.chat], set: { channel, lastText: text, lastAt: new Date(), ...(name ? { name } : {}) } });
}

/** Pausa/retoma a IA numa conversa (sem número: em todas as conversas com esse cliente). */
export async function setAiPaused(chat: string, paused: boolean, conexaoId?: string) {
  await db.update(C).set({ aiPaused: paused }).where(conexaoId ? daConversa(conexaoId, chat) : eq(C.chat, chat));
}

type Envio = { conexao?: string | null; userId?: string | null; vendedorId?: string | null; midia?: Midia };

/** Envia pelo número certo (veja conexaoPara) e registra no histórico. Devolve o número usado. */
export async function sendMessage(chat: string, text: string, sentBy: "ia" | "humano" | "auto", opts: Envio = {}) {
  const conexaoId = await conexaoPara(chat, { conexaoId: opts.conexao, userId: opts.vendedorId });
  const cx = await conexao(conexaoId);
  const channel: Channel = cx?.tipo === "oficial" ? "oficial" : "qr";
  let id: string | undefined;
  if (channel === "oficial") {
    const cfg = await getConfig("whatsapp_oficial");
    if (!cfg) throw new Error("API oficial não configurada na aba Integrações.");
    const r = await oficialSend(cfg, chat, text, opts.midia);
    id = r.id ? `of_${r.id}` : undefined;
  } else {
    const r = await qrSend(conexaoId, chat, text, opts.midia);
    id = r.id ? `qr_${conexaoId}_${r.id}` : undefined;
  }
  const m = opts.midia;
  const arquivo = m ? await salvarMidia(m) : null;
  const texto = text || (m ? rotuloMidia(m.tipo, m.nome) : "");
  await db.insert(M).values({ ...(id ? { id } : {}), conexaoId, chat, channel, fromMe: true, sentBy, userId: opts.userId ?? null, text: texto,
    ...(m ? { midia: arquivo, midiaTipo: m.tipo, midiaMime: m.mime, midiaNome: m.nome ?? null } : {}) })
    .onConflictDoNothing();
  await touchChat(conexaoId, chat, channel, texto);
  // Atendente humano assumiu: a IA para de responder nesta conversa.
  if (sentBy === "humano") await setAiPaused(chat, true, conexaoId);
  return conexaoId;
}

type Incoming = { id?: string; conexaoId: string; chat: string; channel: Channel; fromMe: boolean; name?: string | null; text: string; midia?: Midia | null; midiaFalhou?: { tipo: Midia["tipo"]; nome?: string | null } };

async function camposMidia(m: Incoming) {
  if (m.midia) {
    const arquivo = await salvarMidia(m.midia);
    return { text: m.text || rotuloMidia(m.midia.tipo, m.midia.nome), extra: { midia: arquivo, midiaTipo: m.midia.tipo, midiaMime: m.midia.mime, midiaNome: m.midia.nome ?? null } };
  }
  if (m.midiaFalhou) return { text: m.text || `${rotuloMidia(m.midiaFalhou.tipo, m.midiaFalhou.nome)} (abra no celular)`, extra: {} };
  return { text: m.text, extra: {} };
}

/** Mensagem que chegou (cliente) ou que foi enviada direto pelo celular (fromMe). */
export async function handleIncoming(m: Incoming) {
  const cx = await conexao(m.conexaoId);
  if (!cx) return; // número desconhecido (sessão removida)
  if (m.fromMe) {
    if (m.id && (await db.query.waMessages.findFirst({ where: eq(M.id, m.id) }))) return; // eco do envio pelo hub
    const f = await camposMidia(m);
    await db.insert(M).values({ ...(m.id ? { id: m.id } : {}), conexaoId: m.conexaoId, chat: m.chat, channel: m.channel, fromMe: true, sentBy: "humano", userId: cx.userId, text: f.text, ...f.extra })
      .onConflictDoNothing();
    await touchChat(m.conexaoId, m.chat, m.channel, f.text);
    await setAiPaused(m.chat, true, m.conexaoId); // respondeu pelo celular = humano assumiu
    return;
  }

  if (m.id && (await db.query.waMessages.findFirst({ where: eq(M.id, m.id) }))) return; // repetida
  const f = await camposMidia(m);
  const inserted = await db.insert(M)
    .values({ ...(m.id ? { id: m.id } : {}), conexaoId: m.conexaoId, chat: m.chat, channel: m.channel, fromMe: false, sentBy: "cliente", text: f.text, ...f.extra })
    .onConflictDoNothing().returning({ id: M.id });
  if (!inserted.length) return;
  await touchChat(m.conexaoId, m.chat, m.channel, f.text, m.name);
  await reabrirSePreciso(m.conexaoId, m.chat);

  // Resposta da pesquisa NPS (nota ou comentário): não vai para a IA nem para as automações.
  if (m.text && (await tratarRespostaNps(m.conexaoId, m.chat, m.text).catch(() => false))) return;

  // O lead por CPF/CNPJ funciona em todos os números; o lead fica com o dono do número.
  if (m.text) leadDoWhatsApp({ chat: m.chat, nome: m.name, texto: m.text, responsavelId: cx.userId }).catch((e) => console.error("lead:", e instanceof Error ? e.message : e));

  // "SAIR" vale em qualquer número: não recebe mais disparos, follow-up nem remarketing.
  if (/^\s*(sair|parar|pare|stop|não quero mais|nao quero mais|descadastrar)\s*[.!]*\s*$/i.test(m.text)) {
    await db.update(C).set({ optout: true }).where(eq(C.chat, m.chat));
    await sendMessage(m.chat, "Tudo bem! Você não vai mais receber nossas mensagens automáticas. Se precisar, é só chamar aqui. 🙂", "auto", { conexao: m.conexaoId }).catch(() => null);
    return;
  }

  // Fora do expediente: aviso automático (nos números sem IA).
  await avisarForaDoExpediente(m.conexaoId, m.chat, cx.iaLigada).catch((e) => console.error("expediente:", e instanceof Error ? e.message : e));

  // IA e automações só respondem nos números em que foram ligadas.
  if (!cx.iaLigada) return;

  // Automações por palavra-chave respondem primeiro; se alguma pegou a mensagem, a IA não responde em cima.
  const pegou = await disparar("whatsapp.mensagem", { chat: m.chat, telefone: m.chat, conexao: m.conexaoId, vendedorId: cx.userId, nome: m.name ?? null, texto: m.text }, inserted[0].id)
    .catch((e) => { console.error("automação:", e instanceof Error ? e.message : e); return 0; });
  if (pegou) return;
  replyWithAI(m.conexaoId, m.chat).catch((e) => console.error("IA:", e instanceof Error ? e.message : e));
}

async function historico(conexaoId: string, chat: string) {
  const recent = await db.query.waMessages.findMany({ where: and(eq(M.conexaoId, conexaoId), eq(M.chat, chat)), orderBy: desc(M.createdAt), limit: 20 });
  return recent.reverse().map((x) => ({ fromCustomer: !x.fromMe, text: x.text }));
}

async function gerarResposta(conexaoId: string, chat: string, extra = "") {
  const provider = (await getSetting("ia.provedor")) as AiProvider;
  if (!AI_PROVIDERS.includes(provider)) return null;
  const cfg = await getConfig(provider);
  if (!cfg) return null;
  const history = await historico(conexaoId, chat);
  const instructions = await getSetting("ia.instrucoes");
  const ultimas = history.slice(-4).filter((h) => h.fromCustomer).map((h) => h.text).join("\n");
  const contexto = await contextoIA(ultimas, chat).catch(() => "");
  return replyAsAgent(provider, cfg, instructions + contexto + (extra ? `\n\n${extra}` : ""), history);
}

/** Texto que a IA responderia, sem enviar (para o vendedor aprovar). */
export async function rascunhoIA(chat: string, extra = "", conexaoId?: string | null) {
  return (await gerarResposta(await conexaoPara(chat, { conexaoId }), chat, extra))?.text ?? null;
}

/** Usado pelas automações: responde com a IA no número da conversa. */
export async function responderComIA(chat: string, conexaoId?: string | null) {
  const cx = await conexaoPara(chat, { conexaoId });
  const a = await gerarResposta(cx, chat);
  if (!a?.text) return false;
  await sendMessage(chat, a.text, "ia", { conexao: cx });
  if (a.handoff) await setAiPaused(chat, true, cx);
  return true;
}

async function replyWithAI(conexaoId: string, chat: string) {
  if (!(await iaLigadaEm(conexaoId))) return;
  const row = await db.query.waChats.findFirst({ where: daConversa(conexaoId, chat) });
  if (row?.aiPaused) return;
  // Espera um pouco para juntar mensagens que o cliente manda em sequência.
  await new Promise((r) => setTimeout(r, 4000));
  const last = await db.query.waMessages.findFirst({ where: and(eq(M.conexaoId, conexaoId), eq(M.chat, chat)), orderBy: desc(M.createdAt) });
  if (!last || last.fromMe) return; // já respondido, ou outra execução cuidou
  const answer = await gerarResposta(conexaoId, chat);
  if (!answer?.text) return;
  await sendMessage(chat, answer.text, "ia", { conexao: conexaoId });
  if (answer.handoff) await setAiPaused(chat, true, conexaoId);
}
