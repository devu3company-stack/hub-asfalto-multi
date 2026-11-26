import Link from "next/link";
import { and, desc, gte, isNotNull } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { calcularNps } from "@/lib/whatsapp/atendimento";
import { PageHeader, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
const N = schema.npsRespostas;
const PERIODOS = [{ d: 30, r: "30 dias" }, { d: 90, r: "90 dias" }, { d: 365, r: "12 meses" }];
const tom = (n: number | null) => (n === null ? "" : n >= 50 ? "text-[#1E6B34]" : n >= 0 ? "text-[#7A5A00]" : "text-[#A0261C]");

export default async function Nps({ searchParams }: { searchParams: { dias?: string } }) {
  await requireModule("relatorios");
  const dias = PERIODOS.find((p) => String(p.d) === searchParams.dias)?.d ?? 30;
  const desde = new Date(Date.now() - dias * 86400_000);
  const [respostas, enviadas] = await Promise.all([
    db.query.npsRespostas.findMany({ where: and(gte(N.createdAt, desde), isNotNull(N.nota)), orderBy: desc(N.respondidaEm), with: { user: { columns: { name: true } } } }),
    db.$count(N, gte(N.createdAt, desde)),
  ]);
  const geral = calcularNps(respostas.map((r) => r.nota!));
  const porPessoa = [...respostas.reduce((m, r) => { const k = r.user?.name ?? "Automação / sem atendente"; m.set(k, [...(m.get(k) ?? []), r.nota!]); return m; }, new Map<string, number[]>())]
    .map(([nome, notas]) => ({ nome, ...calcularNps(notas), media: notas.reduce((a, b) => a + b, 0) / notas.length })).sort((a, b) => b.total - a.total);
  const dist = Array.from({ length: 11 }, (_, i) => respostas.filter((r) => r.nota === i).length);
  const max = Math.max(1, ...dist);
  return (
    <>
      <PageHeader title="Satisfação dos clientes (NPS)" subtitle="Nota de 0 a 10 depois do atendimento e da entrega. NPS = % de promotores (9–10) − % de detratores (0–6).">
        <div className="flex gap-2">{PERIODOS.map((p) => <Link key={p.d} href={`/whatsapp/nps?dias=${p.d}`} className={`h-9 px-3 inline-flex items-center rounded-full text-sm font-semibold ${p.d === dias ? "bg-graphite-dark text-white" : "bg-white border border-surface-line"}`}>{p.r}</Link>)}</div>
      </PageHeader>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="NPS" value={geral.nps === null ? "—" : String(geral.nps)} hint={geral.nps === null ? "Sem respostas no período" : geral.nps >= 75 ? "Excelente" : geral.nps >= 50 ? "Muito bom" : geral.nps >= 0 ? "Razoável" : "Crítico"} />
        <Stat label="Respostas" value={`${geral.total} de ${enviadas}`} hint={enviadas ? `${Math.round((geral.total / enviadas) * 100)}% responderam` : undefined} />
        <Stat label="Promotores (9–10)" value={String(geral.promotores)} tone="green" />
        <Stat label="Detratores (0–6)" value={String(geral.detratores)} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Por atendente</h2>
          {!porPessoa.length && <p className="text-sm text-graphite-muted">Sem respostas no período.</p>}
          <table className="w-full text-sm">
            <thead><tr className="text-left text-graphite"><th className="py-1">Atendente</th><th className="text-right">Respostas</th><th className="text-right">Média</th><th className="text-right">NPS</th></tr></thead>
            <tbody>{porPessoa.map((p) => (
              <tr key={p.nome} className="border-t border-surface-line"><td className="py-1.5">{p.nome}</td><td className="text-right">{p.total}</td><td className="text-right">{p.media.toFixed(1).replace(".", ",")}</td><td className={`text-right font-bold ${tom(p.nps)}`}>{p.nps}</td></tr>
            ))}</tbody>
          </table>
        </section>
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Distribuição das notas</h2>
          <div className="flex items-end gap-1.5 h-40" role="img" aria-label={`Notas: ${dist.map((n, i) => `${i}: ${n}`).join(", ")}`}>
            {dist.map((n, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                <span className="text-[11px] text-graphite">{n || ""}</span>
                <div className={`w-full rounded-t ${i >= 9 ? "bg-[#1E8A44]" : i >= 7 ? "bg-[#E5B33A]" : "bg-[#D0342C]"}`} style={{ height: `${(n / max) * 100}%`, minHeight: n ? 4 : 0 }} />
                <span className="text-xs font-semibold">{i}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
      <section className="card flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg">Comentários</h2>
        {!respostas.some((r) => r.comentario) && <p className="text-sm text-graphite-muted">Nenhum comentário no período.</p>}
        <ul className="flex flex-col gap-3">
          {respostas.filter((r) => r.comentario).map((r) => (
            <li key={r.id} className="text-sm border-l-4 pl-3" style={{ borderColor: r.nota! >= 9 ? "#1E8A44" : r.nota! >= 7 ? "#E5B33A" : "#D0342C" }}>
              <p>&ldquo;{r.comentario}&rdquo;</p>
              <p className="text-xs text-graphite">Nota {r.nota} · {r.nome ?? r.chat} · {r.user?.name ?? "automação"} · {r.respondidaEm?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · <Link className="text-brand-text font-semibold" href={`/whatsapp?chat=${r.chat}&n=${r.conexaoId}`}>conversa</Link></p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
