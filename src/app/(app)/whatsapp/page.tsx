import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { qrSessoes } from "@/lib/whatsapp/gateway";
import { conexoesVisiveis, garantirConexaoDoUsuario } from "@/lib/whatsapp/conexoes";
import SendForm from "./SendForm";
import AoVivo from "./AoVivo";
import { alternarIAConversa } from "./actions";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const showNumber = (chat: string) => (/^\d+$/.test(chat) ? `+${chat}` : chat);

import { negociacoesDoTelefone } from "@/lib/crm";
import { rotuloMidia, type TipoMidia } from "@/lib/whatsapp/midia";

type Msg = typeof schema.waMessages.$inferSelect;
const rotulo = (m: Msg) => (m.midiaTipo ? rotuloMidia(m.midiaTipo as TipoMidia, m.midiaNome) : "");

function Midia({ m }: { m: Msg }) {
  const url = `/api/whatsapp/midia/${m.midia}`;
  switch (m.midiaTipo) {
    case "imagem":
    case "figurinha":
      return (
        <a href={url} target="_blank" rel="noopener" className="block mb-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={m.midiaTipo === "imagem" ? "Foto" : "Figurinha"}
            className={m.midiaTipo === "imagem" ? "rounded-xl max-h-80 w-auto max-w-full" : "w-32 h-32 object-contain"} />
        </a>
      );
    case "audio":
      return <audio src={url} controls preload="none" className="max-w-full w-72 h-10 mb-1" />;
    case "video":
      return <video src={url} controls preload="metadata" className="rounded-xl max-h-80 max-w-full mb-1" />;
    default:
      return (
        <a href={`${url}?baixar`} className="flex items-center gap-2 p-2 mb-1 rounded-xl bg-black/5 hover:bg-black/10">
          <span aria-hidden className="text-2xl">📄</span>
          <span className="min-w-0"><span className="block font-semibold truncate">{m.midiaNome ?? "Documento"}</span><span className="text-xs text-graphite-muted">Baixar</span></span>
        </a>
      );
  }
}

