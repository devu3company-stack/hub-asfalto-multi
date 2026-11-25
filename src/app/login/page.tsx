"use client";
import { useFormState, useFormStatus } from "react-dom";
import { login } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full h-12" disabled={pending}>
      {pending ? "Entrando..." : "Entrar"}
    </button>
  );
}

export default function LoginPage() {
  const [state, action] = useFormState(login, undefined);
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm flex flex-col gap-4 p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Asfalto Multi" className="w-44 mx-auto mb-2" />
        <h1 className="font-display font-extrabold text-xl text-center">Entrar no Hub</h1>
        <div>
          <label htmlFor="email" className="label">E-mail</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div>
          <label htmlFor="password" className="label">Senha</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        {state?.error && <p role="alert" className="text-sm text-[#A0261C]">{state.error}</p>}
        <Submit />
      </form>
    </main>
  );
}
