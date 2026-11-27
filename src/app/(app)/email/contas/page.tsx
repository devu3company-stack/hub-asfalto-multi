import { requireModule } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { lojaValida } from "@/lib/lojas";
import { CAMPOS_SMTP, listarContas, smtpDaConta } from "@/lib/email/contas";
import { PageHeader, Badge } from "@/components/ui";
import ActionForm from "@/components/ActionForm";
import LojaTabs from "@/components/LojaTabs";
import Abas from "../Abas";
import { alternar, excluir, salvar } from "./actions";

export const dynamic = "force-dynamic";

function Campos({ sfx, nome, cfg }: { sfx: string; nome?: string; cfg?: Record<string, string> | null }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div className="sm:col-span-2 lg:col-span-3">
        <label htmlFor={`nome-${sfx}`} className="label">Nome da conta <span className="text-graphite-muted font-normal">(só aparece no hub)</span></label>
        <input id={`nome-${sfx}`} name="nome" defaultValue={nome} className="input" placeholder="Ex.: Vendas — Rodrigo" />
      </div>
      {CAMPOS_SMTP.map((c) => (
        <div key={c.key}>
          <label htmlFor={`${c.key}-${sfx}`} className="label">{c.label}{"optional" in c && <span className="text-graphite-muted font-normal"> (opcional)</span>}</label>
          <input id={`${c.key}-${sfx}`} name={c.key} type={"secret" in c ? "password" : "text"} autoComplete="off"
            defaultValue={"secret" in c ? "" : cfg?.[c.key] ?? ""} placeholder={"secret" in c && cfg ? "•••••• (deixe em branco para manter)" : ("placeholder" in c ? c.placeholder : "")} className="input" />
        </div>
      ))}
    </div>
  );
}

export default async function Contas({ searchParams }: { searchParams: { loja?: string } }) {
  const user = await requireModule("email");
  const loja = lojaValida(searchParams.loja);
  const editor = can(user.role, "email", "edit");
  const contas = await listarContas();
  const cfgs = editor ? await Promise.all(contas.map((c) => smtpDaConta(c.id))) : [];
  return (
    <>
      <PageHeader title="E-mail marketing" subtitle="Contas de e-mail que podem enviar. Cada campanha e cada automação escolhe por qual conta sai.">
        <LojaTabs atual={loja} path="/email/contas" />
      </PageHeader>
      <Abas atual="/email/contas" loja={loja} />

      <p className="card text-sm text-graphite">
        Cada conta tem os próprios limites por hora e por dia. Quando nenhuma conta é escolhida, o e-mail sai pelo servidor da loja configurado em Integrações.
        O <strong>nome do remetente</strong> é como você se identifica na caixa de entrada do cliente (ex.: &quot;Rodrigo | Asfalto Multi&quot;).
      </p>

      {editor && (
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">Nova conta de envio</h2>
          <ActionForm action={salvar} label="Salvar e testar" busy="Testando..." reset><Campos sfx="novo" /></ActionForm>
        </section>
      )}

      <section className="flex flex-col gap-3">
        {!contas.length && <p className="card text-sm text-graphite-muted">Nenhuma conta cadastrada ainda.</p>}
        {contas.map((c, i) => (
          <details key={c.id} className="card">
            <summary className="flex flex-wrap items-center gap-3 cursor-pointer min-h-[44px]">
              <span className="font-semibold">{c.nome}</span>
              <span className="text-sm text-graphite">{c.email}</span>
              {c.status === "ok" ? <Badge tone="green">Conectada</Badge> : c.status === "erro" ? <Badge tone="red">Com erro</Badge> : <Badge tone="gray">Não testada</Badge>}
              {!c.ativo && <Badge tone="gray">Desligada</Badge>}
            </summary>
            {c.erro && <p className="text-sm text-[#A0261C] mt-2">{c.erro}</p>}
            {editor && (
              <div className="mt-3 flex flex-col gap-3">
                <ActionForm action={salvar} label="Salvar e testar" busy="Testando...">
                  <input type="hidden" name="id" value={c.id} />
                  <Campos sfx={c.id} nome={c.nome} cfg={cfgs[i]} />
                </ActionForm>
                <div className="flex flex-wrap gap-3 border-t border-surface-line pt-3">
                  <form action={alternar}><input type="hidden" name="id" value={c.id} /><button className="btn-outline h-11">{c.ativo ? "Desligar" : "Ligar"}</button></form>
                  <form action={excluir}><input type="hidden" name="id" value={c.id} /><button className="btn-outline h-11 text-[#A0261C] border-[#A0261C]">Excluir conta</button></form>
                </div>
              </div>
            )}
          </details>
        ))}
      </section>
    </>
  );
}
