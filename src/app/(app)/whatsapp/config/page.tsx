import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { listIntegrations } from "@/lib/integrations/store";
import { qrStatus } from "@/lib/whatsapp/gateway";
import { AI_LABELS, AI_PROVIDERS } from "@/lib/ai";
import { PageHeader, Badge } from "@/components/ui";
import QrPanel from "../QrPanel";
import { desconectarQr, salvarConfig } from "../actions";

export const dynamic = "force-dynamic";

export default async function ConfigWhatsApp() {
  await requireModule("integracoes", "edit");
  const [qr, canal, iaLigada, instrucoes, provedor, integ] = await Promise.all([
    qrStatus(), getSetting("whatsapp.canal"), getSetting("ia.ligada"), getSetting("ia.instrucoes"), getSetting("ia.provedor"), listIntegrations(),
  ]);
  const oficial = integ.find((i) => i.provider === "whatsapp_oficial");
  const ia = integ.find((i) => i.provider === provedor);
  return (
    <>
      <PageHeader title="Configurar WhatsApp" subtitle="Conexão por QR code ou API oficial e atendente com IA.">
        <Link href="/whatsapp" className="btn-outline h-9 px-4">Voltar às conversas</Link>
      </PageHeader>
      <div className="grid lg:grid-cols-3 gap-4">
        <section className="card flex flex-col gap-3 lg:col-span-2">
          <h2 className="font-display font-bold text-lg">Conexão por QR code</h2>
          <QrPanel initial={qr}>
            {(
              <form action={desconectarQr}>
                <button className="text-sm font-semibold text-[#A0261C]">Desconectar este número</button>
              </form>
            )}
          </QrPanel>
        </section>

        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">API oficial (Meta)</h2>
          <div>
            {oficial ? (
              oficial.status === "ok" ? <Badge tone="green">Conectada</Badge> : oficial.status === "erro" ? <Badge tone="red">Com erro</Badge> : <Badge tone="orange">Não testada</Badge>
            ) : (
              <Badge tone="gray">Não configurada</Badge>
            )}
          </div>
          <p className="text-sm text-graphite-muted">Mais estável e sem risco de bloqueio do número. Mensagens que a empresa inicia precisam de template aprovado.</p>
          {<Link href="/integracoes" className="text-sm font-semibold text-brand-text">Configurar em Integrações</Link>}
        </section>
      </div>

      {(
        <section className="card flex flex-col gap-4">
          <h2 className="font-display font-bold text-lg">Envio e atendente com IA</h2>
          <form action={salvarConfig} className="flex flex-col gap-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="canal" className="label">Canal usado para enviar</label>
                <select id="canal" name="canal" defaultValue={canal} className="input">
                  <option value="qr">QR code</option>
                  <option value="oficial">API oficial</option>
                </select>
                <p className="text-xs text-graphite-muted mt-1">A IA sempre responde pelo mesmo canal em que o cliente escreveu.</p>
              </div>
              <div>
                <label htmlFor="provedor" className="label">IA que responde</label>
                <select id="provedor" name="provedor" defaultValue={provedor} className="input">
                  {AI_PROVIDERS.map((p) => {
                    const row = integ.find((i) => i.provider === p);
                    return (
                      <option key={p} value={p}>
                        {AI_LABELS[p]}{row ? (row.status === "ok" ? " · conectada" : row.status === "erro" ? " · com erro" : " · não testada") : " · não configurada"}
                      </option>
                    );
                  })}
                </select>
                {!ia && <p className="text-xs text-[#A0261C] mt-1">Esta IA ainda não foi configurada em Integrações.</p>}
              </div>
              <label className="flex items-center gap-2 text-sm font-medium min-h-[44px] sm:col-span-2">
                <input type="checkbox" name="ia" defaultChecked={iaLigada === "sim"} className="w-5 h-5 accent-[#C25A14]" />
                Atendente com IA ligado
              </label>
            </div>
            <div>
              <label htmlFor="instrucoes" className="label">Instruções do atendente</label>
              <textarea id="instrucoes" name="instrucoes" rows={6} defaultValue={instrucoes} className="input h-auto py-3 text-sm" />
              <p className="text-xs text-graphite-muted mt-1">Diga quem é a empresa, o que vende, como falar e o que nunca prometer. Quando não souber, a IA passa a conversa para um atendente e para de responder ali.</p>
            </div>
            <div><button className="btn-primary">Salvar</button></div>
          </form>
        </section>
      )}

    </>
  );
}
