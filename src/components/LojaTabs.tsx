import Link from "next/link";
import { LOJAS } from "@/lib/lojas";

/** Seletor de loja (via ?loja=). Mantém os outros parâmetros da URL. */
export default function LojaTabs({ atual, params = {}, path }: { atual: string; params?: Record<string, string | undefined>; path: string }) {
  return (
    <div role="tablist" aria-label="Loja" className="inline-flex rounded-full bg-[#EFEDEC] p-1">
      {LOJAS.map((l) => {
        const q = new URLSearchParams(Object.entries({ ...params, loja: l.id }).filter(([, v]) => v) as [string, string][]);
        const ativo = l.id === atual;
        return (
          <Link key={l.id} role="tab" aria-selected={ativo} href={`${path}?${q}`}
            className={`px-4 min-h-[40px] inline-flex items-center rounded-full text-sm font-semibold ${ativo ? "bg-white shadow-sm text-graphite-dark" : "text-graphite"}`}>
            {l.nome}
          </Link>
        );
      })}
    </div>
  );
}
