import { and, desc, eq, sql } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getSetting } from "@/lib/settings";
import { getConfig } from "@/lib/integrations/store";
import { chaveLoja, LOJAS, lojaValida, nomeLoja } from "@/lib/lojas";
import { omieDestino } from "@/lib/lojas-server";
import { contasECategorias } from "@/lib/pedidos";
import { PageHeader, Badge, Stat, brl } from "@/components/ui";
import LojaTabs from "@/components/LojaTabs";
import ActionForm from "@/components/ActionForm";
import { enviar, ignorar, importar, registrarWebhooks, salvarConfig, salvarDocumento } from "./actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { tone: "gray" | "orange" | "green" | "red"; label: string }> = {
  pendente: { tone: "orange", label: "Pendente" }, enviado: { tone: "green", label: "No Omie" },
  erro: { tone: "red", label: "Erro" }, ignorado: { tone: "gray", label: "Ignorado" },
};
const PAG: Record<string, string> = { paid: "Pago", pending: "Aguardando", authorized: "Autorizado", refunded: "Estornado", voided: "Cancelado", partially_paid: "Parcial" };
const fmt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const doc = (d: string | null) => !d ? null : d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

export default async function Pedidos({ searchParams }: { searchParams: { loja?: string; status?: string } }) {
  const user = await requireModule("pedidos");
  const editor = can(user.role, "pedidos", "edit");
  const admin = can(user.role, "integracoes", "edit");
  const loja = lojaValida(searchParams.loja);
  const P = schema.pedidos;
  const filtro = searchParams.status && STATUS[searchParams.status] ? eq(P.status, searchParams.status) : undefined;
  const [lista, [tot], shopify, destino, auto, estoqueAuto, cc, cat] = await Promise.all([
    db.query.pedidos.findMany({ where: and(eq(P.loja, loja), filtro), orderBy: desc(P.criadoNaLoja), limit: 100 }),
    db.select({
      hoje: sql<number>`coalesce(sum(total) filter (where criado_na_loja >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'), 0)::float`,
      mes: sql<number>`coalesce(sum(total) filter (where criado_na_loja >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'), 0)::float`,
      pendentes: sql<number>`count(*) filter (where status = 'pendente')::int`, erros: sql<number>`count(*) filter (where status = 'erro')::int`,
    }).from(P).where(eq(P.loja, loja)),
    getConfig(chaveLoja("shopify", loja)),
    omieDestino(loja),
    getSetting(`pedidos.${loja}.automatico`), getSetting(`estoque.${loja}.automatico`),
    getSetting(`pedidos.${loja}.contaCorrente`), getSetting(`pedidos.${loja}.categoria`),
  ]);
  const listas = admin ? await contasECategorias(loja).catch(() => null) : null;

  return (
    <>
      <PageHeader title="Pedidos" subtitle={`Pedidos da Shopify da ${nomeLoja(loja)} e o envio para o Omie`}>
        <LojaTabs atual={loja} path="/pedidos" />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Vendas hoje" value={brl(tot.hoje)} />
        <Stat label="Vendas no mês" value={brl(tot.mes)} />
        <Stat label="Pendentes" value={String(tot.pendentes)} tone={tot.pendentes ? "orange" : "default"} />
        <Stat label="Com erro" value={String(tot.erros)} tone={tot.erros ? "red" : "default"} />
      </div>

      {!shopify && <div className="card text-sm text-graphite">Conecte a Shopify da {nomeLoja(loja)} em Integrações para os pedidos chegarem aqui.</div>}

      <section className="card flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Filtrar por situação" className="flex flex-wrap gap-2 text-sm">
            {[["", "Todos"], ...Object.entries(STATUS).map(([k, v]) => [k, v.label])].map(([k, l]) => (
              <a key={k} href={`/pedidos?loja=${loja}${k ? `&status=${k}` : ""}`} aria-current={(searchParams.status ?? "") === k ? "page" : undefined}
                className={`px-3 min-h-[36px] inline-flex items-center rounded-full border ${(searchParams.status ?? "") === k ? "bg-graphite-dark text-white border-graphite-dark" : "border-surface-line"}`}>{l}</a>
            ))}
          </nav>
          {editor && shopify && (
            <ActionForm action={importar} label="Trazer pedidos da Shopify" busy="Buscando..." className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="loja" value={loja} />
              <label className="text-sm flex items-center gap-2">últimos <input name="dias" defaultValue="30" inputMode="numeric" className="input h-9 w-16" aria-label="Dias" /> dias</label>
            </ActionForm>
          )}
        </div>
        {lista.length === 0 ? <p className="text-sm text-graphite-muted">Nenhum pedido.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-graphite-muted">
                <th className="py-2 px-2 border-b border-surface-line">Pedido</th><th className="py-2 px-2 border-b border-surface-line">Cliente</th>
                <th className="py-2 px-2 border-b border-surface-line text-right">Total</th><th className="py-2 px-2 border-b border-surface-line">Pagamento</th>
                <th className="py-2 px-2 border-b border-surface-line">Omie</th>{editor && <th className="py-2 px-2 border-b border-surface-line"><span className="sr-only">Ações</span></th>}
              </tr></thead>
              <tbody>
                {lista.map((p) => {
                  const st = STATUS[p.status] ?? STATUS.pendente;
                  return (
                    <tr key={p.id} className="border-b border-[#F1EFEE] last:border-0 align-top">
                      <td className="py-3 px-2"><span className="font-semibold">{p.numero}</span><span className="block text-xs text-graphite-muted">{fmt(p.criadoNaLoja)}</span></td>
                      <td className="py-3 px-2">{p.cliente ?? "—"}<span className="block text-xs text-graphite-muted">{p.email}{p.documento ? ` · ${doc(p.documento)}` : ""}</span></td>
                      <td className="py-3 px-2 text-right tabular-nums">{brl(p.total)}</td>
                      <td className="py-3 px-2">{PAG[p.pagamento ?? ""] ?? p.pagamento ?? "—"}</td>
                      <td className="py-3 px-2">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {p.omieNumero && <span className="block text-xs text-graphite-muted mt-1">Pedido {p.omieNumero}{p.omieDestino && p.omieDestino !== loja ? ` (Omie ${nomeLoja(p.omieDestino)})` : ""}</span>}
                        {p.erro && <span className="block text-xs text-[#A0261C] mt-1 max-w-xs">{p.erro}</span>}
                      </td>
                      {editor && (
                        <td className="py-2 px-2">
                          {p.status !== "enviado" && (
                            <div className="flex flex-col gap-1 items-start">
                              {!p.documento && (
                                <ActionForm action={salvarDocumento} label="Salvar" className="flex items-center gap-2">
                                  <input type="hidden" name="id" value={p.id} />
                                  <input name="documento" aria-label={`CPF ou CNPJ do pedido ${p.numero}`} placeholder="CPF/CNPJ" className="input h-9 w-40" />
                                </ActionForm>
                              )}
                              <div className="flex gap-1">
                                {p.status !== "ignorado" && <form action={enviar}><input type="hidden" name="id" value={p.id} /><button className="text-sm font-semibold text-brand-text px-2 min-h-[44px]">{p.status === "erro" ? "Reenviar" : "Enviar ao Omie"}</button></form>}
                                <form action={ignorar}><input type="hidden" name="id" value={p.id} /><button className="text-sm text-graphite px-2 min-h-[44px]">{p.status === "ignorado" ? "Voltar" : "Ignorar"}</button></form>
                              </div>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {admin && (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Configuração · {nomeLoja(loja)}</h2>
            <ActionForm action={salvarConfig} label="Salvar configuração">
              <input type="hidden" name="loja" value={loja} />
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="omieDestino" className="label">Os pedidos vão para o Omie da</label>
                  <select id="omieDestino" name="omieDestino" defaultValue={destino} className="input">
                    {LOJAS.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="automatico" className="label">Envio ao Omie</label>
                  <select id="automatico" name="automatico" defaultValue={auto} className="input">
                    <option value="nao">Manual (eu clico em enviar)</option>
                    <option value="sim">Automático quando o pedido for pago</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="contaCorrente" className="label">Conta corrente no Omie</label>
                  {listas?.contas.length ? (
                    <select id="contaCorrente" name="contaCorrente" defaultValue={cc} className="input">
                      <option value="">Escolha...</option>{listas.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  ) : <input id="contaCorrente" name="contaCorrente" defaultValue={cc} className="input" placeholder="Código da conta (nCodCC)" />}
                </div>
                <div>
                  <label htmlFor="categoria" className="label">Categoria de receita</label>
                  {listas?.categorias.length ? (
                    <select id="categoria" name="categoria" defaultValue={cat} className="input">
                      <option value="">Escolha...</option>{listas.categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  ) : <input id="categoria" name="categoria" defaultValue={cat} className="input" placeholder="Ex.: 1.01.01" />}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="estoqueAuto" className="label">Estoque</label>
                  <select id="estoqueAuto" name="estoqueAuto" defaultValue={estoqueAuto} className="input">
                    <option value="nao">Atualizar só quando eu pedir</option>
                    <option value="sim">Atualizar a cada hora (Omie → hub{shopify ? " → Shopify" : ""})</option>
                  </select>
                </div>
              </div>
            </ActionForm>
            <p className="text-xs text-graphite-muted">O SKU de cada produto na Shopify precisa ser igual ao código do produto no Omie. O CPF/CNPJ é lido dos campos extras do checkout (nome com &quot;CPF&quot; ou &quot;CNPJ&quot;), do campo empresa ou da observação do pedido.</p>
          </section>
          {shopify && (
            <section className="card flex flex-col gap-3">
              <h2 className="font-display font-bold text-lg">Webhooks da Shopify</h2>
              <p className="text-sm text-graphite">Cria na Shopify os avisos automáticos de pedido e carrinho para este hub. Faça uma vez por loja.</p>
              <ActionForm action={registrarWebhooks} label="Criar webhooks" busy="Criando...">
                <input type="hidden" name="loja" value={loja} />
              </ActionForm>
              <p className="text-xs text-graphite-muted">O &quot;segredo do webhook&quot; em Integrações deve ser a chave secreta da API (Client secret) do app da Shopify.</p>
            </section>
          )}
        </div>
      )}
    </>
  );
}
