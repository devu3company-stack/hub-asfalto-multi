"use client";
import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { EmailConteudo, Marca } from "@/lib/email/template";
import type { Segmento } from "@/lib/email/contatos";
import ConteudoFields from "../ConteudoFields";
import { contarPublico, salvarCampanha } from "../actions";

function Botao({ acao, children, variante = "outline" }: { acao: string; children: React.ReactNode; variante?: "outline" | "primary" }) {
  const { pending } = useFormStatus();
  return <button name="acao" value={acao} disabled={pending} className={variante === "primary" ? "btn-primary" : "btn-outline"}>{children}</button>;
}

const ORIGENS = [["shopify", "Shopify"], ["omie", "Omie"], ["whatsapp", "WhatsApp"], ["planilha", "Planilha"], ["formulario", "Formulário do site"], ["manual", "Manual"]];

export default function CampanhaForm({ loja, marca, id, nome, assunto, conteudo, segmento, tags }: {
  loja: string; marca: Marca; id?: string; nome: string; assunto: string; conteudo: EmailConteudo; segmento: Segmento; tags: string[];
}) {
  const [state, action] = useFormState(salvarCampanha, undefined);
  const [publico, setPublico] = useState<number | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const recontar = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (ref.current) setPublico(await contarPublico(new FormData(ref.current)));
    }, 400);
  };
  useEffect(recontar, []);

  return (
    <form ref={ref} action={action} onChange={(e) => { if ((e.target as HTMLElement).closest("[data-segmento]")) recontar(); }} className="flex flex-col gap-4">
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="loja" value={loja} />
      <input type="hidden" name="tz" value={typeof window === "undefined" ? "" : String(new Date().getTimezoneOffset())} suppressHydrationWarning />
      <section className="card flex flex-col gap-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="assunto" className="label">Assunto</label>
            <input id="assunto" name="assunto" defaultValue={assunto} required className="input" placeholder="{{primeiro_nome}}, novidade na Asfalto Multi" />
          </div>
          <div>
            <label htmlFor="nome" className="label">Nome interno <span className="text-graphite-muted font-normal">(só aparece no hub)</span></label>
            <input id="nome" name="nome" defaultValue={nome} className="input" placeholder="Promoção de dezembro" />
          </div>
        </div>
        <ConteudoFields inicial={conteudo} marca={marca} />
      </section>

      <section className="card flex flex-col gap-3" data-segmento>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display font-bold text-lg">Público</h2>
          <span className="text-sm font-semibold" aria-live="polite">{publico === null ? "Contando..." : `${publico.toLocaleString("pt-BR")} contato(s)`}</span>
        </div>
        <fieldset>
          <legend className="label">Origem <span className="text-graphite-muted font-normal">(nenhuma marcada = todas)</span></legend>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {ORIGENS.map(([v, l]) => (
              <label key={v} className="flex items-center gap-2 text-sm min-h-[44px]">
                <input type="checkbox" name="origens" value={v} defaultChecked={segmento.origens?.includes(v as never)} className="w-4 h-4 accent-[#C25A14]" /> {l}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="compras" className="label">Compras</label>
            <select id="compras" name="compras" defaultValue={segmento.compras ?? "todos"} className="input">
              <option value="todos">Todos</option>
              <option value="compraram">Já compraram</option>
              <option value="nunca">Nunca compraram</option>
            </select>
          </div>
          <div>
            <label htmlFor="compraUltimosDias" className="label">Compraram nos últimos (dias)</label>
            <input id="compraUltimosDias" name="compraUltimosDias" inputMode="numeric" defaultValue={segmento.compraUltimosDias ?? ""} className="input" />
          </div>
          <div>
            <label htmlFor="semCompraDias" className="label">Sem comprar há mais de (dias)</label>
            <input id="semCompraDias" name="semCompraDias" inputMode="numeric" defaultValue={segmento.semCompraDias ?? ""} className="input" />
          </div>
          <div>
            <label htmlFor="uf" className="label">Estado (UF)</label>
            <input id="uf" name="uf" maxLength={2} defaultValue={segmento.uf ?? ""} className="input uppercase" placeholder="SP" />
          </div>
        </div>
        <div>
          <label htmlFor="tags" className="label">Tags <span className="text-graphite-muted font-normal">(separadas por vírgula; qualquer uma)</span></label>
          <input id="tags" name="tags" defaultValue={segmento.tags?.join(", ") ?? ""} className="input" list="tags-lista" />
          <datalist id="tags-lista">{tags.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <p className="text-xs text-graphite-muted">Descadastrados e e-mails inválidos nunca entram.</p>
      </section>

      <section className="card flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="emailTeste" className="label">Enviar teste para</label>
            <input id="emailTeste" name="emailTeste" type="email" className="input w-72" placeholder="voce@asfaltomulti.com.br" />
          </div>
          <Botao acao="teste">Enviar teste</Botao>
          <Botao acao="salvar">Salvar rascunho</Botao>
        </div>
        <div className="flex flex-wrap items-end gap-3 pt-3 border-t border-surface-line">
          <div>
            <label htmlFor="agendadaPara" className="label">Agendar para</label>
            <input id="agendadaPara" name="agendadaPara" type="datetime-local" className="input w-64" />
          </div>
          <Botao acao="agendar">Agendar</Botao>
          <Botao acao="enviar" variante="primary">Enviar agora</Botao>
        </div>
        {state?.message && <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-[#1E6B34]" : "text-[#A0261C]"}`}>{state.message}</p>}
        <p className="text-xs text-graphite-muted">Os e-mails saem aos poucos, dentro do limite por hora do seu servidor de e-mail.</p>
      </section>
    </form>
  );
}
