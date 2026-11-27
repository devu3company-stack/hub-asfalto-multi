import Link from "next/link";
import { can, type Role } from "@/lib/permissions";

const ABAS = [
  { id: "transportadoras", label: "Transportadoras", href: "/fretes/transportadoras", modulo: "fretes" },
  { id: "entregadores", label: "Entregadores", href: "/entregas/entregadores", modulo: "entregas" },
  { id: "planilhas", label: "Planilhas", href: "/fretes/planilhas", modulo: "fretes" },
] as const;

/** Abas da área "Cadastros de logística": transportadoras, entregadores e planilhas no mesmo lugar. */
export default function CadastrosTabs({ atual, role }: { atual: (typeof ABAS)[number]["id"]; role: Role }) {
  const abas = ABAS.filter((a) => can(role, a.modulo));
  return (
    <nav aria-label="Cadastros de logística" className="flex flex-wrap gap-1 border-b border-surface-line -mt-2">
      {abas.map((a) => (
        <Link key={a.id} href={a.href} aria-current={a.id === atual ? "page" : undefined}
          className={`px-4 min-h-[44px] inline-flex items-center text-sm font-semibold border-b-2 -mb-px ${a.id === atual ? "border-brand text-brand-text" : "border-transparent text-graphite hover:text-graphite-dark"}`}>
          {a.label}
        </Link>
      ))}
    </nav>
  );
}
