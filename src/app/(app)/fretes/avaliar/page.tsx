import Link from "next/link";
import { count } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { VEICULOS } from "@/lib/frete/historico";
import { PageHeader } from "@/components/ui";
import Avaliador from "./Avaliador";

export const dynamic = "force-dynamic";

export default async function AvaliarFrete() {
  await requireModule("fretes");
  const [{ n }] = await db.select({ n: count() }).from(schema.freteHistorico);
  return (
    <>
      <PageHeader title="Avaliar frete" subtitle={`Compare o valor de um freteiro com ${n.toLocaleString("pt-BR")} fretes já feitos.`}>
        <div className="flex gap-2"><Link href="/fretes/historico" className="btn-outline h-9 px-4">Histórico</Link><Link href="/fretes" className="btn-outline h-9 px-4">Fretes</Link></div>
      </PageHeader>
      {!n && <p className="card text-sm">O histórico está vazio. <Link href="/fretes/historico" className="font-semibold text-brand-text underline">Importe a planilha</Link> para começar.</p>}
      <Avaliador veiculos={VEICULOS.map((v) => v.nome)} />
    </>
  );
}
