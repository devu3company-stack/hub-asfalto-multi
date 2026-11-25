import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { qrStatus } from "@/lib/whatsapp/gateway";
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

export default async function WhatsApp({ searchParams }: { searchParams: { chat?: string; numero?: string } }) {
  const user = await requireModule("whatsapp");
  const admin = can(user.role, "integracoes", "edit");
  const editor = can(user.role, "whatsapp", "edit");

  const [qr, canal, iaLigada, chats] = await Promise.all([
    qrStatus(),
    getSetting("whatsapp.canal"),
    getSetting("ia.ligada"),
    db.query.waChats.findMany({ orderBy: desc(schema.waChats.lastAt), limit: 100 }),
  ]);
  // Número aberto a partir do funil de vendas, sem conversa ainda.
  const numeroNovo = searchParams.chat && /^\d{10,13}$/.test(searchParams.chat) && !chats.some((c) => c.chat === searchParams.chat) ? searchParams.chat : null;
  if (numeroNovo) searchParams = { chat: "novo", numero: numeroNovo };
  const conectado = canal === "oficial" || qr.status === "conectado";

  const selected = searchParams.chat ? chats.find((c) => c.chat === searchParams.chat) : undefined;
  const negs = selected ? await negociacoesDoTelefone(selected.chat) : [];
  const msgs = selected
    ? (await db.query.waMessages.findMany({ where: eq(schema.waMessages.chat, selected.chat), orderBy: desc(schema.waMessages.createdAt), limit: 300 })).reverse()
    : [];

  return (
    <>
      <h1 className="sr-only">WhatsApp</h1>
      <AoVivo chave={selected?.chat ?? ""} ultima={msgs[msgs.length - 1]?.id ?? ""} />
      <section className="-mx-4 -mt-5 -mb-24 lg:-mx-9 lg:-my-7 bg-white overflow-hidden h-[calc(100dvh-143px-env(safe-area-inset-bottom))] lg:h-[100dvh]">
        <div className="flex h-full">
          <aside className={`w-full lg:w-[340px] shrink-0 lg:border-r border-surface-line flex flex-col min-h-0 ${selected || searchParams.chat === "novo" ? "hidden lg:flex" : "flex"}`}>
            <div className="px-4 h-16 shrink-0 border-b border-surface-line flex items-center justify-between gap-2">
              <h2 className="font-display font-bold text-lg">Conversas</h2>
              <div className="flex items-center gap-1">
                {admin && <Link href="/whatsapp/config" className="text-xs font-semibold px-2.5 h-9 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-surface-line hover:bg-surface"
                  title="Configurar conexão e atendente com IA" aria-label={`Configurar WhatsApp (${conectado ? "conectado" : "desconectado"})`}>
                  <span className={`w-2 h-2 rounded-full ${conectado ? "bg-[#1E8A44]" : "bg-[#D0342C]"}`} />{conectado ? (iaLigada === "sim" ? "IA ligada" : "Conectado") : "Desconectado"}
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg></Link>}
                {editor && <Link href="/whatsapp?chat=novo" className="btn-primary h-9 px-3 text-sm">Nova</Link>}
              </div>
            </div>
            {!admin && !conectado && <p className="px-4 py-2 text-xs bg-[#FDE2DF] text-[#A0261C]">WhatsApp desconectado. Avise um administrador.</p>}
            {chats.length === 0 && <p className="p-4 text-sm text-graphite-muted">Nenhuma conversa ainda.</p>}
            <ul className="flex-1 overflow-y-auto">
              {chats.map((c) => (
                <li key={c.chat}>
                  <Link href={`/whatsapp?chat=${encodeURIComponent(c.chat)}`}
                    className={`flex flex-col gap-0.5 px-4 py-3 border-b border-[#F1EFEE] ${selected?.chat === c.chat ? "bg-brand-soft" : "hover:bg-surface"}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-sm truncate">{c.name ?? showNumber(c.chat)}</span>
                      <span className="text-[11px] text-graphite-muted shrink-0">{fmt(c.lastAt)}</span>
                    </span>
                    <span className="text-xs text-graphite-muted truncate">{c.lastText}</span>
                    <span className="flex gap-1 mt-1">
                      <span className="badge bg-[#E6E4E3] text-[#3E3B3C] text-[10px] py-0.5">{c.channel === "oficial" ? "API oficial" : "QR"}</span>
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
                <SendForm numero={searchParams.numero} />
              </div>
            ) : selected ? (
              <>
                <div className="px-4 py-2 min-h-16 shrink-0 border-b border-surface-line flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link href="/whatsapp" aria-label="Voltar às conversas" className="lg:hidden w-9 h-9 -ml-2 flex items-center justify-center text-xl text-brand-text">←</Link>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{selected.name ?? showNumber(selected.chat)}</p>
                      <p className="text-xs text-graphite-muted">{showNumber(selected.chat)}{selected.aiPaused ? " · atendimento humano" : iaLigada === "sim" ? " · IA respondendo" : ""}</p>
                    </div>
                  </div>
                  {editor && (
                    <div className="flex flex-wrap gap-2">
                    {negs.length
                      ? negs.map((g) => <Link key={g.id} href={`/crm/${g.id}`} className="btn-outline h-9 px-3 text-sm">Negociação: {g.titulo.slice(0, 24)}</Link>)
                      : <Link href={`/crm/nova?nome=${encodeURIComponent(selected.name ?? "")}&tel=${selected.chat.replace(/^55(?=\d{10,11}$)/, "")}`} className="btn-outline h-9 px-3 text-sm">Criar negociação</Link>}
                    <form action={alternarIAConversa}>
                      <input type="hidden" name="chat" value={selected.chat} />
                      <input type="hidden" name="pausar" value={selected.aiPaused ? "0" : "1"} />
                      <button className="btn-outline h-9 px-3 text-sm">{selected.aiPaused ? "Devolver para a IA" : "Assumir atendimento"}</button>
                    </form>
                    </div>
                  )}
                </div>
                <ol id="wa-msgs" className="flex-1 min-h-0 p-4 lg:px-8 flex flex-col gap-2 overflow-y-auto bg-[#F4F1EE]">
                  {msgs.map((m) => (
                    <li key={m.id} className={`max-w-[85%] lg:max-w-[65%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.fromMe ? "self-end bg-[#FDEBDD]" : "self-start bg-white"}`}>
                      {m.midia && <Midia m={m} />}
                      {(!m.midia || m.text !== rotulo(m)) && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                      <p className="text-[11px] text-graphite-muted mt-1">{m.sentBy === "ia" ? "IA · " : m.sentBy === "humano" ? "Atendente · " : ""}{fmt(m.createdAt)}</p>
                    </li>
                  ))}
                </ol>
                {editor && <div className="px-3 py-2 lg:px-6 shrink-0 border-t border-surface-line bg-white"><SendForm key={selected.chat} chat={selected.chat} /></div>}
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
