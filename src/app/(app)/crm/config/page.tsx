import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { garantirFunil, motivosPerda } from "@/lib/crm";
import { PageHeader } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import { salvarFunil, salvarMotivos } from "../actions";

export const dynamic = "force-dynamic";

export default async function ConfigCrm() {
  await requireModule("crm", "edit");
  const funis = await garantirFunil();
  const etapas = await Promise.all(funis.map((f) => db.query.crmEtapas.findMany({ where: eq(schema.crmEtapas.funilId, f.id), orderBy: asc(schema.crmEtapas.ordem) })));
  const motivos = await motivosPerda();
  return (
    <>
      <PageHeader title="Configurar funil"><Link href="/crm" className="btn-outline h-9 px-4">Voltar ao funil</Link></PageHeader>
      <div className="grid lg:grid-cols-2 gap-4">
        {funis.map((f, i) => (
          <section key={f.id} className="card flex flex-col gap-3">
            <ActionForm action={salvarFunil} label="Salvar funil">
              <input type="hidden" name="funilId" value={f.id} />
              <div><label htmlFor={`n_${f.id}`} className="label">Nome do funil</label><input id={`n_${f.id}`} name="nomeFunil" defaultValue={f.nome} className="input" /></div>
              <div><label htmlFor={`e_${f.id}`} className="label">Etapas (uma por linha, na ordem)</label>
                <textarea id={`e_${f.id}`} name="etapas" rows={7} defaultValue={etapas[i].map((e) => e.nome).join("\n")} className="input h-auto py-2" /></div>
            </ActionForm>
          </section>
        ))}
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Novo funil</h2>
          <ActionForm action={salvarFunil} label="Criar funil" reset>
            <div><label htmlFor="nf" className="label">Nome</label><input id="nf" name="nomeFunil" className="input" placeholder="Ex.: Prefeituras e licitações" /></div>
            <div><label htmlFor="ne" className="label">Etapas (uma por linha)</label><textarea id="ne" name="etapas" rows={5} className="input h-auto py-2" placeholder={"Sem contato\nContato feito\nProposta enviada\nFechamento"} /></div>
          </ActionForm>
        </section>
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Motivos de perda</h2>
          <ActionForm action={salvarMotivos} label="Salvar motivos">
            <textarea name="motivos" rows={8} aria-label="Motivos de perda, um por linha" defaultValue={motivos.join("\n")} className="input h-auto py-2" />
          </ActionForm>
        </section>
      </div>
    </>
  );
}
