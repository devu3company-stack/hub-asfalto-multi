import Link from "next/link";
import { asc } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { listIntegrations } from "@/lib/integrations/store";
import { qrSessoes } from "@/lib/whatsapp/gateway";
import { conexaoPadrao } from "@/lib/whatsapp/conexoes";
import { AI_LABELS, AI_PROVIDERS } from "@/lib/ai";
import { PageHeader, Badge } from "@/components/ui";
import { alternarIA, definirDono, desconectar, removerOficial, salvarConfig, salvarExpedienteNps, salvarRepasse } from "../actions";
import OficialForm from "./OficialForm";
import { DIAS, expediente, npsConfig } from "@/lib/whatsapp/atendimento";

export const dynamic = "force-dynamic";

export default async function ConfigWhatsApp() {
  await requireModule("integracoes", "edit");
  const [conexoes, usuarios, sessoes, padrao, instrucoes, provedor, integ] = await Promise.all([
    db.query.waConexoes.findMany({ orderBy: asc(schema.waConexoes.nome) }),
    db.query.users.findMany({ columns: { id: true, name: true }, orderBy: asc(schema.users.name) }),
    qrSessoes(), conexaoPadrao(), getSetting("ia.instrucoes"), getSetting("ia.provedor"), listIntegrations(),
  ]);
  const [exp, nps, ultimo, teste, repassar] = await Promise.all([expediente(), npsConfig(), getSetting("whatsapp.oficial.ultimo"), getSetting("whatsapp.oficial.teste"), getSetting("whatsapp.oficial.repassar")]);
  const quando = (iso: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "nunca");
  const ia = integ.find((i) => i.provider === provedor);
  const oficialOk = integ.some((i) => i.provider === "whatsapp_oficial");
  const estado = (id: string) => (conexoes.find((c) => c.id === id)?.tipo === "oficial" ? (oficialOk ? "conectado" : "desconectado") : sessoes[id]?.status ?? "desconectado");
  const qr = conexoes.filter((c) => c.tipo === "qr"), oficiais = conexoes.filter((c) => c.tipo === "oficial");
  return (
    <>
      <PageHeader title="WhatsApp da equipe" subtitle="Cada usuário conecta o próprio número em Meu WhatsApp. Aqui você vê todos e configura a IA.">
        <div className="flex gap-2"><Link href="/whatsapp/nps" className="btn-outline h-9 px-4">Relatório NPS</Link><Link href="/whatsapp" className="btn-outline h-9 px-4">Voltar às conversas</Link></div>
      </PageHeader>

      <section className="card p-0 overflow-hidden">
        <h2 className="font-display font-bold text-lg p-4 pb-2">Números por QR code</h2>
        <ul>
          {qr.map((c) => {
            const st = estado(c.id);
            return (
              <li key={c.id} className="border-t border-surface-line p-4 flex flex-wrap items-center gap-3">
                <div className="min-w-[180px]">
                  <p className="font-semibold">{c.nome}</p>
                  <p className="text-xs text-graphite">{sessoes[c.id]?.number ? `+${sessoes[c.id].number}` : "—"}</p>
                </div>
                <Badge tone={st === "conectado" ? "green" : st === "aguardando_qr" ? "orange" : "gray"}>{st === "conectado" ? "Conectado" : st === "aguardando_qr" ? "Aguardando QR" : "Desconectado"}</Badge>
                <form action={alternarIA}><input type="hidden" name="conexao" value={c.id} />
                  <button className="btn-outline h-9 px-3 text-sm">{c.iaLigada ? "IA e automações: ligadas" : "IA e automações: desligadas"}</button></form>
                <form action={definirDono} className="flex items-center gap-2 ml-auto">
                  <input type="hidden" name="conexao" value={c.id} />
                  <label htmlFor={`d-${c.id}`} className="text-sm text-graphite">Dono</label>
                  <select id={`d-${c.id}`} name="userId" defaultValue={c.userId ?? ""} className="input h-9 w-48"><option value="">— ninguém —</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                  <button className="btn-outline h-9 px-3 text-sm">Salvar</button>
                </form>
                {st === "conectado" && c.tipo !== "oficial" && <form action={desconectar}><input type="hidden" name="conexao" value={c.id} /><button className="text-sm text-[#A0261C] font-semibold">Desconectar</button></form>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="font-display font-bold text-lg">Números da API oficial (Meta)</h2>
          <p className="text-sm text-graphite">O app da Meta (token, chave secreta e webhook) fica em <Link href="/integracoes" className="text-brand-text font-semibold underline">Integrações</Link>. Aqui você cadastra cada número desse app e escolhe quem usa. Número que mandar mensagem sem estar cadastrado aparece aqui sozinho.</p>
          {!oficialOk && <p className="text-sm text-[#A0261C] mt-1">A API oficial ainda não está configurada em Integrações.</p>}
        </div>
        <div className="rounded-xl bg-[#F8F7F6] p-3 text-sm flex flex-col gap-2">
          <p><strong>Webhook:</strong> último aviso da Meta em <strong>{quando(ultimo)}</strong> · último teste (botão &quot;Testar&quot; da Meta) em <strong>{quando(teste)}</strong></p>
          <form action={salvarRepasse} className="flex flex-col gap-2">
            <label htmlFor="repassar" className="label mb-0">Repassar os avisos da Meta para outro sistema (ex.: o outro CRM) — um endereço por linha</label>
            <textarea id="repassar" name="repassar" rows={2} defaultValue={repassar} className="input h-auto py-2 font-mono text-xs" placeholder="https://outro-crm.com.br/webhook/whatsapp" />
            <p className="text-xs text-graphite-muted">A Meta só aceita um endereço de webhook por app. Cadastre o do Hub na Meta e coloque aqui o endereço que o outro sistema usava: o Hub repassa cada mensagem com a mesma assinatura, e os dois continuam recebendo.</p>
            <button className="btn-outline h-10 w-fit">Salvar repasse</button>
          </form>
        </div>
        {oficiais.map((c) => (
          <details key={c.id} className="rounded-xl border border-surface-line p-3">
            <summary className="flex flex-wrap items-center gap-3 cursor-pointer min-h-[40px]">
              <span className="font-semibold">{c.nome}</span>
              <span className="text-sm text-graphite">{c.numero ?? `ID ${c.phoneNumberId ?? "?"}`}</span>
              <span className="text-sm text-graphite">· {usuarios.find((u) => u.id === c.userId)?.name ?? "sem dono"}</span>
              <span className="text-sm text-graphite">· IA {c.iaLigada ? "ligada" : "desligada"}</span>
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <OficialForm n={{ id: c.id, nome: c.nome, phoneNumberId: c.phoneNumberId, numero: c.numero, userId: c.userId, temToken: !!c.tokenCripto }} usuarios={usuarios} />
              <div className="flex flex-wrap gap-3">
                <form action={alternarIA}><input type="hidden" name="conexao" value={c.id} /><button className="btn-outline h-9 px-3 text-sm">{c.iaLigada ? "Desligar IA e automações" : "Ligar IA e automações"}</button></form>
                <form action={removerOficial}><input type="hidden" name="conexao" value={c.id} /><button className="text-sm text-[#A0261C] font-semibold min-h-[36px]">Remover número</button></form>
              </div>
            </div>
          </details>
        ))}
        <div className="border-t border-surface-line pt-3">
          <p className="font-semibold mb-2">Cadastrar número oficial</p>
          <OficialForm usuarios={usuarios} />
        </div>
      </section>

      <section className="card flex flex-col gap-4">
        <h2 className="font-display font-bold text-lg">Atendente com IA e avisos do sistema</h2>
        <form action={salvarConfig} className="flex flex-col gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="padrao" className="label">Número dos avisos do sistema</label>
              <select id="padrao" name="padrao" defaultValue={padrao} className="input">{conexoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
              <p className="text-xs text-graphite-muted mt-1">Usado para avisar os entregadores e nas automações de clientes que não têm vendedor.</p>
            </div>
            <div>
              <label htmlFor="provedor" className="label">IA que responde</label>
              <select id="provedor" name="provedor" defaultValue={provedor} className="input">
                {AI_PROVIDERS.map((p) => {
                  const row = integ.find((i) => i.provider === p);
                  return <option key={p} value={p}>{AI_LABELS[p]}{row ? (row.status === "ok" ? " · conectada" : row.status === "erro" ? " · com erro" : " · não testada") : " · não configurada"}</option>;
                })}
              </select>
              {!ia && <p className="text-xs text-[#A0261C] mt-1">Esta IA ainda não foi configurada em Integrações.</p>}
            </div>
          </div>
          <div>
            <label htmlFor="instrucoes" className="label">Instruções do atendente</label>
            <textarea id="instrucoes" name="instrucoes" rows={6} defaultValue={instrucoes} className="input h-auto py-3 text-sm" />
            <p className="text-xs text-graphite-muted mt-1">Valem para todos os números com a IA ligada. Quando não souber, a IA passa a conversa para o atendente e para de responder ali.</p>
          </div>
          <div><button className="btn-primary">Salvar</button></div>
        </form>
      </section>

      <form action={salvarExpedienteNps} className="grid lg:grid-cols-2 gap-4 items-start">
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Fora do expediente</h2>
          <label className="flex items-center gap-2 font-semibold min-h-[40px]"><input type="checkbox" name="expAtivo" value="1" defaultChecked={exp.ativo} className="w-5 h-5 accent-[#E87722]" />Responder automaticamente fora do horário</label>
          <p className="text-xs text-graphite-muted">Sai uma vez a cada 12 horas por conversa, em todos os números. Nos números com a IA ligada, quem atende é a IA (24 horas) e o aviso não sai.</p>
          <div className="flex flex-col gap-2">
            {DIAS.map((nome, d) => (
              <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
                <label className="flex items-center gap-2 w-28 min-h-[40px]"><input type="checkbox" name={`aberto${d}`} value="1" defaultChecked={!!exp.dias[d]} className="w-4 h-4 accent-[#E87722]" />{nome}</label>
                <input type="time" name={`abre${d}`} aria-label={`${nome}: abre`} defaultValue={exp.dias[d]?.abre ?? "08:00"} className="input h-10 w-32" />
                <span>às</span>
                <input type="time" name={`fecha${d}`} aria-label={`${nome}: fecha`} defaultValue={exp.dias[d]?.fecha ?? "18:00"} className="input h-10 w-32" />
              </div>
            ))}
          </div>
          <div><label htmlFor="expMensagem" className="label">Mensagem</label><textarea id="expMensagem" name="expMensagem" rows={4} defaultValue={exp.mensagem} className="input h-auto py-2" /></div>
        </section>
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Pesquisa de satisfação (NPS)</h2>
          <label className="flex items-center gap-2 font-semibold min-h-[40px]"><input type="checkbox" name="npsAtivo" value="1" defaultChecked={nps.ativo} className="w-5 h-5 accent-[#E87722]" />Pesquisa ligada</label>
          <p className="text-xs text-graphite-muted">Enviada quando o atendente toca em Finalizar (pode desmarcar na hora) ou pela automação depois da entrega. Notas de 0 a 8 recebem a pergunta de melhoria.</p>
          {([["npsPergunta", "Pergunta", nps.pergunta], ["npsAgradece", "Agradecimento (nota 9 ou 10)", nps.agradece], ["npsMelhoria", "Pergunta de melhoria (nota 0 a 8)", nps.melhoria], ["npsObrigado", "Agradecimento depois do comentário", nps.obrigadoComentario]] as const).map(([k, r, v]) => (
            <div key={k}><label htmlFor={k} className="label">{r}</label><textarea id={k} name={k} rows={2} defaultValue={v} className="input h-auto py-2" /></div>
          ))}
        </section>
        <div className="lg:col-span-2"><button className="btn-primary">Salvar expediente e NPS</button></div>
      </form>
    </>
  );
}
