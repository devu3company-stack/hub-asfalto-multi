"use client";
import { useState } from "react";
import ActionForm from "@/components/ActionForm";
import { GATILHOS, GRUPOS, PASSOS, VARIAVEIS, novoId, type Campo, type Passo } from "@/lib/automacoes/definicoes";
import { salvar } from "../actions";

import type { EnvioAutomacao } from "@/db/schema";

type Dados = { nome: string; grupo: string; ativa: boolean; gatilho: string; gatilhoConfig: Record<string, unknown>; passos: Passo[]; envio: EnvioAutomacao };
type Opcao = { id: string; nome: string; detalhe?: string };

function CampoInput({ c, valor, onChange, etapas, lojas, idBase }: { c: Campo; valor: unknown; onChange: (v: unknown) => void; etapas: string[]; lojas: { id: string; nome: string }[]; idBase: string }) {
  const id = `${idBase}-${c.k}`;
  const v = valor ?? c.padrao ?? "";
  const rot = <label htmlFor={id} className="label">{c.rotulo}</label>;
  switch (c.tipo) {
    case "textarea":
      return <div className="sm:col-span-2">{rot}<textarea id={id} rows={4} value={String(v)} onChange={(e) => onChange(e.target.value)} className="input h-auto py-2" /></div>;
    case "palavras":
      return <div className="sm:col-span-2">{rot}<textarea id={id} rows={4} value={((v as string[]) || []).join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} className="input h-auto py-2" />
        {c.ajuda && <p className="text-xs text-graphite-muted mt-1">{c.ajuda}</p>}</div>;
    case "numero":
      return <div>{rot}<input id={id} inputMode="numeric" value={String(v)} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value.replace(",", ".")) || 0)} className="input" /></div>;
    case "bool":
      return <label className="flex items-center gap-2 text-sm min-h-[44px] sm:col-span-2"><input id={id} type="checkbox" checked={!!v} onChange={(e) => onChange(e.target.checked)} className="w-5 h-5 accent-[#E87722]" />{c.rotulo}</label>;
    case "etapa":
      return <div>{rot}<select id={id} value={String(v)} onChange={(e) => onChange(e.target.value)} className="input"><option value="">—</option>{etapas.map((x) => <option key={x}>{x}</option>)}</select></div>;
    case "loja":
      return <div>{rot}<select id={id} value={String(v)} onChange={(e) => onChange(e.target.value)} className="input"><option value="">Todas</option>{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>;
    case "select":
      return <div>{rot}<select id={id} value={String(v)} onChange={(e) => onChange(e.target.value)} className="input"><option value="">—</option>{c.opcoes?.map((o) => <option key={o.v} value={o.v}>{o.r}</option>)}</select></div>;
    default:
      return <div>{rot}<input id={id} value={String(v)} onChange={(e) => onChange(e.target.value)} className="input" /></div>;
  }
}

