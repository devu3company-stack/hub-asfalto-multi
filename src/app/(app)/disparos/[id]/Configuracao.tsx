"use client";
import { useState } from "react";
import ActionForm from "@/components/ActionForm";
import { RITMOS, RODAPE, porHora, renderizar } from "@/lib/disparos-texto";
import { salvar } from "../actions";

type Numero = { id: string; nome: string; conectado: boolean; hoje: number };
type Dados = {
  id: string; nome: string; mensagens: string[]; rodapeSair: boolean; conferirNumero: boolean; conexoes: string[];
  intervaloMin: number; intervaloMax: number; loteTamanho: number; lotePausa: number; limiteDia: number;
  janelaInicio: number; janelaFim: number; sabado: boolean; domingo: boolean; inicioEm: string; midiaNome: string | null;
};

export default function Configuracao({ d, numeros, exemplo, colunas, bloqueado, total }: { d: Dados; numeros: Numero[]; exemplo: { nome: string | null; empresa: string | null; vars: Record<string, string> }; colunas: string[]; bloqueado: boolean; total: number }) {
  const [msgs, setMsgs] = useState<string[]>(d.mensagens.length ? d.mensagens : [""]);
  const [r, setR] = useState({ intervaloMin: d.intervaloMin, intervaloMax: d.intervaloMax, loteTamanho: d.loteTamanho, lotePausa: d.lotePausa, limiteDia: d.limiteDia });
  const [sel, setSel] = useState<string[]>(d.conexoes);
  const [rodape, setRodape] = useState(d.rodapeSair);
  const [prev, setPrev] = useState(0);
  const vars = ["{{primeiro_nome}}", "{{nome}}", "{{empresa}}", ...colunas.map((c) => `{{${c}}}`)];
  const ph = porHora(r);
  const nums = Math.max(1, sel.length);
  const porDia = Math.min(r.limiteDia * nums, ph * nums * Math.max(1, d.janelaFim - d.janelaInicio));
  const dias = total ? Math.ceil(total / porDia) : 0;

  function inserir(i: number, v: string) {
    setMsgs((m) => m.map((x, j) => (j === i ? `${x}${x && !x.endsWith(" ") && !x.endsWith("\n") ? " " : ""}${v}` : x)));
  }

  return (
    <ActionForm action={salvar} label="Salvar" busy="Salvando...">
      <input type="hidden" name="id" value={d.id} />
      <fieldset disabled={bloqueado} className="flex flex-col gap-4 disabled:opacity-60">
        <section className="card flex flex-col gap-3">
          <div><label htmlFor="nome" className="label">Nome do disparo</label><input id="nome" name="nome" defaultValue={d.nome} className="input" /></div>
          <h2 className="font-display font-bold text-lg">Mensagem</h2>
          <p className="text-sm text-graphite">Escreva 2 ou 3 versões diferentes: o Hub sorteia uma para cada contato. Use <code>{"{Olá|Oi|Bom dia}"}</code> para variar palavras. Textos iguais para muita gente são o que mais derruba número.</p>
          {msgs.map((m, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label htmlFor={`msg-${i}`} className="label mb-0">Versão {i + 1}</label>
                {msgs.length > 1 && <button type="button" onClick={() => setMsgs(msgs.filter((_, j) => j !== i))} className="text-xs text-[#A0261C] font-semibold min-h-[32px]">Remover</button>}
              </div>
              <textarea id={`msg-${i}`} name="mensagem" rows={5} value={m} onChange={(e) => setMsgs(msgs.map((x, j) => (j === i ? e.target.value : x)))} className="input h-auto py-2" />
              <div className="flex flex-wrap gap-1">{vars.map((v) => <button type="button" key={v} onClick={() => inserir(i, v)} className="text-xs px-2 h-7 rounded-full bg-surface hover:bg-brand-soft">{v}</button>)}</div>
            </div>
          ))}
          {msgs.length < 5 && <button type="button" onClick={() => setMsgs([...msgs, ""])} className="btn-outline h-10 w-fit">+ Outra versão</button>}
          <label className="flex items-center gap-2 text-sm min-h-[40px]"><input type="checkbox" name="rodapeSair" value="1" checked={rodape} onChange={(e) => setRodape(e.target.checked)} className="w-5 h-5 accent-[#E87722]" />
            Incluir no final: &quot;Se não quiser receber mais mensagens, responda SAIR.&quot; (recomendado)</label>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="anexo" className="label mb-0">Anexo (foto ou PDF, opcional)</label>
            <input id="anexo" type="file" name="anexo" accept="image/jpeg,image/png,video/mp4,application/pdf" className="text-sm" />
            {d.midiaNome && <span className="text-sm">Atual: <strong>{d.midiaNome}</strong> <label className="ml-2 text-[#A0261C]"><input type="checkbox" name="tirarAnexo" value="1" /> tirar</label></span>}
          </div>
          <div className="rounded-2xl bg-[#E7F6E9] p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-graphite">Prévia {exemplo.nome ? `para ${exemplo.nome}` : "(com o 1º contato da lista)"}</p>
              <button type="button" onClick={() => setPrev((x) => x + 1)} className="text-xs font-semibold text-brand-text">Sortear de novo</button>
            </div>
            <p key={prev} className="text-sm whitespace-pre-wrap bg-white rounded-xl p-3 shadow-sm max-w-md">
              {msgs.filter((x) => x.trim()).length ? renderizar(msgs.filter((x) => x.trim())[prev % msgs.filter((x) => x.trim()).length], exemplo) + (rodape ? RODAPE : "") : "—"}
            </p>
          </div>
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Números que vão disparar</h2>
          <p className="text-sm text-graphite">Com mais de um número, o Hub reveza: cada número segue o próprio ritmo e o próprio limite diário.</p>
          {!numeros.length && <p className="text-sm text-[#A0261C]">Nenhum número conectado. Os usuários conectam em WhatsApp → Meu WhatsApp.</p>}
          <div className="flex flex-wrap gap-2">
            {numeros.map((n) => (
              <label key={n.id} className="cursor-pointer">
                <input type="checkbox" name="conexoes" value={n.id} checked={sel.includes(n.id)} onChange={(e) => setSel(e.target.checked ? [...sel, n.id] : sel.filter((x) => x !== n.id))} className="peer sr-only" />
                <span className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-surface-line text-sm peer-checked:border-brand peer-checked:bg-brand-soft peer-focus-visible:ring-2 peer-focus-visible:ring-graphite-dark">
                  <span className={`w-2 h-2 rounded-full ${n.conectado ? "bg-[#1E8A44]" : "bg-[#D0342C]"}`} />
                  <span><strong>{n.nome}</strong><span className="block text-xs text-graphite">{n.conectado ? `${n.hoje} enviada(s) hoje` : "desconectado"}</span></span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Proteção contra bloqueio</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(RITMOS).map(([k, v]) => (
              <button type="button" key={k} onClick={() => setR({ intervaloMin: v.intervaloMin, intervaloMax: v.intervaloMax, loteTamanho: v.loteTamanho, lotePausa: v.lotePausa, limiteDia: v.limiteDia })}
                className={`btn-outline h-10 ${r.intervaloMin === v.intervaloMin && r.limiteDia === v.limiteDia ? "border-brand bg-brand-soft" : ""}`}>{v.rotulo}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {([["intervaloMin", "Intervalo mínimo (s)"], ["intervaloMax", "Intervalo máximo (s)"], ["loteTamanho", "Mensagens por lote"], ["lotePausa", "Pausa entre lotes (min)"], ["limiteDia", "Limite por número/dia"]] as const).map(([k, rot]) => (
              <div key={k}><label htmlFor={k} className="label">{rot}</label>
                <input id={k} name={k} inputMode="numeric" value={r[k]} onChange={(e) => setR({ ...r, [k]: Number(e.target.value.replace(/\D/g, "")) || 0 })} className="input" /></div>
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div><label htmlFor="janelaInicio" className="label">Enviar a partir de (h)</label><input id="janelaInicio" name="janelaInicio" inputMode="numeric" defaultValue={d.janelaInicio} className="input" /></div>
            <div><label htmlFor="janelaFim" className="label">Até (h)</label><input id="janelaFim" name="janelaFim" inputMode="numeric" defaultValue={d.janelaFim} className="input" /></div>
            <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" name="sabado" value="1" defaultChecked={d.sabado} className="w-5 h-5 accent-[#E87722]" />Sábado</label>
            <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" name="domingo" value="1" defaultChecked={d.domingo} className="w-5 h-5 accent-[#E87722]" />Domingo</label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 items-end">
            <div><label htmlFor="inicioEm" className="label">Começar em (opcional)</label><input id="inicioEm" name="inicioEm" type="datetime-local" defaultValue={d.inicioEm} className="input" /></div>
            <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" name="conferirNumero" value="1" defaultChecked={d.conferirNumero} className="w-5 h-5 accent-[#E87722]" />Conferir se o número tem WhatsApp antes de enviar</label>
          </div>
          <p className="text-sm bg-[#F8F7F6] rounded-xl p-3">
            Ritmo: ~<strong>{ph}</strong> mensagens/hora por número{sel.length > 1 ? ` (${ph * sel.length}/h com ${sel.length} números)` : ""}, no máximo <strong>{r.limiteDia}</strong> por número por dia.
            {total ? <> Esta lista ({total.toLocaleString("pt-BR")}) leva cerca de <strong>{dias} dia(s)</strong> de envio.</> : null}
            {r.intervaloMin < 20 && <span className="block text-[#A0261C] font-semibold mt-1">Intervalo abaixo de 20 segundos aumenta muito o risco de bloqueio.</span>}
            {r.limiteDia > 250 && <span className="block text-[#A0261C] font-semibold mt-1">Mais de 250 por dia só é seguro em número antigo, aquecido, e para quem já é cliente.</span>}
          </p>
        </section>
      </fieldset>
      {bloqueado && <p className="text-sm text-graphite">Pause o disparo para editar.</p>}
    </ActionForm>
  );
}
