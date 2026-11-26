"use client";
import { useFormState, useFormStatus } from "react-dom";
import { salvarOficial } from "../actions";

function Botao({ novo }: { novo: boolean }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary h-10" disabled={pending}>{pending ? "Salvando..." : novo ? "Cadastrar número" : "Salvar"}</button>;
}

type Num = { id: string; nome: string; phoneNumberId: string | null; numero: string | null; userId: string | null; temToken: boolean };

export default function OficialForm({ n, usuarios, donoPadrao }: { n?: Num; usuarios: { id: string; name: string }[]; donoPadrao?: string }) {
  const [st, run] = useFormState(salvarOficial, undefined);
  const s = n?.id ?? "novo";
  return (
    <form action={run} className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
      {n && <input type="hidden" name="id" value={n.id} />}
      <div><label htmlFor={`on-${s}`} className="label">Nome</label><input id={`on-${s}`} name="nome" defaultValue={n?.nome} required className="input" placeholder="Ex.: Comercial" /></div>
      <div><label htmlFor={`op-${s}`} className="label">ID do número (Meta)</label><input id={`op-${s}`} name="phoneNumberId" defaultValue={n?.phoneNumberId ?? ""} required inputMode="numeric" className="input" /></div>
      <div><label htmlFor={`onum-${s}`} className="label">Telefone (para exibir)</label><input id={`onum-${s}`} name="numero" defaultValue={n?.numero ?? ""} inputMode="tel" className="input" placeholder="19 3800-0000" /></div>
      <div><label htmlFor={`ou-${s}`} className="label">Quem usa</label>
        <select id={`ou-${s}`} name="userId" defaultValue={n?.userId ?? donoPadrao ?? ""} className="input"><option value="">— ninguém —</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
      <div><label htmlFor={`ot-${s}`} className="label">Token próprio (opcional)</label><input id={`ot-${s}`} name="token" type="password" autoComplete="off" className="input" placeholder={n?.temToken ? "•••••• (manter)" : "usa o de Integrações"} /></div>
      <div className="sm:col-span-2 lg:col-span-5 flex items-center gap-3">
        <Botao novo={!n} />
        {st?.message && <p role={st.ok ? "status" : "alert"} className={`text-sm ${st.ok ? "text-[#1E6B34]" : "text-[#A0261C]"}`}>{st.message}</p>}
      </div>
    </form>
  );
}
