"use client";
import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { criarUsuario } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? "Criando..." : "Criar usuário"}</button>;
}

export default function NewUserForm({ roles }: { roles: { value: string; label: string }[] }) {
  const [state, action] = useFormState(criarUsuario, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 items-end">
      <div><label htmlFor="n-name" className="label">Nome</label><input id="n-name" name="name" required className="input" /></div>
      <div><label htmlFor="n-email" className="label">E-mail</label><input id="n-email" name="email" type="email" required className="input" /></div>
      <div><label htmlFor="n-pass" className="label">Senha inicial</label><input id="n-pass" name="password" type="password" minLength={8} required autoComplete="new-password" className="input" /></div>
      <div>
        <label htmlFor="n-role" className="label">Perfil</label>
        <select id="n-role" name="role" className="input" defaultValue="ATENDIMENTO">
          {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2 xl:col-span-4 flex flex-wrap items-center gap-3">
        <Submit />
        {state?.message && <p role="status" className={`text-sm ${state.ok ? "text-[#1E6B34]" : "text-[#A0261C]"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
