import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getConfig } from "@/lib/integrations/store";
import { chaveLoja, lojaValida, nomeLoja } from "@/lib/lojas";
import LojaTabs from "@/components/LojaTabs";
import { semMedidas, type Produto } from "@/lib/produtos";
import { PageHeader, Badge, brl } from "@/components/ui";
import ActionForm from "../transportadoras/ActionForm";
import { excluirProduto, importar, salvarProduto, sincronizar, usarMedidasOmie } from "./actions";

export const dynamic = "force-dynamic";

const br = (n: number) => (n ? String(n).replace(".", ",") : "");
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function Campos({ p }: { p?: Produto }) {
  const c = (name: keyof Produto, label: string, ph = "", cls = "") => (
    <div className={cls}>
      <label htmlFor={`${String(name)}${p ? "_e" : ""}`} className="block text-xs font-medium text-graphite mb-1">{label}</label>
      <input id={`${String(name)}${p ? "_e" : ""}`} name={String(name)} placeholder={ph}
        defaultValue={p ? (typeof p[name] === "number" ? br(p[name] as number) : String(p[name] ?? "")) : ""}
        inputMode={name === "descricao" || name === "codigo" ? undefined : "decimal"} className="input h-10 px-3" />
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {c("descricao", "Descrição", "Asfalto frio saco 25 kg", "col-span-2 sm:col-span-4")}
        {c("codigo", "Código", "AF25", "")}
        {c("valorUnit", "Valor un. R$", "89,90")}
        {c("pesoKg", "Peso bruto (kg)", "25")}
        {c("alturaCm", "Altura (cm)", "12")}
        {c("larguraCm", "Largura (cm)", "40")}
        {c("comprimentoCm", "Profundidade (cm)", "60")}
        {p && (
          <div className="col-span-2">
            <label htmlFor="ativo_e" className="block text-xs font-medium text-graphite mb-1">Situação</label>
            <select id="ativo_e" name="ativo" defaultValue={p.ativo ? "sim" : "nao"} className="input h-10 px-3">
              <option value="sim">Ativo (aparece na cotação)</option>
              <option value="nao">Inativo</option>
            </select>
          </div>
        )}
      </div>
      <p className="text-xs font-semibold text-graphite">Estoque e paletização (opcional)</p>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {c("estoqueMinimo", "Estoque mínimo (alerta)", "20")}
        {c("paleteQtd", "Unidades por palete", "48")}
        {c("paletePesoKg", "Peso do palete (kg)", "1.225")}
        {c("paleteAlturaCm", "Altura palete (cm)", "110")}
        {c("paleteLarguraCm", "Largura palete (cm)", "100")}
        {c("paleteComprimentoCm", "Compr. palete (cm)", "120")}
      </div>
      <p className="text-xs text-graphite-muted">Com paletização, 100 unidades viram 2 paletes cheios + 4 soltas na cotação. Peso do palete em branco = unidades × peso.</p>
    </div>
  );
}

