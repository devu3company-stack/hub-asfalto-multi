import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listIntegrations } from "@/lib/integrations/store";
import { INTEGRACOES as PROVIDERS } from "@/lib/integrations/providers";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { brl } from "@/components/ui";
import { PageHeader, Stat, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Painel() {
  const user = await requireModule("painel");
  const [rows, [v], [w], [e]] = await Promise.all([
    listIntegrations(),
    db.execute<{ hoje: number; pendentes: number; erros: number }>(sql`select
      coalesce(sum(total) filter (where criado_na_loja >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'), 0)::float hoje,
      count(*) filter (where status = 'pendente')::int pendentes, count(*) filter (where status = 'erro')::int erros from pedidos`) as unknown as Promise<{ hoje: number; pendentes: number; erros: number }[]>,
    db.execute<{ abertas: number; humano: number }>(sql`select count(*) filter (where last_at > now() - interval '24 hours')::int abertas,
      count(*) filter (where ai_paused and last_at > now() - interval '24 hours')::int humano from wa_chats`) as unknown as Promise<{ abertas: number; humano: number }[]>,
    db.execute<{ baixo: number }>(sql`select count(*)::int baixo from produtos where ativo and estoque is not null and estoque_minimo > 0 and estoque <= estoque_minimo`) as unknown as Promise<{ baixo: number }[]>,
  ]);
  const status = (id: string) => rows.find((r) => r.provider === id)?.status ?? "desconectado";

  return (
    <>
      <PageHeader title="Painel" subtitle={`Olá, ${user.name.split(" ")[0]}. Visão geral de vendas, integrações e atendimento.`} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">
        <Stat label="Vendas hoje (Shopify)" value={brl(v?.hoje ?? 0)} hint="as duas lojas" />
        <Stat label="Pedidos a enviar ao Omie" value={String(v?.pendentes ?? 0)} tone={(v?.erros ?? 0) ? "red" : "orange"} hint={(v?.erros ?? 0) ? `${v.erros} com erro` : "pendentes"} />
        <Stat label="Produtos com estoque baixo" value={String(e?.baixo ?? 0)} tone={(e?.baixo ?? 0) ? "red" : "default"} />
        <Stat label="Conversas no WhatsApp (24h)" value={String(w?.abertas ?? 0)} tone="dark" hint={`${w?.humano ?? 0} com atendente`} />
      </div>

      <section className="card flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display font-bold text-lg">Integrações</h2>
          {can(user.role, "integracoes", "edit") && <Link href="/integracoes" className="text-sm font-semibold text-brand-text">Gerenciar</Link>}
        </div>
        <ul className="grid sm:grid-cols-2 gap-2">
          {PROVIDERS.map((p) => {
            const s = status(p.id);
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#F8F7F6]">
                <span className="text-sm font-medium">{p.name}</span>
                {s === "ok" ? <Badge tone="green">Conectado</Badge> : s === "erro" ? <Badge tone="red">Com erro</Badge> : s === "nao_testado" ? <Badge tone="orange">Não testado</Badge> : <Badge tone="gray">Desconectado</Badge>}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
