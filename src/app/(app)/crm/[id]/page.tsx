import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { FONTES, garantirFunil, motivosPerda, TIPOS_TAREFA } from "@/lib/crm";
import { LOJAS, nomeLoja } from "@/lib/lojas";
import { PageHeader, Badge, brl } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import { concluirTarefa, criarNegociacao, excluirNegociacao, marcar, mudarEtapa, nota, novaTarefa, salvarNegociacao } from "../actions";

export const dynamic = "force-dynamic";
const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const ymd = (d: Date | null) => (d ? new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10) : "");
const TZ = <input type="hidden" name="tz" value="180" />;

type Neg = typeof schema.crmNegociacoes.$inferSelect;

function Campos({ n, usuarios, uid, pre }: { n?: Neg; usuarios: { id: string; name: string }[]; uid: string; pre?: Partial<Neg> }) {
  const v = { ...pre, ...n } as Partial<Neg>;
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      <div className="sm:col-span-2"><label htmlFor="titulo" className="label">Nome da negociação</label>
        <input id="titulo" name="titulo" required defaultValue={v.titulo ?? ""} className="input" placeholder="40 sacos asfalto frio — Construtora X" /></div>
      <div><label htmlFor="contato" className="label">Contato</label><input id="contato" name="contato" defaultValue={v.contato ?? ""} className="input" /></div>
      <div><label htmlFor="empresa" className="label">Empresa</label><input id="empresa" name="empresa" defaultValue={v.empresa ?? ""} className="input" /></div>
      <div><label htmlFor="telefone" className="label">WhatsApp</label><input id="telefone" name="telefone" inputMode="tel" defaultValue={v.telefone ?? ""} className="input" placeholder="19 99999-0000" /></div>
      <div><label htmlFor="email" className="label">E-mail</label><input id="email" name="email" type="email" defaultValue={v.email ?? ""} className="input" /></div>
      <div><label htmlFor="valor" className="label">Valor (R$)</label><input id="valor" name="valor" inputMode="decimal" defaultValue={v.valor ? String(v.valor).replace(".", ",") : ""} className="input" /></div>
      <div><label htmlFor="previsao" className="label">Previsão de fechamento</label><input id="previsao" name="previsao" type="date" defaultValue={ymd(v.previsaoFechamento ?? null)} className="input" /></div>
      <div><label htmlFor="qualificacao" className="label">Qualificação</label>
        <select id="qualificacao" name="qualificacao" defaultValue={String(v.qualificacao ?? 0)} className="input">
          {[0, 1, 2, 3, 4, 5].map((i) => <option key={i} value={i}>{i ? "★".repeat(i) : "Sem qualificação"}</option>)}</select></div>
      <div><label htmlFor="fonte" className="label">Fonte</label>
        <select id="fonte" name="fonte" defaultValue={v.fonte ?? ""} className="input"><option value="">—</option>{FONTES.map((f) => <option key={f}>{f}</option>)}</select></div>
      <div><label htmlFor="responsavelId" className="label">Responsável</label>
        <select id="responsavelId" name="responsavelId" defaultValue={v.responsavelId ?? uid} className="input">{usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      <div><label htmlFor="loja" className="label">Loja</label>
        <select id="loja" name="loja" defaultValue={v.loja ?? "asfaltomulti"} className="input">{LOJAS.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
      {TZ}
    </div>
  );
}

export default async function Negociacao({ params, searchParams }: { params: { id: string }; searchParams: { funil?: string; nome?: string; tel?: string } }) {
  const user = await requireModule("crm");
  const editor = can(user.role, "crm", "edit");
  const usuarios = await db.query.users.findMany({ where: eq(schema.users.active, true), columns: { id: true, name: true }, orderBy: asc(schema.users.name) });

  if (params.id === "nova") {
    if (!editor) notFound();
    const funis = await garantirFunil();
    const funilId = funis.some((f) => f.id === searchParams.funil) ? searchParams.funil! : funis[0].id;
    const etapas = await db.query.crmEtapas.findMany({ where: eq(schema.crmEtapas.funilId, funilId), orderBy: asc(schema.crmEtapas.ordem) });
    return (
      <>
        <PageHeader title="Nova negociação"><Link href="/crm" className="btn-outline h-9 px-4">Voltar</Link></PageHeader>
        <section className="card">
          <ActionForm action={criarNegociacao} label="Criar negociação">
            <div><label htmlFor="etapaId" className="label">Etapa</label>
              <select id="etapaId" name="etapaId" className="input">{etapas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></div>
            <Campos usuarios={usuarios} uid={user.id} pre={{ contato: searchParams.nome ?? null, telefone: searchParams.tel ?? null, fonte: searchParams.tel ? "WhatsApp" : null,
              titulo: searchParams.nome ? `Orçamento — ${searchParams.nome}` : "" }} />
          </ActionForm>
        </section>
      </>
    );
  }

  const n = await db.query.crmNegociacoes.findFirst({ where: eq(schema.crmNegociacoes.id, params.id), with: { etapa: true } });
  if (!n) notFound();
  const [etapas, tarefas, hist, motivos] = await Promise.all([
    db.query.crmEtapas.findMany({ where: eq(schema.crmEtapas.funilId, n.funilId), orderBy: asc(schema.crmEtapas.ordem) }),
    db.query.crmTarefas.findMany({ where: eq(schema.crmTarefas.negociacaoId, n.id), orderBy: [asc(schema.crmTarefas.concluida), asc(schema.crmTarefas.quando)], with: { responsavel: { columns: { name: true } } } }),
    db.query.crmHistorico.findMany({ where: eq(schema.crmHistorico.negociacaoId, n.id), orderBy: desc(schema.crmHistorico.createdAt), limit: 100, with: { user: { columns: { name: true } } } }),
    motivosPerda(),
  ]);
  const idx = etapas.findIndex((e) => e.id === n.etapaId);

  return (
    <>
      <PageHeader title={n.titulo} subtitle={`${brl(n.valor)} · ${nomeLoja(n.loja)}${n.contato ? ` · ${n.contato}` : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          {n.status === "ganha" && <Badge tone="green">Vendida</Badge>}
          {n.status === "perdida" && <Badge tone="red">Perdida: {n.motivoPerda}</Badge>}
          {n.telefone && <Link href={`/whatsapp?chat=${n.telefone.length <= 11 ? "55" + n.telefone : n.telefone}`} className="btn-outline h-9 px-4">Conversa no WhatsApp</Link>}
          <Link href={`/fretes?loja=${n.loja}`} className="btn-outline h-9 px-4">Cotar frete</Link>
          <Link href="/crm" className="btn-outline h-9 px-4">Funil</Link>
        </div>
      </PageHeader>

      <nav aria-label="Etapas" className="card flex flex-wrap gap-1 p-2">
        {etapas.map((e, i) => (
          <form key={e.id} action={mudarEtapa} className="grow">
            <input type="hidden" name="id" value={n.id} /><input type="hidden" name="etapaId" value={e.id} />
            <button disabled={!editor || n.status !== "andamento"} aria-current={e.id === n.etapaId ? "step" : undefined}
              className={`w-full min-h-[40px] px-3 text-xs font-semibold rounded-lg ${i <= idx ? "bg-brand text-white" : "bg-[#EFEDEC] text-graphite"} ${e.id === n.etapaId ? "ring-2 ring-graphite-dark" : ""}`}>
              {e.nome}
            </button>
          </form>
        ))}
      </nav>

      {editor && (
        <div className="flex flex-wrap gap-3">
          {n.status === "andamento" ? (
            <>
              <ActionForm action={marcar} label="Marcar venda" className="flex items-center gap-2"><input type="hidden" name="id" value={n.id} /><input type="hidden" name="status" value="ganha" /></ActionForm>
              <ActionForm action={marcar} label="Marcar perda" className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={n.id} /><input type="hidden" name="status" value="perdida" />
                <select name="motivo" aria-label="Motivo da perda" className="input h-10 w-48" defaultValue=""><option value="">Motivo da perda...</option>{motivos.map((m) => <option key={m}>{m}</option>)}</select>
                <input name="obs" aria-label="Observação" placeholder="Observação (opcional)" className="input h-10 w-56" />
              </ActionForm>
            </>
          ) : (
            <ActionForm action={marcar} label="Reabrir negociação" className="flex items-center gap-2"><input type="hidden" name="id" value={n.id} /><input type="hidden" name="status" value="andamento" /></ActionForm>
          )}
        </div>
      )}

      <div className="grid xl:grid-cols-3 gap-4 items-start">
        <section className="card flex flex-col gap-3 xl:col-span-1">
          <h2 className="font-display font-bold text-lg">Dados</h2>
          {editor ? (
            <ActionForm action={salvarNegociacao} label="Salvar"><input type="hidden" name="id" value={n.id} /><Campos n={n} usuarios={usuarios} uid={user.id} /></ActionForm>
          ) : <p className="text-sm text-graphite">{n.contato} {n.empresa} {n.telefone} {n.email}</p>}
          {editor && (
            <details className="border-t border-surface-line pt-2"><summary className="text-sm text-[#A0261C] cursor-pointer min-h-[40px] inline-flex items-center">Excluir negociação</summary>
              <form action={excluirNegociacao}><input type="hidden" name="id" value={n.id} /><button className="btn-outline text-[#A0261C] border-[#A0261C] mt-2">Excluir de vez</button></form></details>
          )}
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Tarefas</h2>
          {editor && (
            <ActionForm action={novaTarefa} label="Agendar tarefa" reset>
              <input type="hidden" name="id" value={n.id} />{TZ}
              <div className="grid grid-cols-2 gap-2">
                <select name="tipo" aria-label="Tipo de tarefa" className="input">{Object.entries(TIPOS_TAREFA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <select name="responsavelId" aria-label="Responsável" defaultValue={user.id} className="input">{usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                <input name="data" type="date" required aria-label="Data" className="input" />
                <input name="hora" type="time" aria-label="Hora" defaultValue="09:00" className="input" />
                <input name="descricao" aria-label="Descrição" placeholder="Ex.: cobrar retorno do orçamento" className="input col-span-2" />
              </div>
            </ActionForm>
          )}
          {tarefas.length === 0 ? <p className="text-sm text-graphite-muted">Nenhuma tarefa. Agende o próximo passo para não perder a venda.</p> : (
            <ul className="flex flex-col gap-2">
              {tarefas.map((t) => {
                const atrasada = !t.concluida && t.quando.getTime() < Date.now();
                return (
                  <li key={t.id} className={`flex items-start gap-2 p-2 rounded-xl ${t.concluida ? "bg-[#F8F7F6] opacity-70" : atrasada ? "bg-[#FDE2DF]" : "bg-[#F8F7F6]"}`}>
                    {editor && <form action={concluirTarefa}><input type="hidden" name="tarefaId" value={t.id} />
                      <button aria-label={t.concluida ? "Reabrir tarefa" : "Concluir tarefa"} className={`w-6 h-6 mt-0.5 rounded-md border-2 ${t.concluida ? "bg-[#1E6B34] border-[#1E6B34] text-white" : "border-graphite-muted"} text-xs`}>{t.concluida ? "✓" : ""}</button></form>}
                    <div className="text-sm">
                      <p className={t.concluida ? "line-through" : "font-semibold"}>{TIPOS_TAREFA[t.tipo] ?? t.tipo} · {t.descricao}</p>
                      <p className={`text-xs ${atrasada ? "text-[#A0261C] font-semibold" : "text-graphite-muted"}`}>{fmt(t.quando)}{t.responsavel ? ` · ${t.responsavel.name}` : ""}{atrasada ? " · atrasada" : ""}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Histórico</h2>
          {editor && (
            <ActionForm action={nota} label="Salvar anotação" reset>
              <input type="hidden" name="id" value={n.id} />
              <textarea name="texto" rows={3} aria-label="Anotação" placeholder="O que foi conversado, objeções, combinado..." className="input h-auto py-2" />
            </ActionForm>
          )}
          <ol className="flex flex-col gap-3">
            {hist.map((h) => (
              <li key={h.id} className="text-sm border-l-2 pl-3 border-surface-line">
                <p className={h.tipo === "nota" ? "whitespace-pre-wrap" : "text-graphite"}>{h.texto}</p>
                <p className="text-xs text-graphite-muted">{h.user?.name ?? "Sistema"} · {fmt(h.createdAt)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
