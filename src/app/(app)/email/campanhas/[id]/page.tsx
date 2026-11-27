import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { MODELO_CAMPANHA } from "@/lib/email/modelos";
import { todasTags, type Segmento } from "@/lib/email/contatos";
import type { EmailConteudo } from "@/lib/email/template";
import { PageHeader, Badge, Stat } from "@/components/ui";
import { lojaValida, nomeLoja, type LojaId } from "@/lib/lojas";
import { marcaDa } from "@/lib/email/envio";
import CampanhaForm from "../CampanhaForm";
import { listarContas } from "@/lib/email/contas";
import { cancelarCampanha, excluirCampanha } from "../../actions";

export const dynamic = "force-dynamic";
const fmt = (d?: Date | null) => d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default async function Campanha({ params, searchParams }: { params: { id: string }; searchParams: { loja?: string } }) {
  const user = await requireModule("email");
  const editor = can(user.role, "email", "edit");
  const tags = await todasTags();

  if (params.id === "nova") {
    if (!editor) notFound();
    const loja = lojaValida(searchParams.loja);
    return (
      <>
        <PageHeader title={`Nova campanha · ${nomeLoja(loja)}`} subtitle="Escreva o e-mail, escolha o público e envie ou agende.">
          <Link href={`/email?loja=${loja}`} className="btn-outline h-9 px-4">Voltar</Link>
        </PageHeader>
        <CampanhaForm loja={loja} marca={await marcaDa(loja)} nome="" assunto="" conteudo={MODELO_CAMPANHA} segmento={{ compras: "todos" }} tags={tags} contas={await listarContas(true)} />
      </>
    );
  }

  const c = await db.query.emailCampanhas.findFirst({ where: eq(schema.emailCampanhas.id, params.id) });
  if (!c) notFound();
  const editavel = editor && (c.status === "rascunho" || c.status === "agendada");

  const [[s], recentes] = await Promise.all([
    db.select({
      enviados: sql<number>`count(*) filter (where status='enviado')::int`, fila: sql<number>`count(*) filter (where status='fila')::int`,
      erros: sql<number>`count(*) filter (where status='erro')::int`, abertos: sql<number>`count(aberto_em)::int`, cliques: sql<number>`count(clicado_em)::int`,
    }).from(schema.emailEnvios).where(eq(schema.emailEnvios.campanhaId, c.id)),
    db.query.emailEnvios.findMany({
      where: eq(schema.emailEnvios.campanhaId, c.id), orderBy: desc(schema.emailEnvios.enviadoEm), limit: 30,
      with: { contato: { columns: { email: true, nome: true } } }, columns: { id: true, status: true, enviadoEm: true, abertoEm: true, clicadoEm: true, erro: true },
    }),
  ]);
  const pct = (a: number) => (s.enviados ? `${Math.round((a / s.enviados) * 100)}%` : "—");

  return (
    <>
      <PageHeader title={`${c.nome} · ${nomeLoja(c.loja)}`} subtitle={c.status === "agendada" ? `Agendada para ${fmt(c.agendadaPara)}` : `Assunto: ${c.assunto}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={c.status === "enviada" ? "green" : c.status === "cancelada" ? "red" : c.status === "rascunho" ? "gray" : "orange"}>{c.status}</Badge>
          {editor && (c.status === "agendada" || c.status === "enviando") && (
            <form action={cancelarCampanha}><input type="hidden" name="id" value={c.id} /><button className="btn-outline h-9 px-4">Cancelar envio</button></form>
          )}
          {editor && (c.status === "rascunho" || c.status === "cancelada") && (
            <form action={excluirCampanha}><input type="hidden" name="id" value={c.id} /><button className="btn-outline h-9 px-4 text-[#A0261C] border-[#A0261C]">Excluir</button></form>
          )}
          <Link href={`/email?loja=${c.loja}`} className="btn-outline h-9 px-4">Voltar</Link>
        </div>
      </PageHeader>

      {c.status !== "rascunho" && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat label="Destinatários" value={String(c.totalDestinatarios)} />
          <Stat label="Enviados" value={String(s.enviados)} hint={s.fila ? `${s.fila} na fila` : undefined} />
          <Stat label="Abertura" value={pct(s.abertos)} hint={`${s.abertos} pessoas`} />
          <Stat label="Cliques" value={pct(s.cliques)} hint={`${s.cliques} pessoas`} />
          <Stat label="Erros" value={String(s.erros)} tone={s.erros ? "red" : "default"} />
        </div>
      )}

      {editavel ? (
        <CampanhaForm loja={c.loja} marca={await marcaDa(c.loja as LojaId)} id={c.id} nome={c.nome} assunto={c.assunto} conteudo={c.conteudo as EmailConteudo} segmento={c.segmento as Segmento} tags={tags} contas={await listarContas(true)} contaId={c.contaId} />
      ) : (
        recentes.length > 0 && (
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Últimos envios</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-graphite-muted">
                  <th className="py-2 px-2 border-b border-surface-line">Contato</th><th className="py-2 px-2 border-b border-surface-line">Situação</th>
                  <th className="py-2 px-2 border-b border-surface-line">Enviado</th><th className="py-2 px-2 border-b border-surface-line">Abriu</th><th className="py-2 px-2 border-b border-surface-line">Clicou</th>
                </tr></thead>
                <tbody>
                  {recentes.map((e) => (
                    <tr key={e.id} className="border-b border-[#F1EFEE] last:border-0">
                      <td className="py-2 px-2">{e.contato.nome ?? e.contato.email}<span className="block text-xs text-graphite-muted">{e.contato.email}</span></td>
                      <td className="py-2 px-2">{e.status}{e.erro && <span className="block text-xs text-[#A0261C]">{e.erro}</span>}</td>
                      <td className="py-2 px-2 whitespace-nowrap">{fmt(e.enviadoEm)}</td>
                      <td className="py-2 px-2">{e.abertoEm ? "Sim" : "—"}</td>
                      <td className="py-2 px-2">{e.clicadoEm ? "Sim" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}
    </>
  );
}
