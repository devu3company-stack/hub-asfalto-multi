import Link from "next/link";
import { asc, count } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import CadastrosTabs from "@/components/CadastrosTabs";
import { importar } from "../historico/actions";
import { importarCsv } from "../transportadoras/actions";

export const dynamic = "force-dynamic";

export default async function Planilhas({ searchParams }: { searchParams: { t?: string } }) {
  const user = await requireModule("fretes");
  const admin = can(user.role, "integracoes", "edit");
  const editor = can(user.role, "fretes", "edit");
  const H = schema.freteHistorico;
  const [transportadoras, [hist]] = await Promise.all([
    db.select({ id: schema.transportadoras.id, nome: schema.transportadoras.nome }).from(schema.transportadoras).orderBy(asc(schema.transportadoras.nome)),
    db.select({ n: count() }).from(H),
  ]);

  return (
    <>
      <PageHeader title="Cadastros de logística" subtitle="Transportadoras, entregadores e as planilhas de frete, tudo num lugar só.">
        <Link href="/fretes" className="btn-outline h-9 px-4">Ir para cotação</Link>
      </PageHeader>
      <CadastrosTabs atual="planilhas" role={user.role} />

      <div className="grid lg:grid-cols-2 gap-4">
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Tabela de frete da transportadora</h2>
          <p className="text-sm text-graphite">
            A tabela de preços que a transportadora manda (uma rota por linha, separada por ponto e vírgula). Baixe o <a href="/modelo-tabela-frete.csv" download className="font-semibold text-brand-text underline">modelo de planilha</a>, preencha no Excel e salve como CSV.
          </p>
          {!admin ? (
            <p className="text-sm text-graphite-muted">Só o administrador importa tabelas de transportadora.</p>
          ) : transportadoras.length === 0 ? (
            <p className="text-sm">Cadastre a transportadora primeiro na aba <Link href="/fretes/transportadoras" className="font-semibold text-brand-text underline">Transportadoras</Link>.</p>
          ) : (
            <ActionForm action={importarCsv} label="Importar tabela" busy="Importando..." reset>
              <div>
                <label htmlFor="transportadoraId" className="label">Transportadora</label>
                <select id="transportadoraId" name="transportadoraId" required defaultValue={searchParams.t ?? ""} className="input">
                  <option value="" disabled>Escolha…</option>
                  {transportadoras.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="arquivo-csv" className="label">Arquivo CSV</label>
                <input id="arquivo-csv" name="arquivo" type="file" accept=".csv,text/csv,text/plain" className="text-sm" />
              </div>
              <div>
                <label htmlFor="texto" className="label">Ou cole as linhas</label>
                <textarea id="texto" name="texto" rows={3} className="input h-auto py-2 font-mono text-xs" placeholder="Capital SP;01000-000;05999-999;2;10:45,00|30:62,50;1,10;45;0,3;0,2;3,5;4,2;15;0;12" />
              </div>
              <label className="flex items-center gap-2 text-sm min-h-[44px]">
                <input type="checkbox" name="substituir" value="sim" className="w-4 h-4 accent-[#C25A14]" />
                Apagar as rotas atuais dessa transportadora antes de importar
              </label>
            </ActionForm>
          )}
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Histórico de preços de fretes</h2>
          <p className="text-sm text-graphite">
            A planilha &quot;Histórico de Preços Fretes&quot; (.xlsx ou .xlsm). É a base para avaliar cotações e sugerir o valor dos fretes dos entregadores. Os fretes que vieram de planilha são substituídos; os registrados pelo app de entregas ficam.
          </p>
          <p className="text-sm text-graphite-muted">
            {hist.n ? `${hist.n.toLocaleString("pt-BR")} fretes no histórico.` : "Nenhum frete no histórico ainda."}{" "}
            <Link href="/fretes/historico" className="font-semibold text-brand-text underline">Ver histórico</Link>
          </p>
          {editor ? (
            <ActionForm action={importar} label="Importar histórico" busy="Importando..." reset>
              <input type="file" name="arquivo" accept=".xlsx,.xlsm" required aria-label="Planilha de histórico" className="text-sm" />
            </ActionForm>
          ) : <p className="text-sm text-graphite-muted">Seu acesso a Fretes é só de leitura.</p>}
        </section>
      </div>
    </>
  );
}
