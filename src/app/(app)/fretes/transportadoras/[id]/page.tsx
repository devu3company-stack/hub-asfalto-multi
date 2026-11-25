import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { faixasTexto, type Faixa } from "@/lib/frete/motor";
import { PageHeader, Badge, brl } from "@/components/ui";
import ActionForm from "../ActionForm";
import { atualizarTransportadora, excluirRota, excluirTransportadora, importarCsv, salvarRota } from "../actions";

export const dynamic = "force-dynamic";

const fmtCep = (c: string) => c.replace(/^(\d{5})(\d{3})$/, "$1-$2");
const br = (n: number) => (n ? String(n).replace(".", ",") : "");

type Rota = typeof schema.freteRotas.$inferSelect;

function CamposRota({ r }: { r?: Rota }) {
  const campo = (name: string, label: string, def: string, ph = "", extra = "") => (
    <div className={extra}>
      <label htmlFor={`${name}${r ? "_e" : ""}`} className="block text-xs font-medium text-graphite mb-1">{label}</label>
      <input id={`${name}${r ? "_e" : ""}`} name={name} defaultValue={def} placeholder={ph} inputMode={name === "nome" ? undefined : "decimal"} className="input h-10 px-3" />
    </div>
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {campo("nome", "Nome da rota", r?.nome ?? "", "Capital SP", "col-span-2")}
      {campo("cepInicio", "CEP inicial", r ? fmtCep(r.cepInicio) : "", "01000-000")}
      {campo("cepFim", "CEP final", r ? fmtCep(r.cepFim) : "", "05999-999")}
      <div className="col-span-2 sm:col-span-4">
        <label htmlFor={`faixas${r ? "_e" : ""}`} className="block text-xs font-medium text-graphite mb-1">Faixas de peso (até kg : valor R$)</label>
        <input id={`faixas${r ? "_e" : ""}`} name="faixas" defaultValue={r ? faixasTexto(r.faixas as Faixa[]) : ""} placeholder="10:45,00 | 30:62,50 | 50:80,00 | 100:120,00" className="input h-10 px-3" />
      </div>
      {campo("excedenteKg", "Excedente R$/kg", br(r?.excedenteKg ?? 0), "1,10")}
      {campo("freteMinimo", "Frete mínimo R$", br(r?.freteMinimo ?? 0), "45,00")}
      {campo("prazoDias", "Prazo (dias úteis)", String(r?.prazoDias ?? ""), "3")}
      {campo("icmsPct", "ICMS %", br(r?.icmsPct ?? 0), "12")}
      {campo("adValoremPct", "Ad valorem %", br(r?.adValoremPct ?? 0), "0,3")}
      {campo("grisPct", "GRIS %", br(r?.grisPct ?? 0), "0,2")}
      {campo("grisMin", "GRIS mínimo R$", br(r?.grisMin ?? 0), "3,50")}
      {campo("pedagioPor100kg", "Pedágio R$/100 kg", br(r?.pedagioPor100kg ?? 0), "4,20")}
      {campo("taxaDespacho", "Taxa de despacho R$", br(r?.taxaDespacho ?? 0), "15,00")}
      {campo("outrasTaxas", "Outras taxas R$", br(r?.outrasTaxas ?? 0), "0")}
      {r && (
        <div>
          <label htmlFor="ativo_e" className="block text-xs font-medium text-graphite mb-1">Situação</label>
          <select id="ativo_e" name="ativo" defaultValue={r.ativo ? "sim" : "nao"} className="input h-10 px-3">
            <option value="sim">Ativa</option>
            <option value="nao">Inativa</option>
          </select>
        </div>
      )}
    </div>
  );
}

