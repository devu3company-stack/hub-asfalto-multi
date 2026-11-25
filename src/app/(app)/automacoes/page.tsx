import Link from "next/link";
import { count, eq, sql } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { GRUPOS, MODELOS, resumoGatilho } from "@/lib/automacoes/definicoes";
import { PageHeader, Badge } from "@/components/ui";
import { alternar, criarEmBranco, usarModelo } from "./actions";

export const dynamic = "force-dynamic";
const A = schema.automacoes, X = schema.automacaoExecucoes;

export default async function Automacoes() {
  const user = await requireModule("automacoes");
  const editor = can(user.role, "automacoes", "edit");
  const desde = new Date(Date.now() - 30 * 86400_000);
  const [lista, stats, [{ pend }]] = await Promise.all([
    db.query.automacoes.findMany({ orderBy: [A.grupo, A.nome] }),
    db.select({ id: X.automacaoId, andamento: sql<number>`count(*) filter (where ${X.status} in ('ativa','esperando','rodando'))::int`,
      feitas: sql<number>`count(*) filter (where ${X.status} = 'concluida' and ${X.createdAt} > ${desde.toISOString()}::timestamptz)::int`,
      erros: sql<number>`count(*) filter (where ${X.status} = 'erro')::int` }).from(X).groupBy(X.automacaoId),
    db.select({ pend: count() }).from(schema.automacaoAprovacoes).where(eq(schema.automacaoAprovacoes.status, "pendente")),
  ]);
  const st = new Map(stats.map((s) => [s.id, s]));
  const usados = new Set(lista.map((a) => a.modelo).filter(Boolean));
  const grupos = Object.keys(GRUPOS).filter((g) => lista.some((a) => a.grupo === g) || MODELOS.some((m) => m.grupo === g && !usados.has(m.chave)));

  return (
    <>
      <PageHeader title="Automações" subtitle="Quando acontecer algo no WhatsApp, no funil, na loja ou nas entregas, o Hub faz o próximo passo sozinho.">
        <div className="flex flex-wrap gap-2">
          <Link href="/automacoes/aprovar" className={pend ? "btn-primary h-9 px-4" : "btn-outline h-9 px-4"}>Aprovar mensagens{pend ? ` (${pend})` : ""}</Link>
          <Link href="/automacoes/publicos" className="btn-outline h-9 px-4">Públicos de anúncio</Link>
          {editor && <form action={criarEmBranco}><button className="btn-outline h-9 px-4">+ Em branco</button></form>}
        </div>
      </PageHeader>

      {grupos.map((g) => {
        const minhas = lista.filter((a) => a.grupo === g);
        const modelos = MODELOS.filter((m) => m.grupo === g && !usados.has(m.chave));
        return (
          <section key={g} className="flex flex-col gap-3" aria-labelledby={`g-${g}`}>
            <h2 id={`g-${g}`} className="font-display font-bold text-lg">{GRUPOS[g]}</h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
              {minhas.map((a) => {
                const s = st.get(a.id);
                return (
                  <article key={a.id} className="card flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/automacoes/${a.id}`} className="font-semibold hover:underline">{a.nome}</Link>
                      {editor ? (
                        <form action={alternar}><input type="hidden" name="id" value={a.id} />
                          <button role="switch" aria-checked={a.ativa} aria-label={`${a.ativa ? "Desligar" : "Ligar"} ${a.nome}`}
                            className={`w-12 h-7 rounded-full relative shrink-0 transition ${a.ativa ? "bg-[#1E8A44]" : "bg-[#D9D6D4]"}`}>
                            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${a.ativa ? "left-6" : "left-1"}`} />
                          </button></form>
                      ) : <Badge tone={a.ativa ? "green" : "gray"}>{a.ativa ? "Ligada" : "Desligada"}</Badge>}
                    </div>
                    <p className="text-sm text-graphite"><strong>Quando:</strong> {resumoGatilho(a.gatilho, a.gatilhoConfig)}</p>
                    <p className="text-sm text-graphite">{a.passos.length} passo(s)</p>
                    <p className="text-xs text-graphite-muted mt-auto">{s?.andamento ?? 0} em andamento · {s?.feitas ?? 0} concluídas em 30 dias{s?.erros ? <span className="text-[#A0261C] font-semibold"> · {s.erros} com erro</span> : null}</p>
                  </article>
                );
              })}
              {editor && modelos.map((m) => (
                <article key={m.chave} className="rounded-2xl border-2 border-dashed border-surface-line p-4 flex flex-col gap-2">
                  <p className="font-semibold">{m.nome} <span className="text-xs font-normal text-graphite-muted">modelo pronto</span></p>
                  <p className="text-sm text-graphite">{m.descricao}</p>
                  <form action={usarModelo} className="mt-auto"><input type="hidden" name="modelo" value={m.chave} /><button className="btn-outline h-10">Usar modelo</button></form>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
