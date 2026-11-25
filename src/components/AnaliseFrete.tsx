import type { Analise } from "@/lib/frete/historico";
import { Badge } from "./ui";

export type AnaliseJSON = Omit<Analise, "exemplos"> & { exemplos: (Omit<Analise["exemplos"][number], "data"> & { data: string })[] };

const r$ = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Linha({ k, v, forte }: { k: string; v: string; forte?: boolean }) {
  return <div className="flex justify-between gap-3 py-1 border-b border-surface-line last:border-0"><dt className="text-graphite">{k}</dt><dd className={forte ? "font-bold" : "font-semibold"}>{v}</dd></div>;
}

/** Resultado da comparação com fretes parecidos (mesmas regras da planilha de cotação). */
export default function AnaliseFrete({ a, compacto = false }: { a: AnaliseJSON; compacto?: boolean }) {
  const o = a.orcamento;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={a.suficiente ? "green" : a.n ? "yellow" : "red"}>
          {a.n ? `${a.suficiente ? "Amostra confiável" : "Amostra pequena"} — ${a.n} de ${a.minAmostra} fretes parecidos` : "Nenhum frete parecido no histórico"}
        </Badge>
        {a.avaliacao && <Badge tone={a.avaliacao.tom}>{a.avaliacao.texto}</Badge>}
        {a.avaliacao?.maisPraticado && <Badge tone="blue">Valor mais praticado</Badge>}
      </div>
      {a.n > 0 && (
        <div className={`grid gap-4 ${compacto ? "sm:grid-cols-2" : "lg:grid-cols-3"}`}>
          <dl className="text-sm">
            <Linha k="Faixa excelente (até)" v={r$(o.q1)} forte />
            <Linha k="Frete bom (mediana)" v={r$(o.mediana)} forte />
            <Linha k="Faixa superior" v={r$(o.q3)} />
            <Linha k="Custo mediano pago" v={r$(a.custoMediano)} />
          </dl>
          <dl className="text-sm">
            <Linha k="Menor / maior orçamento" v={`${r$(o.min)} / ${r$(o.max)}`} />
            <Linha k="Média dos orçamentos" v={r$(o.medio)} />
            <Linha k="R$/km pago (médio)" v={r$(a.rsKm.medio)} />
            {a.maisPraticado && <Linha k={`Mais praticado (${a.maisPraticado.vezes}x)`} v={`${r$(a.maisPraticado.valor)}${a.maisPraticado.empate ? " (empate)" : ""}`} />}
          </dl>
          {a.avaliacao && (
            <dl className="text-sm">
              <Linha k="R$/tonelada cotado" v={r$(a.avaliacao.rsTon)} />
              <Linha k="R$/km cotado" v={r$(a.avaliacao.rsKmCotado)} />
              <Linha k="Economia possível" v={a.avaliacao.saving > 0 ? `${r$(a.avaliacao.saving)} (${pct(a.avaliacao.savingPct)})` : "—"} forte />
            </dl>
          )}
        </div>
      )}
      {!compacto && a.exemplos.length > 0 && (
        <details>
          <summary className="text-sm font-semibold text-brand-text cursor-pointer min-h-[40px] inline-flex items-center">Ver os fretes parecidos ({a.exemplos.length} mais recentes)</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-sm mt-2">
              <thead><tr className="text-left text-graphite"><th className="py-1 pr-3">Data</th><th className="pr-3">Destino</th><th className="pr-3 text-right">Kg</th><th className="pr-3 text-right">Km</th><th className="pr-3 text-right">Orçamento</th><th className="text-right">Pago</th></tr></thead>
              <tbody>{a.exemplos.map((x, i) => (
                <tr key={i} className="border-t border-surface-line">
                  <td className="py-1 pr-3">{new Date(x.data).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</td>
                  <td className="pr-3">{x.cidade}{x.uf ? `/${x.uf}` : ""}</td>
                  <td className="pr-3 text-right">{x.kg.toLocaleString("pt-BR")}</td>
                  <td className="pr-3 text-right">{x.distanciaKm.toLocaleString("pt-BR")}</td>
                  <td className="pr-3 text-right">{r$(x.orcamento)}</td>
                  <td className="text-right">{r$(x.custo)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
