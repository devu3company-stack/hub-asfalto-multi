"use client";
import { useEffect, useRef } from "react";
import { useFormState, useFormStatus } from "react-dom";
import type { FormMsg } from "./actions";

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? busy : label}</button>;
}

/** Formulário com server action e mensagem de retorno. `reset` limpa os campos após sucesso. */
export default function ActionForm({
  action, children, label, busy = "Salvando...", reset = false, className = "flex flex-col gap-3",
}: {
  action: (p: FormMsg, f: FormData) => Promise<FormMsg>;
  children: React.ReactNode;
  label: string;
  busy?: string;
  reset?: boolean;
  className?: string;
}) {
  const [state, run] = useFormState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (reset && state?.ok) ref.current?.reset(); }, [state, reset]);
  return (
    <form ref={ref} action={run} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Submit label={label} busy={busy} />
        {state?.message && (
          <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-[#1E6B34]" : "text-[#A0261C]"}`}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
