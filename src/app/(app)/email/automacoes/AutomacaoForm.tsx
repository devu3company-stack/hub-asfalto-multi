"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { AutomacaoChave, AutomacaoConfig, Passo } from "@/lib/email/modelos";
import type { Marca } from "@/lib/email/template";
import ConteudoFields from "../ConteudoFields";
import { salvarAutomacaoForm, testarPasso } from "../actions";

function Salvar() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? "Salvando..." : "Salvar automação"}</button>;
}

function Teste({ chave, i, loja }: { chave: AutomacaoChave; i: number; loja: string }) {
  const [st, act] = useFormState(testarPasso, undefined);
  return (
    <form action={act} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="chave" value={chave} /><input type="hidden" name="passo" value={i} /><input type="hidden" name="loja" value={loja} />
      <input name="emailTeste" type="email" aria-label="E-mail para teste" placeholder="e-mail para teste" className="input h-10 w-60" />
      <button className="btn-outline h-10">Testar e-mail salvo</button>
      {st?.message && <span role="status" className={`text-sm ${st.ok ? "text-[#1E6B34]" : "text-[#A0261C]"}`}>{st.message}</span>}
    </form>
  );
}

export default function AutomacaoForm({ loja, marca, chave, ativo, config, padrao, variaveis }: {
  loja: string; marca: Marca; chave: AutomacaoChave; ativo: boolean; config: AutomacaoConfig; padrao: AutomacaoConfig; variaveis: string[];
}) {
  const [state, action] = useFormState(salvarAutomacaoForm, undefined);
  const [passos, setPassos] = useState<Passo[]>(config.passos);
  const [versao, setVersao] = useState(0);

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="chave" value={chave} />
        <input type="hidden" name="loja" value={loja} />
        <input type="hidden" name="passos" value={passos.length} />
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor={`ativo_${chave}`} className="label">Situação</label>
            <select id={`ativo_${chave}`} name="ativo" defaultValue={ativo ? "sim" : "nao"} className="input w-48">
              <option value="sim">Ligada</option><option value="nao">Desligada</option>
            </select>
          </div>
          {chave === "reativacao" && (
            <>
              <div>
                <label htmlFor="diasSemCompra" className="label">Sem comprar há (dias)</label>
                <input id="diasSemCompra" name="diasSemCompra" inputMode="numeric" defaultValue={config.diasSemCompra ?? 120} className="input w-40" />
              </div>
              <div>
                <label htmlFor="intervaloDias" className="label">Não repetir antes de (dias)</label>
                <input id="intervaloDias" name="intervaloDias" inputMode="numeric" defaultValue={config.intervaloDias ?? 90} className="input w-40" />
              </div>
            </>
          )}
        </div>

        {passos.map((p, i) => {
          const dias = p.esperaHoras >= 24 && p.esperaHoras % 24 === 0;
          return (
            <fieldset key={`${versao}-${i}`} className="flex flex-col gap-3 p-4 rounded-xl bg-[#F8F7F6]">
              <legend className="font-display font-bold px-1">E-mail {i + 1}</legend>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label htmlFor={`p${i}_espera_${chave}`} className="label">{chave === "carrinho" ? "Enviar depois de abandonar" : chave === "poscompra" ? "Enviar depois da compra" : "Enviar depois de entrar na regra"}</label>
                  <div className="flex gap-2">
                    <input id={`p${i}_espera_${chave}`} name={`p${i}_espera`} inputMode="numeric" defaultValue={dias ? p.esperaHoras / 24 : p.esperaHoras} className="input w-24" />
                    <select name={`p${i}_unidade`} defaultValue={dias ? "dias" : "horas"} aria-label="Unidade" className="input w-28">
                      <option value="horas">horas</option><option value="dias">dias</option>
                    </select>
                  </div>
                </div>
                <div className="grow min-w-[240px]">
                  <label htmlFor={`p${i}_assunto_${chave}`} className="label">Assunto</label>
                  <input id={`p${i}_assunto_${chave}`} name={`p${i}_assunto`} defaultValue={p.assunto} required className="input" />
                </div>
                {passos.length > 1 && (
                  <button type="button" onClick={() => { setPassos(passos.filter((_, j) => j !== i)); setVersao((v) => v + 1); }}
                    className="text-sm text-[#A0261C] min-h-[44px]">Remover</button>
                )}
              </div>
              <ConteudoFields inicial={p.conteudo} p={`p${i}_`} variaveis={variaveis} marca={marca} />
            </fieldset>
          );
        })}

        <div className="flex flex-wrap items-center gap-3">
          <Salvar />
          {passos.length < 5 && (
            <button type="button" className="btn-outline" onClick={() => setPassos([...passos, { ...padrao.passos[padrao.passos.length - 1], esperaHoras: (passos[passos.length - 1]?.esperaHoras ?? 0) + 48 }])}>
              + Adicionar e-mail
            </button>
          )}
          <button type="button" className="text-sm text-graphite min-h-[44px]" onClick={() => { setPassos(padrao.passos); setVersao((v) => v + 1); }}>
            Voltar ao modelo pronto
          </button>
          {state?.message && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-[#1E6B34]" : "text-[#A0261C]"}`}>{state.message}</p>}
        </div>
      </form>
      <div className="flex flex-col gap-2">
        {config.passos.map((_, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm"><span className="w-20 text-graphite">E-mail {i + 1}</span><Teste chave={chave} i={i} loja={loja} /></div>
        ))}
      </div>
    </div>
  );
}
