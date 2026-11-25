import "server-only";
import { desc, eq } from "drizzle-orm";
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

export type Channel = "qr" | "oficial";
const M = schema.waMessages;
const C = schema.waChats;

/** Converte o identificador do WhatsApp na chave da conversa (número só com dígitos quando possível). */
export function chatKey(jidOrNumber: string) {
  if (jidOrNumber.endsWith("@s.whatsapp.net")) return jidOrNumber.split("@")[0].split(":")[0];
  if (jidOrNumber.includes("@")) return jidOrNumber;
  return jidOrNumber.replace(/\D/g, "");
}

async function touchChat(chat: string, channel: Channel, text: string, name?: string | null) {
  await db.insert(C).values({ chat, channel, name: name ?? null, lastText: text, lastAt: new Date() })
    .onConflictDoUpdate({
      target: C.chat,
      set: { channel, lastText: text, lastAt: new Date(), ...(name ? { name } : {}) },
    });
}

export async function setAiPaused(chat: string, paused: boolean) {
  await db.update(C).set({ aiPaused: paused }).where(eq(C.chat, chat));
}

/** Envia uma mensagem pelo canal escolhido e registra no histórico. */
export async function sendMessage(chat: string, text: string, sentBy: "ia" | "humano" | "auto", opts: { channel?: Channel; userId?: string; midia?: Midia } = {}) {
  // Responde pelo canal da conversa; conversa nova usa o canal escolhido na tela WhatsApp.
  const existing = opts.channel ? null : await db.query.waChats.findFirst({ where: eq(C.chat, chat) });
  const channel = opts.channel ?? (existing?.channel as Channel | undefined) ?? ((await getSetting("whatsapp.canal")) as Channel);
  let id: string | undefined;
  if (channel === "oficial") {
    const cfg = await getConfig("whatsapp_oficial");
    if (!cfg) throw new Error("API oficial não configurada na aba Integrações.");
    const r = await oficialSend(cfg, chat, text, opts.midia);
    id = r.id ? `of_${r.id}` : undefined;
  } else {
    const r = await qrSend(chat, text, opts.midia);
    id = r.id ? `qr_${r.id}` : undefined;
  }
  const m = opts.midia;
  const arquivo = m ? await salvarMidia(m) : null;
  const texto = text || (m ? rotuloMidia(m.tipo, m.nome) : "");
  await db.insert(M).values({ ...(id ? { id } : {}), chat, channel, fromMe: true, sentBy, userId: opts.userId ?? null, text: texto,
    ...(m ? { midia: arquivo, midiaTipo: m.tipo, midiaMime: m.mime, midiaNome: m.nome ?? null } : {}) })
    .onConflictDoNothing();
  await touchChat(chat, channel, texto);
  // Atendente humano assumiu: a IA para de responder nesta conversa.
  if (sentBy === "humano") await setAiPaused(chat, true);
}

type Incoming = { id?: string; chat: string; channel: Channel; fromMe: boolean; name?: string | null; text: string; midia?: Midia | null; midiaFalhou?: { tipo: Midia["tipo"]; nome?: string | null } };

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
  if (m.fromMe) {
    // Já registrada pelo hub? Então é eco do envio; nada a fazer.
    if (m.id && (await db.query.waMessages.findFirst({ where: eq(M.id, m.id) }))) return;
    const f = await camposMidia(m);
    await db.insert(M).values({ ...(m.id ? { id: m.id } : {}), chat: m.chat, channel: m.channel, fromMe: true, sentBy: "humano", text: f.text, ...f.extra })
      .onConflictDoNothing();
    await touchChat(m.chat, m.channel, f.text);
    await setAiPaused(m.chat, true); // respondeu pelo celular = humano assumiu
    return;
  }

  if (m.id && (await db.query.waMessages.findFirst({ where: eq(M.id, m.id) }))) return; // repetida (a Meta reenvia avisos)
  const f = await camposMidia(m);
  const inserted = await db.insert(M)
    .values({ ...(m.id ? { id: m.id } : {}), chat: m.chat, channel: m.channel, fromMe: false, sentBy: "cliente", text: f.text, ...f.extra })
    .onConflictDoNothing().returning({ id: M.id });
  if (!inserted.length) return;
  await touchChat(m.chat, m.channel, f.text, m.name);

  // "SAIR": não recebe mais mensagens de follow-up e remarketing.
  if (/^\s*(sair|parar|pare|stop|não quero mais|nao quero mais)\s*[.!]*\s*$/i.test(m.text)) {
    await db.update(C).set({ optout: true }).where(eq(C.chat, m.chat));
    await sendMessage(m.chat, "Tudo bem! Você não vai mais receber nossas mensagens automáticas. Se precisar, é só chamar aqui. 🙂", "auto", { channel: m.channel });
    return;
  }
  if (m.text) leadDoWhatsApp({ chat: m.chat, nome: m.name, texto: m.text }).catch((e) => console.error("lead:", e instanceof Error ? e.message : e));

  // Automações por palavra-chave respondem primeiro; se alguma pegou a mensagem, a IA não responde em cima.
  const pegou = await disparar("whatsapp.mensagem", { chat: m.chat, telefone: m.chat, nome: m.name ?? null, texto: m.text }, inserted[0].id)
    .catch((e) => { console.error("automação:", e instanceof Error ? e.message : e); return 0; });
  if (pegou) return;
  replyWithAI(m.chat, m.channel).catch((e) => console.error("IA:", e instanceof Error ? e.message : e));
}

