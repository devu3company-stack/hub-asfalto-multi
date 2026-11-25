import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { lojaValida } from "@/lib/lojas";
import LojaTabs from "@/components/LojaTabs";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { usoHoje } from "@/lib/email/envio";
import { PageHeader, Badge, Stat } from "@/components/ui";
import Abas from "./Abas";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { tone: "gray" | "orange" | "green" | "red"; label: string }> = {
  rascunho: { tone: "gray", label: "Rascunho" }, agendada: { tone: "orange", label: "Agendada" },
  enviando: { tone: "orange", label: "Enviando" }, enviada: { tone: "green", label: "Enviada" }, cancelada: { tone: "red", label: "Cancelada" },
};
const fmt = (d?: Date | null) => d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export default async function Email({ searchParams }: { searchParams: { loja?: string } }) {
  const user = await requireModule("email");
  const loja = lojaValida(searchParams.loja);
  const editor = can(user.role, "email", "edit");
  const [uso, campanhas, stats, [{ contatos, ativos }]] = await Promise.all([
    usoHoje(loja),
    db.query.emailCampanhas.findMany({ where: eq(schema.emailCampanhas.loja, loja), orderBy: desc(schema.emailCampanhas.createdAt), limit: 50 }),
    db.execute<{ campanha_id: string; enviados: number; abertos: number; cliques: number; fila: number; erros: number }>(sql`
      select campanha_id, count(*) filter (where status='enviado')::int enviados, count(aberto_em)::int abertos,
             count(clicado_em)::int cliques, count(*) filter (where status='fila')::int fila, count(*) filter (where status='erro')::int erros
      from email_envios where campanha_id is not null group by campanha_id`),
    db.select({ contatos: sql<number>`count(*)::int`, ativos: sql<number>`count(*) filter (where descadastrado_em is null and not bounce)::int` })
      .from(schema.contatos).where(sql`${loja} = any(${schema.contatos.lojas})`),
  ]);
  const porCamp = new Map((stats as unknown as { campanha_id: string; enviados: number; abertos: number; cliques: number; fila: number; erros: number }[]).map((s) => [s.campanha_id, s]));

  return (
    <>
      <PageHeader title="E-mail marketing" subtitle="Campanhas, automações e contatos. Os envios saem pelo e-mail do domínio.">
        <div className="flex flex-wrap items-center gap-2">
          <LojaTabs atual={loja} path="/email" />
          {editor && <Link href={`/email/campanhas/nova?loja=${loja}`} className="btn-primary">Nova campanha</Link>}
        </div>
      </PageHeader>
      <Abas atual="/email" loja={loja} />

      {!uso.conectado && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-graphite">Configure o servidor de e-mail (SMTP) desta loja em Integrações para começar a enviar.</p>
          {can(user.role, "integracoes", "edit") && <Link href="/integracoes" className="btn-outline">Abrir Integrações</Link>}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Contatos ativos" value={ativos.toLocaleString("pt-BR")} hint={`${contatos.toLocaleString("pt-BR")} no total`} />
        <Stat label="Na fila" value={uso.fila.toLocaleString("pt-BR")} hint="aguardando envio" />
        <Stat label="Enviados na última hora" value={`${uso.hora}/${uso.porHora}`} />
        <Stat label="Enviados nas últimas 24h" value={`${uso.dia}/${uso.porDia}`} />
      </div>

      <section className="card flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg">Campanhas</h2>
        {campanhas.length === 0 ? (
          <p className="text-sm text-graphite-muted">Nenhuma campanha ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-graphite-muted">
                  <th className="py-2 px-2 border-b border-surface-line">Campanha</th>
                  <th className="py-2 px-2 border-b border-surface-line">Situação</th>
                  <th className="py-2 px-2 border-b border-surface-line text-right">Enviados</th>
                  <th className="py-2 px-2 border-b border-surface-line text-right">Abertura</th>
                  <th className="py-2 px-2 border-b border-surface-line text-right">Cliques</th>
                  <th className="py-2 px-2 border-b border-surface-line">Data</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => {
                  const s = porCamp.get(c.id);
                  const st = STATUS[c.status] ?? STATUS.rascunho;
                  return (
                    <tr key={c.id} className="border-b border-[#F1EFEE] last:border-0">
                      <td className="py-3 px-2"><Link href={`/email/campanhas/${c.id}`} className="font-medium hover:underline">{c.nome}</Link>
                        <span className="block text-xs text-graphite-muted">{c.assunto}</span></td>
                      <td className="py-3 px-2"><Badge tone={st.tone}>{st.label}</Badge>{s?.fila ? <span className="block text-xs text-graphite-muted mt-1">{s.fila} na fila</span> : null}</td>
                      <td className="py-3 px-2 text-right tabular-nums">{s?.enviados ?? 0}</td>
                      <td className="py-3 px-2 text-right tabular-nums">{pct(s?.abertos ?? 0, s?.enviados ?? 0)}</td>
                      <td className="py-3 px-2 text-right tabular-nums">{pct(s?.cliques ?? 0, s?.enviados ?? 0)}</td>
                      <td className="py-3 px-2 whitespace-nowrap">{fmt(c.enviadaEm ?? c.agendadaPara ?? c.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-graphite-muted">A taxa de abertura é aproximada: alguns programas de e-mail bloqueiam imagens ou abrem o e-mail sozinhos.</p>
      </section>
    </>
  );
}