export default async function WhatsApp({ searchParams }: { searchParams: { chat?: string; numero?: string; n?: string } }) {
  const user = await requireModule("whatsapp");
  const admin = user.role === "ADMIN";
  const editor = can(user.role, "whatsapp", "edit");

  // Cada usuário tem o próprio número; o administrador vê todos.
  const minha = await garantirConexaoDoUsuario(user);
  const visiveis = await conexoesVisiveis(user);
  const ids = visiveis.map((c) => c.id);
  const filtroN = admin && searchParams.n && ids.includes(searchParams.n) ? searchParams.n : null;
  const [sessoes, chats] = await Promise.all([
    qrSessoes(),
    db.query.waChats.findMany({ where: inArray(schema.waChats.conexaoId, filtroN ? [filtroN] : ids), orderBy: desc(schema.waChats.lastAt), limit: 150 }),
  ]);
  const estado = (id: string) => (id === "oficial" ? "conectado" : sessoes[id]?.status ?? "desconectado");
  const nomeDe = new Map(visiveis.map((c) => [c.id, c.nome]));
  const minhaOk = estado(minha.id) === "conectado";
  const conectadas = visiveis.filter((c) => estado(c.id) === "conectado");

  // Número aberto a partir do funil de vendas, sem conversa ainda.
  const numeroNovo = searchParams.chat && /^\d{10,13}$/.test(searchParams.chat) && !chats.some((c) => c.chat === searchParams.chat) ? searchParams.chat : null;
  if (numeroNovo) searchParams = { chat: "novo", numero: numeroNovo };

  const selected = searchParams.chat
    ? chats.find((c) => c.chat === searchParams.chat && (!searchParams.n || c.conexaoId === searchParams.n)) ?? chats.find((c) => c.chat === searchParams.chat)
    : undefined;
  const iaNoNumero = selected ? !!visiveis.find((c) => c.id === selected.conexaoId)?.iaLigada : false;
  const negs = selected ? await negociacoesDoTelefone(selected.chat) : [];
  const msgs = selected
    ? (await db.query.waMessages.findMany({ where: and(eq(schema.waMessages.conexaoId, selected.conexaoId), eq(schema.waMessages.chat, selected.chat)), orderBy: desc(schema.waMessages.createdAt), limit: 300 })).reverse()
    : [];
  const link = (chat: string, n: string) => `/whatsapp?chat=${encodeURIComponent(chat)}&n=${encodeURIComponent(n)}`;

  return (
    <>
      <h1 className="sr-only">WhatsApp</h1>
      <AoVivo chave={selected ? `${selected.conexaoId}:${selected.chat}` : ""} ultima={msgs[msgs.length - 1]?.id ?? ""} />
      <section className="-mx-4 -mt-5 -mb-24 lg:-mx-9 lg:-my-7 bg-white overflow-hidden h-[calc(100dvh-143px-env(safe-area-inset-bottom))] lg:h-[100dvh]">
        <div className="flex h-full">
          <aside className={`w-full lg:w-[340px] shrink-0 lg:border-r border-surface-line flex flex-col min-h-0 ${selected || searchParams.chat === "novo" ? "hidden lg:flex" : "flex"}`}>
            <div className="px-4 h-16 shrink-0 border-b border-surface-line flex items-center justify-between gap-2">
              <h2 className="font-display font-bold text-lg">Conversas</h2>
              <div className="flex items-center gap-1">
                <Link href="/whatsapp/conectar" title="Meu WhatsApp: conexão e IA" aria-label={`Meu WhatsApp (${minhaOk ? "conectado" : "desconectado"})`}
                  className="text-xs font-semibold px-2.5 h-9 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-surface-line hover:bg-surface">
                  <span className={`w-2 h-2 rounded-full ${minhaOk ? "bg-[#1E8A44]" : "bg-[#D0342C]"}`} />Meu WhatsApp</Link>
                {admin && <Link href="/whatsapp/config" aria-label="Configurar números e IA" title="Números da equipe e IA" className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-surface-line hover:bg-surface">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg></Link>}
                {editor && <Link href="/whatsapp?chat=novo" className="btn-primary h-9 px-3 text-sm">Nova</Link>}
              </div>
            </div>
            {!minhaOk && <Link href="/whatsapp/conectar" className="px-4 py-2 text-xs bg-[#FDE2DF] text-[#A0261C] font-semibold">Seu WhatsApp não está conectado. Toque para conectar.</Link>}
            {admin && visiveis.length > 1 && (
              <nav aria-label="Filtrar por número" className="px-3 py-2 border-b border-surface-line flex gap-1.5 overflow-x-auto">
                <Link href="/whatsapp" aria-current={!filtroN ? "true" : undefined} className={`shrink-0 px-3 h-8 inline-flex items-center rounded-full text-xs font-semibold ${!filtroN ? "bg-graphite-dark text-white" : "bg-surface"}`}>Todos</Link>
                {visiveis.map((c) => (
                  <Link key={c.id} href={`/whatsapp?n=${c.id}`} aria-current={filtroN === c.id ? "true" : undefined}
                    className={`shrink-0 px-3 h-8 inline-flex items-center gap-1.5 rounded-full text-xs font-semibold ${filtroN === c.id ? "bg-graphite-dark text-white" : "bg-surface"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${estado(c.id) === "conectado" ? "bg-[#1E8A44]" : "bg-[#D0342C]"}`} />{c.nome.split(" ")[0]}</Link>
                ))}
              </nav>
            )}
            {chats.length === 0 && <p className="p-4 text-sm text-graphite-muted">Nenhuma conversa ainda.</p>}
            <ul className="flex-1 overflow-y-auto">
              {chats.map((c) => (
                <li key={`${c.conexaoId}:${c.chat}`}>
                  <Link href={link(c.chat, c.conexaoId)}
                    className={`flex flex-col gap-0.5 px-4 py-3 border-b border-[#F1EFEE] ${selected?.chat === c.chat && selected.conexaoId === c.conexaoId ? "bg-brand-soft" : "hover:bg-surface"}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm truncate">{c.name ?? showNumber(c.chat)}</span>
                      <span className="text-[11px] text-graphite-muted shrink-0">{fmt(c.lastAt)}</span>
                    </span>
                    <span className="text-xs text-graphite-muted truncate">{c.lastText}</span>
                    <span className="flex gap-1 mt-1">
                      {visiveis.length > 1 && <span className="badge bg-[#E6E4E3] text-[#3E3B3C] text-[10px] py-0.5">{nomeDe.get(c.conexaoId)?.split(" ")[0] ?? c.conexaoId}</span>}
                      {c.aiPaused && <span className="badge bg-brand-soft text-brand-text text-[10px] py-0.5">Humano</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>

          <div className={`flex-1 min-w-0 min-h-0 flex-col ${!selected && searchParams.chat !== "novo" ? "hidden lg:flex" : "flex"}`}>
            {searchParams.chat === "novo" ? (
              <div className="p-5 flex flex-col gap-3">
                <Link href="/whatsapp" className="lg:hidden text-sm text-brand-text font-semibold">← Conversas</Link>
                <h2 className="font-display font-bold text-lg">Nova mensagem</h2>
                {conectadas.length ? <SendForm numero={searchParams.numero} conexoes={conectadas.map((c) => ({ id: c.id, nome: c.nome }))} padrao={minhaOk ? minha.id : conectadas[0].id} />
                  : <p className="text-sm">Conecte seu WhatsApp primeiro em <Link href="/whatsapp/conectar" className="font-semibold text-brand-text underline">Meu WhatsApp</Link>.</p>}
              </div>
            ) : selected ? (
              <>
                <div className="px-4 py-2 min-h-16 shrink-0 border-b border-surface-line flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link href="/whatsapp" aria-label="Voltar às conversas" className="lg:hidden w-9 h-9 -ml-2 flex items-center justify-center text-xl text-brand-text">←</Link>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{selected.name ?? showNumber(selected.chat)}</p>
                      <p className="text-xs text-graphite-muted">{showNumber(selected.chat)}{visiveis.length > 1 ? ` · no número de ${nomeDe.get(selected.conexaoId) ?? selected.conexaoId}` : ""}{selected.aiPaused ? " · atendimento humano" : iaNoNumero ? " · IA respondendo" : ""}</p>
                    </div>
                  </div>
                  {editor && (
                    <div className="flex flex-wrap gap-2">
                    {negs.length
                      ? negs.map((g) => <Link key={g.id} href={`/crm/${g.id}`} className="btn-outline h-9 px-3 text-sm">Negociação: {g.titulo.slice(0, 24)}</Link>)
                      : <Link href={`/crm/nova?nome=${encodeURIComponent(selected.name ?? "")}&tel=${selected.chat.replace(/^55(?=\d{10,11}$)/, "")}`} className="btn-outline h-9 px-3 text-sm">Criar negociação</Link>}
                    {iaNoNumero && (
                      <form action={alternarIAConversa}>
                        <input type="hidden" name="chat" value={selected.chat} />
                        <input type="hidden" name="conexao" value={selected.conexaoId} />
                        <input type="hidden" name="pausar" value={selected.aiPaused ? "0" : "1"} />
                        <button className="btn-outline h-9 px-3 text-sm">{selected.aiPaused ? "Devolver para a IA" : "Assumir atendimento"}</button>
                      </form>
                    )}
                    </div>
                  )}
                </div>
                <ol id="wa-msgs" className="flex-1 min-h-0 p-4 lg:px-8 flex flex-col gap-2 overflow-y-auto bg-[#F4F1EE]">
                  {msgs.map((m) => (
                    <li key={m.id} className={`max-w-[85%] lg:max-w-[65%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.fromMe ? "self-end bg-[#FDEBDD]" : "self-start bg-white"}`}>
                      {m.midia && <Midia m={m} />}
                      {(!m.midia || m.text !== rotulo(m)) && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                      <p className="text-[11px] text-graphite-muted mt-1">{m.sentBy === "ia" ? "IA · " : m.sentBy === "auto" ? "Automação · " : m.sentBy === "humano" ? "Atendente · " : ""}{fmt(m.createdAt)}</p>
                    </li>
                  ))}
                </ol>
                {editor && <div className="px-3 py-2 lg:px-6 shrink-0 border-t border-surface-line bg-white"><SendForm key={`${selected.conexaoId}:${selected.chat}`} chat={selected.chat} conexao={selected.conexaoId} /></div>}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-[#F4F1EE]"><p className="text-sm text-graphite-muted">Escolha uma conversa à esquerda.</p></div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
