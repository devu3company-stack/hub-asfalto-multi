"use client";
import { useFormState, useFormStatus } from "react-dom";
import { saveAndTest } from "./actions";
import type { ProviderDef } from "@/lib/integrations/providers";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? "Testando..." : "Salvar e testar"}</button>;
}

/** Os campos secretos nunca voltam preenchidos: em branco = manter o valor salvo. */
export default function IntegrationForm({ def, saved, values }: { def: ProviderDef; saved: boolean; values: Record<string, string> }) {
  const [state, action] = useFormState(saveAndTest, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="provider" value={def.id} />
      <div className="grid sm:grid-cols-2 gap-3">
        {def.fields.map((f) => (
          <div key={f.key}>
            <label htmlFor={`${def.id}-${f.key}`} className="label">
              {f.label}{f.optional && <span className="text-graphite-muted font-normal"> (opcional)</span>}
            </label>
            <input
              id={`${def.id}-${f.key}`}
              name={f.key}
              type={f.secret ? "password" : "text"}
              autoComplete="off"
              defaultValue={f.secret ? "" : values[f.key] ?? ""}
              placeholder={f.secret && saved ? "•••••• (salvo, deixe em branco para manter)" : f.placeholder}
              className="input"
            />
            {f.help && <p className="text-xs text-graphite-muted mt-1">{f.help}</p>}
          </div>
        ))}
      </div>
      {state?.message && (
        <p role="status" className={`text-sm ${state.ok ? "text-[#1E6B34]" : "text-[#A0261C]"}`}>{state.message}</p>
      )}
      <div><Submit /></div>
    </form>
  );
}
