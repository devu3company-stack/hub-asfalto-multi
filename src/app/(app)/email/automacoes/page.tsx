import { sql } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AUTOMACOES, type AutomacaoChave } from "@/lib/email/modelos";
import { lerAutomacao } from "@/lib/email/automacoes";
import { PageHeader, Badge } from "@/components/ui";
import Abas from "../Abas";
import LojaTabs from "@/components/LojaTabs";
import { lojaValida } from "@/lib/lojas";
import { marcaDa } from "@/lib/email/envio";
import AutomacaoForm from "./AutomacaoForm";

export const dynamic = "force-dynamic";

const VARS: Record<AutomacaoChave, string[]> = { carrinho: ["{{link_carrinho}}"], poscompra: ["{{pedido}}"], reativacao: ["{{cidade}}"] };
const REQUISITO: Record<AutomacaoChave, string> = {
  carrinho: "Precisa da Shopify conectada e dos webhooks checkouts/create, checkouts/update e orders/create apontando para o hub.",
  poscompra: "Dispara com o webhook orders/create da Shopify.",
  reativacao: "Usa a data da última compra (Shopify e Omie). Sincronize os contatos para preencher o histórico.",
};

export default async function Automacoes({ searchParams }: { searchParams: { loja?: string } }) {
  const user = await requireModule("email");
  const loja = lojaValida(searchParams.loja);
  const marca = await marcaDa(loja);
  const editor = can(user.role, "email", "edit");
  const chaves = Object.keys(AUTOMACOES) as AutomacaoChave[];
  const [estados, stats] = await Promise.all([
    Promise.all(chaves.map((k) => lerAutomacao(k, loja))),
    db.execute<{ k: string; enviados: number; abertos: number; cliques: number; fila: number }>(sql`
      select split_part(automacao, ':', 1) k, count(*) filter (where status='enviado')::int enviados, count(aberto_em)::int abertos,
             count(clicado_em)::int cliques, count(*) filter (where status='fila')::int fila
      from email_envios where automacao is not null and loja = ${loja} and created_at > now() - interval '30 days' group by 1`),
  ]);
  const porK = new Map((stats as unknown as { k: string; enviados: number; abertos: number; cliques: number; fila: number }[]).map((s) => [s.k, s]));
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");

  return (
    <>
      <PageHeader title="E-mail marketing" subtitle="Automações que rodam sozinhas. Já vêm com modelos prontos: ajuste os textos e ligue.">
        <LojaTabs atual={loja} path="/email/automacoes" />
      </PageHeader>
      <Abas atual="/email/automacoes" loja={loja} />
      {chaves.map((k, idx) => {
        const s = porK.get(k);
        const e = estados[idx];
        return (
          <details key={k} className="card group" open={idx === 0}>
            <summary className="flex flex-wrap items-center justify-between gap-3 cursor-pointer list-none min-h-[44px]">
              <span>
                <span className="font-display font-bold text-lg">{AUTOMACOES[k].nome}</span>
                <span className="block text-sm text-graphite">{AUTOMACOES[k].descricao}</span>
              </span>
              <span className="flex items-center gap-3 text-sm text-graphite">
                {s && <span>30 dias: {s.enviados} enviados · {s.abertos} aberturas · {s.cliques} cliques{s.fila ? ` · ${s.fila} na fila` : ""}</span>}
                <Badge tone={e.ativo ? "green" : "gray"}>{e.ativo ? "Ligada" : "Desligada"}</Badge>
              </span>
            </summary>
            <div className="mt-4 flex flex-col gap-3">
              <p className="text-xs text-graphite-muted">{REQUISITO[k]}{k !== "reativacao" && ` Endereço do webhook: ${appUrl}/api/webhooks/shopify`}</p>
              {editor
                ? <AutomacaoForm key={`${loja}-${k}`} loja={loja} marca={marca} chave={k} ativo={e.ativo} config={e.config} padrao={AUTOMACOES[k].padrao} variaveis={VARS[k]} />
                : <p className="text-sm text-graphite">Você pode ver, mas não editar as automações.</p>}
            </div>
          </details>
        );
      })}
    </>
  );
}
