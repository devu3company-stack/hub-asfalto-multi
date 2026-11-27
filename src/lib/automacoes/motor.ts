import "server-only";
import { and, asc, desc, eq, gt, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { nomeLoja, lojaValida } from "../lojas";
import { appUrl, enfileirar, marcaDa } from "../email/envio";
import { salvarContato } from "../email/contatos";
import { buscar, lerArquivo } from "../manuais/index";
import { garantirFunil, registrar } from "../crm";
import { rascunhoIA, responderComIA, sendMessage } from "../whatsapp/service";
import { GATILHOS, type Passo } from "./definicoes";
import { conexao as lerConexao, conexaoPara } from "../whatsapp/conexoes";

/**
 * Número por onde a automação fala. Se a automação escolheu um número, é ele (mesmo com a IA desligada lá).
 * Senão: o da conversa, o do vendedor da negociação ou o padrão — e só se as automações estiverem ligadas nele.
 */
async function numeroDaAutomacao(a: Auto, ctx: Contexto, chat: string) {
  const fixo = a.envio?.conexao;
  if (fixo) {
    const cx = await lerConexao(fixo);
    if (cx) return { id: cx.id, ligado: true, nome: cx.nome };
  }
  let vendedor = ctx.vendedorId ? String(ctx.vendedorId) : null;
  if (!ctx.conexao && !vendedor && ctx.negociacaoId) {
    const n = await db.query.crmNegociacoes.findFirst({ where: eq(N.id, String(ctx.negociacaoId)), columns: { responsavelId: true } });
    vendedor = n?.responsavelId ?? null;
  }
  const id = await conexaoPara(chat, { conexaoId: ctx.conexao ? String(ctx.conexao) : null, userId: vendedor });
  const cx = await lerConexao(id);
  return { id, ligado: !!cx?.iaLigada, nome: cx?.nome ?? id };
}

const A = schema.automacoes, X = schema.automacaoExecucoes, AP = schema.automacaoAprovacoes;
const N = schema.crmNegociacoes;

export type Contexto = Record<string, string | number | null | undefined>;
type Exec = typeof X.$inferSelect;
type Auto = typeof A.$inferSelect;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soDigitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
/** Telefone no formato da chave da conversa (55 + DDD + número). */
export const chatDoTelefone = (t: unknown) => {
  const d = soDigitos(t);
  return d.length === 10 || d.length === 11 ? "55" + d : d.length >= 12 ? d : "";
};
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ───────── Disparo ─────────

function combina(a: Auto, ctx: Contexto) {
  const c = a.gatilhoConfig ?? {};
  if (c.loja && ctx.loja && c.loja !== ctx.loja) return false;
  // Automação presa a um número: só reage às mensagens que chegam nele.
  if (a.gatilho === "whatsapp.mensagem" && a.envio?.conexao && ctx.conexao && a.envio.conexao !== ctx.conexao) return false;
  switch (a.gatilho) {
    case "whatsapp.mensagem": {
      const ps = ((c.palavras as string[] | undefined) ?? []).map((p) => norm(p.trim())).filter(Boolean);
      if (!ps.length) return true;
      const t = ` ${norm(String(ctx.texto ?? "")).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
      return ps.some((p) => t.includes(` ${p.replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `));
    }
    case "crm.etapa": return !!c.etapa && norm(String(c.etapa)) === norm(String(ctx.etapa ?? ""));
    case "entrega.status": return c.status === ctx.status;
    default: return true;
  }
}

/**
 * Chamado pelos eventos do Hub. Começa a automação para cada regra ativa que combina.
 * Devolve quantas começaram (o WhatsApp usa isso para a IA não responder por cima).
 */
export async function disparar(gatilho: string, ctx: Contexto, chave: string, opts: { soDoNumero?: boolean } = {}) {
  const autos = (await db.query.automacoes.findMany({ where: and(eq(A.ativa, true), eq(A.gatilho, gatilho)) }))
    .filter((a) => combina(a, ctx) && (!opts.soDoNumero || (!!a.envio?.conexao && a.envio.conexao === ctx.conexao)));
  let n = 0;
  for (const a of autos) {
    // Palavra-chave: não repete a mesma automação na mesma conversa em 12 horas.
    if (gatilho === "whatsapp.mensagem" && ctx.chat) {
      const recente = await db.query.automacaoExecucoes.findFirst({ where: and(eq(X.automacaoId, a.id),
        sql`${X.contexto}->>'chat' = ${String(ctx.chat)}`, gt(X.createdAt, new Date(Date.now() - 12 * 3600_000))), columns: { id: true } });
      if (recente) { n++; continue; }
    }
    const [e] = await db.insert(X).values({ automacaoId: a.id, chave, contexto: ctx }).onConflictDoNothing().returning();
    if (!e) continue;
    n++;
    await processar(e.id).catch((err) => console.error("automação", a.nome, err));
  }
  return n;
}

/** Atalho para disparar sem esperar (eventos do CRM, pedidos e entregas). */
export function dispararDepois(gatilho: string, ctx: Contexto, chave: string) {
  disparar(gatilho, ctx, chave).catch((e) => console.error("automação:", e instanceof Error ? e.message : e));
}

// ───────── Execução ─────────

type Resultado = { acao: "seguir" | "parar" | "esperar"; texto: string; ate?: Date; repetir?: boolean };

async function log(id: string, texto: string) {
  await db.update(X).set({ log: sql`(${X.log} || ${JSON.stringify([{ em: new Date().toISOString(), texto }])}::jsonb)`, updatedAt: new Date() }).where(eq(X.id, id));
}

export async function processar(execId: string) {
  // "Pega" a execução para duas rodadas do worker não rodarem a mesma ao mesmo tempo.
  const [e] = await db.update(X).set({ status: "rodando", updatedAt: new Date() })
    .where(and(eq(X.id, execId), inArray(X.status, ["ativa", "esperando"]), lte(X.proximaEm, new Date()))).returning();
  if (!e) return;
  const a = await db.query.automacoes.findFirst({ where: eq(A.id, e.automacaoId) });
  if (!a) return;
  const passos = a.passos as Passo[];
  const ctx = { ...e.contexto } as Contexto;
  try {
    for (let i = e.passo; i < passos.length; i++) {
      const r = await executar(passos[i], { ...e, contexto: ctx }, a, ctx);
      await log(e.id, r.texto);
      if (r.acao === "parar") {
        await db.update(X).set({ status: "concluida", passo: i + 1, contexto: ctx, updatedAt: new Date() }).where(eq(X.id, e.id));
        return;
      }
      if (r.acao === "esperar") {
        await db.update(X).set({ status: "esperando", passo: r.repetir ? i : i + 1, proximaEm: r.ate!, contexto: ctx, updatedAt: new Date() }).where(eq(X.id, e.id));
        return;
      }
    }
    await db.update(X).set({ status: "concluida", passo: passos.length, contexto: ctx, updatedAt: new Date() }).where(eq(X.id, e.id));
  } catch (err) {
    await log(e.id, `Erro: ${err instanceof Error ? err.message : String(err)}`);
    await db.update(X).set({ status: "erro", contexto: ctx, updatedAt: new Date() }).where(eq(X.id, e.id));
  }
}

// ───────── Variáveis ─────────

/** Nome de quem fala pela automação, conforme "Como se identificar". */
async function meuNome(a: Auto, ctx: Contexto) {
  const env = a.envio ?? {};
  if (env.assinatura === "fixo") return (env.assinaturaFixa ?? "").trim();
  const nomeDe = async (id: string | null | undefined) =>
    id ? (await db.query.users.findFirst({ where: eq(schema.users.id, id), columns: { name: true } }))?.name ?? "" : "";
  if (env.assinatura === "vendedor") {
    let vend = ctx.vendedorId ? String(ctx.vendedorId) : null;
    if (!vend && ctx.negociacaoId) vend = (await db.query.crmNegociacoes.findFirst({ where: eq(N.id, String(ctx.negociacaoId)), columns: { responsavelId: true } }))?.responsavelId ?? null;
    if (vend) return nomeDe(vend);
  }
  // dono do número que envia (também é o reserva do "vendedor")
  const cxId = env.conexao || (ctx.conexao ? String(ctx.conexao) : null);
  const cx = cxId ? await lerConexao(cxId) : null;
  return cx?.userId ? nomeDe(cx.userId) : "";
}

async function variaveis(ctx: Contexto, a?: Auto) {
  const loja = lojaValida(String(ctx.loja ?? "asfaltomulti"));
  const marca = await marcaDa(loja);
  const nome = String(ctx.nome ?? "").trim();
  const env = a?.envio ?? {};
  const primeiro = nome.split(/\s+/)[0] || "";
  // Como chamar o cliente: {{cliente}}
  const cliente = env.cliente === "fixo" ? (env.clienteFixo ?? "").trim()
    : (env.cliente === "completo" ? nome : primeiro) || (env.semNome ?? "").trim();
  const eu = a ? await meuNome(a, ctx) : "";
  return {
    cliente, meu_nome: eu, empresa: marca.nome ?? nomeLoja(loja),
    nome, primeiro_nome: primeiro,
    loja: marca.nome ?? nomeLoja(loja), site: marca.site ?? "", pedido: String(ctx.pedido ?? ""),
    valor: typeof ctx.valor === "number" ? reais(ctx.valor) : String(ctx.valor ?? ""), link_carrinho: String(ctx.linkCarrinho ?? ""),
    destino: String(ctx.destino ?? ""), entregador: String(ctx.entregador ?? ""), link_comprovante: String(ctx.linkComprovante ?? ""),
    etapa: String(ctx.etapa ?? ""),
  } as Record<string, string>;
}
function aplicar(t: string, v: Record<string, string>) {
  // Sem nome: "Oi, {{primeiro_nome}}!" vira "Oi!" e "{{primeiro_nome}}, tudo certo?" vira "Tudo certo?".
  if (!v.primeiro_nome) {
    t = t.replace(/,\s*\{\{\s*(primeiro_)?nome\s*\}\}/g, "").replace(/^\s*\{\{\s*(primeiro_)?nome\s*\}\}\s*,?\s*(\p{L})/u, (_m, _p, l: string) => l.toUpperCase());
  }
  if (!v.cliente) {
    t = t.replace(/,\s*\{\{\s*cliente\s*\}\}/g, "").replace(/^\s*\{\{\s*cliente\s*\}\}\s*,?\s*(\p{L})/u, (_m, l: string) => l.toUpperCase());
  }
  return t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => v[k] ?? "").replace(/[ \t]{2,}/g, " ").trim();
}

// ───────── Horário de envio ─────────

/** Mensagens automáticas de marketing só saem entre 8h e 20h (Brasília). Avisos de entrega saem a qualquer hora. */
function foraDoHorario() {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }));
  if (h >= 8 && h < 20) return null;
  const agora = new Date();
  const alvo = new Date(agora.getTime() + ((h >= 20 ? 24 - h + 8 : 8 - h) * 3600_000));
  alvo.setUTCMinutes(0, 0, 0);
  return alvo;
}

// ───────── CRM ─────────

async function negociacao(ctx: Contexto) {
  if (ctx.negociacaoId) return db.query.crmNegociacoes.findFirst({ where: eq(N.id, String(ctx.negociacaoId)), with: { etapa: true } });
  const tel = soDigitos(ctx.telefone ?? ctx.chat).replace(/^55(?=\d{10,11}$)/, "");
  if (!tel) return null;
  const n = await db.query.crmNegociacoes.findFirst({ where: and(eq(N.telefone, tel), eq(N.status, "andamento")), orderBy: desc(N.createdAt), with: { etapa: true } });
  if (n) ctx.negociacaoId = n.id;
  return n;
}

async function criarLead(ctx: Contexto, titulo?: string) {
  const ja = await negociacao(ctx);
  if (ja) return { n: ja, novo: false };
  const tel = soDigitos(ctx.telefone ?? ctx.chat).replace(/^55(?=\d{10,11}$)/, "");
  const [funil] = await garantirFunil();
  const etapa = await db.query.crmEtapas.findFirst({ where: eq(schema.crmEtapas.funilId, funil.id), orderBy: asc(schema.crmEtapas.ordem) });
  if (!etapa) throw new Error("funil sem etapas");
  const [{ m }] = await db.select({ m: sql<number>`coalesce(max(${N.ordem}), 0)` }).from(N).where(eq(N.etapaId, etapa.id));
  const nome = String(ctx.nome ?? "").trim();
  const [n] = await db.insert(N).values({
    funilId: funil.id, etapaId: etapa.id, titulo: titulo || `${nome || tel} — ${ctx.texto ? String(ctx.texto).slice(0, 40) : "WhatsApp"}`,
    contato: nome || null, telefone: tel || null, email: ctx.email ? String(ctx.email) : null, fonte: "WhatsApp", valor: 0, ordem: Number(m) + 1,
    loja: lojaValida(String(ctx.loja ?? "asfaltomulti")),
  }).returning();
  await registrar(n.id, null, "criada", `Lead criado pela automação${ctx.texto ? `: "${String(ctx.texto).slice(0, 120)}"` : ""}`);
  ctx.negociacaoId = n.id;
  return { n: { ...n, etapa }, novo: true };
}

// ───────── Passos ─────────

async function executar(p: Passo, e: Exec, a: Auto, ctx: Contexto): Promise<Resultado> {
  const c = p.config ?? {};
  const chat = chatDoTelefone(ctx.telefone ?? ctx.chat) || (String(ctx.chat ?? "").includes("@") ? String(ctx.chat) : "");
  switch (p.tipo) {
    case "esperar": {
      const ms = (Number(c.dias) || 0) * 86400_000 + (Number(c.horas) || 0) * 3600_000 + (Number(c.minutos) || 0) * 60_000;
      return ms > 0 ? { acao: "esperar", ate: new Date(Date.now() + ms), texto: `Esperando até ${new Date(Date.now() + ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` } : { acao: "seguir", texto: "Sem espera" };
    }

    case "parar_se_respondeu": {
      if (!chat) return { acao: "seguir", texto: "Sem WhatsApp para conferir resposta" };
      const r = await db.query.waMessages.findFirst({ where: and(eq(schema.waMessages.chat, chat), eq(schema.waMessages.fromMe, false), gt(schema.waMessages.createdAt, e.createdAt)), columns: { id: true } });
      return r ? { acao: "parar", texto: "Parou: o cliente respondeu" } : { acao: "seguir", texto: "Cliente ainda não respondeu" };
    }
    case "parar_se_fechou": {
      const n = await negociacao(ctx);
      if (!n) return { acao: "seguir", texto: "Sem negociação ligada" };
      if (n.status !== "andamento") return { acao: "parar", texto: `Parou: negociação ${n.status === "ganha" ? "vendida" : "perdida"}` };
      if (ctx.etapaId && n.etapaId !== ctx.etapaId) return { acao: "parar", texto: `Parou: negociação já está em "${n.etapa?.nome}"` };
      return { acao: "seguir", texto: "Negociação continua aberta" };
    }
    case "parar_se_comprou": {
      if (ctx.carrinhoId) {
        const k = await db.query.carrinhos.findFirst({ where: eq(schema.carrinhos.id, String(ctx.carrinhoId)), columns: { recuperado: true } });
        if (k?.recuperado) return { acao: "parar", texto: "Parou: o cliente finalizou a compra" };
      }
      if (ctx.email) {
        const k = await db.query.contatos.findFirst({ where: eq(schema.contatos.email, String(ctx.email).toLowerCase()), columns: { ultimaCompraEm: true } });
        if (k?.ultimaCompraEm && k.ultimaCompraEm > e.createdAt) return { acao: "parar", texto: "Parou: o cliente comprou" };
      }
      return { acao: "seguir", texto: "Cliente ainda não comprou" };
    }

    case "whatsapp": {
      if (!chat) return { acao: "seguir", texto: "Pulou o WhatsApp: cliente sem telefone" };
      const conversa = await db.query.waChats.findFirst({ where: and(eq(schema.waChats.chat, chat), eq(schema.waChats.optout, true)), columns: { optout: true } });
      if (conversa?.optout && a.grupo !== "frete") return { acao: "seguir", texto: "Pulou o WhatsApp: cliente pediu para sair" };
      const numero = await numeroDaAutomacao(a, ctx, chat);
      if (!numero.ligado) return { acao: "seguir", texto: `Pulou o WhatsApp: automações desligadas no número de ${numero.nome}` };
      if (a.grupo !== "frete") { const ate = foraDoHorario(); if (ate) return { acao: "esperar", ate, repetir: true, texto: "Fora do horário (8h–20h): envia às 8h" }; }
      const texto = aplicar(String(c.texto ?? ""), await variaveis(ctx, a));
      if (!texto) return { acao: "seguir", texto: "Mensagem vazia" };
      if (c.aprovacao) {
        await db.insert(AP).values({ execucaoId: e.id, automacaoId: a.id, conexaoId: numero.id, chat, nome: ctx.nome ? String(ctx.nome) : null, pedido: ctx.texto ? String(ctx.texto) : null, texto });
        return { acao: "seguir", texto: "Mensagem aguardando aprovação do vendedor" };
      }
      await sendMessage(chat, texto, "auto", { conexao: numero.id });
      return { acao: "seguir", texto: `WhatsApp enviado: "${texto.slice(0, 80)}"` };
    }

    case "orcamento": {
      if (!chat) return { acao: "seguir", texto: "Sem WhatsApp" };
      const numero = await numeroDaAutomacao(a, ctx, chat);
      const sugestao = await rascunhoIA(chat, `Tarefa agora: ${String(c.instrucao ?? "")} A resposta será revisada por um vendedor antes de ir para o cliente.`, numero.id).catch(() => null);
      await db.insert(AP).values({ execucaoId: e.id, automacaoId: a.id, conexaoId: numero.id, chat, nome: ctx.nome ? String(ctx.nome) : null, pedido: ctx.texto ? String(ctx.texto) : null,
        texto: sugestao || `Olá${ctx.nome ? `, ${String(ctx.nome).split(" ")[0]}` : ""}! Vou preparar seu orçamento. Pode me confirmar a quantidade e o CEP de entrega?` });
      return { acao: "seguir", texto: sugestao ? "Orçamento montado pela IA, aguardando aprovação" : "Pedido de orçamento enviado para o vendedor (IA não configurada)" };
    }

    case "enviar_manual": {
      if (!chat) return { acao: "seguir", texto: "Sem WhatsApp" };
      const [r] = await buscar(String(ctx.texto ?? ""), { soIA: true, limite: 1 });
      if (!r) return { acao: "seguir", texto: "Nenhum manual com esse assunto" };
      const numero = await numeroDaAutomacao(a, ctx, chat);
      if (!numero.ligado) return { acao: "seguir", texto: `Pulou: automações desligadas no número de ${numero.nome}` };
      await sendMessage(chat, `Sobre isso, o manual *${r.titulo}* (pág. ${r.pagina}) diz:\n\n${r.trecho.slice(0, 900)}`, "auto", { conexao: numero.id });
      if (c.pdf !== false) {
        const m = await db.query.manuais.findFirst({ where: eq(schema.manuais.id, r.manualId) });
        if (m) {
          const buf = await lerArquivo(m.arquivo).catch(() => null);
          if (buf && buf.length < 16 * 1024 * 1024) await sendMessage(chat, "", "auto", { conexao: numero.id, midia: { buffer: buf, mime: "application/pdf", nome: `${m.titulo}.pdf`, tipo: "documento" } });
        }
      }
      return { acao: "seguir", texto: `Respondeu com o manual "${r.titulo}"` };
    }
    case "pesquisa_nps": {
      if (!chat) return { acao: "seguir", texto: "Sem WhatsApp" };
      const numero = await numeroDaAutomacao(a, ctx, chat);
      if (!numero.ligado) return { acao: "seguir", texto: `Pulou: automações desligadas no número de ${numero.nome}` };
      const { enviarNps } = await import("../whatsapp/atendimento");
      return (await enviarNps(numero.id, chat, "automacao")) ? { acao: "seguir", texto: "Pesquisa NPS enviada" } : { acao: "seguir", texto: "Pesquisa NPS desligada nas configurações" };
    }
    case "responder_ia": {
      if (!chat) return { acao: "seguir", texto: "Sem WhatsApp" };
      const numero = await numeroDaAutomacao(a, ctx, chat);
      if (!numero.ligado) return { acao: "seguir", texto: `Pulou: IA desligada no número de ${numero.nome}` };
      return (await responderComIA(chat, numero.id)) ? { acao: "seguir", texto: "A IA respondeu" } : { acao: "seguir", texto: "IA não configurada" };
    }

    case "email": {
      if (!ctx.email) return { acao: "seguir", texto: "Pulou o e-mail: cliente sem e-mail" };
      const loja = lojaValida(String(ctx.loja ?? "asfaltomulti"));
      const contato = await salvarContato({ email: String(ctx.email), nome: ctx.nome ? String(ctx.nome) : null, telefone: ctx.telefone ? String(ctx.telefone) : null, origem: "manual", loja });
      if (!contato) return { acao: "seguir", texto: "E-mail inválido" };
      const v = await variaveis(ctx, a);
      const r = await enfileirar(contato, aplicar(String(c.assunto ?? ""), v), {
        titulo: aplicar(String(c.titulo ?? c.assunto ?? ""), v), texto: aplicar(String(c.texto ?? ""), v),
        botaoTexto: c.botaoTexto ? String(c.botaoTexto) : undefined, botaoUrl: c.botaoUrl ? aplicar(String(c.botaoUrl), v) : undefined,
      }, { loja, automacao: `auto:${a.id}`, referencia: `auto:${e.id}:${p.id}`, extra: v, contaId: a.envio?.emailConta || null,
        remetenteNome: a.envio?.assinatura && v.meu_nome ? `${v.meu_nome} | ${v.empresa}` : null });
      return { acao: "seguir", texto: r ? `E-mail na fila: ${String(c.assunto ?? "")}` : "Pulou o e-mail: contato descadastrado" };
    }

    case "criar_lead": {
      const r = await criarLead(ctx, c.titulo ? aplicar(String(c.titulo), await variaveis(ctx, a)) : undefined);
      return { acao: "seguir", texto: r.novo ? "Lead criado no funil" : "Lead já existia" };
    }
    case "tarefa": {
      const { n } = await criarLead(ctx);
      const quando = new Date(Date.now() + (Number(c.prazoHoras) || 0) * 3600_000);
      await db.insert(schema.crmTarefas).values({ negociacaoId: n.id, tipo: String(c.tipo ?? "tarefa"), descricao: aplicar(String(c.descricao ?? "Tarefa da automação"), await variaveis(ctx, a)),
        quando, responsavelId: n.responsavelId ?? null });
      return { acao: "seguir", texto: `Tarefa criada: ${String(c.descricao ?? "")}` };
    }
    case "mover_etapa": {
      const n = await negociacao(ctx);
      if (!n) return { acao: "seguir", texto: "Sem negociação para mover" };
      const alvo = (await db.query.crmEtapas.findMany({ where: eq(schema.crmEtapas.funilId, n.funilId) })).find((x) => norm(x.nome) === norm(String(c.etapa ?? "")));
      if (!alvo) return { acao: "seguir", texto: `Etapa "${String(c.etapa)}" não existe no funil` };
      if (alvo.id === n.etapaId) return { acao: "seguir", texto: "Já estava na etapa" };
      await db.update(N).set({ etapaId: alvo.id, updatedAt: new Date() }).where(eq(N.id, n.id));
      await registrar(n.id, null, "etapa", `Automação "${a.nome}" moveu para "${alvo.nome}"`);
      dispararDepois("crm.etapa", { negociacaoId: n.id, etapaId: alvo.id, etapa: alvo.nome, nome: n.contato, telefone: n.telefone, email: n.email, loja: n.loja }, `${n.id}:${alvo.id}:${Date.now()}`);
      return { acao: "seguir", texto: `Movida para "${alvo.nome}"` };
    }
    case "marcar_perdida": {
      const n = await negociacao(ctx);
      if (!n || n.status !== "andamento") return { acao: "seguir", texto: "Sem negociação aberta" };
      const motivo = String(c.motivo ?? "Sem resposta");
      await db.update(N).set({ status: "perdida", motivoPerda: motivo, fechadaEm: new Date(), updatedAt: new Date() }).where(eq(N.id, n.id));
      await registrar(n.id, null, "status", `Marcada como PERDA pela automação "${a.nome}": ${motivo}`);
      return { acao: "seguir", texto: `Negociação marcada como perdida (${motivo})` };
    }
    case "tag": {
      const tag = String(c.tag ?? "").trim();
      if (!tag) return { acao: "seguir", texto: "Etiqueta vazia" };
      const tel = soDigitos(ctx.telefone ?? ctx.chat).replace(/^55(?=\d{10,11}$)/, "");
      const onde = ctx.email ? eq(schema.contatos.email, String(ctx.email).toLowerCase()) : tel ? sql`regexp_replace(coalesce(${schema.contatos.telefone},''), '\\D', '', 'g') like ${"%" + tel}` : null;
      if (!onde) return { acao: "seguir", texto: "Sem contato para etiquetar" };
      const r = await db.update(schema.contatos).set({ tags: sql`array(select distinct unnest(${schema.contatos.tags} || ${[tag]}::text[]))`, updatedAt: new Date() }).where(onde).returning({ id: schema.contatos.id });
      return { acao: "seguir", texto: r.length ? `Etiqueta "${tag}" aplicada` : "Contato não está na base de e-mail" };
    }
    default:
      return { acao: "seguir", texto: `Passo desconhecido: ${p.tipo}` };
  }
}

// ───────── Rotina (worker a cada minuto) ─────────

let ultimaVarredura = 0;

export async function rodarAutomacoes() {
  // Continua as que estavam esperando.
  const prontas = await db.select({ id: X.id }).from(X).where(and(inArray(X.status, ["ativa", "esperando"]), lte(X.proximaEm, new Date()))).orderBy(asc(X.proximaEm)).limit(50);
  for (const r of prontas) await processar(r.id).catch((e) => console.error("automação:", e));
  // Execução travada em "rodando" por mais de 10 min (servidor reiniciou no meio): volta para a fila.
  await db.update(X).set({ status: "ativa" }).where(and(eq(X.status, "rodando"), lt(X.updatedAt, new Date(Date.now() - 10 * 60_000))));

  if (Date.now() - ultimaVarredura < 5 * 60_000) return;
  ultimaVarredura = Date.now();
  await varrer().catch((e) => console.error("varredura de automações:", e));
}

/** Gatilhos de tempo: negociação parada, carrinho abandonado e cliente sem comprar. */
async function varrer() {
  const ativas = await db.query.automacoes.findMany({ where: and(eq(A.ativa, true), inArray(A.gatilho, ["crm.parado", "carrinho.abandonado", "cliente.inativo"])) });
  for (const a of ativas) {
    const c = a.gatilhoConfig ?? {};
    if (a.gatilho === "crm.parado") {
      const dias = Number(c.dias) || 5;
      const lista = await db.query.crmNegociacoes.findMany({ where: and(eq(N.status, "andamento"), lt(N.updatedAt, new Date(Date.now() - dias * 86400_000))), with: { etapa: true }, limit: 200 });
      for (const n of lista) {
        if (c.etapa && norm(n.etapa.nome) !== norm(String(c.etapa))) continue;
        await disparar1(a, { negociacaoId: n.id, etapaId: n.etapaId, etapa: n.etapa.nome, nome: n.contato, telefone: n.telefone, email: n.email, loja: n.loja }, `${n.id}:${n.updatedAt.toISOString()}`);
      }
    }
    if (a.gatilho === "carrinho.abandonado") {
      const horas = Number(c.horas) || 2;
      const K = schema.carrinhos;
      const lista = await db.select().from(K).where(and(eq(K.recuperado, false), lt(K.updatedAt, new Date(Date.now() - horas * 3600_000)), gt(K.updatedAt, new Date(Date.now() - 7 * 86400_000)),
        c.loja ? eq(K.loja, String(c.loja)) : undefined, or(sql`${K.telefone} is not null`, sql`${K.email} is not null`))).limit(200);
      for (const k of lista) await disparar1(a, { carrinhoId: k.id, nome: k.nome, telefone: k.telefone, email: k.email, linkCarrinho: k.url, valor: k.valor, loja: k.loja }, k.id);
    }
    if (a.gatilho === "cliente.inativo") {
      const dias = Number(c.dias) || 90;
      const K = schema.contatos;
      // Só quem cruzou o limite na última semana (ligar a regra não dispara para a base inteira de uma vez).
      const lista = await db.select().from(K).where(and(isNull(K.descadastradoEm),
        lt(K.ultimaCompraEm, new Date(Date.now() - dias * 86400_000)), gt(K.ultimaCompraEm, new Date(Date.now() - (dias + 7) * 86400_000)))).limit(300);
      for (const k of lista) await disparar1(a, { contatoId: k.id, nome: k.nome, telefone: k.telefone, email: k.email, loja: k.lojas[0] ?? "asfaltomulti" }, `${k.id}:${k.ultimaCompraEm?.toISOString()}`);
    }
  }
}

async function disparar1(a: Auto, ctx: Contexto, chave: string) {
  const [e] = await db.insert(X).values({ automacaoId: a.id, chave, contexto: ctx }).onConflictDoNothing().returning({ id: X.id });
  if (e) await processar(e.id).catch((err) => console.error("automação", a.nome, err));
}

/** Link público (assinado) da foto do canhoto, para mandar ao cliente. */
export async function linkComprovante(entregaId: string) {
  const { assinar } = await import("../email/envio");
  return `${appUrl()}/comprovante/${encodeURIComponent(assinar(`e:${entregaId}`))}`;
}

export const gatilhoExiste = (g: string) => g in GATILHOS;