export default async function Produtos({ searchParams }: { searchParams: { q?: string; falta?: string; editar?: string; loja?: string } }) {
  const user = await requireModule("fretes");
  const admin = can(user.role, "integracoes", "edit");
  const loja = lojaValida(searchParams.loja);
  const [todos, omie, shopify] = await Promise.all([
    db.query.produtos.findMany({ where: eq(schema.produtos.loja, loja), orderBy: asc(schema.produtos.descricao) }),
    getConfig(chaveLoja("omie", loja)),
    getConfig(chaveLoja("shopify", loja)),
  ]);
  const q = norm(searchParams.q ?? "");
  const lista = todos.filter((p) =>
    (!q || norm(`${p.codigo ?? ""} ${p.descricao}`).includes(q)) && (!searchParams.falta || semMedidas(p)));
  const faltando = todos.filter((p) => p.ativo && semMedidas(p)).length;
  const editando = admin && searchParams.editar ? todos.find((p) => p.id === searchParams.editar) : undefined;

  return (
    <>
      <PageHeader title="Produtos" subtitle="Peso e medidas da embalagem de cada produto, usados na cotação de frete.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gray">{todos.length} produto(s)</Badge>
          {faltando > 0 && <Badge tone="orange">{faltando} sem medidas</Badge>}
          <LojaTabs atual={loja} path="/fretes/produtos" />
          <Link href="/fretes" className="btn-outline h-9 px-4">Voltar para cotação</Link>
        </div>
      </PageHeader>

      {editando && (
        <section className="card flex flex-col gap-3 ring-2 ring-brand">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display font-bold text-lg">Editar: {editando.descricao}</h2>
            <Link href={`/fretes/produtos?loja=${loja}`} className="text-sm text-graphite min-h-[44px] inline-flex items-center">Cancelar</Link>
          </div>
          {editando.medidasNoHub && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-graphite">
              Peso e medidas foram ajustados aqui e não são trocados pelos do Omie.
              <form action={usarMedidasOmie}><input type="hidden" name="id" value={editando.id} />
                <button className="text-brand-text font-semibold min-h-[44px]">Voltar a usar os do Omie</button></form>
            </div>
          )}
          <ActionForm action={salvarProduto} label="Salvar produto">
            <input type="hidden" name="id" value={editando.id} />
            <input type="hidden" name="loja" value={loja} />
            <Campos p={editando} />
          </ActionForm>
          {!editando.omieId && !editando.shopifyVariantId && (
            <form action={excluirProduto} className="border-t border-surface-line pt-3">
              <input type="hidden" name="id" value={editando.id} /><input type="hidden" name="loja" value={loja} />
              <button className="text-sm text-[#A0261C] font-semibold min-h-[44px]">Excluir produto</button>
            </form>
          )}
        </section>
      )}

      {admin && (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Trazer produtos · {nomeLoja(loja)}</h2>
            {!omie && !shopify && <p className="text-sm text-graphite">Conecte a Shopify ou o Omie desta loja em Integrações, ou importe a planilha ao lado.</p>}
            <div className="flex flex-wrap gap-3">
              {shopify && (
                <ActionForm action={sincronizar} label="Sincronizar com a Shopify" busy="Sincronizando...">
                  <input type="hidden" name="loja" value={loja} /><input type="hidden" name="fonte" value="shopify" />
                </ActionForm>
              )}
              {omie && (
                <ActionForm action={sincronizar} label="Sincronizar com o Omie" busy="Sincronizando...">
                  <input type="hidden" name="loja" value={loja} /><input type="hidden" name="fonte" value="omie" />
                </ActionForm>
              )}
            </div>
            {shopify && <p className="text-xs text-graphite-muted">Da Shopify vêm nome, SKU, preço e peso. Altura, largura e comprimento: preencha aqui ou crie na Shopify os metacampos de variante custom.altura, custom.largura e custom.comprimento (em cm).</p>}
            <div className="border-t border-surface-line pt-3">
              <ActionForm action={sincronizar} label="Atualizar estoque pelo Omie" busy="Atualizando...">
                <input type="hidden" name="loja" value={loja} /><input type="hidden" name="fonte" value="estoque" />
                {shopify && (
                  <label className="flex items-center gap-2 text-sm min-h-[44px]">
                    <input type="checkbox" name="enviarShopify" value="sim" className="w-4 h-4 accent-[#C25A14]" /> Enviar o saldo para a Shopify também
                  </label>
                )}
              </ActionForm>
              <p className="text-xs text-graphite-muted mt-1">Casa os produtos pelo código/SKU. O hub também faz isso sozinho a cada hora, se ligado em Pedidos.</p>
            </div>
          </section>
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">Importar planilha</h2>
            <p className="text-sm text-graphite">
              .xlsx ou .csv com as colunas Código, Descrição, Peso Bruto, Altura, Largura, Profundidade e, se quiser, Preço Unitário. Produtos que já existem são atualizados pelo código.{" "}
              <a href="/modelo-produtos.csv" download className="font-semibold text-brand-text underline">Baixar modelo</a>
            </p>
            <ActionForm action={importar} label="Importar" busy="Importando..." reset>
              <input type="hidden" name="loja" value={loja} />
              <div>
                <label htmlFor="arquivo" className="label">Planilha</label>
                <input id="arquivo" name="arquivo" type="file" accept=".xlsx,.csv,text/csv" className="text-sm" />
              </div>
            </ActionForm>
          </section>
        </div>
      )}

      <section className="card flex flex-col gap-3">
        <form className="flex flex-wrap items-end gap-3" role="search">
          <input type="hidden" name="loja" value={loja} />
          <div className="grow max-w-sm">
            <label htmlFor="q" className="label">Buscar</label>
            <input id="q" name="q" defaultValue={searchParams.q} className="input" placeholder="Código ou descrição" />
          </div>
          <label className="flex items-center gap-2 text-sm min-h-[44px]">
            <input type="checkbox" name="falta" value="1" defaultChecked={Boolean(searchParams.falta)} className="w-4 h-4 accent-[#C25A14]" />
            Só sem medidas
          </label>
          <button className="btn-outline">Filtrar</button>
        </form>

        {lista.length === 0 ? (
          <p className="text-sm text-graphite-muted">{todos.length ? "Nenhum produto com esse filtro." : "Nenhum produto ainda. Traga do Omie, importe a planilha ou cadastre abaixo."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-graphite-muted">
                  <th className="py-2 px-2 border-b border-surface-line">Produto</th>
                  <th className="py-2 px-2 border-b border-surface-line text-right">Peso</th>
                  <th className="py-2 px-2 border-b border-surface-line">A × L × P (cm)</th>
                  <th className="py-2 px-2 border-b border-surface-line">Palete</th>
                  <th className="py-2 px-2 border-b border-surface-line text-right">Estoque</th>
                  <th className="py-2 px-2 border-b border-surface-line text-right">Valor</th>
                  <th className="py-2 px-2 border-b border-surface-line">Origem</th>
                  {admin && <th className="py-2 px-2 border-b border-surface-line"><span className="sr-only">Ações</span></th>}
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, 300).map((p) => (
                  <tr key={p.id} className="border-b border-[#F1EFEE] last:border-0">
                    <td className="py-3 px-2">
                      <span className="font-medium">{p.descricao}</span>
                      {p.codigo && <span className="block text-xs text-graphite-muted">{p.codigo}</span>}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums">{p.pesoKg ? `${br(p.pesoKg)} kg` : "—"}</td>
                    <td className="py-3 px-2 tabular-nums">
                      {semMedidas(p) ? <Badge tone="orange">Faltam medidas</Badge> : `${br(p.alturaCm)} × ${br(p.larguraCm)} × ${br(p.comprimentoCm)}`}
                    </td>
                    <td className="py-3 px-2">{p.paleteQtd ? `${p.paleteQtd} un.` : "—"}</td>
                    <td className="py-3 px-2 text-right tabular-nums">
                      {p.estoque === null ? "—" : p.estoqueMinimo > 0 && p.estoque <= p.estoqueMinimo ? <Badge tone="red">{br(p.estoque) || "0"}</Badge> : br(p.estoque) || "0"}
                    </td>
                    <td className="py-3 px-2 text-right tabular-nums">{p.valorUnit ? brl(p.valorUnit) : "—"}</td>
                    <td className="py-3 px-2 text-xs text-graphite-muted">
                      {p.shopifyVariantId ? "Shopify" : p.omieId ? "Omie" : "Hub"}{p.medidasNoHub && (p.omieId || p.shopifyVariantId) ? " (medidas do hub)" : ""}{!p.ativo && " · inativo"}
                    </td>
                    {admin && (
                      <td className="py-2 px-2">
                        <Link href={`/fretes/produtos?loja=${loja}&editar=${p.id}`} className="text-sm font-semibold text-brand-text px-2 min-h-[44px] inline-flex items-center">Editar</Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length > 300 && <p className="text-xs text-graphite-muted pt-2">Mostrando 300 de {lista.length}. Use a busca.</p>}
          </div>
        )}
      </section>

      {admin && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Cadastrar produto à mão</h2>
          <ActionForm action={salvarProduto} label="Cadastrar" reset>
            <input type="hidden" name="loja" value={loja} />
            <Campos />
          </ActionForm>
        </section>
      )}
    </>
  );
}