async function gerarResposta(chat: string, extra = "") {
  const provider = (await getSetting("ia.provedor")) as AiProvider;
  if (!AI_PROVIDERS.includes(provider)) return null;
  const cfg = await getConfig(provider);
  if (!cfg) return null;
  const recent = await db.query.waMessages.findMany({ where: eq(M.chat, chat), orderBy: desc(M.createdAt), limit: 20 });
  const history = recent.reverse().map((x) => ({ fromCustomer: !x.fromMe, text: x.text }));
  const instructions = await getSetting("ia.instrucoes");
  const ultimas = history.slice(-4).filter((h) => h.fromCustomer).map((h) => h.text).join("\n");
  const contexto = await contextoIA(ultimas, chat).catch(() => "");
  return replyAsAgent(provider, cfg, instructions + contexto + (extra ? `\n\n${extra}` : ""), history);
}

/** Texto que a IA responderia, sem enviar (para o vendedor aprovar). */
export async function rascunhoIA(chat: string, extra = "") {
  return (await gerarResposta(chat, extra))?.text ?? null;
}

/** Usado pelas automações: responde com a IA mesmo se a IA geral estiver desligada. */
export async function responderComIA(chat: string) {
  const a = await gerarResposta(chat);
  if (!a?.text) return false;
  await sendMessage(chat, a.text, "ia");
  if (a.handoff) await setAiPaused(chat, true);
  return true;
}

async function replyWithAI(chat: string, channel: Channel) {
  if ((await getSetting("ia.ligada")) !== "sim") return;
  const row = await db.query.waChats.findFirst({ where: eq(C.chat, chat) });
  if (row?.aiPaused) return;
  const provider = (await getSetting("ia.provedor")) as AiProvider;
  if (!AI_PROVIDERS.includes(provider)) return;
  const cfg = await getConfig(provider);
  if (!cfg) return;

  // Espera um pouco para juntar mensagens que o cliente manda em sequência.
  await new Promise((r) => setTimeout(r, 4000));
  const last = await db.query.waMessages.findFirst({ where: eq(M.chat, chat), orderBy: desc(M.createdAt) });
  if (!last || last.fromMe) return; // já respondido, ou outra execução cuidou

  const recent = await db.query.waMessages.findMany({ where: eq(M.chat, chat), orderBy: desc(M.createdAt), limit: 20 });
  const history = recent.reverse().map((x) => ({ fromCustomer: !x.fromMe, text: x.text }));
  const instructions = await getSetting("ia.instrucoes");
  const ultimas = history.slice(-4).filter((h) => h.fromCustomer).map((h) => h.text).join("\n");
  const contexto = await contextoIA(ultimas, chat).catch(() => "");
  const answer = await replyAsAgent(provider, cfg, instructions + contexto, history);
  if (!answer?.text) return;

  await sendMessage(chat, answer.text, "ia", { channel });
  if (answer.handoff) await setAiPaused(chat, true);
}
