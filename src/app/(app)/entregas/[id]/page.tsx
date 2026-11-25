import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { nomeLoja } from "@/lib/lojas";
import { STATUS } from "@/lib/entregas";
import { PageHeader, Badge, brl } from "@/components/ui";
import { cancelar, liberar, reavisar } from "../actions";

export const dynamic = "force-dynamic";
const quando = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null);

export default async function Entrega({ params, searchParams }: { params: { id: string }; searchParams: { publicado?: string } }) {
  const user = await requireModule("entregas");
  const editor = can(user.role, "entregas", "edit");
  const e = await db.query.entregas.findFirst({ where: eq(schema.entregas.id, params.id), with: { entregador: true, autor: { columns: { name: true } } } });
  if (!e) notFound();
  const passos = [
    { t: "Publicado", d: e.createdAt, extra: e.autor?.name ? `por ${e.autor.name} · ${e.avisados} entregador(es) avisado(s)` : `${e.avisados} avisado(s)` },
    { t: "Aceito", d: e.aceitoEm, extra: e.entregador?.nome },
    { t: "Carga coletada", d: e.coletadoEm },
    { t: "Entregue", d: e.entregueEm, extra: e.recebedor ? `recebido por ${e.recebedor}` : undefined },
  ];
  return (
    <>
      <PageHeader title={`${e.origem} → ${e.destino}${e.uf ? `/${e.uf}` : ""}`} subtitle={`${brl(e.valor)} · ${nomeLoja(e.loja)}`}>
        <div className="flex items-center gap-2"><Badge tone={STATUS[e.status].tom}>{STATUS[e.status].rotulo}</Badge><Link href="/entregas" className="btn-outline h-9 px-4">Voltar</Link></div>
      </PageHeader>
      {searchParams.publicado && <p role="status" className="card text-sm text-[#1E6B34]">Frete publicado. Os entregadores estão sendo avisados pelo WhatsApp (leva alguns segundos por pessoa).</p>}
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <section className="card flex flex-col gap-2 text-sm">
          <h2 className="font-display font-bold text-lg">Frete</h2>
          {[["Cliente", e.cliente], ["Endereço", e.endereco], ["Contato no local", e.contatoCliente], ["Produto", e.produto ? `${e.qtd ?? ""} ${e.produto}` : null],
            ["Peso", e.kg ? `${e.kg.toLocaleString("pt-BR")} kg` : null], ["Distância", e.distanciaKm ? `${e.distanciaKm.toLocaleString("pt-BR")} km` : null],
            ["Veículo", e.veiculo ?? "Qualquer"], ["Coleta", e.coletaEm?.toLocaleDateString("pt-BR", { timeZone: "UTC" })], ["Observação", e.observacao]]
            .filter(([, v]) => v).map(([k, v]) => <p key={k as string}><span className="text-graphite">{k}:</span> <strong>{v}</strong></p>)}
        </section>
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Andamento</h2>
          <ol className="flex flex-col gap-3">
            {passos.map((p) => (
              <li key={p.t} className="flex gap-3 text-sm">
                <span aria-hidden className={`mt-1 w-3 h-3 rounded-full shrink-0 ${p.d ? "bg-brand" : "bg-[#D9D6D4]"}`} />
                <div><p className={p.d ? "font-semibold" : "text-graphite-muted"}>{p.t}</p>{p.d && <p className="text-xs text-graphite">{quando(p.d)}{p.extra ? ` · ${p.extra}` : ""}</p>}</div>
              </li>
            ))}
          </ol>
          {e.entregador && <p className="text-sm">Entregador: <strong>{e.entregador.nome}</strong>{e.entregador.placa ? ` · ${e.entregador.placa}` : ""} · <a className="text-brand-text font-semibold" href={`/whatsapp?chat=${e.entregador.telefone}`}>conversa</a></p>}
          {editor && e.status !== "entregue" && (
            <div className="flex flex-wrap gap-2 border-t border-surface-line pt-3">
              {e.status === "publicado" && <form action={reavisar}><input type="hidden" name="id" value={e.id} /><button className="btn-outline h-10">Avisar de novo</button></form>}
              {(e.status === "aceito" || e.status === "coletado" || e.status === "cancelado") && (
                <form action={liberar}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="avisar" value="1" />
                  <button className="btn-outline h-10">{e.status === "cancelado" ? "Reabrir e avisar" : "Tirar do entregador e reabrir"}</button></form>
              )}
              {e.status !== "cancelado" && <form action={cancelar}><input type="hidden" name="id" value={e.id} /><button className="btn-outline h-10 text-[#A0261C] border-[#A0261C]">Cancelar frete</button></form>}
            </div>
          )}
        </section>
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Comprovante</h2>
          {e.canhoto ? (
            <a href={`/api/entregas/canhoto/${e.id}`} target="_blank" rel="noopener">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/entregas/canhoto/${e.id}`} alt="Foto do canhoto da entrega" className="rounded-xl max-h-96 w-auto" />
            </a>
          ) : <p className="text-sm text-graphite-muted">A foto do canhoto aparece aqui quando o entregador finalizar.</p>}
          {e.entregaLat != null && e.entregaLng != null && (
            <a className="btn-outline h-10 w-fit" target="_blank" rel="noopener" href={`https://www.google.com/maps?q=${e.entregaLat},${e.entregaLng}`}>
              Ver local da entrega no mapa{e.entregaPrecisao ? ` (±${Math.round(e.entregaPrecisao)} m)` : ""}</a>
          )}
          {e.status === "entregue" && e.entregaLat == null && <p className="text-xs text-graphite-muted">O celular do entregador não enviou a localização.</p>}
        </section>
      </div>
    </>
  );
}
