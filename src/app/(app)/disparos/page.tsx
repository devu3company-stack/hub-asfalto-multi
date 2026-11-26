import Link from "next/link";
import { desc, sql } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { PageHeader, Badge } from "@/components/ui";
import { criar } from "./actions";

export const dynamic = "force-dynamic";
const DC = schema.disparoContatos;
const STATUS: Record<string, { r: string; t: "gray" | "blue" | "yellow" | "green" }> = {
  rascunho: { r: "Rascunho", t: "gray" }, enviando: { r: "Enviando", t: "blue" }, pausado: { r: "Pausado", t: "yellow" }, concluido: { r: "Concluído", t: "green" }, cancelado: { r: "Cancelado", t: "gray" },
};

export default async function Disparos() {
  const user = await requireModule("disparos");
  const [lista, stats] = await Promise.all([
    db.query.disparos.findMany({ orderBy: desc(schema.disparos.createdAt), limit: 100 }),
    db.select({ id: DC.disparoId, total: sql<number>`count(*)::int`, enviados: sql<number>`count(*) filter (where ${DC.status} = 'enviado')::int` }).from(DC).groupBy(DC.disparoId),
  ]);
  const st = new Map(stats.map((s) => [s.id, s]));
  return (
    <>
      <PageHeader title="Disparos em massa" subtitle="Mensagens no WhatsApp para listas, com variáveis, vários números e proteção contra bloqueio.">
        {can(user.role, "disparos", "edit") && <form action={criar}><button className="btn-primary h-9 px-4">+ Novo disparo</button></form>}
      </PageHeader>
      <p className="card text-sm text-graphite">Dispare só para quem já é cliente ou pediu para receber (LGPD). Mensagem para quem não conhece a empresa gera denúncia de spam, e é isso que bloqueia o número.</p>
      <section className="card p-0 overflow-hidden">
        {!lista.length && <p className="p-4 text-sm text-graphite-muted">Nenhum disparo ainda.</p>}
        <ul>
          {lista.map((d) => {
            const s = st.get(d.id);
            const pct = s?.total ? Math.round((s.enviados / s.total) * 100) : 0;
            return (
              <li key={d.id} className="border-b border-surface-line last:border-0">
                <Link href={`/disparos/${d.id}`} className="flex flex-wrap items-center gap-4 p-4 hover:bg-[#F8F7F6]">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{d.nome}</p>
                    <p className="text-xs text-graphite">{d.conexoes.length} número(s) · criado em {d.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
                  </div>
                  <div className="w-48">
                    <div className="h-2 rounded-full bg-surface overflow-hidden"><span className="block h-full bg-[#1E8A44]" style={{ width: `${pct}%` }} /></div>
                    <p className="text-xs text-graphite mt-1">{s?.enviados ?? 0} de {s?.total ?? 0} enviados</p>
                  </div>
                  <Badge tone={STATUS[d.status].t}>{STATUS[d.status].r}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
