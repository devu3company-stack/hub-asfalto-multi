import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { and, count, eq, gte, isNull, lte, sql, type SQL } from "drizzle-orm";
import nodemailer from "nodemailer";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "../db";
import { getConfig, type Config } from "../integrations/store";
import { aplicarVariaveis, renderEmail, textoPuro, type EmailConteudo, type Marca, type Variaveis } from "./template";
import { getSetting } from "../settings";
import { chaveLoja, LOJAS, lojaValida, type LojaId } from "../lojas";
import { listarContas, smtpDaConta } from "./contas";

/** Nome, site e logo da loja usados nos e-mails (ajustáveis em Integrações › Lojas). */
export async function marcaDa(loja: LojaId): Promise<Marca> {
  const l = LOJAS.find((x) => x.id === loja)!;
  const [nome, site, logo] = await Promise.all([getSetting(`loja.${loja}.nome`), getSetting(`loja.${loja}.site`), getSetting(`loja.${loja}.logo`)]);
  return { nome: nome || l.nome, site: site || l.site, logo: logo || l.logo };
}

/** Servidor de envio da loja; se a loja não tiver, usa o da outra. */
export async function smtpDa(loja: LojaId) {
  return (await getConfig(chaveLoja("smtp", loja))) ?? (await getConfig(chaveLoja("smtp", loja === "asfaltomulti" ? "lojadoasfalto" : "asfaltomulti")));
}

const E = schema.emailEnvios;
export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

/* ------------------------------ Links assinados ------------------------------ */

function assinatura(valor: string) {
  return createHmac("sha256", `email-links:${process.env.ENCRYPTION_KEY ?? ""}`).update(valor).digest("base64url").slice(0, 22);
}
export function assinar(valor: string) { return `${valor}.${assinatura(valor)}`; }
export function conferir(token: string | null | undefined): string | null {
  if (!token) return null;
  const i = token.lastIndexOf(".");
  if (i < 1) return null;
  const valor = token.slice(0, i);
  const a = Buffer.from(token.slice(i + 1));
  const b = Buffer.from(assinatura(valor));
  return a.length === b.length && timingSafeEqual(a, b) ? valor : null;
}

export const linkDescadastro = (contatoId: string) => `${appUrl()}/descadastro?t=${encodeURIComponent(assinar(`c:${contatoId}`))}`;

/* ---------------------------------- SMTP ---------------------------------- */

export const limites = (cfg: Config | null) => ({
  porHora: Math.max(1, Number(cfg?.limitePorHora) || 80),
  porDia: Math.max(1, Number(cfg?.limitePorDia) || 800),
});

function transporte(cfg: Config) {
  const port = Number(cfg.port) || 465;
  return nodemailer.createTransport({
    host: cfg.host, port, secure: port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000,
  });
}

const remetente = (cfg: Config, marca: Marca, nome?: string | null) => ({ name: nome || cfg.fromName || marca.nome, address: cfg.fromEmail || cfg.user });

export async function testarSmtp(cfg: Config) {
  if (!cfg.host || !cfg.user || !cfg.pass) throw new Error("Informe servidor, usuário e senha.");
  await transporte(cfg).verify();
  return `Servidor de e-mail conectado (${cfg.host}). Envio limitado a ${limites(cfg).porHora}/hora e ${limites(cfg).porDia}/dia.`;
}

/* ------------------------------ Montar e enfileirar ------------------------------ */

type Contato = typeof schema.contatos.$inferSelect;

export function variaveisDo(c: Pick<Contato, "nome" | "email" | "cidade">, marca: Marca, extra: Variaveis = {}): Variaveis {
  const nome = (c.nome ?? "").trim();
  return { nome: nome || undefined, primeiro_nome: nome.split(/\s+/)[0] || undefined, email: c.email, cidade: c.cidade ?? undefined,
    loja: marca.nome, site: marca.site, ...extra };
}

/** Gera o HTML final (com rastreio e descadastro) de um envio. */
export function montar(envioId: string, contato: Contato, conteudo: EmailConteudo, marca: Marca, extra: Variaveis = {}) {
  const v = variaveisDo(contato, marca, extra);
  const desc = linkDescadastro(contato.id);
  const html = renderEmail(conteudo, v, {
    appUrl: appUrl(), marca,
    descadastro: desc,
    pixel: `${appUrl()}/api/email/abriu?t=${encodeURIComponent(assinar(`e:${envioId}`))}`,
    rastrear: (url) => (/^https?:\/\//.test(url)
      ? `${appUrl()}/api/email/clique?t=${encodeURIComponent(assinar(`e:${envioId}|${url}`))}`
      : url),
  });
  return { html, texto: textoPuro(conteudo, v, desc, marca) };
}

