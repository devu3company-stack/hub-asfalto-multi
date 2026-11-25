import Link from "next/link";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { lojaValida } from "@/lib/lojas";
import LojaTabs from "@/components/LojaTabs";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { cepOrigemPadrao, provedoresConectados, type Opcao } from "@/lib/frete";
import { PageHeader, Badge, brl } from "@/components/ui";
import CotacaoForm, { type ProdutoOpcao } from "./CotacaoForm";
import { semMedidas } from "@/lib/produtos";

export const dynamic = "force-dynamic";

const fmtCep = (c: string) => c.replace(/^(\d{5})(\d{3})$/, "$1-$2");
const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function Fretes({ searchParams }: { searchParams: { loja?: string } }) {
  const loja = lojaValida(searchParams.loja);
  const user = await requireModule("fretes");
  const editor = can(user.role, "fretes", "edit");
  const [cep, prov, [{ n: nRotas }], historico, prods] = await Promise.all([
    cepOrigemPadrao(loja),
    provedoresConectados(),
    db.select({ n: count() }).from(schema.freteRotas).where(eq(schema.freteRotas.ativo, true)),
    db.query.freteCotacoes.findMany({ where: eq(schema.freteCotacoes.loja, loja), orderBy: desc(schema.freteCotacoes.createdAt), limit: 20, with: { user: { columns: { name: true } } } }),
    db.query.produtos.findMany({ where: and(eq(schema.produtos.ativo, true), eq(schema.produtos.loja, loja)), orderBy: asc(schema.produtos.descricao) }),
  ]);
  const produtos: ProdutoOpcao[] = prods.map((p) => ({
    id: p.id, descricao: p.descricao, codigo: p.codigo, pesoKg: p.pesoKg, alturaCm: p.alturaCm, larguraCm: p.larguraCm,
    comprimentoCm: p.comprimentoCm, valorUnit: p.valorUnit, paleteQtd: p.paleteQtd, completo: !semMedidas(p),
  }));
  const nenhum = !nRotas && !prov.melhorenvio;
  const admin = can(user.role, "integracoes", "edit");

  return (
    <>
      <PageHeader title="Fretes" subtitle="Cotação com as tabelas das suas transportadoras (e o Melhor Envio, se conectado), da opção mais barata para a mais cara.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={nRotas ? "green" : "gray"}>{nRotas} rota(s) própria(s)</Badge>
          <Badge tone={prov.melhorenvio ? "green" : "gray"}>Melhor Envio</Badge>
          <LojaTabs atual={loja} path="/fretes" />
          <Link href="/fretes/avaliar" className="btn-outline h-9 px-4">Avaliar frete</Link>
          <Link href="/fretes/historico" className="btn-outline h-9 px-4">Histórico</Link>
          <Link href={`/fretes/produtos?loja=${loja}`} className="btn-outline h-9 px-4">Produtos</Link>
          <Link href="/fretes/transportadoras" className="btn-outline h-9 px-4">Transportadoras e tabelas</Link>
        </div>
      </PageHeader>

      {nenhum && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-graphite">Cadastre as transportadoras e as tabelas de frete delas para começar a cotar.</p>
          {admin && <Link href="/fretes/transportadoras" className="btn-outline">Cadastrar transportadora</Link>}
        </div>
      )}

      {editor && <CotacaoForm key={loja} loja={loja} cepOrigem={cep} podeEnviarWhats={can(user.role, "whatsapp", "edit")} produtos={produtos} />}

      <section className="card flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg">Últimas cotações</h2>
        {historico.length === 0 ? (
          <p className="text-sm text-graphite-muted">Nenhuma cotação ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-graphite-muted">
                  <th className="py-2 px-2 border-b border-surface-line">Data</th>
                  <th className="py-2 px-2 border-b border-surface-line">Cliente</th>
                  <th className="py-2 px-2 border-b border-surface-line">Destino</th>
                  <th className="py-2 px-2 border-b border-surface-line text-right">Peso (kg)</th>
                  <th className="py-2 px-2 border-b border-surface-line">Melhor opção</th>
                  <th className="py-2 px-2 border-b border-surface-line">Por</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => {
                  const best = (h.opcoes as Opcao[])[0];
                  return (
                    <tr key={h.id} className="border-b border-[#F1EFEE] last:border-0">
                      <td className="py-3 px-2 whitespace-nowrap">{fmt(h.createdAt)}</td>
                      <td className="py-3 px-2">{h.cliente ?? "—"}</td>
                      <td className="py-3 px-2">{fmtCep(h.cepDestino)}</td>
                      <td className="py-3 px-2 text-right tabular-nums">{Number(h.pesoTotal).toLocaleString("pt-BR")}</td>
                      <td className="py-3 px-2">{best ? `${best.transportadora} · ${brl(best.valor)}${best.prazoDias != null ? ` · ${best.prazoDias}d` : ""}` : <span className="text-graphite-muted">sem opções</span>}</td>
                      <td className="py-3 px-2 text-graphite-muted">{h.user?.name ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
