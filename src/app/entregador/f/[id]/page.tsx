import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { entregadorAtual } from "@/lib/entregador-auth";
import { STATUS, textoDescarga } from "@/lib/entregas";
import { AceitarForm, ColetarForm, EntregarForm } from "../../Forms";

export const dynamic = "force-dynamic";
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function Frete({ params }: { params: { id: string } }) {
  const d = await entregadorAtual();
  if (!d) redirect(`/entregador/entrar?volta=/entregador/f/${params.id}`);
  const e = await db.query.entregas.findFirst({ where: eq(schema.entregas.id, params.id) });
  const meu = e?.entregadorId === d.id;
  if (!e || (!meu && e.status !== "publicado")) {
    return (
      <>
        <p className="card text-sm">{e && e.status !== "cancelado" ? "Este frete já foi aceito por outro entregador." : "Este frete não está mais disponível."}</p>
        <Link href="/entregador" className="btn-outline h-12">Ver fretes disponíveis</Link>
      </>
    );
  }
  const linhas: [string, string | null | undefined][] = [
    ["Saída", e.origem],
    ["Destino", `${e.destino}${e.uf ? `/${e.uf}` : ""}`],
    ["Distância", e.distanciaKm ? `${Math.round(e.distanciaKm)} km` : null],
    ["Carga", [e.qtd ? `${e.qtd}` : null, e.produto, e.kg ? `(${e.kg.toLocaleString("pt-BR")} kg)` : null].filter(Boolean).join(" ") || null],
    ["Veículo", e.veiculo],
    ["Descarga", textoDescarga(e)],
    ["Coleta", e.coletaEm?.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "2-digit" })],
    ["Observação", e.observacao],
    // Dados do cliente só para quem aceitou.
    ...(meu ? ([["Endereço", e.endereco], ["Cliente", e.cliente], ["Contato no local", e.contatoCliente]] as [string, string | null][]) : []),
  ];
  const mapa = meu && e.endereco ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${e.endereco}, ${e.destino}${e.uf ? ` - ${e.uf}` : ""}`)}` : null;
  return (
    <>
      <Link href="/entregador" className="text-sm font-semibold text-brand-text min-h-[44px] inline-flex items-center">← Fretes</Link>
      <section className="card flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display font-bold text-xl">{e.destino}{e.uf ? `/${e.uf}` : ""}</h1>
          <span className="font-bold text-2xl text-brand-text">{reais(e.valor + e.valorDescarga)}</span>
        </div>
        {meu && <p className="text-sm font-semibold">{STATUS[e.status].rotulo}</p>}
        <dl className="text-sm flex flex-col gap-1.5">
          {linhas.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex gap-2"><dt className="text-graphite w-28 shrink-0">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
        </dl>
        {mapa && <a href={mapa} target="_blank" rel="noopener" className="btn-outline h-12">Abrir rota no mapa</a>}
      </section>
      {e.status === "publicado" && <AceitarForm id={e.id} />}
      {meu && e.status === "aceito" && <ColetarForm id={e.id} />}
      {meu && (e.status === "aceito" || e.status === "coletado") && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold">Finalizar entrega</h2>
          <EntregarForm id={e.id} />
        </section>
      )}
      {meu && e.status === "entregue" && <p className="card text-sm text-[#1E6B34] font-semibold">Entrega finalizada ✓</p>}
    </>
  );
}
