import Link from "next/link";
import { count, desc, eq, inArray } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { LOJAS } from "@/lib/lojas";
import { STATUS } from "@/lib/entregas";
import { VEICULOS } from "@/lib/frete/historico";
import { PageHeader, Badge, brl } from "@/components/ui";
import PublicarForm from "./PublicarForm";

export const dynamic = "force-dynamic";
const E = schema.entregas;
const ABAS = [
  { id: "abertos", rotulo: "Em andamento", status: ["publicado", "aceito", "coletado"] },
  { id: "entregues", rotulo: "Entregues", status: ["entregue"] },
  { id: "cancelados", rotulo: "Cancelados", status: ["cancelado"] },
];
const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) : "—");

export default async function Entregas({ searchParams }: { searchParams: { aba?: string; novo?: string } }) {
  const user = await requireModule("entregas");
  const editor = can(user.role, "entregas", "edit");
  const aba = ABAS.find((a) => a.id === searchParams.aba) ?? ABAS[0];
  const [lista, [{ n: nEnt }]] = await Promise.all([
    db.query.entregas.findMany({ where: inArray(E.status, aba.status), orderBy: desc(E.createdAt), limit: 100, with: { entregador: { columns: { nome: true } } } }),
    db.select({ n: count() }).from(schema.entregadores).where(eq(schema.entregadores.ativo, true)),
  ]);
  return (
    <>
      <PageHeader title="Entregas" subtitle="Publique o frete, os entregadores recebem o aviso no WhatsApp e o primeiro que aceitar leva.">
        <Link href="/entregas/entregadores" className="btn-outline h-9 px-4">Entregadores ({nEnt})</Link>
      </PageHeader>
      {editor && (
        <details className="card" open={searchParams.novo === "1" || undefined}>
          <summary className="font-display font-bold text-lg cursor-pointer min-h-[44px] flex items-center">+ Publicar frete</summary>
          <div className="mt-3">
            {nEnt === 0 ? <p className="text-sm">Cadastre os entregadores primeiro em <Link href="/entregas/entregadores" className="font-semibold text-brand-text underline">Entregadores</Link>.</p>
              : <PublicarForm veiculos={VEICULOS.map((v) => v.nome)} lojas={LOJAS.map((l) => ({ id: l.id, nome: l.nome }))} origem="Mogi Mirim-SP" nEntregadores={nEnt} />}
          </div>
        </details>
      )}
      <nav aria-label="Situação" className="flex gap-2">
        {ABAS.map((a) => <Link key={a.id} href={`/entregas?aba=${a.id}`} aria-current={a.id === aba.id ? "page" : undefined}
          className={`px-4 h-10 inline-flex items-center rounded-full text-sm font-semibold ${a.id === aba.id ? "bg-graphite-dark text-white" : "bg-white border border-surface-line"}`}>{a.rotulo}</Link>)}
      </nav>
      <section className="card p-0 overflow-hidden">
        {lista.length === 0 ? <p className="p-4 text-sm text-graphite-muted">Nenhum frete aqui.</p> : (
          <ul>
            {lista.map((e) => (
              <li key={e.id} className="border-b border-surface-line last:border-0">
                <Link href={`/entregas/${e.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-[#F8F7F6]">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{e.origem} → {e.destino}{e.uf ? `/${e.uf}` : ""}</p>
                    <p className="text-xs text-graphite">{[e.cliente, e.kg ? `${e.kg.toLocaleString("pt-BR")} kg` : null, e.veiculo, `coleta ${dia(e.coletaEm)}`].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className="font-bold">{brl(e.valor)}</span>
                  <Badge tone={STATUS[e.status].tom}>{STATUS[e.status].rotulo}</Badge>
                  <span className="text-sm text-graphite w-36 truncate">{e.entregador?.nome ?? (e.status === "publicado" ? `${e.avisados} avisado(s)` : "")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
