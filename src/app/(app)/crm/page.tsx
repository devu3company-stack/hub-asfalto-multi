import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { garantirFunil, quadro, tarefasAbertas, TIPOS_TAREFA } from "@/lib/crm";
import { LOJAS } from "@/lib/lojas";
import { PageHeader, Stat } from "@/components/ui";
import Quadro from "./Quadro";

export const dynamic = "force-dynamic";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default async function Crm({ searchParams }: { searchParams: { funil?: string; resp?: string; status?: string; q?: string; loja?: string } }) {
  const user = await requireModule("crm");
  const editor = can(user.role, "crm", "edit");
  const funis = await garantirFunil();
  const funilId = funis.some((f) => f.id === searchParams.funil) ? searchParams.funil! : funis[0].id;
  const resp = searchParams.resp === "todos" ? undefined : searchParams.resp === undefined ? (user.role === "ADMIN" ? undefined : user.id) : searchParams.resp;
  const status = ["ganha", "perdida"].includes(searchParams.status ?? "") ? searchParams.status! : "andamento";
  const [q, usuarios, minhas] = await Promise.all([
    quadro({ funilId, responsavelId: resp, status, busca: searchParams.q?.trim(), loja: searchParams.loja || undefined }),
    db.query.users.findMany({ where: eq(schema.users.active, true), columns: { id: true, name: true }, orderBy: asc(schema.users.name) }),
    tarefasAbertas(user.id),
  ]);
  const todas = q.etapas.flatMap((e) => e.negociacoes);
  const atrasadas = minhas.filter((t) => t.quando.getTime() < Date.now() && t.negociacao.status === "andamento");
  const hoje = minhas.filter((t) => t.quando.toDateString() === new Date().toDateString() && t.quando.getTime() >= Date.now());

  return (
    <>
      <PageHeader title="Funil de vendas" subtitle="Negociações por etapa. Arraste os cartões para mudar de etapa.">
        <div className="flex flex-wrap gap-2">
          {editor && <Link href={`/crm/nova?funil=${funilId}`} className="btn-primary">+ Novo lead</Link>}
          {editor && <Link href="/crm/config" className="btn-outline">Configurar funil</Link>}
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={status === "andamento" ? "Em andamento" : status === "ganha" ? "Vendidas" : "Perdidas"} value={String(todas.length)} />
        <Stat label="Valor total" value={brl(todas.reduce((s, n) => s + n.valor, 0))} />
        <Stat label="Minhas tarefas atrasadas" value={String(atrasadas.length)} tone={atrasadas.length ? "red" : "default"} />
        <Stat label="Minhas tarefas hoje" value={String(hoje.length)} tone={hoje.length ? "orange" : "default"} />
      </div>

      <form className="card flex flex-wrap items-end gap-3" role="search">
        {funis.length > 1 && (
          <div><label htmlFor="funil" className="label">Funil</label>
            <select id="funil" name="funil" defaultValue={funilId} className="input">{funis.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div>
        )}
        <div><label htmlFor="resp" className="label">Responsável</label>
          <select id="resp" name="resp" defaultValue={searchParams.resp ?? (user.role === "ADMIN" ? "todos" : user.id)} className="input">
            <option value="todos">Todos</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.id === user.id ? `${u.name} (eu)` : u.name}</option>)}
          </select></div>
        <div><label htmlFor="status" className="label">Situação</label>
          <select id="status" name="status" defaultValue={status} className="input">
            <option value="andamento">Em andamento</option><option value="ganha">Vendidas</option><option value="perdida">Perdidas</option>
          </select></div>
        <div><label htmlFor="loja" className="label">Loja</label>
          <select id="loja" name="loja" defaultValue={searchParams.loja ?? ""} className="input"><option value="">As duas</option>{LOJAS.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
        <div className="grow max-w-xs"><label htmlFor="q" className="label">Buscar</label><input id="q" name="q" defaultValue={searchParams.q} className="input" placeholder="Nome, contato, empresa ou telefone" /></div>
        <button className="btn-outline">Filtrar</button>
      </form>

      <Quadro key={JSON.stringify(searchParams)} podeEditar={editor && status === "andamento"} colunas={q.etapas.map((e) => ({
        id: e.id, nome: e.nome,
        cards: e.negociacoes.map((n) => ({
          id: n.id, titulo: n.titulo, contato: n.contato, empresa: n.empresa, valor: n.valor, qualificacao: n.qualificacao,
          responsavel: n.responsavel?.name ?? null, proximaTarefa: n.proximaTarefa ? n.proximaTarefa.toISOString() : null,
        })),
      }))} />

      {(atrasadas.length > 0 || hoje.length > 0) && (
        <section className="card flex flex-col gap-2">
          <h2 className="font-display font-bold text-lg">Minhas tarefas</h2>
          <ul className="divide-y divide-[#F1EFEE]">
            {[...atrasadas, ...hoje].map((t) => (
              <li key={t.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><span className={t.quando.getTime() < Date.now() ? "text-[#A0261C] font-semibold" : "font-semibold"}>{TIPOS_TAREFA[t.tipo] ?? t.tipo}</span> · {t.descricao}</span>
                <Link href={`/crm/${t.negociacao.id}`} className="text-brand-text font-semibold">{t.negociacao.titulo}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
