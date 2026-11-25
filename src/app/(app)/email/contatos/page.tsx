import { and, desc, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ORIGENS, type Origem } from "@/lib/email/contatos";
import { PageHeader, Badge, brl } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import Abas from "../Abas";
import LojaTabs from "@/components/LojaTabs";
import { lojaValida } from "@/lib/lojas";
import { alternarDescadastro, excluirContato, importar, novoContato, sincronizar } from "../actions";

export const dynamic = "force-dynamic";
const K = schema.contatos;
const data = (d?: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

export default async function Contatos({ searchParams }: { searchParams: { q?: string; f?: string; pagina?: string; loja?: string } }) {
  const user = await requireModule("email");
  const loja = lojaValida(searchParams.loja);
  const editor = can(user.role, "email", "edit");
  const conds: SQL[] = [sql`${loja} = any(${K.lojas})`];
  const q = searchParams.q?.trim();
  if (q) conds.push(or(ilike(K.email, `%${q}%`), ilike(K.nome, `%${q}%`), sql`${q.toLowerCase()} = any(${K.tags})`)!);
  if (searchParams.f === "descadastrados") conds.push(isNotNull(K.descadastradoEm));
  if (searchParams.f === "compraram") conds.push(isNotNull(K.ultimaCompraEm));
  if (searchParams.f === "ativos") conds.push(isNull(K.descadastradoEm));
  const pagina = Math.max(1, Number(searchParams.pagina) || 1);
  const where = conds.length ? and(...conds) : undefined;
  const [lista, [{ n }]] = await Promise.all([
    db.select().from(K).where(where).orderBy(desc(K.updatedAt)).limit(100).offset((pagina - 1) * 100),
    db.select({ n: sql<number>`count(*)::int` }).from(K).where(where),
  ]);
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const snippet = `<form action="${appUrl}/api/email/formulario" method="post" style="display:grid;gap:8px;max-width:420px">
  <input name="nome" placeholder="Seu nome" required>
  <input name="email" type="email" placeholder="Seu e-mail" required>
  <input name="site_url" style="display:none" tabindex="-1" autocomplete="off">
  <input type="hidden" name="loja" value="${loja}">
  <input type="hidden" name="redirect" value="https://SEU-SITE/obrigado">
  <label><input type="checkbox" name="aceite" value="sim" required> Aceito receber e-mails da Asfalto Multi</label>
  <button type="submit">Quero receber</button>
</form>`;

  return (
    <>
      <PageHeader title="E-mail marketing" subtitle={`${n.toLocaleString("pt-BR")} contato(s)`}>
        <LojaTabs atual={loja} path="/email/contatos" />
      </PageHeader>
      <Abas atual="/email/contatos" loja={loja} />

      {editor && (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Trazer contatos</h2>
            <p className="text-sm text-graphite">Junta todos num só cadastro, sem duplicar e-mail. Quem se descadastrou continua descadastrado.</p>
            <div className="flex flex-wrap gap-3">
              {(["shopify", "omie", "whatsapp"] as const).map((f) => (
                <ActionForm key={f} action={sincronizar} label={`Sincronizar ${ORIGENS[f]}`} busy="Buscando..." className="flex flex-col gap-2">
                  <input type="hidden" name="fonte" value={f} /><input type="hidden" name="loja" value={loja} />
                </ActionForm>
              ))}
            </div>
          </section>
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Importar planilha</h2>
            <p className="text-sm text-graphite">.xlsx ou .csv com coluna de e-mail (nome, telefone, cidade, estado e tags são opcionais). Aceita a exportação de leads do RD Station.</p>
            <ActionForm action={importar} label="Importar" busy="Importando..." reset>
              <input type="hidden" name="loja" value={loja} />
              <input name="arquivo" type="file" accept=".xlsx,.csv,text/csv" aria-label="Planilha" className="text-sm" />
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="consentimento" className="label">De onde vieram?</label>
                  <input id="consentimento" name="consentimento" required className="input" placeholder="Leads do RD Station (opt-in)" />
                </div>
                <div>
                  <label htmlFor="tags_imp" className="label">Tags <span className="text-graphite-muted font-normal">(opcional)</span></label>
                  <input id="tags_imp" name="tags" className="input" placeholder="rd-station, construtoras" />
                </div>
              </div>
            </ActionForm>
            <p className="text-xs text-graphite-muted">Importe só quem aceitou receber e-mails ou já é cliente (LGPD).</p>
          </section>
        </div>
      )}

      <section className="card flex flex-col gap-3">
        <form className="flex flex-wrap items-end gap-3" role="search">
          <input type="hidden" name="loja" value={loja} />
          <div className="grow max-w-sm">
            <label htmlFor="q" className="label">Buscar</label>
            <input id="q" name="q" defaultValue={q} className="input" placeholder="E-mail, nome ou tag" />
          </div>
          <div>
            <label htmlFor="f" className="label">Mostrar</label>
            <select id="f" name="f" defaultValue={searchParams.f ?? ""} className="input">
              <option value="">Todos</option><option value="ativos">Ativos</option><option value="compraram">Já compraram</option><option value="descadastrados">Descadastrados</option>
            </select>
          </div>
          <button className="btn-outline">Filtrar</button>
        </form>
        {lista.length === 0 ? <p className="text-sm text-graphite-muted">Nenhum contato.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-graphite-muted">
                <th className="py-2 px-2 border-b border-surface-line">Contato</th>
                <th className="py-2 px-2 border-b border-surface-line">Origem</th>
                <th className="py-2 px-2 border-b border-surface-line">Tags</th>
                <th className="py-2 px-2 border-b border-surface-line text-right">Compras</th>
                <th className="py-2 px-2 border-b border-surface-line">Última compra</th>
                <th className="py-2 px-2 border-b border-surface-line">Situação</th>
                {editor && <th className="py-2 px-2 border-b border-surface-line"><span className="sr-only">Ações</span></th>}
              </tr></thead>
              <tbody>
                {lista.map((c) => (
                  <tr key={c.id} className="border-b border-[#F1EFEE] last:border-0 align-top">
                    <td className="py-3 px-2"><span className="font-medium">{c.nome ?? "—"}</span><span className="block text-xs text-graphite-muted">{c.email}</span>
                      {c.consentimento && <span className="block text-xs text-graphite-muted">{c.consentimento}</span>}</td>
                    <td className="py-3 px-2 text-xs">{c.origens.map((o) => ORIGENS[o as Origem] ?? o).join(", ")}</td>
                    <td className="py-3 px-2 text-xs">{c.tags.join(", ") || "—"}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{c.totalPedidos ? `${c.totalPedidos} · ${brl(c.totalGasto)}` : "—"}</td>
                    <td className="py-3 px-2">{data(c.ultimaCompraEm)}</td>
                    <td className="py-3 px-2">{c.bounce ? <Badge tone="red">E-mail inválido</Badge> : c.descadastradoEm ? <Badge tone="gray">Descadastrado</Badge> : <Badge tone="green">Ativo</Badge>}</td>
                    {editor && (
                      <td className="py-2 px-2 whitespace-nowrap">
                        <form action={alternarDescadastro} className="inline"><input type="hidden" name="id" value={c.id} />
                          <button className="text-sm text-graphite px-2 min-h-[44px]">{c.descadastradoEm ? "Reativar" : "Descadastrar"}</button></form>
                        <form action={excluirContato} className="inline"><input type="hidden" name="id" value={c.id} />
                          <button className="text-sm text-[#A0261C] px-2 min-h-[44px]" aria-label={`Excluir ${c.email}`}>Excluir</button></form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {n > 100 && (
          <div className="flex gap-3 text-sm">
            {pagina > 1 && <a className="btn-outline" href={`?${new URLSearchParams({ ...searchParams, pagina: String(pagina - 1) })}`}>Anterior</a>}
            {pagina * 100 < n && <a className="btn-outline" href={`?${new URLSearchParams({ ...searchParams, pagina: String(pagina + 1) })}`}>Próxima</a>}
          </div>
        )}
        <p className="text-xs text-graphite-muted">Só reative um descadastrado se a própria pessoa pediu para voltar a receber.</p>
      </section>

      {editor && (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Adicionar contato</h2>
            <ActionForm action={novoContato} label="Salvar" reset>
              <input type="hidden" name="loja" value={loja} />
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label htmlFor="n_email" className="label">E-mail</label><input id="n_email" name="email" type="email" required className="input" /></div>
                <div><label htmlFor="n_nome" className="label">Nome</label><input id="n_nome" name="nome" className="input" /></div>
                <div><label htmlFor="n_tel" className="label">Telefone</label><input id="n_tel" name="telefone" className="input" /></div>
                <div><label htmlFor="n_tags" className="label">Tags</label><input id="n_tags" name="tags" className="input" placeholder="construtora, sp" /></div>
                <div className="sm:col-span-2"><label htmlFor="n_cons" className="label">Como autorizou receber e-mails?</label><input id="n_cons" name="consentimento" className="input" placeholder="Pediu por telefone em 24/11" /></div>
              </div>
            </ActionForm>
          </section>
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Formulário para o site</h2>
            <p className="text-sm text-graphite">Cole num widget HTML do Elementor. Quem preencher entra aqui com a origem &quot;Formulário do site&quot;. Troque o endereço de &quot;redirect&quot; pela sua página de obrigado.</p>
            <textarea readOnly rows={10} value={snippet} aria-label="Código do formulário" className="input h-auto py-2 font-mono text-xs" />
          </section>
        </div>
      )}
    </>
  );
}