/** Pode receber marketing? */
export const podeReceber = (c: Pick<Contato, "descadastradoEm" | "bounce">) => !c.descadastradoEm && !c.bounce;

export async function enfileirar(contato: Contato, assunto: string, conteudo: EmailConteudo, opts: {
  loja: LojaId; campanhaId?: string; automacao?: string; referencia?: string; agendadoPara?: Date; extra?: Variaveis;
  contaId?: string | null; remetenteNome?: string | null;
}) {
  if (!podeReceber(contato)) return null;
  const id = createId();
  const marca = await marcaDa(opts.loja);
  const { html } = montar(id, contato, conteudo, marca, opts.extra);
  const v = variaveisDo(contato, marca, opts.extra);
  await db.insert(E).values({
    id, loja: opts.loja, contaId: opts.contaId || null, remetenteNome: opts.remetenteNome || null, contatoId: contato.id, campanhaId: opts.campanhaId ?? null, automacao: opts.automacao ?? null,
    referencia: opts.referencia ?? null, assunto: aplicarVariaveis(assunto, v), html,
    agendadoPara: opts.agendadoPara ?? new Date(),
  });
  return id;
}

/** E-mail de teste (não entra na fila nem nas estatísticas). */
export async function enviarTeste(loja: LojaId, para: string, assunto: string, conteudo: EmailConteudo, contaId?: string | null) {
  const cfg = contaId ? await smtpDaConta(contaId) : await smtpDa(loja);
  if (!cfg) throw new Error(contaId ? "A conta de e-mail escolhida está desligada ou sem configuração." : "Configure o servidor de e-mail (SMTP) em Integrações ou cadastre uma conta em E-mail › Contas de envio.");
  const marca = await marcaDa(loja);
  const fake = { id: "teste", nome: "Cliente Teste", email: para, cidade: "Mogi Mirim" } as Contato;
  const { html, texto } = montar("teste", fake, conteudo, marca, { link_carrinho: marca.site, pedido: "#1001" });
  const v = variaveisDo(fake, marca);
  await transporte(cfg).sendMail({ from: remetente(cfg, marca), to: para, subject: `[TESTE] ${aplicarVariaveis(assunto, v)}`, html, text: texto });
}

/* ---------------------------------- Fila ---------------------------------- */

let rodando = false;

/** Envia o que está na fila, loja por loja, respeitando os limites por hora e por dia de cada servidor de e-mail. */
export async function processarFila() {
  if (rodando) return { enviados: 0 };
  rodando = true;
  let total = 0;
  try {
    for (const l of LOJAS) total += await processarLoja(l.id);
    for (const c of await listarContas(true)) total += await processarConta(c.id);
    // campanhas cujo último envio saiu viram "enviada"
    await db.execute(sql`update email_campanhas c set status = 'enviada', enviada_em = now()
      where c.status = 'enviando' and not exists (select 1 from email_envios e where e.campanha_id = c.id and e.status = 'fila')`);
    return { enviados: total };
  } finally {
    rodando = false;
  }
}

async function enviadosDesde(cfg: Config, ms: number) {
  // o limite é da conta de e-mail: conta envios de todas as lojas que usam a mesma conta
  const lojas: string[] = [];
  for (const l of LOJAS) if ((await smtpDa(l.id))?.user === cfg.user) lojas.push(l.id);
  const [{ n }] = await db.select({ n: count() }).from(E)
    .where(and(eq(E.status, "enviado"), gte(E.enviadoEm, new Date(Date.now() - ms)), isNull(E.contaId), sql`${E.loja} = any(${lojas})`));
  return n;
}

async function enviadosDaConta(contaId: string, ms: number) {
  const [{ n }] = await db.select({ n: count() }).from(E).where(and(eq(E.status, "enviado"), eq(E.contaId, contaId), gte(E.enviadoEm, new Date(Date.now() - ms))));
  return n;
}

