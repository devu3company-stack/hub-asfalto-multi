import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import { aprovar } from "../actions";

export const dynamic = "force-dynamic";
const AP = schema.automacaoAprovacoes;

export default async function Aprovar() {
  await requireModule("whatsapp", "edit");
  const [pend, feitas] = await Promise.all([
    db.query.automacaoAprovacoes.findMany({ where: eq(AP.status, "pendente"), orderBy: desc(AP.createdAt), with: { automacao: { columns: { nome: true } } } }),
    db.query.automacaoAprovacoes.findMany({ where: eq(AP.status, "enviada"), orderBy: desc(AP.decididaEm), limit: 10 }),
  ]);
  return (
    <>
      <PageHeader title="Aprovar mensagens" subtitle="Orçamentos e respostas que as automações prepararam. Confira, ajuste se precisar e envie.">
        <Link href="/automacoes" className="btn-outline h-9 px-4">Automações</Link>
      </PageHeader>
      {!pend.length && <p className="card text-sm text-graphite-muted">Nada esperando aprovação. 🎉</p>}
      {pend.map((p) => (
        <section key={p.id} className="card flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <strong>{p.nome ?? p.chat}</strong>
            <span className="text-graphite">· {p.automacao?.nome} · {p.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
            <Link href={`/whatsapp?chat=${p.chat}`} className="ml-auto text-brand-text font-semibold">Abrir conversa</Link>
          </div>
          {p.pedido && <p className="text-sm bg-[#F4F1EE] rounded-xl p-3"><span className="text-graphite">Cliente:</span> {p.pedido}</p>}
          <ActionForm action={aprovar} label="Enviar pelo WhatsApp" busy="Enviando...">
            <input type="hidden" name="id" value={p.id} />
            <label htmlFor={`t-${p.id}`} className="label">Mensagem (pode editar)</label>
            <textarea id={`t-${p.id}`} name="texto" rows={6} defaultValue={p.texto} className="input h-auto py-2" />
          </ActionForm>
          <ActionForm action={aprovar} label="Descartar" busy="..." className="flex"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="decisao" value="descartar" /></ActionForm>
        </section>
      ))}
      {feitas.length > 0 && (
        <details className="card"><summary className="font-semibold cursor-pointer min-h-[40px] flex items-center">Últimas enviadas</summary>
          <ul className="mt-2 flex flex-col gap-2 text-sm">{feitas.map((f) => <li key={f.id}><strong>{f.nome ?? f.chat}:</strong> {f.texto.slice(0, 140)}</li>)}</ul></details>
      )}
    </>
  );
}
