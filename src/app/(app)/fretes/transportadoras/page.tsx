import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { PageHeader, Badge } from "@/components/ui";
import ActionForm from "./ActionForm";
import CadastrosTabs from "@/components/CadastrosTabs";
import { criarTransportadora, salvarCepOrigem } from "./actions";

export const dynamic = "force-dynamic";

export default async function Transportadoras() {
  const user = await requireModule("fretes");
  const admin = can(user.role, "integracoes", "edit");
  const [lista, cepOrigem] = await Promise.all([
    db.select({ t: schema.transportadoras, rotas: count(schema.freteRotas.id) })
      .from(schema.transportadoras)
      .leftJoin(schema.freteRotas, eq(schema.freteRotas.transportadoraId, schema.transportadoras.id))
      .groupBy(schema.transportadoras.id)
      .orderBy(asc(schema.transportadoras.nome)),
    getSetting("frete.cepOrigem"),
  ]);

  return (
    <>
      <PageHeader title="Cadastros de logística" subtitle="Transportadoras, entregadores e as planilhas de frete, tudo num lugar só. O hub calcula o frete com as tabelas das transportadoras.">
        <Link href="/fretes" className="btn-outline h-9 px-4">Ir para cotação</Link>
      </PageHeader>
      <CadastrosTabs atual="transportadoras" role={user.role} />

      <section className="card flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg">Transportadoras</h2>
        {lista.length === 0 ? (
          <p className="text-sm text-graphite-muted">Nenhuma transportadora cadastrada ainda.</p>
        ) : (
          <ul className="divide-y divide-[#F1EFEE]">
            {lista.map(({ t, rotas }) => (
              <li key={t.id}>
                <Link href={`/fretes/transportadoras/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 min-h-[44px] hover:bg-surface rounded-lg px-2">
                  <span className="font-medium">{t.nome}{t.cnpj && <span className="text-xs text-graphite-muted ml-2">{t.cnpj}</span>}</span>
                  <span className="flex items-center gap-2 text-sm text-graphite-muted">
                    {rotas} rota(s) · cubagem {t.fatorCubagem} kg/m³
                    {t.ativo ? <Badge tone="green">Ativa</Badge> : <Badge tone="gray">Inativa</Badge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {admin && (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Nova transportadora</h2>
            <ActionForm action={criarTransportadora} label="Cadastrar">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label htmlFor="nome" className="label">Nome</label>
                  <input id="nome" name="nome" required className="input" placeholder="Ex.: Transportadora Rápido Sul" />
                </div>
                <div>
                  <label htmlFor="cnpj" className="label">CNPJ <span className="text-graphite-muted font-normal">(opcional)</span></label>
                  <input id="cnpj" name="cnpj" className="input" placeholder="00.000.000/0001-00" />
                </div>
                <div>
                  <label htmlFor="fatorCubagem" className="label">Fator de cubagem (kg/m³)</label>
                  <input id="fatorCubagem" name="fatorCubagem" inputMode="decimal" defaultValue="300" className="input" />
                </div>
                <div>
                  <label htmlFor="prazoExtra" className="label">Dias a somar no prazo</label>
                  <input id="prazoExtra" name="prazoExtra" inputMode="numeric" defaultValue="0" className="input" />
                </div>
              </div>
            </ActionForm>
          </section>

          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">CEP de origem</h2>
            <p className="text-sm text-graphite">De onde saem as mercadorias. Já vem preenchido na tela de cotação.</p>
            <ActionForm action={salvarCepOrigem} label="Salvar CEP">
              <div>
                <label htmlFor="cepOrigem" className="label">CEP</label>
                <input id="cepOrigem" name="cepOrigem" defaultValue={cepOrigem.replace(/^(\d{5})(\d{3})$/, "$1-$2")} inputMode="numeric" className="input" placeholder="13800-000" />
              </div>
            </ActionForm>
            <div className="text-sm text-graphite border-t border-surface-line pt-3">
              <p className="font-semibold mb-1">Como o hub calcula</p>
              <p>Peso taxado = o maior entre peso real e peso cubado (m³ × fator). Sobre ele entra a faixa de peso (e o excedente por kg), depois ad valorem e GRIS sobre o valor da nota, pedágio a cada 100 kg, taxas, frete mínimo e ICMS por dentro.</p>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
