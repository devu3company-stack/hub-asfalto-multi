import Link from "next/link";
import { and, count, desc, eq, ilike, sql } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { parametros } from "@/lib/frete/historico";
import { PageHeader, Stat, brl } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import { salvarParams } from "./actions";

export const dynamic = "force-dynamic";
const H = schema.freteHistorico;

export default async function HistoricoFretes({ searchParams }: { searchParams: { veiculo?: string; q?: string } }) {
  const user = await requireModule("fretes");
  const editor = can(user.role, "fretes", "edit");
  const filtro = and(searchParams.veiculo ? eq(H.veiculo, searchParams.veiculo) : undefined, searchParams.q ? ilike(H.cidade, `%${searchParams.q}%`) : undefined);
  const [[tot], porVeiculo, linhas, cfg] = await Promise.all([
    db.select({ n: count(), custo: sql<number>`coalesce(sum(${H.custo}),0)`, save: sql<number>`coalesce(sum(${H.orcamento} - ${H.custo}),0)`, app: sql<number>`count(*) filter (where ${H.origem} = 'entrega')` }).from(H),
    db.select({ veiculo: H.veiculo, n: count(), rsKm: sql<number>`avg(${H.custo} / nullif(${H.distanciaKm},0))` }).from(H).groupBy(H.veiculo).orderBy(desc(count())),
    db.select().from(H).where(filtro).orderBy(desc(H.data)).limit(150),
    parametros(),
  ]);
  return (
    <>
      <PageHeader title="Histórico de fretes" subtitle="Base usada para avaliar cotações e sugerir o valor dos fretes dos entregadores.">
        <div className="flex gap-2"><Link href="/fretes/avaliar" className="btn-primary h-9 px-4">Avaliar frete</Link><Link href="/fretes" className="btn-outline h-9 px-4">Fretes</Link></div>
      </PageHeader>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Fretes no histórico" value={tot.n.toLocaleString("pt-BR")} hint={tot.app ? `${tot.app} vieram do app de entregas` : undefined} />
        <Stat label="Total pago" value={brl(Number(tot.custo))} />
        <Stat label="Economia negociada" value={brl(Number(tot.save))} hint="Orçamento pedido − valor pago" tone="green" />
        <Stat label="Veículos" value={String(porVeiculo.length)} />
      </div>

      {editor && (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Importar planilha</h2>
            <p className="text-sm text-graphite">A importação da planilha &quot;Histórico de Preços Fretes&quot; agora fica em Cadastros, junto com as transportadoras e os entregadores.</p>
            <Link href="/fretes/planilhas" className="btn-primary self-start">Abrir Cadastros → Planilhas</Link>
          </section>
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">O que conta como &quot;frete parecido&quot;</h2>
            <ActionForm action={salvarParams} label="Salvar parâmetros" className="grid grid-cols-2 gap-3">
              <div><label htmlFor="pesoTol" className="label">Peso: variação (%)</label><input id="pesoTol" name="pesoTol" defaultValue={cfg.pesoTol} inputMode="decimal" className="input" /></div>
              <div><label htmlFor="distTol" className="label">Distância: variação (%)</label><input id="distTol" name="distTol" defaultValue={cfg.distTol} inputMode="decimal" className="input" /></div>
              <div><label htmlFor="minAmostra" className="label">Mínimo para confiar</label><input id="minAmostra" name="minAmostra" defaultValue={cfg.minAmostra} inputMode="numeric" className="input" /></div>
              <div><label htmlFor="mesmaUF" className="label">Mesma UF obrigatória</label>
                <select id="mesmaUF" name="mesmaUF" defaultValue={cfg.mesmaUF ? "sim" : "nao"} className="input"><option value="nao">Não</option><option value="sim">Sim</option></select></div>
              <p className="col-span-2 text-xs text-graphite-muted">O veículo precisa ser sempre o mesmo.</p>
            </ActionForm>
          </section>
        </div>
      )}

      <section className="card flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg">R$/km médio por veículo</h2>
        <div className="flex flex-wrap gap-2">
          {porVeiculo.map((v) => (
            <Link key={v.veiculo} href={`/fretes/historico?veiculo=${encodeURIComponent(v.veiculo)}`}
              className={`px-3 py-2 rounded-xl border text-sm ${searchParams.veiculo === v.veiculo ? "border-brand bg-brand-soft" : "border-surface-line"}`}>
              <span className="font-semibold">{v.veiculo}</span> · {v.n} fretes · {brl(Number(v.rsKm ?? 0))}/km
            </Link>
          ))}
          {searchParams.veiculo && <Link href="/fretes/historico" className="px-3 py-2 text-sm text-brand-text font-semibold">Limpar filtro</Link>}
        </div>
      </section>

      <section className="card flex flex-col gap-3">
        <form className="flex flex-wrap gap-2 items-end" role="search">
          {searchParams.veiculo && <input type="hidden" name="veiculo" value={searchParams.veiculo} />}
          <div><label htmlFor="q" className="label">Cidade</label><input id="q" name="q" defaultValue={searchParams.q} className="input" /></div>
          <button className="btn-outline h-11">Filtrar</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-graphite"><th className="py-2 pr-3">Data</th><th className="pr-3">Destino</th><th className="pr-3">Produto</th><th className="pr-3 text-right">Kg</th><th className="pr-3 text-right">Km</th><th className="pr-3">Veículo</th><th className="pr-3 text-right">Orçamento</th><th className="pr-3 text-right">Pago</th><th className="text-right">R$/km</th></tr></thead>
            <tbody>
              {linhas.map((r) => (
                <tr key={r.id} className="border-t border-surface-line">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{r.data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}{r.origem === "entrega" && <span className="ml-1 text-xs text-brand-text">app</span>}</td>
                  <td className="pr-3">{r.cidade}{r.uf ? `/${r.uf}` : ""}</td>
                  <td className="pr-3">{r.qtd ? `${r.qtd} ` : ""}{r.produto}</td>
                  <td className="pr-3 text-right">{r.kg.toLocaleString("pt-BR")}</td>
                  <td className="pr-3 text-right">{r.distanciaKm.toLocaleString("pt-BR")}</td>
                  <td className="pr-3">{r.veiculo}</td>
                  <td className="pr-3 text-right">{brl(r.orcamento)}</td>
                  <td className="pr-3 text-right">{brl(r.custo)}</td>
                  <td className="text-right">{brl(r.distanciaKm ? r.custo / r.distanciaKm : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!linhas.length && <p className="text-sm text-graphite-muted py-3">Nenhum frete{searchParams.q || searchParams.veiculo ? " com esse filtro" : ". Importe a planilha acima"}.</p>}
        </div>
      </section>
    </>
  );
}
