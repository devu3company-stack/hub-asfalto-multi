"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { cotarFrete, enviarCotacaoWhatsApp } from "./actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function Btn({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? busy : label}</button>;
}

const FIELDS = [
  { k: "descricao", label: "Produto", type: "text", ph: "Asfalto frio 25 kg", cls: "col-span-2 sm:col-span-3" },
  { k: "quantidade", label: "Qtd.", type: "number", ph: "40" },
  { k: "peso", label: "Peso un. (kg)", type: "text", ph: "25" },
  { k: "altura", label: "Alt. (cm)", type: "text", ph: "12" },
  { k: "largura", label: "Larg. (cm)", type: "text", ph: "40" },
  { k: "comprimento", label: "Comp. (cm)", type: "text", ph: "60" },
  { k: "valor", label: "Valor un. (R$)", type: "text", ph: "89,90" },
] as const;

export type ProdutoOpcao = {
  id: string; descricao: string; codigo: string | null; pesoKg: number; alturaCm: number; larguraCm: number;
  comprimentoCm: number; valorUnit: number; paleteQtd: number; completo: boolean;
};

const fmt = (n: number) => (n ? String(n).replace(".", ",") : "");

function Linha({ i, produtos }: { i: number; produtos: ProdutoOpcao[] }) {
  const [pid, setPid] = useState("");
  const p = produtos.find((x) => x.id === pid);
  return (
    <fieldset className="flex flex-col gap-2 p-3 rounded-xl bg-[#F8F7F6]">
      <legend className="sr-only">Item {i + 1}</legend>
      {produtos.length > 0 && (
        <div>
          <label htmlFor={`produto_${i}`} className="block text-xs font-medium text-graphite mb-1">Produto cadastrado</label>
          <select id={`produto_${i}`} name={`produto_${i}`} value={pid} onChange={(e) => setPid(e.target.value)} className="input h-10 px-3">
            <option value="">Item avulso (digitar medidas)</option>
            {produtos.map((x) => (
              <option key={x.id} value={x.id} disabled={!x.completo}>
                {x.codigo ? `${x.codigo} · ` : ""}{x.descricao}{x.completo ? "" : " (sem medidas)"}
              </option>
            ))}
          </select>
        </div>
      )}
      {p ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <div>
            <label htmlFor={`quantidade_${i}`} className="block text-xs font-medium text-graphite mb-1">Quantidade</label>
            <input id={`quantidade_${i}`} name={`quantidade_${i}`} type="number" min={1} required className="input h-10 px-3" />
          </div>
          <div>
            <label htmlFor={`valor_${i}`} className="block text-xs font-medium text-graphite mb-1">Valor un. (R$)</label>
            <input id={`valor_${i}`} name={`valor_${i}`} inputMode="decimal" defaultValue={fmt(p.valorUnit)} className="input h-10 px-3" />
          </div>
          <p className="col-span-2 text-xs text-graphite-muted pb-2">
            {fmt(p.pesoKg)} kg · {fmt(p.alturaCm)} × {fmt(p.larguraCm)} × {fmt(p.comprimentoCm)} cm
            {p.paleteQtd > 0 && ` · palete de ${p.paleteQtd}`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-6 lg:grid-cols-9 gap-2">
          {FIELDS.map((f) => (
            <div key={f.k} className={"cls" in f ? f.cls : ""}>
              <label htmlFor={`${f.k}_${i}`} className="block text-xs font-medium text-graphite mb-1">{f.label}</label>
              <input id={`${f.k}_${i}`} name={`${f.k}_${i}`} type={f.type} inputMode={f.type === "text" && f.k !== "descricao" ? "decimal" : undefined}
                placeholder={f.ph} className="input h-10 px-3" />
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

export default function CotacaoForm({ loja, cepOrigem, podeEnviarWhats, produtos = [] }: { loja: string; cepOrigem: string; podeEnviarWhats: boolean; produtos?: ProdutoOpcao[] }) {
  const [linhas, setLinhas] = useState(1);
  const [state, action] = useFormState(cotarFrete, undefined);
  const [envio, enviar] = useFormState(enviarCotacaoWhatsApp, undefined);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="card flex flex-col gap-4">
        <input type="hidden" name="loja" value={loja} />
        <input type="hidden" name="linhas" value={linhas} />
        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="cepOrigem" className="label">CEP de origem</label>
            <input id="cepOrigem" name="cepOrigem" defaultValue={cepOrigem.replace(/^(\d{5})(\d{3})$/, "$1-$2")} inputMode="numeric" required className="input" placeholder="13800-000" />
          </div>
          <div>
            <label htmlFor="cepDestino" className="label">CEP de destino</label>
            <input id="cepDestino" name="cepDestino" inputMode="numeric" required className="input" placeholder="00000-000" />
          </div>
          <div>
            <label htmlFor="cliente" className="label">Cliente <span className="text-graphite-muted font-normal">(opcional)</span></label>
            <input id="cliente" name="cliente" className="input" placeholder="Nome do cliente" />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {Array.from({ length: linhas }).map((_, i) => <Linha key={i} i={i} produtos={produtos} />)}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setLinhas((n) => Math.min(n + 1, 20))} className="text-sm font-semibold text-brand-text min-h-[44px]">+ Adicionar item</button>
            {linhas > 1 && <button type="button" onClick={() => setLinhas((n) => n - 1)} className="text-sm text-graphite min-h-[44px]">Remover último</button>}
          </div>
          <p className="text-xs text-graphite-muted">Produto cadastrado: o hub usa o peso, as medidas e a paletização do cadastro. Item avulso: peso e medidas por unidade (volume embalado).</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Btn label="Cotar frete" busy="Cotando..." />
          {state && !state.ok && <p role="alert" className="text-sm text-[#A0261C]">{state.message}</p>}
        </div>
      </form>

      {state?.ok && (
        <section className="card flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display font-bold text-lg">Opções de frete</h2>
            <span className="text-sm text-graphite-muted">{state.resumo}</span>
          </div>
          {state.erros.map((e) => <p key={e} role="alert" className="text-sm text-[#A0261C]">{e}</p>)}
          {state.opcoes.length === 0 ? (
            state.erros.length ? null : <p className="text-sm text-graphite-muted">Nenhuma transportadora atendeu essa cotação.</p>
          ) : (
            <form action={enviar} className="flex flex-col gap-3">
              <input type="hidden" name="cotacaoId" value={state.id} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-graphite-muted">
                      {podeEnviarWhats && <th className="py-2 px-2 border-b border-surface-line w-10"><span className="sr-only">Escolher</span></th>}
                      <th className="py-2 px-2 border-b border-surface-line">Transportadora</th>
                      <th className="py-2 px-2 border-b border-surface-line">Serviço</th>
                      <th className="py-2 px-2 border-b border-surface-line">Prazo (dias úteis)</th>
                      <th className="py-2 px-2 border-b border-surface-line text-right">Frete</th>
                      <th className="py-2 px-2 border-b border-surface-line">Fonte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.opcoes.map((o, i) => (
                      <tr key={i} className={`border-b border-[#F1EFEE] last:border-0 ${i === 0 ? "bg-[#F3FAF4]" : ""}`}>
                        {podeEnviarWhats && (
                          <td className="py-3 px-2">
                            <input type="radio" name="opcao" value={i} defaultChecked={i === 0} aria-label={`Escolher ${o.transportadora}`} className="w-4 h-4 accent-[#C25A14]" />
                          </td>
                        )}
                        <td className="py-3 px-2 font-medium">{o.transportadora}{i === 0 && <span className="badge bg-[#E3F1E6] text-[#1E6B34] ml-2">Mais barato</span>}</td>
                        <td className="py-3 px-2">
                          {o.servico}{o.observacao && <span className="block text-xs text-graphite-muted">{o.observacao}</span>}
                          {o.detalhe && (
                            <details className="mt-1 text-xs text-graphite">
                              <summary className="cursor-pointer text-brand-text font-semibold">Ver composição</summary>
                              <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 tabular-nums">
                                <dt>Peso real</dt><dd className="text-right">{o.detalhe.pesoReal.toLocaleString("pt-BR")} kg</dd>
                                <dt>Peso cubado</dt><dd className="text-right">{o.detalhe.pesoCubado.toLocaleString("pt-BR")} kg</dd>
                                <dt className="font-semibold">Peso taxado</dt><dd className="text-right font-semibold">{o.detalhe.pesoTaxado.toLocaleString("pt-BR")} kg</dd>
                                <dt>Frete-peso</dt><dd className="text-right">{brl(o.detalhe.fretePeso)}</dd>
                                <dt>Ad valorem</dt><dd className="text-right">{brl(o.detalhe.adValorem)}</dd>
                                <dt>GRIS</dt><dd className="text-right">{brl(o.detalhe.gris)}</dd>
                                <dt>Pedágio</dt><dd className="text-right">{brl(o.detalhe.pedagio)}</dd>
                                <dt>Taxas</dt><dd className="text-right">{brl(o.detalhe.taxas)}</dd>
                                <dt>Subtotal{o.detalhe.minimoAplicado ? " (mínimo)" : ""}</dt><dd className="text-right">{brl(o.detalhe.subtotal)}</dd>
                                <dt>ICMS</dt><dd className="text-right">{brl(o.detalhe.icms)}</dd>
                              </dl>
                            </details>
                          )}
                        </td>
                        <td className="py-3 px-2">{o.prazoDias ?? "—"}</td>
                        <td className="py-3 px-2 text-right font-semibold tabular-nums">{brl(o.valor)}</td>
                        <td className="py-3 px-2 text-xs text-graphite-muted">{o.fonte}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {podeEnviarWhats && (
                <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-surface-line">
                  <div>
                    <label htmlFor="numero" className="label">Enviar a opção marcada para o WhatsApp</label>
                    <input id="numero" name="numero" inputMode="tel" placeholder="5519999999999" className="input w-64" />
                  </div>
                  <Btn label="Enviar ao cliente" busy="Enviando..." />
                  {envio?.message && <p role="status" className={`text-sm ${envio.ok ? "text-[#1E6B34]" : "text-[#A0261C]"}`}>{envio.message}</p>}
                </div>
              )}
            </form>
          )}
        </section>
      )}
    </div>
  );
}