export default async function Transportadora({ params, searchParams }: { params: { id: string }; searchParams: { rota?: string } }) {
  const user = await requireModule("fretes");
  const admin = can(user.role, "integracoes", "edit");
  const t = await db.query.transportadoras.findFirst({ where: eq(schema.transportadoras.id, params.id) }).catch(() => undefined);
  if (!t) notFound();
  const rotas = await db.query.freteRotas.findMany({ where: eq(schema.freteRotas.transportadoraId, t.id), orderBy: asc(schema.freteRotas.cepInicio) });
  const editando = admin && searchParams.rota ? rotas.find((r) => r.id === searchParams.rota) : undefined;

  return (
    <>
      <PageHeader title={t.nome} subtitle={`${rotas.length} rota(s) · cubagem ${t.fatorCubagem} kg/m³${t.prazoExtra ? ` · +${t.prazoExtra} dia(s) no prazo` : ""}`}>
        <Link href="/fretes/transportadoras" className="btn-outline h-9 px-4">Todas as transportadoras</Link>
      </PageHeader>

      {editando && (
        <section className="card flex flex-col gap-3 ring-2 ring-brand">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-lg">Editar rota: {editando.nome}</h2>
            <Link href={`/fretes/transportadoras/${t.id}`} className="text-sm text-graphite min-h-[44px] inline-flex items-center">Cancelar</Link>
          </div>
          <ActionForm action={salvarRota} label="Salvar rota">
            <input type="hidden" name="transportadoraId" value={t.id} />
            <input type="hidden" name="rotaId" value={editando.id} />
            <CamposRota r={editando} />
          </ActionForm>
        </section>
      )}

      <section className="card flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg">Tabela de frete</h2>
        {rotas.length === 0 ? (
          <p className="text-sm text-graphite-muted">Nenhuma rota ainda. Adicione abaixo ou importe a planilha da transportadora.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-graphite-muted">
                  <th className="py-2 px-2 border-b border-surface-line">Rota</th>
                  <th className="py-2 px-2 border-b border-surface-line">Faixa de CEP</th>
                  <th className="py-2 px-2 border-b border-surface-line">Prazo</th>
                  <th className="py-2 px-2 border-b border-surface-line">Faixas de peso</th>
                  <th className="py-2 px-2 border-b border-surface-line text-right">Exc./kg</th>
                  <th className="py-2 px-2 border-b border-surface-line text-right">Mínimo</th>
                  <th className="py-2 px-2 border-b border-surface-line">Taxas</th>
                  {admin && <th className="py-2 px-2 border-b border-surface-line"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody>
                {rotas.map((r) => (
                  <tr key={r.id} className="border-b border-[#F1EFEE] last:border-0 align-top">
                    <td className="py-3 px-2 font-medium">{r.nome}{!r.ativo && <span className="ml-2"><Badge tone="gray">Inativa</Badge></span>}</td>
                    <td className="py-3 px-2 whitespace-nowrap tabular-nums">{fmtCep(r.cepInicio)} a {fmtCep(r.cepFim)}</td>
                    <td className="py-3 px-2">{r.prazoDias}d</td>
                    <td className="py-3 px-2 text-xs">{faixasTexto(r.faixas as Faixa[]) || "—"}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{r.excedenteKg ? brl(r.excedenteKg) : "—"}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{r.freteMinimo ? brl(r.freteMinimo) : "—"}</td>
                    <td className="py-3 px-2 text-xs text-graphite">
                      {[
                        r.adValoremPct && `AdV ${br(r.adValoremPct)}%`,
                        (r.grisPct || r.grisMin) && `GRIS ${br(r.grisPct)}%${r.grisMin ? ` (mín. ${brl(r.grisMin)})` : ""}`,
                        r.pedagioPor100kg && `Pedágio ${brl(r.pedagioPor100kg)}/100kg`,
                        r.taxaDespacho && `Despacho ${brl(r.taxaDespacho)}`,
                        r.outrasTaxas && `Outras ${brl(r.outrasTaxas)}`,
                        r.icmsPct && `ICMS ${br(r.icmsPct)}%`,
                      ].filter(Boolean).join(" · ") || "—"}
                    </td>
                    {admin && (
                      <td className="py-2 px-2 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Link href={`/fretes/transportadoras/${t.id}?rota=${r.id}`} className="text-sm font-semibold text-brand-text px-2 min-h-[44px] inline-flex items-center">Editar</Link>
                          <form action={excluirRota}>
                            <input type="hidden" name="rotaId" value={r.id} />
                            <input type="hidden" name="transportadoraId" value={t.id} />
                            <button className="text-sm text-[#A0261C] px-2 min-h-[44px]" aria-label={`Excluir rota ${r.nome}`}>Excluir</button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {admin && (
        <>
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Adicionar rota</h2>
            <ActionForm action={salvarRota} label="Adicionar rota" reset>
              <input type="hidden" name="transportadoraId" value={t.id} />
              <CamposRota />
              <p className="text-xs text-graphite-muted">Acima da última faixa, cobra o valor dela mais o excedente por kg. Sem faixas, cobra só o R$/kg. Se a mesma transportadora tiver duas rotas para um CEP, vale a faixa de CEP mais estreita.</p>
            </ActionForm>
          </section>

          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Importar planilha (CSV)</h2>
            <p className="text-sm text-graphite">
              Uma rota por linha, separada por ponto e vírgula. Baixe o <a href="/modelo-tabela-frete.csv" download className="font-semibold text-brand-text underline">modelo de planilha</a>, preencha no Excel e salve como CSV.
            </p>
            <ActionForm action={importarCsv} label="Importar" busy="Importando..." reset>
              <input type="hidden" name="transportadoraId" value={t.id} />
              <div>
                <label htmlFor="arquivo" className="label">Arquivo CSV</label>
                <input id="arquivo" name="arquivo" type="file" accept=".csv,text/csv,text/plain" className="text-sm" />
              </div>
              <div>
                <label htmlFor="texto" className="label">Ou cole as linhas</label>
                <textarea id="texto" name="texto" rows={4} className="input h-auto py-2 font-mono text-xs" placeholder="Capital SP;01000-000;05999-999;2;10:45,00|30:62,50;1,10;45;0,3;0,2;3,5;4,2;15;0;12" />
              </div>
              <label className="flex items-center gap-2 text-sm min-h-[44px]">
                <input type="checkbox" name="substituir" value="sim" className="w-4 h-4 accent-[#C25A14]" />
                Apagar as rotas atuais desta transportadora antes de importar
              </label>
            </ActionForm>
          </section>

          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Dados da transportadora</h2>
            <ActionForm action={atualizarTransportadora} label="Salvar">
              <input type="hidden" name="id" value={t.id} />
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="nome_t" className="label">Nome</label>
                  <input id="nome_t" name="nome" defaultValue={t.nome} required className="input" />
                </div>
                <div>
                  <label htmlFor="cnpj_t" className="label">CNPJ</label>
                  <input id="cnpj_t" name="cnpj" defaultValue={t.cnpj ?? ""} className="input" />
                </div>
                <div>
                  <label htmlFor="ativo_t" className="label">Situação</label>
                  <select id="ativo_t" name="ativo" defaultValue={t.ativo ? "sim" : "nao"} className="input">
                    <option value="sim">Ativa (entra nas cotações)</option>
                    <option value="nao">Inativa</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="fator_t" className="label">Fator de cubagem (kg/m³)</label>
                  <input id="fator_t" name="fatorCubagem" defaultValue={br(t.fatorCubagem)} inputMode="decimal" className="input" />
                </div>
                <div>
                  <label htmlFor="prazo_t" className="label">Dias a somar no prazo</label>
                  <input id="prazo_t" name="prazoExtra" defaultValue={String(t.prazoExtra)} inputMode="numeric" className="input" />
                </div>
                <div>
                  <label htmlFor="obs_t" className="label">Observação</label>
                  <input id="obs_t" name="observacao" defaultValue={t.observacao ?? ""} className="input" />
                </div>
              </div>
            </ActionForm>
            <details className="border-t border-surface-line pt-3">
              <summary className="cursor-pointer text-sm text-[#A0261C] font-semibold min-h-[44px] inline-flex items-center">Excluir transportadora</summary>
              <form action={excluirTransportadora} className="flex flex-wrap items-center gap-3 mt-2">
                <input type="hidden" name="id" value={t.id} />
                <p className="text-sm text-graphite">Apaga a transportadora e as {rotas.length} rota(s) dela. Não dá para desfazer.</p>
                <button className="btn border border-[#A0261C] text-[#A0261C] bg-white">Excluir de vez</button>
              </form>
            </details>
          </section>
        </>
      )}
    </>
  );
}
