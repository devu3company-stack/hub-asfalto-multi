import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { listIntegrations } from "@/lib/integrations/store";
import { qrStatus } from "@/lib/whatsapp/gateway";
import { AI_LABELS, AI_PROVIDERS } from "@/lib/ai";
import { PageHeader, Badge } from "@/components/ui";
import QrPanel from "./QrPanel";
import SendForm from "./SendForm";
import { alternarIAConversa, desconectarQr, salvarConfig } from "./actions";

export const dynamic = "force-dynamic";

const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const showNumber = (chat: string) => (/^\d+$/.test(chat) ? `+${chat}` : chat);

export default async function WhatsApp({ searchParams }: { searchParams: { chat?: string } }) {
  const user = await requireModule("whatsapp");
  const admin = can(user.role, "integracoes", "edit");
  const editor = can(user.role, "whatsapp", "edit");

  const [qr, canal, iaLigada, instrucoes, provedor, integ, chats] = await Promise.all([
    qrStatus(),
    getSetting("whatsapp.canal"),
    getSetting("ia.ligada"),
    getSetting("ia.instrucoes"),
    getSetting("ia.provedor"),
    listIntegrations(),
    db.query.waChats.findMany({ orderBy: desc(schema.waChats.lastAt), limit: 50 }),
  ]);
  const oficial = integ.find((i) => i.provider === "whatsapp_oficial");
  const ia = integ.find((i) => i.provider === provedor);

  const selected = searchParams.chat ? chats.find((c) => c.chat === searchParams.chat) : undefined;
  const msgs = selected
    ? await db.query.waMessages.findMany({ where: eq(schema.waMessages.chat, selected.chat), orderBy: asc(schema.waMessages.createdAt), limit: 200 })
    : [];

  return (
    <>
      <PageHeader title="WhatsApp" subtitle="Conexão por QR code ou API oficial, atendente com IA e conversas." />

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="card flex flex-col gap-3 lg:col-span-2">
          <h2 className="font-display font-bold text-lg">Conexão por QR code</h2>
          <QrPanel initial={qr}>
            {admin && (
              <form action={desconectarQr}>
                <button className="text-sm font-semibold text-[#A0261C]">Desconectar este número</button>
              </form>
            )}
          </QrPanel>
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">API oficial (Meta)</h2>
          <div>
            {oficial ? (
              oficial.status === "ok" ? <Badge tone="green">Conectada</Badge> : oficial.status === "erro" ? <Badge tone="red">Com erro</Badge> : <Badge tone="orange">Não testada</Badge>
            ) : (
              <Badge tone="gray">Não configurada</Badge>
            )}
          </div>
          <p className="text-sm text-graphite-muted">Mais estável e sem risco de bloqueio do número. Mensagens que a empresa inicia precisam de template aprovado.</p>
          {admin && <Link href="/integracoes" className="text-sm font-semibold text-brand-text">Configurar em Integrações</Link>}
        </section>
      </div>

      {admin && (
        <section className="card flex flex-col gap-4">
          <h2 className="font-display font-bold text-lg">Envio e atendente com IA</h2>
          <form action={salvarConfig} className="flex flex-col gap-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="canal" className="label">Canal usado para enviar</label>
                <select id="canal" name="canal" defaultValue={canal} className="input">
                  <option value="qr">QR code</option>
                  <option value="oficial">API oficial</option>
                </select>
                <p className="text-xs text-graphite-muted mt-1">A IA sempre responde pelo mesmo canal em que o cliente escreveu.</p>
              </div>
              <div>
                <label htmlFor="provedor" className="label">IA que responde</label>
                <select id="provedor" name="provedor" defaultValue={provedor} className="input">
                  {AI_PROVIDERS.map((p) => {
                    const row = integ.find((i) => i.provider === p);
                    return (
                      <option key={p} value={p}>
                        {AI_LABELS[p]}{row ? (row.status === "ok" ? " · conectada" : row.status === "erro" ? " · com erro" : " · não testada") : " · não configurada"}
                      </option>
                    );
                  })}
                </select>
                {!ia && <p className="text-xs text-[#A0261C] mt-1">Esta IA ainda não foi configurada em Integrações.</p>}
              </div>
              <label className="flex items-center gap-2 text-sm font-medium min-h-[44px] sm:col-span-2">
                <input type="checkbox" name="ia" defaultChecked={iaLigada === "sim"} className="w-5 h-5 accent-[#C25A14]" />
                Atendente com IA ligado
              </label>
            </div>
            <div>
              <label htmlFor="instrucoes" className="label">Instruções do atendente</label>
              <textarea id="instrucoes" name="instrucoes" rows={6} defaultValue={instrucoes} className="input h-auto py-3 text-sm" />
              <p className="text-xs text-graphite-muted mt-1">Diga quem é a empresa, o que vende, como falar e o que nunca prometer. Quando não souber, a IA passa a conversa para um atendente e para de responder ali.</p>
            </div>
            <div><button className="btn-primary">Salvar</button></div>
          </form>
        </section>
      )}

      <section className="card p-0 overflow-hidden">
        <div className="flex flex-col lg:flex-row min-h-[480px]">
          <aside className={`lg:w-[320px] lg:border-r border-surface-line ${selected ? "hidden lg:block" : ""}`}>
            <div className="p-4 border-b border-surface-line flex items-center justify-between">
              <h2 className="font-display font-bold text-lg">Conversas</h2>
              {editor && <Link href="/whatsapp?chat=novo" className="text-sm font-semibold text-brand-text">Nova</Link>}
            </div>
            {chats.length === 0 && <p className="p-4 text-sm text-graphite-muted">Nenhuma conversa ainda.</p>}
            <ul>
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

          <div className={`flex-1 min-w-0 flex flex-col ${!selected && searchParams.chat !== "novo" ? "hidden lg:flex" : ""}`}>
            {searchParams.chat === "novo" ? (
              <div className="p-5 flex flex-col gap-3">
                <Link href="/whatsapp" className="lg:hidden text-sm text-brand-text font-semibold">← Conversas</Link>
                <h2 className="font-display font-bold text-lg">Nova mensagem</h2>
                <SendForm />
              </div>
            ) : selected ? (
              <>
                <div className="p-4 border-b border-surface-line flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link href="/whatsapp" className="lg:hidden text-sm text-brand-text font-semibold">← Conversas</Link>
                    <p className="font-semibold">{selected.name ?? showNumber(selected.chat)}</p>
                    <p className="text-xs text-graphite-muted">{showNumber(selected.chat)}</p>
                  </div>
                  {editor && (
                    <form action={alternarIAConversa}>
                      <input type="hidden" name="chat" value={selected.chat} />
                      <input type="hidden" name="pausar" value={selected.aiPaused ? "0" : "1"} />
                      <button className="btn-outline h-10">{selected.aiPaused ? "Devolver para a IA" : "Assumir atendimento"}</button>
                    </form>
                  )}
                </div>
                <ol className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto max-h-[520px] bg-[#F8F7F6]">
                  {msgs.map((m) => (
                    <li key={m.id} className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.fromMe ? "self-end bg-[#FDEBDD]" : "self-start bg-white border border-surface-line"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                      <p className="text-[11px] text-graphite-muted mt-1">{m.sentBy === "ia" ? "IA · " : m.sentBy === "humano" ? "Atendente · " : ""}{fmt(m.createdAt)}</p>
                    </li>
                  ))}
                </ol>
                {editor && <div className="p-4 border-t border-surface-line"><SendForm chat={selected.chat} /></div>}
              </>
            ) : (
              <p className="p-6 text-sm text-graphite-muted">Escolha uma conversa.</p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
