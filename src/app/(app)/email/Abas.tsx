import Link from "next/link";

const ABAS = [["/email", "Campanhas"], ["/email/automacoes", "Automações"], ["/email/contatos", "Contatos"]] as const;

export default function Abas({ atual, loja }: { atual: string; loja: string }) {
  return (
    <nav aria-label="E-mail marketing" className="flex gap-1 border-b border-surface-line -mt-2">
      {ABAS.map(([href, label]) => (
        <Link key={href} href={`${href}?loja=${loja}`} aria-current={atual === href ? "page" : undefined}
          className={`px-4 min-h-[44px] inline-flex items-center text-sm font-semibold border-b-2 -mb-px ${atual === href ? "border-brand text-brand-text" : "border-transparent text-graphite hover:text-graphite-dark"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
