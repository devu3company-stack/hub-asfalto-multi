import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { LOJAS } from "@/lib/lojas";
import { MODELOS, resumoGatilho, resumoPasso } from "@/lib/automacoes/definicoes";
import { PageHeader, Badge } from "@/components/ui";
import Editor from "./Editor";
import { listarContas } from "@/lib/email/contas";
import { cancelarExecucao, excluir } from "../actions";

export const dynamic = "force-dynamic";
const X = schema.automacaoExecucoes;
const TOM: Record<string, "green" | "yellow" | "red" | "gray" | "blue"> = { concluida: "green", esperando: "yellow", ativa: "blue", rodando: "blue", erro: "red", cancelada: "gray" };
const ROT: Record<string, string> = { concluida: "Concluída", esperando: "Esperando", ativa: "Na fila", rodando: "Rodando", erro: "Erro", cancelada: "Cancelada" };
const quando = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function Automacao({ params, searchParams }: { params: { id: string }; searchParams: { novo?: string } }) {
  const user = await requireModule("automacoes");
  const editor = can(user.role, "automacoes", "edit");
  const a = await db.query.automacoes.findFirst({ where: eq(schema.automacoes.id, params.id) });
  if (!a) notFound();
  const [execs, etapas, cxs, contas] = await Promise.all([
    db.query.automacaoExecucoes.findMany({ where: eq(X.automacaoId, a.id), orderBy: desc(X.createdAt), limit: 50 }),
    db.query.crmEtapas.findMany({ columns: { nome: true } }),
    db.select({ id: schema.waConexoes.id, nome: schema.waConexoes.nome, tipo: schema.waConexoes.tipo, numero: schema.waConexoes.numero, dono: schema.users.name })
      .from(schema.waConexoes).leftJoin(schema.users, eq(schema.users.id, schema.waConexoes.userId)),
    listarContas(true),
  ]);
  const numeros = cxs.map((c) => ({ id: c.id, nome: c.nome, detalhe: [c.tipo === "oficial" ? "API oficial" : "QR", c.dono, c.numero].filter(Boolean).join(" · ") }));
  const modelo = MODELOS.find((m) => m.chave === a.modelo);
  return (
    <>
      <PageHeader title={a.nome} subtitle={resumoGatilho(a.gatilho, a.gatilhoConfig)}>
        <div className="flex gap-2"><Badge tone={a.ativa ? "green" : "gray"}>{a.ativa ? "Ligada" : "Desligada"}</Badge><Link href="/automacoes" className="btn-outline h-9 px-4">Voltar</Link></div>
      </PageHeader>
      {searchParams.novo && <p role="status" className="card text-sm">{modelo ? `Modelo "${modelo.nome}" copiado. ` : ""}Revise as mensagens, marque <strong>Automação ligada</strong> e salve.</p>}
      {editor ? (
        <Editor id={a.id} etapas={[...new Set(etapas.map((e) => e.nome))]} lojas={LOJAS.map((l) => ({ id: l.id, nome: l.nome }))} numeros={numeros}
          contas={contas.map((c) => ({ id: c.id, nome: c.nome, detalhe: c.email }))}
          inicial={{ nome: a.nome, grupo: a.grupo, ativa: a.ativa, gatilho: a.gatilho, gatilhoConfig: a.gatilhoConfig, passos: a.passos, envio: a.envio ?? {} }} />
      ) : (
        <ol className="card list-decimal pl-8 text-sm flex flex-col gap-1">{a.passos.map((p) => <li key={p.id}>{resumoPasso(p)}</li>)}</ol>
      )}

      <section className="card flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg">Últimas execuções</h2>
        {!execs.length && <p className="text-sm text-graphite-muted">Ainda não rodou.</p>}
        <ul className="flex flex-col gap-2">
          {execs.map((e) => {
            const c = e.contexto;
            return (
              <li key={e.id}>
                <details className="rounded-xl border border-surface-line p-3">
                  <summary className="flex flex-wrap items-center gap-3 cursor-pointer text-sm">
                    <Badge tone={TOM[e.status] ?? "gray"}>{ROT[e.status] ?? e.status}</Badge>
                    <span className="font-semibold">{String(c.nome || c.telefone || c.email || c.destino || "—")}</span>
                    <span className="text-graphite">{quando(e.createdAt)}</span>
                    <span className="text-graphite">passo {Math.min(e.passo + 1, a.passos.length)} de {a.passos.length}</span>
                    {e.status === "esperando" && <span className="text-graphite">próximo: {quando(e.proximaEm)}</span>}
                  </summary>
                  <ol className="mt-2 text-xs flex flex-col gap-1">{e.log.map((l, i) => <li key={i}><span className="text-graphite-muted">{quando(new Date(l.em))}</span> — {l.texto}</li>)}</ol>
                  <div className="flex gap-3 mt-2 text-sm">
                    {c.negociacaoId && <Link className="text-brand-text font-semibold" href={`/crm/${c.negociacaoId}`}>Negociação</Link>}
                    {(c.chat || c.telefone) && <Link className="text-brand-text font-semibold" href={`/whatsapp?chat=${String(c.chat || c.telefone).replace(/\D/g, "").replace(/^(?!55)(\d{10,11})$/, "55$1")}`}>Conversa</Link>}
                    {editor && ["ativa", "esperando", "erro"].includes(e.status) && (
                      <form action={cancelarExecucao}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="automacaoId" value={a.id} /><button className="text-[#A0261C] font-semibold">Cancelar</button></form>
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>
      {editor && (
        <details className="card"><summary className="text-sm text-[#A0261C] cursor-pointer min-h-[40px] inline-flex items-center">Excluir automação</summary>
          <form action={excluir}><input type="hidden" name="id" value={a.id} /><button className="btn-outline text-[#A0261C] border-[#A0261C] mt-2">Excluir de vez (e o histórico)</button></form></details>
      )}
    </>
  );
}
