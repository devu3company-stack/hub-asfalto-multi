"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { mover } from "./actions";

type Card = {
  id: string; titulo: string; contato: string | null; empresa: string | null; valor: number; qualificacao: number;
  responsavel: string | null; proximaTarefa: string | null;
};
type Coluna = { id: string; nome: string; cards: Card[] };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const iniciais = (n: string | null) => (n ?? "?").split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

function Aviso({ quando }: { quando: string | null }) {
  if (!quando) return <span title="Sem tarefa agendada" className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#FFF4D6] text-[#8A6100]">Sem tarefa</span>;
  const d = new Date(quando);
  const atrasada = d.getTime() < Date.now();
  const hoje = d.toDateString() === new Date().toDateString();
  const txt = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return (
    <span title="Próxima tarefa" className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${atrasada ? "bg-[#FDE2DF] text-[#A0261C]" : hoje ? "bg-[#FDEBDD] text-[#9A4510]" : "bg-[#E3F3E6] text-[#1E6B34]"}`}>
      {atrasada ? `Atrasada ${txt}` : hoje ? "Hoje" : txt}
    </span>
  );
}

export default function Quadro({ colunas: inicial, podeEditar }: { colunas: Coluna[]; podeEditar: boolean }) {
  const [colunas, setColunas] = useState(inicial);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);
  const [, start] = useTransition();

  function soltar(etapaId: string) {
    const id = arrastando;
    setArrastando(null); setAlvo(null);
    if (!id) return;
    const origem = colunas.find((c) => c.cards.some((x) => x.id === id));
    if (!origem || origem.id === etapaId) return;
    const card = origem.cards.find((x) => x.id === id)!;
    const destino = colunas.find((c) => c.id === etapaId)!;
    const ordem = (destino.cards.length ? Math.max(...destino.cards.map((_, i) => i)) + 2 : 1) + Date.now() / 1e13;
    setColunas(colunas.map((c) => c.id === origem.id ? { ...c, cards: c.cards.filter((x) => x.id !== id) }
      : c.id === etapaId ? { ...c, cards: [...c.cards, card] } : c));
    start(() => mover(id, etapaId, ordem));
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 snap-x" role="list" aria-label="Etapas do funil">
      {colunas.map((c) => {
        const total = c.cards.reduce((s, x) => s + x.valor, 0);
        return (
          <section key={c.id} role="listitem" aria-label={c.nome}
            onDragOver={(e) => { if (podeEditar) { e.preventDefault(); setAlvo(c.id); } }}
            onDragLeave={() => setAlvo((a) => (a === c.id ? null : a))}
            onDrop={() => soltar(c.id)}
            className={`snap-start shrink-0 w-[280px] rounded-2xl p-2 flex flex-col gap-2 ${alvo === c.id ? "bg-[#FDEBDD]" : "bg-[#EFEDEC]"}`}>
            <header className="px-2 pt-1">
              <h2 className="font-display font-bold text-sm uppercase tracking-wide text-graphite-dark">{c.nome}</h2>
              <p className="text-xs text-graphite">{c.cards.length} negociação(ões) · {brl(total)}</p>
            </header>
            <ul className="flex flex-col gap-2 min-h-[60px]">
              {c.cards.map((x) => (
                <li key={x.id} draggable={podeEditar}
                  onDragStart={() => setArrastando(x.id)} onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                  className={`bg-white rounded-xl border border-surface-line p-3 shadow-sm ${podeEditar ? "cursor-grab active:cursor-grabbing" : ""} ${arrastando === x.id ? "opacity-50" : ""}`}>
                  <Link href={`/crm/${x.id}`} className="font-semibold text-sm leading-snug hover:underline block">{x.titulo}</Link>
                  {(x.contato || x.empresa) && <p className="text-xs text-graphite mt-0.5">{[x.contato, x.empresa].filter(Boolean).join(" · ")}</p>}
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <span className="text-sm font-semibold tabular-nums">{brl(x.valor)}</span>
                    <span aria-label={`${x.qualificacao} de 5 estrelas`} className="text-xs text-[#E0A100] tracking-tighter">{"★".repeat(x.qualificacao)}<span className="text-[#D9D5D3]">{"★".repeat(5 - x.qualificacao)}</span></span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2">
                    <Aviso quando={x.proximaTarefa} />
                    <span title={x.responsavel ?? "Sem responsável"} className="w-7 h-7 rounded-full bg-graphite-dark text-white text-[11px] font-bold inline-flex items-center justify-center">{iniciais(x.responsavel)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
