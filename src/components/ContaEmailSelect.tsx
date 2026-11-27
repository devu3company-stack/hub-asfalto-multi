/** Escolha da conta de e-mail que envia. Vazio = servidor da loja (Integrações). */
export default function ContaEmailSelect({ id, contas, valor, padrao = "Servidor da loja (Integrações)" }: {
  id: string; contas: { id: string; nome: string; email: string }[]; valor?: string | null; padrao?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">Enviar pela conta</label>
      <select id={id} name="contaId" defaultValue={valor ?? ""} className="input min-w-[240px]">
        <option value="">{padrao}</option>
        {contas.map((c) => <option key={c.id} value={c.id}>{c.nome} ({c.email})</option>)}
      </select>
    </div>
  );
}
