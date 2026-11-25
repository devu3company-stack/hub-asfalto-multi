import { requireModule } from "@/lib/auth";
import { INTEGRACOES as PROVIDERS } from "@/lib/integrations/providers";
import { getConfig, listIntegrations } from "@/lib/integrations/store";
import { PageHeader, Badge } from "@/components/ui";
import IntegrationForm from "./IntegrationForm";
import { disconnect } from "./actions";

export const dynamic = "force-dynamic";

const STATUS = {
  ok: <Badge tone="green">Conectado</Badge>,
  erro: <Badge tone="red">Com erro</Badge>,
  nao_testado: <Badge tone="orange">Não testado</Badge>,
} as const;

import { LOJAS } from "@/lib/lojas";
import { marcaDa } from "@/lib/email/envio";
import ActionForm from "@/components/ActionForm";
import { salvarLoja } from "./actions";

export default async function Integracoes() {
  await requireModule("integracoes", "edit");
  const rows = await listIntegrations();
  const lojas = await Promise.all(LOJAS.map(async (l) => ({ id: l.id, ...(await marcaDa(l.id)) })));
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");

  const cards = await Promise.all(
    PROVIDERS.map(async (def) => {
      const row = rows.find((r) => r.provider === def.id);
      const cfg = row ? (await getConfig(def.id)) ?? {} : {};
      // só valores não secretos vão para a tela
      const values: Record<string, string> = {};
      for (const f of def.fields) if (!f.secret && cfg[f.key]) values[f.key] = cfg[f.key];
      return { def, row, values, hasWebhookSecret: Boolean(cfg.webhookSecret) };
    }),
  );

  return (
    <>
      <PageHeader title="Integrações" subtitle="Conecte as APIs. As chaves ficam criptografadas e nunca aparecem de novo na tela." />
      <section className="card flex flex-col gap-3">
        <h2 className="font-display font-bold text-lg">Lojas</h2>
        <p className="text-sm text-graphite">Nome, site e logo de cada loja nos e-mails. Shopify, Omie e e-mail se conectam por loja, nos cartões abaixo.</p>
        <div className="grid lg:grid-cols-2 gap-4">
          {lojas.map((l) => (
            <ActionForm key={l.id} action={salvarLoja} label={`Salvar ${l.nome}`} className="flex flex-col gap-2 p-3 rounded-xl bg-[#F8F7F6]">
              <input type="hidden" name="loja" value={l.id} />
              <div><label htmlFor={`nome_${l.id}`} className="label">Nome</label><input id={`nome_${l.id}`} name="nome" defaultValue={l.nome} className="input" /></div>
              <div><label htmlFor={`site_${l.id}`} className="label">Site</label><input id={`site_${l.id}`} name="site" defaultValue={l.site} className="input" placeholder="https://" /></div>
              <div><label htmlFor={`logo_${l.id}`} className="label">Logo (link https de uma imagem PNG)</label><input id={`logo_${l.id}`} name="logo" defaultValue={l.logo.startsWith("http") ? l.logo : ""} className="input" placeholder="Em branco = logo da Asfalto Multi" /></div>
            </ActionForm>
          ))}
        </div>
      </section>
      <div className="flex flex-col gap-4">
        {cards.map(({ def, row, values, hasWebhookSecret }) => (
          <section key={def.id} className="card flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-lg">{def.name}</h2>
                <p className="text-sm text-graphite-muted mt-1 max-w-2xl">{def.description}</p>
                {def.docs && <a href={def.docs} target="_blank" rel="noreferrer" className="text-sm font-semibold text-brand-text">Documentação</a>}
              </div>
              <div className="flex items-center gap-3">
                {row ? STATUS[row.status as keyof typeof STATUS] ?? STATUS.nao_testado : <Badge tone="gray">Desconectado</Badge>}
                {row && (
                  <form action={disconnect}>
                    <input type="hidden" name="provider" value={def.id} />
                    <button className="text-sm text-[#A0261C] font-semibold">Desconectar</button>
                  </form>
                )}
              </div>
            </div>
            {row?.status === "erro" && row.lastError && <p className="text-sm text-[#A0261C]">Último erro: {row.lastError}</p>}
            <IntegrationForm def={def} saved={Boolean(row)} values={values} />
            {def.id === "shopify" && (
              <div className="rounded-xl bg-[#F8F7F6] p-3 text-sm">
                <p className="font-medium">URL do webhook para cadastrar na Shopify:</p>
                <code className="break-all text-xs">{appUrl || "https://SEU-HUB"}/api/webhooks/shopify</code>
                {!hasWebhookSecret && <p className="text-xs text-graphite-muted mt-1">Defina o segredo dos webhooks acima antes de cadastrar.</p>}
              </div>
            )}
            {def.id === "whatsapp_oficial" && (
              <div className="rounded-xl bg-[#F8F7F6] p-3 text-sm">
                <p className="font-medium">No app da Meta, em WhatsApp › Configuração › Webhook:</p>
                <p className="text-xs mt-1">URL de retorno:</p>
                <code className="break-all text-xs">{appUrl || "https://SEU-HUB"}/api/webhooks/whatsapp-oficial</code>
                <p className="text-xs mt-1">Token de verificação: o mesmo do campo acima. Depois assine o campo <b>messages</b>.</p>
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
