import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { enviadosHoje, ORIGENS, dentroDaJanela } from "@/lib/disparos";
import { qrSessoes } from "@/lib/whatsapp/gateway";
import { PageHeader, Badge } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import Configuracao from "./Configuracao";
import { daBase, duplicar, excluir, importar, iniciar, mudarStatus } from "../actions";

export const dynamic = "force-dynamic";
const DC = schema.disparoContatos;
const STATUS: Record<string, { r: string; t: "gray" | "blue" | "yellow" | "green" | "red" | "orange" }> = {
  rascunho: { r: "Rascunho", t: "gray" }, enviando: { r: "Enviando", t: "blue" }, pausado: { r: "Pausado", t: "yellow" },
  concluido: { r: "Concluído", t: "green" }, cancelado: { r: "Cancelado", t: "gray" },
};
const SC: Record<string, string> = { pendente: "Na fila", enviando: "Enviando", enviado: "Enviado", falhou: "Falhou", pulado: "Pulado" };

export default async function Disparo({ params, searchParams }: { params: { id: string }; searchParams: { ver?: string } }) {
  const user = await requireModule("disparos");
  const editor = can(user.role, "disparos", "edit");
  const d = await db.query.disparos.findFirst({ where: eq(schema.disparos.id, params.id) });
  if (!d) notFound();
  const [contagem, lista, primeiro, conexoes, sessoes, etapas] = await Promise.all([
    db.select({ status: DC.status, n: sql<number>`count(*)::int` }).from(DC).where(eq(DC.disparoId, d.id)).groupBy(DC.status),
    db.query.disparoContatos.findMany({ where: and(eq(DC.disparoId, d.id), searchParams.ver ? eq(DC.status, searchParams.ver) : undefined), orderBy: asc(DC.ordem), limit: 100 }),
    db.query.disparoContatos.findFirst({ where: eq(DC.disparoId, d.id), orderBy: asc(DC.ordem) }),
    db.query.waConexoes.findMany(),
    qrSessoes(),
    db.query.crmEtapas.findMany({ columns: { nome: true } }),
  ]);
  const c = Object.fromEntries(contagem.map((x) => [x.status, x.n])) as Record<string, number>;
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  const feitos = (c.enviado ?? 0) + (c.pulado ?? 0) + (c.falhou ?? 0);
  const numeros = await Promise.all(conexoes.filter((x) => x.tipo === "qr").map(async (x) => ({ id: x.id, nome: x.nome, conectado: sessoes[x.id]?.status === "conectado", hoje: await enviadosHoje(x.id) })));
  const colunas = primeiro ? Object.keys(primeiro.vars) : [];
  const fmtLocal = (dt: Date | null) => (dt ? new Date(dt.getTime() - 3 * 3600_000).toISOString().slice(0, 16) : "");

  return (
    <>
      <PageHeader title={d.nome} subtitle={`${total.toLocaleString("pt-BR")} contato(s) na lista`}>
        <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS[d.status].t}>{STATUS[d.status].r}</Badge><Link href="/disparos" className="btn-outline h-9 px-4">Voltar</Link></div>
      </PageHeader>

      <section className="card flex flex-col gap-3">
        <div className="h-3 rounded-full bg-surface overflow-hidden flex" aria-label={`${feitos} de ${total} processados`}>
          <span className="bg-[#1E8A44]" style={{ width: `${total ? ((c.enviado ?? 0) / total) * 100 : 0}%` }} />
          <span className="bg-[#E5B33A]" style={{ width: `${total ? ((c.pulado ?? 0) / total) * 100 : 0}%` }} />
          <span className="bg-[#D0342C]" style={{ width: `${total ? ((c.falhou ?? 0) / total) * 100 : 0}%` }} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {(["enviado", "pendente", "pulado", "falhou"] as const).map((s) => (
            <Link key={s} href={`/disparos/${d.id}?ver=${s}`} className="hover:underline"><strong>{(c[s] ?? 0).toLocaleString("pt-BR")}</strong> {SC[s].toLowerCase()}{s === "pulado" ? " (sem WhatsApp ou pediram para sair)" : ""}</Link>
          ))}
        </div>
        {d.status === "pausado" && d.motivoPausa && <p role="status" className="text-sm text-[#7A5A00] bg-[#FBF0CC] rounded-xl p-3">{d.motivoPausa}</p>}
        {d.status === "enviando" && !dentroDaJanela(d) && <p className="text-sm text-graphite">Fora do horário de envio agora ({d.janelaInicio}h–{d.janelaFim}h). Continua sozinho no próximo horário.</p>}
        {d.status === "enviando" && d.inicioEm && d.inicioEm > new Date() && <p className="text-sm text-graphite">Agendado para {d.inicioEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</p>}
        {editor && (
          <div className="flex flex-wrap gap-2">
            {(d.status === "rascunho" || d.status === "pausado") && (
              <ActionForm action={iniciar} label={d.status === "pausado" ? "Retomar disparo" : "Iniciar disparo"} busy="..." className="flex"><input type="hidden" name="id" value={d.id} /></ActionForm>
            )}
            {d.status === "enviando" && <form action={mudarStatus}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="acao" value="pausar" /><button className="btn-outline h-11">Pausar</button></form>}
            {(c.falhou ?? 0) > 0 && d.status !== "enviando" && <form action={mudarStatus}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="acao" value="reenviar" /><button className="btn-outline h-11">Tentar de novo as que falharam</button></form>}
            {["rascunho", "pausado", "enviando"].includes(d.status) && <form action={mudarStatus}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="acao" value="cancelar" /><button className="btn-outline h-11 text-[#A0261C] border-[#A0261C]">Cancelar disparo</button></form>}
            <form action={duplicar}><input type="hidden" name="id" value={d.id} /><button className="btn-outline h-11">Duplicar</button></form>
          </div>
        )}
      </section>

      {editor && (
        <Configuracao bloqueado={d.status === "enviando"} total={c.pendente ?? 0} numeros={numeros} colunas={colunas}
          exemplo={primeiro ? { nome: primeiro.nome, empresa: primeiro.empresa, vars: primeiro.vars } : { nome: "Carlos Souza", empresa: "Construtora Exemplo", vars: {} }}
          d={{ id: d.id, nome: d.nome, mensagens: d.mensagens, rodapeSair: d.rodapeSair, conferirNumero: d.conferirNumero, conexoes: d.conexoes,
            intervaloMin: d.intervaloMin, intervaloMax: d.intervaloMax, loteTamanho: d.loteTamanho, lotePausa: d.lotePausa, limiteDia: d.limiteDia,
            janelaInicio: d.janelaInicio, janelaFim: d.janelaFim, sabado: d.sabado, domingo: d.domingo, inicioEm: fmtLocal(d.inicioEm), midiaNome: d.midiaNome }} />
      )}

      <section className="card flex flex-col gap-4">
        <h2 className="font-display font-bold text-lg">Lista de contatos</h2>
        {editor && d.status !== "enviando" && (
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-graphite">Planilha .xlsx ou .csv com uma coluna de <strong>telefone</strong> (ou celular/WhatsApp). Colunas <strong>nome</strong> e <strong>empresa</strong> viram {"{{nome}}"} e {"{{empresa}}"}; as outras também viram variáveis.</p>
              <ActionForm action={importar} label="Adicionar da planilha" busy="Importando..." reset>
                <input type="hidden" name="id" value={d.id} />
                <input type="file" name="arquivo" accept=".xlsx,.csv" required aria-label="Planilha de contatos" className="text-sm" />
              </ActionForm>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-graphite">Ou puxe da base do Hub:</p>
              <ActionForm action={daBase} label="Adicionar" busy="Buscando..." className="grid sm:grid-cols-2 gap-2 items-end">
                <input type="hidden" name="id" value={d.id} />
                <div><label htmlFor="origem" className="label">Origem</label><select id="origem" name="origem" className="input">{Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label htmlFor="filtro" className="label">Etapa ou etiqueta (opcional)</label><input id="filtro" name="filtro" list="etapas" className="input" />
                  <datalist id="etapas">{[...new Set(etapas.map((e) => e.nome))].map((e) => <option key={e} value={e} />)}</datalist></div>
              </ActionForm>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={`/disparos/${d.id}`} className={!searchParams.ver ? "font-bold" : "text-brand-text"}>Todos</Link>
          {Object.keys(SC).map((s) => <Link key={s} href={`/disparos/${d.id}?ver=${s}`} className={searchParams.ver === s ? "font-bold" : "text-brand-text"}>{SC[s]}</Link>)}
          {editor && d.status !== "enviando" && total > 0 && <form action={mudarStatus} className="ml-auto"><input type="hidden" name="id" value={d.id} /><input type="hidden" name="acao" value="limpar" /><button className="text-[#A0261C] font-semibold">Tirar da lista os não enviados</button></form>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-graphite"><th className="py-2 pr-3">Telefone</th><th className="pr-3">Nome</th><th className="pr-3">Empresa</th><th className="pr-3">Situação</th><th>Obs.</th></tr></thead>
            <tbody>{lista.map((x) => (
              <tr key={x.id} className="border-t border-surface-line">
                <td className="py-1.5 pr-3 whitespace-nowrap">{x.telefone.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3")}</td>
                <td className="pr-3">{x.nome}</td><td className="pr-3">{x.empresa}</td>
                <td className="pr-3">{SC[x.status]}{x.enviadoEm ? ` ${x.enviadoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}</td>
                <td className="text-graphite">{x.erro}</td>
              </tr>))}</tbody>
          </table>
          {total > lista.length && <p className="text-xs text-graphite-muted mt-2">Mostrando {lista.length} de {searchParams.ver ? (c[searchParams.ver] ?? 0) : total}.</p>}
          {!total && <p className="text-sm text-graphite-muted">A lista está vazia.</p>}
        </div>
      </section>
      {editor && d.status !== "enviando" && (
        <details className="card"><summary className="text-sm text-[#A0261C] cursor-pointer min-h-[40px] inline-flex items-center">Excluir disparo</summary>
          <form action={excluir}><input type="hidden" name="id" value={d.id} /><button className="btn-outline text-[#A0261C] border-[#A0261C] mt-2">Excluir de vez</button></form></details>
      )}
    </>
  );
}
