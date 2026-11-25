"use client";
import { useFormState, useFormStatus } from "react-dom";
import AnaliseFrete from "@/components/AnaliseFrete";
import { avaliar } from "../historico/actions";

function Botao() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? "Comparando..." : "Comparar com o histórico"}</button>;
}

export default function Avaliador({ veiculos }: { veiculos: string[] }) {
  const [st, run] = useFormState(avaliar, undefined);
  return (
    <>
      <section className="card">
        <form action={run} className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
          <div><label htmlFor="veiculo" className="label">Veículo</label>
            <select id="veiculo" name="veiculo" className="input" required defaultValue="">
              <option value="" disabled>Escolha</option>{veiculos.map((v) => <option key={v}>{v}</option>)}</select></div>
          <div><label htmlFor="kg" className="label">Peso (kg)</label><input id="kg" name="kg" inputMode="decimal" required className="input" /></div>
          <div><label htmlFor="km" className="label">Distância (km)</label><input id="km" name="km" inputMode="decimal" required className="input" /></div>
          <div><label htmlFor="uf" className="label">UF destino</label><input id="uf" name="uf" maxLength={2} className="input uppercase" placeholder="SP" /></div>
          <div><label htmlFor="cotado" className="label">Valor cotado (R$)</label><input id="cotado" name="cotado" inputMode="decimal" className="input" placeholder="opcional" /></div>
          <Botao />
        </form>
        {st?.message && !st.ok && <p role="alert" className="text-sm text-[#A0261C] mt-2">{st.message}</p>}
      </section>
      {st?.analise && <section className="card" aria-live="polite"><AnaliseFrete a={st.analise} /></section>}
    </>
  );
}
