import { requireModule } from "@/lib/auth";
import { getConfig } from "@/lib/integrations/store";
import { listarContasPagar, listarContasReceber, type Titulo } from "@/lib/integrations/omie";
import { PageHeader, Stat, Badge, NeedsIntegration, brl } from "@/components/ui";
import { chaveLoja, lojaValida, nomeLoja } from "@/lib/lojas";
import LojaTabs from "@/components/LojaTabs";

export const dynamic = "force-dynamic";

const FECHADOS = ["RECEBIDO", "PAGO", "CANCELADO", "LIQUIDADO"];
const aberto = (t: Titulo) => !FECHADOS.includes((t.status_titulo ?? "").toUpperCase());

function toDate(br?: string) {
  if (!br) return null;
  const [d, m, y] = br.split("/").map(Number);
  return new Date(y, m - 1, d);
}
const hoje = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const vencido = (t: Titulo) => aberto(t) && (toDate(t.data_vencimento)?.getTime() ?? Infinity) < hoje().getTime();
const soma = (ts: Titulo[]) => ts.reduce((s, t) => s + (t.valor_documento ?? 0), 0);

function tone(t: Titulo): "green" | "orange" | "red" | "gray" {
  const s = (t.status_titulo ?? "").toUpperCase();
  if (FECHADOS.includes(s)) return s === "CANCELADO" ? "gray" : "green";
  if (vencido(t)) return "red";
  return "orange";
}

function Tabela({ titulo, quem, itens }: { titulo: string; quem: string; itens: Titulo[] }) {
  const ordenados = [...itens].filter(aberto).sort((a, b) => (toDate(a.data_vencimento)?.getTime() ?? 0) - (toDate(b.data_vencimento)?.getTime() ?? 0)).slice(0, 15);
  return (
    <section className="card flex-1 min-w-0 flex flex-col gap-3">
      <h2 className="font-display font-bold text-lg">{titulo}</h2>
      {ordenados.length === 0 ? (
        <p className="text-sm text-graphite-muted">Nenhum título em aberto.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-graphite-muted">
                <th className="py-2 px-2 border-b border-surface-line">{quem}</th>
                <th className="py-2 px-2 border-b border-surface-line">Vencimento</th>
                <th className="py-2 px-2 border-b border-surface-line">Valor</th>
                <th className="py-2 px-2 border-b border-surface-line">Status</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((t, i) => (
                <tr key={t.codigo_lancamento_omie ?? i} className="border-b border-[#F1EFEE] last:border-0">
                  <td className="py-3 px-2">#{t.codigo_cliente_fornecedor ?? "—"}</td>
                  <td className="py-3 px-2">{t.data_vencimento ?? "—"}</td>
                  <td className="py-3 px-2">{brl(t.valor_documento ?? 0)}</td>
                  <td className="py-3 px-2"><Badge tone={tone(t)}>{vencido(t) ? "Vencido" : (t.status_titulo ?? "—")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function Financeiro({ searchParams }: { searchParams: { loja?: string } }) {
  await requireModule("financeiro");
  const loja = lojaValida(searchParams.loja);
  const cfg = await getConfig(chaveLoja("omie", loja));

  const header = (
    <PageHeader title="Financeiro" subtitle={`Contas a receber, contas a pagar e vencidos, direto do Omie da ${nomeLoja(loja)}`}>
      <LojaTabs atual={loja} path="/financeiro" />
    </PageHeader>
  );
  if (!cfg) return (<>{header}<NeedsIntegration name={`Omie da ${nomeLoja(loja)}`} /></>);

  let receber: Titulo[] = [], pagar: Titulo[] = [], erro: string | null = null;
  try {
    [receber, pagar] = await Promise.all([listarContasReceber(cfg), listarContasPagar(cfg)]);
  } catch (e) {
    erro = e instanceof Error ? e.message : "Erro ao consultar o Omie.";
  }

  const aReceber = soma(receber.filter(aberto));
  const aPagar = soma(pagar.filter(aberto));
  const vencidosReceber = receber.filter(vencido);

  return (
    <>
      {header}
      {erro && <div role="alert" className="card border-[#F3C4BF] text-sm text-[#A0261C]">Não foi possível ler o Omie: {erro}</div>}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">
        <Stat label="A receber (em aberto)" value={brl(aReceber)} tone="green" hint={`${receber.filter(aberto).length} títulos`} />
        <Stat label="A pagar (em aberto)" value={brl(aPagar)} tone="red" hint={`${pagar.filter(aberto).length} contas`} />
        <Stat label="Vencidos a receber" value={brl(soma(vencidosReceber))} tone="orange" hint={`${vencidosReceber.length} títulos`} />
        <Stat label="Diferença prevista" value={brl(aReceber - aPagar)} tone="dark" hint="A receber − a pagar" />
      </div>
      <div className="flex flex-col xl:flex-row gap-4">
        <Tabela titulo="Contas a receber" quem="Cliente" itens={receber} />
        <Tabela titulo="Contas a pagar" quem="Fornecedor" itens={pagar} />
      </div>
      <p className="text-xs text-graphite-muted">Mostrando a primeira página do Omie (até 50 títulos de cada). Fluxo de caixa semanal e cobrança pelo WhatsApp entram na próxima fase.</p>
    </>
  );
}
