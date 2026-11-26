import "server-only";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { linhasDaPlanilha } from "./produtos";
import { qrCheck, qrSessoes } from "./whatsapp/gateway";
import { lerMidia, type Midia, type TipoMidia } from "./whatsapp/midia";
import { sendMessage } from "./whatsapp/service";

const D = schema.disparos, DC = schema.disparoContatos;
export type Disparo = typeof D.$inferSelect;

import { RODAPE, renderizar } from "./disparos-texto";
export { RITMOS, porHora, RODAPE, renderizar, normalizarTelefone } from "./disparos-texto";
import { normalizarTelefone } from "./disparos-texto";

const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

// ───────── Lista de contatos ─────────

const COLS = {
  telefone: /^(telefone|tel|celular|cel|whatsapp|whats|fone|numero|número|contato_telefone|phone)/,
  nome: /^(nome|contato|cliente|responsavel|responsável|name)/,
  empresa: /^(empresa|razao|razão|fantasia|nome_fantasia|loja|company)/,
};

async function inserir(disparoId: string, linhas: { telefone: string; nome?: string | null; empresa?: string | null; vars?: Record<string, string> }[]) {
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${DC.ordem}), 0)` }).from(DC).where(eq(DC.disparoId, disparoId));
  let n = 0;
  for (let i = 0; i < linhas.length; i += 500) {
    const r = await db.insert(DC).values(linhas.slice(i, i + 500).map((l, j) => ({ disparoId, telefone: l.telefone, nome: l.nome || null, empresa: l.empresa || null, vars: l.vars ?? {}, ordem: Number(max) + i + j + 1 })))
      .onConflictDoNothing().returning({ id: DC.id });
    n += r.length;
  }
  return n;
}

/** Planilha (.xlsx ou .csv): acha as colunas de telefone, nome e empresa; as outras viram variáveis {{coluna}}. */
export async function importarLista(disparoId: string, arquivo: File) {
  const rows = await linhasDaPlanilha(arquivo);
  let h = -1, mapa: Record<string, number> = {}, extras: { k: string; i: number }[] = [];
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cab = rows[i].map((x) => slug(String(x ?? "")));
    const m: Record<string, number> = {};
    for (const [k, re] of Object.entries(COLS)) { const j = cab.findIndex((c) => re.test(c)); if (j >= 0) m[k] = j; }
    if (m.telefone !== undefined) {
      h = i; mapa = m;
      extras = cab.map((k, j) => ({ k, i: j })).filter((x) => x.k && !Object.values(m).includes(x.i));
      break;
    }
  }
  if (h < 0) throw new Error("Não achei a coluna de telefone (telefone, celular ou WhatsApp).");
  const vistos = new Set<string>();
  const linhas: Parameters<typeof inserir>[1] = [];
  let invalidos = 0;
  for (const r of rows.slice(h + 1)) {
    const tel = normalizarTelefone(r[mapa.telefone]);
    if (!tel) { if (r.some((x) => String(x ?? "").trim())) invalidos++; continue; }
    if (vistos.has(tel)) continue;
    vistos.add(tel);
    linhas.push({ telefone: tel, nome: mapa.nome !== undefined ? String(r[mapa.nome] ?? "").trim() : null, empresa: mapa.empresa !== undefined ? String(r[mapa.empresa] ?? "").trim() : null,
      vars: Object.fromEntries(extras.map((x) => [x.k, String(r[x.i] ?? "").trim()])) });
  }
  const adicionados = await inserir(disparoId, linhas);
  return { adicionados, repetidos: linhas.length - adicionados, invalidos, colunas: extras.map((x) => x.k) };
}

export const ORIGENS: Record<string, string> = {
  clientes: "Clientes que já compraram (base de contatos)",
  tag: "Contatos com uma etiqueta",
  crm: "Leads do funil de vendas (por etapa)",
  conversas: "Pessoas que já conversaram no WhatsApp",
};

export async function adicionarDaBase(disparoId: string, origem: string, filtro: string) {
  let linhas: { telefone: string | null; nome: string | null; empresa?: string | null }[] = [];
  const K = schema.contatos;
  if (origem === "clientes") linhas = await db.select({ telefone: K.telefone, nome: K.nome }).from(K).where(and(sql`${K.totalPedidos} > 0`, sql`${K.telefone} is not null`));
  if (origem === "tag" && filtro) linhas = await db.select({ telefone: K.telefone, nome: K.nome }).from(K).where(and(sql`${filtro} = any(${K.tags})`, sql`${K.telefone} is not null`));
  if (origem === "crm") {
    const N = schema.crmNegociacoes, E = schema.crmEtapas;
    linhas = await db.select({ telefone: N.telefone, nome: N.contato, empresa: N.empresa }).from(N).innerJoin(E, eq(E.id, N.etapaId))
      .where(and(eq(N.status, "andamento"), filtro ? eq(E.nome, filtro) : undefined, sql`${N.telefone} is not null`));
  }
  if (origem === "conversas") {
    const C = schema.waChats;
    linhas = await db.selectDistinctOn([C.chat], { telefone: C.chat, nome: C.name }).from(C).where(sql`${C.chat} ~ '^[0-9]+$'`);
  }
  const vistos = new Set<string>();
  const ok = linhas.flatMap((l) => { const t = normalizarTelefone(l.telefone); if (!t || vistos.has(t)) return []; vistos.add(t); return [{ telefone: t, nome: l.nome, empresa: l.empresa ?? null }]; });
  return { adicionados: await inserir(disparoId, ok), encontrados: ok.length };
}

// ───────── Envio (roda no servidor a cada 5 segundos) ─────────

type Estado = { prox: Map<string, number>; lote: Map<string, number>; falhas: Map<string, number>; midias: Map<string, Buffer>; iniciado: boolean };
const g = globalThis as unknown as { __disparos?: Estado };
const est: Estado = (g.__disparos ??= { prox: new Map(), lote: new Map(), falhas: new Map(), midias: new Map(), iniciado: false });
const sorteio = (a: number, b: number) => a + Math.random() * Math.max(0, b - a);

function agoraSP() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false, weekday: "short" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { hora: Number(p.hour) % 24, dia: p.weekday as string };
}
export function dentroDaJanela(d: Disparo) {
  const { hora, dia } = agoraSP();
  if (dia === "Sun" && !d.domingo) return false;
  if (dia === "Sat" && !d.sabado) return false;
  return hora >= d.janelaInicio && hora < d.janelaFim;
}

function inicioDoDiaSP() {
  const s = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(`${s}T03:00:00Z`);
}

export async function enviadosHoje(conexaoId: string) {
  const [{ n }] = await db.select({ n: count() }).from(DC).where(and(eq(DC.conexaoId, conexaoId), eq(DC.status, "enviado"), gte(DC.enviadoEm, inicioDoDiaSP())));
  return n;
}

async function pausar(id: string, motivo: string) {
  await db.update(D).set({ status: "pausado", motivoPausa: motivo, updatedAt: new Date() }).where(eq(D.id, id));
}

async function midiaDe(d: Disparo): Promise<Midia | undefined> {
  if (!d.midia) return undefined;
  let buf = est.midias.get(d.midia);
  if (!buf) { buf = await lerMidia(d.midia); est.midias.set(d.midia, buf); }
  return { buffer: buf, mime: d.midiaMime ?? "application/octet-stream", nome: d.midiaNome, tipo: (d.midiaTipo ?? "documento") as TipoMidia };
}

export async function rodarDisparos() {
  if (!est.iniciado) {
    // Servidor reiniciou no meio de um envio: volta para a fila.
    await db.update(DC).set({ status: "pendente", conexaoId: null }).where(eq(DC.status, "enviando"));
    est.iniciado = true;
  }
  const ativos = await db.query.disparos.findMany({ where: eq(D.status, "enviando") });
  if (!ativos.length) return;
  const sessoes = await qrSessoes();
  const agora = Date.now();

  for (const d of ativos) {
    if (d.inicioEm && d.inicioEm.getTime() > agora) continue;
    if (!dentroDaJanela(d)) continue;
    const [{ pend }] = await db.select({ pend: count() }).from(DC).where(and(eq(DC.disparoId, d.id), inArray(DC.status, ["pendente", "enviando"])));
    if (!pend) { await db.update(D).set({ status: "concluido", updatedAt: new Date() }).where(eq(D.id, d.id)); continue; }
    if (!d.mensagens.some((m) => m.trim())) { await pausar(d.id, "Sem mensagem."); continue; }

    const online = d.conexoes.filter((c) => sessoes[c]?.status === "conectado");
    if (!online.length) { await pausar(d.id, "Nenhum dos números escolhidos está conectado."); continue; }

    for (const cx of online) {
      if ((est.prox.get(cx) ?? 0) > agora) continue;
      if ((await enviadosHoje(cx)) >= d.limiteDia) continue;

      const [c] = await db.update(DC).set({ status: "enviando", conexaoId: cx })
        .where(eq(DC.id, sql`(select ${DC.id} from ${DC} where ${DC.disparoId} = ${d.id} and ${DC.status} = 'pendente' order by ${DC.ordem} limit 1 for update skip locked)`)).returning();
      if (!c) break;

      const pular = async (erro: string) => { await db.update(DC).set({ status: "pulado", erro }).where(eq(DC.id, c.id)); };
      const saiu = await db.query.waChats.findFirst({ where: and(eq(schema.waChats.chat, c.telefone), eq(schema.waChats.optout, true)), columns: { chat: true } });
      if (saiu) { await pular("Pediu para sair"); continue; }
      try {
        if (d.conferirNumero && !(await qrCheck(cx, c.telefone))) { await pular("Número sem WhatsApp"); est.prox.set(cx, agora + 3000); continue; }
        const modelos = d.mensagens.filter((m) => m.trim());
        const texto = renderizar(modelos[Math.floor(Math.random() * modelos.length)], c) + (d.rodapeSair ? RODAPE : "");
        await sendMessage(c.telefone, texto, "auto", { conexao: cx, midia: await midiaDe(d) });
        await db.update(DC).set({ status: "enviado", enviadoEm: new Date(), erro: null }).where(eq(DC.id, c.id));
        est.falhas.set(cx, 0);
        const n = (est.lote.get(cx) ?? 0) + 1;
        est.lote.set(cx, n);
        let espera = sorteio(d.intervaloMin, d.intervaloMax) * 1000;
        if (n % d.loteTamanho === 0) espera += sorteio(d.lotePausa * 0.8, d.lotePausa * 1.25) * 60_000; // pausa longa entre lotes
        est.prox.set(cx, Date.now() + espera);
      } catch (e) {
        const erro = e instanceof Error ? e.message : String(e);
        await db.update(DC).set({ status: "falhou", erro: erro.slice(0, 300) }).where(eq(DC.id, c.id));
        const f = (est.falhas.get(cx) ?? 0) + 1;
        est.falhas.set(cx, f);
        est.prox.set(cx, Date.now() + 60_000);
        // Proteção: 3 falhas seguidas no mesmo número = algo errado (desconectou, bloqueio). Pausa tudo.
        if (f >= 3) { await pausar(d.id, `O número "${cx}" falhou 3 vezes seguidas (${erro}). Confira a conexão antes de retomar.`); est.falhas.set(cx, 0); break; }
      }
    }
  }
}

export function iniciarWorkerDisparos() {
  const gg = globalThis as unknown as { __disparosTimer?: NodeJS.Timeout };
  if (gg.__disparosTimer) return;
  let ocupado = false;
  gg.__disparosTimer = setInterval(async () => {
    if (ocupado) return;
    ocupado = true;
    try { await rodarDisparos(); } catch (e) { console.error("disparos:", e instanceof Error ? e.message : e); } finally { ocupado = false; }
  }, 5000);
}

