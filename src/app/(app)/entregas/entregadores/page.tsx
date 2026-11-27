import Link from "next/link";
import { asc } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { VEICULOS } from "@/lib/frete/historico";
import { PageHeader, Badge } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import CadastrosTabs from "@/components/CadastrosTabs";
import { alternarAtivo, salvarEntregador, trocarSenha } from "../actions";

export const dynamic = "force-dynamic";
type Ent = typeof schema.entregadores.$inferSelect;

function Campos({ d }: { d?: Ent }) {
  const sfx = d?.id ?? "novo";
  return (
    <>
      {d && <input type="hidden" name="id" value={d.id} />}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div><label htmlFor={`nome-${sfx}`} className="label">Nome</label><input id={`nome-${sfx}`} name="nome" required defaultValue={d?.nome} className="input" /></div>
        <div><label htmlFor={`tel-${sfx}`} className="label">WhatsApp (com DDD)</label><input id={`tel-${sfx}`} name="telefone" inputMode="tel" required defaultValue={d?.telefone.replace(/^55/, "")} className="input" placeholder="19 99999-0000" /></div>
        <div><label htmlFor={`placa-${sfx}`} className="label">Placa</label><input id={`placa-${sfx}`} name="placa" defaultValue={d?.placa ?? ""} className="input uppercase" /></div>
        <div><label htmlFor={`doc-${sfx}`} className="label">CPF ou CNPJ</label><input id={`doc-${sfx}`} name="documento" inputMode="numeric" defaultValue={d?.documento ?? ""} className="input" /></div>
      </div>
      <fieldset>
        <legend className="label">Veículos que ele tem (recebe só fretes desses veículos; nenhum marcado = recebe todos)</legend>
        <div className="flex flex-wrap gap-2">
          {VEICULOS.map((v) => (
            <label key={v.nome} className="cursor-pointer">
              <input type="checkbox" name="veiculos" value={v.nome} defaultChecked={d?.veiculos.includes(v.nome)} className="peer sr-only" />
              <span className="inline-flex items-center min-h-[40px] px-3 rounded-full border border-surface-line text-sm peer-checked:bg-brand peer-checked:text-white peer-checked:border-brand peer-focus-visible:ring-2 peer-focus-visible:ring-graphite-dark">{v.nome}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export default async function Entregadores() {
  const user = await requireModule("entregas");
  const editor = can(user.role, "entregas", "edit");
  const lista = await db.query.entregadores.findMany({ orderBy: [asc(schema.entregadores.nome)] });
  return (
    <>
      <PageHeader title="Cadastros de logística" subtitle="Entregadores externos: eles entram no app com o WhatsApp e uma senha de 6 números.">
        <Link href="/entregas" className="btn-outline h-9 px-4">Ir para entregas</Link>
      </PageHeader>
      <CadastrosTabs atual="entregadores" role={user.role} />
      {editor && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Novo entregador</h2>
          <ActionForm action={salvarEntregador} label="Cadastrar" reset>
            <Campos />
            <label className="flex items-center gap-2 text-sm min-h-[40px]"><input type="checkbox" name="enviar" value="1" defaultChecked className="w-5 h-5 accent-[#E87722]" /> Enviar o link e a senha pelo WhatsApp</label>
          </ActionForm>
        </section>
      )}
      <section className="flex flex-col gap-3">
        {lista.length === 0 && <p className="card text-sm text-graphite-muted">Nenhum entregador cadastrado.</p>}
        {lista.map((d) => (
          <details key={d.id} className="card">
            <summary className="flex flex-wrap items-center gap-3 cursor-pointer min-h-[44px]">
              <span className="font-semibold">{d.nome}</span>
              <span className="text-sm text-graphite">{d.telefone.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3")}</span>
              <span className="text-sm text-graphite">{d.veiculos.length ? d.veiculos.join(", ") : "Todos os veículos"}</span>
              {!d.ativo && <Badge tone="gray">Desativado</Badge>}
              <span className="text-xs text-graphite-muted ml-auto">{d.ultimoAcesso ? `último acesso ${d.ultimoAcesso.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "nunca entrou"}</span>
            </summary>
            {editor && (
              <div className="mt-3 flex flex-col gap-3">
                <ActionForm action={salvarEntregador} label="Salvar"><Campos d={d} /></ActionForm>
                <div className="flex flex-wrap gap-3 border-t border-surface-line pt-3">
                  <ActionForm action={trocarSenha} label="Gerar nova senha e enviar" busy="Enviando..." className="flex items-center gap-2"><input type="hidden" name="id" value={d.id} /></ActionForm>
                  <form action={alternarAtivo}><input type="hidden" name="id" value={d.id} /><button className="btn-outline h-11">{d.ativo ? "Desativar" : "Reativar"}</button></form>
                </div>
              </div>
            )}
          </details>
        ))}
      </section>
    </>
  );
}
