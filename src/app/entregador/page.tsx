import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { exigirEntregador } from "@/lib/entregador-auth";
import { STATUS } from "@/lib/entregas";
import { sair } from "./actions";

export const dynamic = "force-dynamic";
const E = schema.entregas;
const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" }) : "a combinar");

function Cartao({ e, meu }: { e: typeof E.$inferSelect; meu?: boolean }) {
  return (
    <li>
      <Link href={`/entregador/f/${e.id}`} className="card flex items-center gap-3 active:scale-[.99]">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{e.destino}{e.uf ? `/${e.uf}` : ""}</p>
          <p className="text-xs text-graphite">{[e.distanciaKm ? `${Math.round(e.distanciaKm)} km` : null, e.kg ? `${e.kg.toLocaleString("pt-BR")} kg` : null, e.veiculo, e.descarga === "ajudante" ? `com ${e.ajudantes} ajudante(s)` : e.descarga === "motorista" ? "motorista descarrega" : null, `coleta ${dia(e.coletaEm)}`].filter(Boolean).join(" · ")}</p>
          {meu && <p className="text-xs font-semibold text-brand-text mt-1">{STATUS[e.status].rotulo}</p>}
        </div>
        <span className="font-bold text-lg">{reais(e.valor + e.valorDescarga)}</span>
      </Link>
    </li>
  );
}

export default async function Inicio() {
  const d = await exigirEntregador();
  const [abertos, meus, feitos] = await Promise.all([
    db.query.entregas.findMany({ where: eq(E.status, "publicado"), orderBy: desc(E.createdAt), limit: 50 }),
    db.query.entregas.findMany({ where: and(eq(E.entregadorId, d.id), inArray(E.status, ["aceito", "coletado"])), orderBy: desc(E.aceitoEm) }),
    db.query.entregas.findMany({ where: and(eq(E.entregadorId, d.id), eq(E.status, "entregue")), orderBy: desc(E.entregueEm), limit: 10 }),
  ]);
  const disponiveis = abertos.filter((e) => !e.veiculo || !d.veiculos.length || d.veiculos.includes(e.veiculo));
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="font-display font-bold text-xl">Olá, {d.nome.split(" ")[0]}</h1>
        <form action={sair}><button className="text-sm text-graphite underline min-h-[44px]">Sair</button></form>
      </div>
      {meus.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="meus">
          <h2 id="meus" className="font-display font-bold">Meus fretes</h2>
          <ul className="flex flex-col gap-2">{meus.map((e) => <Cartao key={e.id} e={e} meu />)}</ul>
        </section>
      )}
      <section className="flex flex-col gap-2" aria-labelledby="disp">
        <h2 id="disp" className="font-display font-bold">Fretes disponíveis</h2>
        {disponiveis.length ? <ul className="flex flex-col gap-2">{disponiveis.map((e) => <Cartao key={e.id} e={e} />)}</ul>
          : <p className="card text-sm text-graphite">Nenhum frete disponível agora. Você recebe um aviso no WhatsApp quando aparecer um novo.</p>}
      </section>
      {feitos.length > 0 && (
        <details className="card">
          <summary className="font-semibold cursor-pointer min-h-[40px] flex items-center">Últimas entregas ({feitos.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">{feitos.map((e) => (
            <li key={e.id} className="flex justify-between"><span>{e.entregueEm?.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {e.destino}</span><strong>{reais(e.valor + e.valorDescarga)}</strong></li>
          ))}</ul>
        </details>
      )}
    </>
  );
}
