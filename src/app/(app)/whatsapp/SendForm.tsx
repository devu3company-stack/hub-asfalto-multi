"use client";
import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { enviar } from "./actions";

function Btn() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? "Enviando..." : "Enviar"}</button>;
}

export default function SendForm({ chat }: { chat?: string }) {
  const [state, action] = useFormState(enviar, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="flex flex-col gap-2">
      {chat ? (
        <input type="hidden" name="chat" value={chat} />
      ) : (
        <div>
          <label htmlFor="wa-num" className="label">Número (com DDD)</label>
          <input id="wa-num" name="chat" inputMode="tel" placeholder="5519999999999" className="input" required />
        </div>
      )}
      <label htmlFor="wa-text" className="sr-only">Mensagem</label>
      <textarea id="wa-text" name="text" rows={3} required placeholder="Escreva a mensagem" className="input h-auto py-3" />
      <div className="flex flex-wrap items-center gap-3">
        <Btn />
        {state?.message && <p role="status" className={`text-sm ${state.ok ? "text-[#1E6B34]" : "text-[#A0261C]"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
