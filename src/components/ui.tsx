import Link from "next/link";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="font-display font-extrabold text-2xl lg:text-[28px]">{title}</h1>
        {subtitle && <p className="text-sm text-graphite-muted mt-1">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "dark" | "green" | "red" | "orange" }) {
  const dark = tone === "dark";
  const color = { default: "", dark: "text-white", green: "text-[#1E6B34]", red: "text-[#A0261C]", orange: "text-brand-text" }[tone];
  return (
    <div className={`rounded-2xl p-4 lg:p-5 flex flex-col gap-2 ${dark ? "bg-graphite" : "bg-white border border-surface-line"}`}>
      <span className={`text-xs lg:text-[13px] font-medium ${dark ? "text-[#E8E5E3]" : "text-graphite-muted"}`}>{label}</span>
      <span className={`font-display font-extrabold text-xl lg:text-[28px] ${color}`}>{value}</span>
      {hint && <span className={`text-xs ${dark ? "text-[#E8E5E3]" : "text-graphite-muted"}`}>{hint}</span>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  green: "bg-[#E3F1E6] text-[#1E6B34]",
  orange: "bg-brand-soft text-brand-text",
  red: "bg-[#FBE3E1] text-[#A0261C]",
  gray: "bg-[#E6E4E3] text-[#3E3B3C]",
  blue: "bg-[#E1ECFA] text-[#1F4E8C]",
  yellow: "bg-[#FBF0CC] text-[#7A5A00]",
};
export function Badge({ tone, children }: { tone: keyof typeof BADGE; children: React.ReactNode }) {
  return <span className={`badge ${BADGE[tone]}`}>{children}</span>;
}

export function NeedsIntegration({ name }: { name: string }) {
  return (
    <div className="card flex flex-col items-start gap-3">
      <p className="text-sm text-graphite-muted">Conecte o {name} na aba Integrações para ver estes dados.</p>
      <Link href="/integracoes" className="btn-outline">Abrir Integrações</Link>
    </div>
  );
}

export function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
