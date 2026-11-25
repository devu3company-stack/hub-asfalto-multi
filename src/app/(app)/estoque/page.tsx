import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getConfig } from "@/lib/integrations/store";
import { chaveLoja, lojaValida, nomeLoja } from "@/lib/lojas";
import { omieDestino } from "@/lib/lojas-server";
import { PageHeader, Badge, Stat } from "@/components/ui";
import LojaTabs from "@/components/LojaTabs";
import ActionForm from "@/components/ActionForm";
import { sincronizar } from "../fretes/produtos/actions";

export const dynamic = "force-dynamic";
const n = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const quando = (d: Date | null) => d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export default async function Estoque({ searchParams }: { searchParams: { loja?: string; baixo?: string } }) {
  const user = await requireModule("estoque");
  const admin = can(user.role, "integracoes", "edit");
  const loja = lojaValida(searchParams.loja);
  const [prods, destino, shopify] = await Promise.all([
    db.query.produtos.findMany({ where: eq(schema.produtos.loja, loja), orderBy: asc(schema.produtos.descricao) }),
    omieDestino(loja), getConfig(chaveLoja("shopify", loja)),
  ]);
  const omie = await getConfig(chaveLoja("omie", destino));
  const ativos = prods.filter((p) => p.ativo);
  const baixos = ativos.filter((p) => p.estoque !== null && p.estoqueMinimo > 0 && p.estoque <= p.estoqueMinimo);
  const zerados = ativos.filter((p) => p.estoque !== null && p.estoque <= 0);
  const lista = searchParams.baixo ? baixos : ativos;
  const ultima = ativos.reduce<Date | null>((m, p) => (p.estoqueEm && (!m || p.estoqueEm > m) ? p.estoqueEm : m), null);

  return (
    <>
      <PageHeader title="Estoque" subtitle={`Saldo do Omie da ${nomeLoja(destino)} para os produtos da ${nomeLoja(loja)}`}>
        <LojaTabs atual={loja} path="/estoque" />
      </PageHeader>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Produtos ativos" value={String(ativos.length)} />
        <Stat label="Abaixo do mínimo" value={String(baixos.length)} tone={baixos.length ? "red" : "default"} />
        <Stat label="Zerados" value={String(zerados.length)} tone={zerados.length ? "orange" : "default"} />
        <Stat label="Última atualização" value={quando(ultima)} />
      </div>
      {!omie ? <div className="card text-sm text-graphite">Conecte o Omie em Integrações para ver o estoque.</div> : admin && (
        <div className="card flex flex-wrap items-center justify-between gap-3">
          <ActionForm action={sincronizar} label="Atualizar agora" busy="Atualizando..." className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="loja" value={loja} /><input type="hidden" name="fonte" value="estoque" />
            {shopify && <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" name="enviarShopify" value="sim" defaultChecked className="w-4 h-4 accent-[#C25A14]" /> Enviar para a Shopify</label>}
          </ActionForm>
          <Link href={`/pedidos?loja=${loja}`} className="text-sm text-brand-text font-semibold">Atualização automática: em Pedidos › Configuração</Link>
        </div>
      )}
      <section className="card flex flex-col gap-3">
        <div className="flex gap-2 text-sm">
          <a href={`/estoque?loja=${loja}`} className={`px-3 min-h-[36px] inline-flex items-center rounded-full border ${!searchParams.baixo ? "bg-graphite-dark text-white" : "border-surface-line"}`}>Todos</a>
          <a href={`/estoque?loja=${loja}&baixo=1`} className={`px-3 min-h-[36px] inline-flex items-center rounded-full border ${searchParams.baixo ? "bg-graphite-dark text-white" : "border-surface-line"}`}>Abaixo do mínimo</a>
        </div>
        {lista.length === 0 ? <p className="text-sm text-graphite-muted">{prods.length ? "Nada aqui." : "Nenhum produto. Traga os produtos em Fretes › Produtos."}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-graphite-muted">
                <th className="py-2 px-2 border-b border-surface-line">Produto</th><th className="py-2 px-2 border-b border-surface-line text-right">Saldo</th>
                <th className="py-2 px-2 border-b border-surface-line text-right">Mínimo</th><th className="py-2 px-2 border-b border-surface-line">Situação</th>
              </tr></thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className="border-b border-[#F1EFEE] last:border-0">
                    <td className="py-3 px-2"><span className="font-medium">{p.descricao}</span>{p.codigo && <span className="block text-xs text-graphite-muted">{p.codigo}</span>}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{p.estoque === null ? "—" : n(p.estoque)}</td>
                    <td className="py-3 px-2 text-right tabular-nums">{p.estoqueMinimo ? n(p.estoqueMinimo) : "—"}</td>
                    <td className="py-3 px-2">{p.estoque === null ? <Badge tone="gray">Sem código no Omie</Badge> : p.estoque <= 0 ? <Badge tone="red">Zerado</Badge>
                      : p.estoqueMinimo > 0 && p.estoque <= p.estoqueMinimo ? <Badge tone="orange">Baixo</Badge> : <Badge tone="green">OK</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-graphite-muted">O estoque mínimo de cada produto é definido em Fretes › Produtos › Editar.</p>
      </section>
    </>
  );
}