export default function Editor({ id, inicial, etapas, lojas, numeros, contas }: { id: string; inicial: Dados; etapas: string[]; lojas: { id: string; nome: string }[]; numeros: Opcao[]; contas: Opcao[] }) {
  const [d, setD] = useState<Dados>(inicial);
  const set = (p: Partial<Dados>) => setD((x) => ({ ...x, ...p }));
  const setPasso = (i: number, p: Partial<Passo>) => set({ passos: d.passos.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  const mover = (i: number, k: number) => { const ps = [...d.passos]; const [x] = ps.splice(i, 1); ps.splice(i + k, 0, x); set({ passos: ps }); };
  const g = GATILHOS[d.gatilho];
  const env = d.envio ?? {};
  const setEnv = (p: Partial<EnvioAutomacao>) => set({ envio: { ...env, ...p } });
  const usaWpp = d.gatilho === "whatsapp.mensagem" || d.passos.some((s) => ["whatsapp", "orcamento", "enviar_manual", "responder_ia", "pesquisa_nps"].includes(s.tipo));
  const usaEmail = d.passos.some((s) => s.tipo === "email");

  return (
    <ActionForm action={salvar} label="Salvar automação">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="dados" value={JSON.stringify(d)} />
      <section className="card grid sm:grid-cols-3 gap-3 items-end">
        <div className="sm:col-span-2"><label htmlFor="nome" className="label">Nome</label><input id="nome" value={d.nome} onChange={(e) => set({ nome: e.target.value })} className="input" /></div>
        <div><label htmlFor="grupo" className="label">Grupo</label>
          <select id="grupo" value={d.grupo} onChange={(e) => set({ grupo: e.target.value })} className="input">{Object.entries(GRUPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <label className="flex items-center gap-2 font-semibold min-h-[44px]"><input type="checkbox" checked={d.ativa} onChange={(e) => set({ ativa: e.target.checked })} className="w-5 h-5 accent-[#1E8A44]" />Automação ligada</label>
      </section>

      <section className="card flex flex-col gap-3 border-l-4 border-l-brand">
        <h2 className="font-display font-bold text-lg">Quando</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label htmlFor="gatilho" className="label">Gatilho</label>
            <select id="gatilho" value={d.gatilho} onChange={(e) => set({ gatilho: e.target.value, gatilhoConfig: {} })} className="input">
              {Object.entries(GATILHOS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>
            <p className="text-xs text-graphite-muted mt-1">{g?.descricao}</p></div>
          {g?.campos.map((c) => <CampoInput key={c.k} c={c} idBase="g" valor={d.gatilhoConfig[c.k]} etapas={etapas} lojas={lojas}
            onChange={(v) => set({ gatilhoConfig: { ...d.gatilhoConfig, [c.k]: v } })} />)}
        </div>
      </section>

      <section className="card flex flex-col gap-3 border-l-4 border-l-[#2563EB]">
        <h2 className="font-display font-bold text-lg">Envio e identificação</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="env-conexao" className="label">Número do WhatsApp</label>
            <select id="env-conexao" value={env.conexao ?? ""} onChange={(e) => setEnv({ conexao: e.target.value })} className="input">
              <option value="">Automático (o da conversa ou do vendedor)</option>
              {numeros.map((n) => <option key={n.id} value={n.id}>{n.nome}{n.detalhe ? ` — ${n.detalhe}` : ""}</option>)}
            </select>
            <p className="text-xs text-graphite-muted mt-1">
              {env.conexao ? (d.gatilho === "whatsapp.mensagem" ? "Só reage às mensagens que chegam neste número e responde por ele, mesmo com a IA desligada lá." : "As mensagens saem sempre por este número.")
                : "Usa o número da conversa; sem conversa, o do vendedor da negociação ou o número padrão."}{!usaWpp && " (Esta automação ainda não tem passo de WhatsApp.)"}
            </p>
          </div>
          <div>
            <label htmlFor="env-email" className="label">Conta de e-mail</label>
            <select id="env-email" value={env.emailConta ?? ""} onChange={(e) => setEnv({ emailConta: e.target.value })} className="input">
              <option value="">Servidor da loja (Integrações)</option>
              {contas.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.detalhe ? ` — ${c.detalhe}` : ""}</option>)}
            </select>
            <p className="text-xs text-graphite-muted mt-1">{contas.length ? "" : "Cadastre mais contas em E-mail marketing › Contas de envio. "}{!usaEmail && "(Esta automação ainda não tem passo de e-mail.)"}</p>
          </div>
          <div>
            <label htmlFor="env-cliente" className="label">Como chamar o cliente <code className="font-normal">{"{{cliente}}"}</code></label>
            <select id="env-cliente" value={env.cliente ?? "primeiro"} onChange={(e) => setEnv({ cliente: e.target.value as EnvioAutomacao["cliente"] })} className="input">
              <option value="primeiro">Primeiro nome (ex.: Maria)</option>
              <option value="completo">Nome completo (ex.: Maria Souza)</option>
              <option value="fixo">Um texto meu (ex.: &quot;cliente&quot;, &quot;parceiro&quot;)</option>
            </select>
          </div>
          {env.cliente === "fixo" ? (
            <div><label htmlFor="env-cliente-fixo" className="label">Texto para chamar o cliente</label>
              <input id="env-cliente-fixo" value={env.clienteFixo ?? ""} onChange={(e) => setEnv({ clienteFixo: e.target.value })} className="input" placeholder="cliente" /></div>
          ) : (
            <div><label htmlFor="env-sem-nome" className="label">Quando não souber o nome</label>
              <input id="env-sem-nome" value={env.semNome ?? ""} onChange={(e) => setEnv({ semNome: e.target.value })} className="input" placeholder="Em branco: tira o nome da frase" /></div>
          )}
          <div>
            <label htmlFor="env-assinatura" className="label">Como você se identifica <code className="font-normal">{"{{meu_nome}}"}</code></label>
            <select id="env-assinatura" value={env.assinatura ?? ""} onChange={(e) => setEnv({ assinatura: e.target.value as EnvioAutomacao["assinatura"] })} className="input">
              <option value="">Nome do dono do número que envia</option>
              <option value="vendedor">Nome do vendedor responsável pela negociação</option>
              <option value="fixo">Um nome que eu escrevo</option>
            </select>
          </div>
          {env.assinatura === "fixo" && (
            <div><label htmlFor="env-assinatura-fixa" className="label">Seu nome nas mensagens</label>
              <input id="env-assinatura-fixa" value={env.assinaturaFixa ?? ""} onChange={(e) => setEnv({ assinaturaFixa: e.target.value })} className="input" placeholder="Ex.: Rodrigo, da Asfalto Multi" /></div>
          )}
        </div>
        <p className="text-xs text-graphite-muted">
          Exemplo: &quot;Olá, {"{{cliente}}"}! Aqui é {"{{meu_nome}}"}, da {"{{empresa}}"}.&quot; Nos e-mails, quando você escolhe como se identificar, o remetente aparece como &quot;seu nome | empresa&quot;.
        </p>
      </section>

      <ol className="flex flex-col gap-3">
        {d.passos.map((s, i) => {
          const def = PASSOS[s.tipo];
          return (
            <li key={s.id} className="card flex flex-col gap-3" style={{ borderLeft: `4px solid ${def?.cor ?? "#999"}` }}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display font-bold">Então {i + 1}.</span>
                <label className="sr-only" htmlFor={`t-${s.id}`}>Tipo do passo {i + 1}</label>
                <select id={`t-${s.id}`} value={s.tipo} onChange={(e) => setPasso(i, { tipo: e.target.value, config: {} })} className="input h-10 w-auto flex-1 min-w-[220px]">
                  {Object.entries(PASSOS).map(([k, v]) => <option key={k} value={k}>{v.rotulo}</option>)}</select>
                <div className="flex gap-1 ml-auto">
                  <button type="button" disabled={i === 0} onClick={() => mover(i, -1)} aria-label={`Subir passo ${i + 1}`} className="w-10 h-10 rounded-lg border border-surface-line disabled:opacity-30">↑</button>
                  <button type="button" disabled={i === d.passos.length - 1} onClick={() => mover(i, 1)} aria-label={`Descer passo ${i + 1}`} className="w-10 h-10 rounded-lg border border-surface-line disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => set({ passos: d.passos.filter((_, j) => j !== i) })} aria-label={`Remover passo ${i + 1}`} className="w-10 h-10 rounded-lg border border-surface-line text-[#A0261C]">✕</button>
                </div>
              </div>
              {def?.campos.length ? (
                <div className="grid sm:grid-cols-2 gap-3">
                  {def.campos.map((c) => <CampoInput key={c.k} c={c} idBase={s.id} valor={s.config[c.k]} etapas={etapas} lojas={lojas}
                    onChange={(v) => setPasso(i, { config: { ...s.config, [c.k]: v } })} />)}
                </div>
              ) : null}
              {(s.tipo === "whatsapp" || s.tipo === "email") && (
                <p className="text-xs text-graphite-muted">Pode usar: {VARIAVEIS.map((x) => <code key={x.v} title={x.r} className="mr-1.5">{x.v}</code>)}</p>
              )}
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={() => set({ passos: [...d.passos, { id: novoId(), tipo: "whatsapp", config: {} }] })} className="btn-outline h-11 w-fit">+ Adicionar passo</button>
    </ActionForm>
  );
}
