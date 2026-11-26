"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { transferirConversa } from "./actions";

function Botao() {
  const { pending } = useFormStatus();
  return <button className="btn-primary h-10" disabled={pending}>{pending ? "Transferindo..." : "Transferir"}</button>;
}

export default function Transferir({ chat, conexao, cliente, eu, usuarios }: { chat: string; conexao: string; cliente: string | null; eu: string; usuarios: { id: string; name: string; conectado: boolean }[] }) {
  const [st, run] = useFormState(transferirConversa, undefined);
  const [para, setPara] = useState("");
  const nome = usuarios.find((u) => u.id === para)?.name.split(" ")[0] ?? "";
  const pn = (cliente ?? "").trim().split(/\s+/)[0];
  return (
    <details className="relative">
      <summary className="btn-outline h-9 px-3 text-sm list-none cursor-pointer">Transferir</summary>
      <form action={run} className="absolute right-0 top-11 z-20 w-[min(92vw,380px)] card shadow-lg flex flex-col gap-2 text-sm">
        <input type="hidden" name="chat" value={chat} /><input type="hidden" name="conexao" value={conexao} />
        <label htmlFor="tr-para" className="label">Para quem</label>
        <select id="tr-para" name="para" value={para} onChange={(e) => setPara(e.target.value)} className="input" required>
          <option value="">Escolha</option>
          {usuarios.map((u) => <option key={u.id} value={u.id}>{u.name}{u.conectado ? "" : " (WhatsApp desconectado)"}</option>)}
        </select>
        <label htmlFor="tr-nota" className="label">Nota interna (o cliente não vê)</label>
        <textarea id="tr-nota" name="nota" rows={2} className="input h-auto py-2" placeholder="Ex.: quer 40 sacos para sexta, já passei o preço" />
        <label className="flex items-center gap-2 min-h-[36px]"><input type="checkbox" name="avisar" value="1" defaultChecked className="w-4 h-4 accent-[#E87722]" />Avisar o cliente</label>
        <textarea key={`a-${para}`} name="textoAviso" rows={2} aria-label="Mensagem para o cliente" className="input h-auto py-2"
          defaultValue={`${pn ? `${pn}, vou` : "Vou"} te passar para ${nome || "um colega"}, que vai continuar seu atendimento. 😉`} />
        <label className="flex items-center gap-2 min-h-[36px]"><input type="checkbox" name="chamar" value="1" defaultChecked className="w-4 h-4 accent-[#E87722]" />{nome || "O colega"} chama o cliente pelo próprio número</label>
        <textarea key={`b-${para}`} name="textoApresentacao" rows={3} aria-label="Primeira mensagem do colega" className="input h-auto py-2"
          defaultValue={`Oi${pn ? `, ${pn}` : ""}! Aqui é ${nome || "da equipe"}, da Asfalto Multi. ${eu.split(" ")[0]} me passou seu atendimento e vou continuar daqui. Como posso te ajudar?`} />
        <Botao />
        {st?.message && <p role={st.ok ? "status" : "alert"} className={st.ok ? "text-[#1E6B34]" : "text-[#A0261C]"}>{st.message}</p>}
      </form>
    </details>
  );
}
