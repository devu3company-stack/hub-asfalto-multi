import { asc, desc } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { buscar } from "@/lib/manuais";
import { LOJAS, nomeLoja } from "@/lib/lojas";
import { PageHeader, Badge } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import { alternarIA, enviarManual, removerManual } from "./actions";

export const dynamic = "force-dynamic";
const mb = (b: number) => `${(b / 1_048_576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;

export default async function Manuais({ searchParams }: { searchParams: { q?: string } }) {
  const user = await requireModule("manuais");
  const editor = can(user.role, "manuais", "edit");
  const q = searchParams.q?.trim() ?? "";
  const [lista, produtos, achados] = await Promise.all([
    db.query.manuais.findMany({ orderBy: desc(schema.manuais.createdAt), with: { produto: { columns: { descricao: true } } } }),
    editor ? db.query.produtos.findMany({ columns: { id: true, descricao: true, loja: true }, orderBy: asc(schema.produtos.descricao) }) : [],
    q ? buscar(q) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader title="Manuais" subtitle="PDFs dos produtos. Busque dentro deles e deixe a IA do WhatsApp usar o conteúdo nas respostas." />

      <section className="card flex flex-col gap-3">
        <form role="search" className="flex flex-wrap items-end gap-3">
          <div className="grow max-w-xl">
            <label htmlFor="q" className="label">Buscar nos manuais</label>
            <input id="q" name="q" defaultValue={q} className="input" placeholder="Ex.: rendimento por m², tempo de cura, compactação" />
          </div>
          <button className="btn-primary">Buscar</button>
        </form>
        {q && (achados.length === 0 ? <p className="text-sm text-graphite-muted">Nada encontrado para &quot;{q}&quot;.</p> : (
          <ul className="flex flex-col gap-3">
            {achados.map((a, i) => (
              <li key={i} className="p-3 rounded-xl bg-[#F8F7F6]">
                <a href={`/api/manuais/${a.manualId}#page=${a.pagina}`} target="_blank" rel="noopener" className="font-semibold hover:underline">{a.titulo} · pág. {a.pagina}</a>
                <p className="text-sm text-graphite mt-1" dangerouslySetInnerHTML={{ __html: escaparTrecho(a.trecho) }} />
              </li>
            ))}
          </ul>
        ))}
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg">Arquivos</h2>
        {lista.length === 0 ? <p className="text-sm text-graphite-muted">Nenhum manual ainda.</p> : (
          <ul className="divide-y divide-[#F1EFEE]">
            {lista.map((m) => (
              <li key={m.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <a href={`/api/manuais/${m.id}`} target="_blank" rel="noopener" className="font-medium hover:underline">{m.titulo}</a>
                  <span className="block text-xs text-graphite-muted">
                    {m.paginas} pág. · {mb(m.tamanho)} · {m.loja ? nomeLoja(m.loja) : "As duas lojas"}{m.produto ? ` · ${m.produto.descricao}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {m.usarNaIA ? <Badge tone="green">Usado pela IA</Badge> : <Badge tone="gray">Fora da IA</Badge>}
                  {editor && (
                    <>
                      <form action={alternarIA}><input type="hidden" name="id" value={m.id} /><button className="text-sm text-graphite px-2 min-h-[44px]">{m.usarNaIA ? "Tirar da IA" : "Usar na IA"}</button></form>
                      <form action={removerManual}><input type="hidden" name="id" value={m.id} /><button className="text-sm text-[#A0261C] px-2 min-h-[44px]" aria-label={`Excluir ${m.titulo}`}>Excluir</button></form>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editor && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Enviar manual (PDF)</h2>
          <ActionForm action={enviarManual} label="Enviar" busy="Lendo o PDF..." reset>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2"><label htmlFor="arquivo" className="label">Arquivo PDF</label><input id="arquivo" name="arquivo" type="file" accept="application/pdf,.pdf" required className="text-sm" /></div>
              <div><label htmlFor="titulo" className="label">Título</label><input id="titulo" name="titulo" className="input" placeholder="Manual de aplicação — Asfalto frio" /></div>
              <div><label htmlFor="loja" className="label">Loja</label>
                <select id="loja" name="loja" className="input"><option value="">As duas</option>{LOJAS.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
              <div><label htmlFor="produtoId" className="label">Produto <span className="text-graphite-muted font-normal">(opcional)</span></label>
                <select id="produtoId" name="produtoId" className="input"><option value="">Nenhum</option>{produtos.map((p) => <option key={p.id} value={p.id}>{p.descricao} ({nomeLoja(p.loja)})</option>)}</select></div>
              <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" name="usarNaIA" value="sim" defaultChecked className="w-4 h-4 accent-[#C25A14]" /> A IA do WhatsApp pode usar este manual</label>
            </div>
          </ActionForm>
          <p className="text-xs text-graphite-muted">PDF com texto (não escaneado). Até 30 MB.</p>
        </section>
      )}
    </>
  );
}

/** O trecho vem do banco com «destaques»: escapa o HTML e transforma só os destaques em <mark>. */
function escaparTrecho(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/«/g, "<mark>").replace(/»/g, "</mark>");
}