async function processarLoja(loja: LojaId) {
  const cfg = await smtpDa(loja);
  if (!cfg) return 0;
  const { porHora, porDia } = limites(cfg);
  const vagas = Math.min(porHora - (await enviadosDesde(cfg, 3600_000)), porDia - (await enviadosDesde(cfg, 86400_000)), 30);
  return enviarLote(cfg, vagas, and(eq(E.loja, loja), isNull(E.contaId))!);
}

async function processarConta(contaId: string) {
  const cfg = await smtpDaConta(contaId);
  if (!cfg) return 0;
  const { porHora, porDia } = limites(cfg);
  const vagas = Math.min(porHora - (await enviadosDaConta(contaId, 3600_000)), porDia - (await enviadosDaConta(contaId, 86400_000)), 30);
  return enviarLote(cfg, vagas, eq(E.contaId, contaId));
}

async function enviarLote(cfg: Config, vagas: number, filtro: SQL) {
  if (vagas <= 0) return 0;
  const lote = await db.query.emailEnvios.findMany({
    where: and(eq(E.status, "fila"), filtro, lte(E.agendadoPara, new Date())),
    orderBy: (t, { asc }) => [asc(t.agendadoPara)],
    limit: vagas,
    with: { contato: true },
  });
  const tr = transporte(cfg);
  const marcas = new Map<string, Marca>();
  let enviados = 0;
  for (const e of lote) {
    if (!podeReceber(e.contato)) {
      await db.update(E).set({ status: "cancelado", erro: "Contato descadastrado ou e-mail inválido" }).where(eq(E.id, e.id));
      continue;
    }
    const loja = lojaValida(e.loja);
    if (!marcas.has(loja)) marcas.set(loja, await marcaDa(loja));
    try {
      await tr.sendMail({
        from: remetente(cfg, marcas.get(loja)!, e.remetenteNome), to: e.contato.nome ? { name: e.contato.nome, address: e.contato.email } : e.contato.email,
        replyTo: cfg.replyTo || undefined, subject: e.assunto, html: e.html,
        text: e.html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        headers: {
          "List-Unsubscribe": `<${appUrl()}/api/email/descadastro?t=${encodeURIComponent(assinar(`c:${e.contato.id}`))}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      await db.update(E).set({ status: "enviado", enviadoEm: new Date(), erro: null, tentativas: e.tentativas + 1 }).where(eq(E.id, e.id));
      enviados++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { responseCode?: number }).responseCode ?? 0;
      const permanente = code >= 550 && code < 560; // caixa inexistente etc.
      if (permanente) await db.update(schema.contatos).set({ bounce: true, updatedAt: new Date() }).where(eq(schema.contatos.id, e.contato.id));
      const desiste = permanente || e.tentativas + 1 >= 3;
      await db.update(E).set({
        status: desiste ? "erro" : "fila", erro: msg.slice(0, 300), tentativas: e.tentativas + 1,
        agendadoPara: new Date(Date.now() + 15 * 60_000),
      }).where(eq(E.id, e.id));
      if (code === 421 || code === 451 || /rate|limit|too many/i.test(msg)) break; // servidor pediu calma
    }
  }
  return enviados;
}

/** Cancela o que ainda não saiu (ex.: cliente comprou e o carrinho foi recuperado). */
export async function cancelarFila(where: { referencia?: string; campanhaId?: string; automacaoPrefixo?: string; contatoId?: string; loja?: string }) {
  const conds = [eq(E.status, "fila")];
  if (where.loja) conds.push(eq(E.loja, where.loja));
  if (where.referencia) conds.push(eq(E.referencia, where.referencia));
  if (where.campanhaId) conds.push(eq(E.campanhaId, where.campanhaId));
  if (where.contatoId) conds.push(eq(E.contatoId, where.contatoId));
  if (where.automacaoPrefixo) conds.push(sql`${E.automacao} like ${where.automacaoPrefixo + "%"}`);
  await db.update(E).set({ status: "cancelado" }).where(and(...conds));
}

export async function usoHoje(lojaParam?: string) {
  const loja = lojaValida(lojaParam);
  const cfg = await smtpDa(loja);
  const [h, d, [{ f }]] = await Promise.all([
    cfg ? enviadosDesde(cfg, 3600_000) : 0,
    cfg ? enviadosDesde(cfg, 86400_000) : 0,
    db.select({ f: count() }).from(E).where(and(eq(E.status, "fila"), eq(E.loja, loja))),
  ]);
  return { conectado: Boolean(cfg), ...limites(cfg), hora: h, dia: d, fila: f };
}
