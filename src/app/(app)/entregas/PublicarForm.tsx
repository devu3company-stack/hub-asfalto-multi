"use client";
import { useRef, useState, useTransition } from "react";
import ActionForm from "@/components/ActionForm";
import AnaliseFrete, { type AnaliseJSON } from "@/components/AnaliseFrete";
import { publicar, sugerir } from "./actions";

export default function PublicarForm({ veiculos, lojas, origem, nEntregadores }: { veiculos: string[]; lojas: { id: string; nome: string }[]; origem: string; nEntregadores: number }) {
  const form = useRef<HTMLDivElement>(null);
  const [a, setA] = useState<AnaliseJSON | null>(null);
  const [aviso, setAviso] = useState("");
  const [carregando, start] = useTransition();
  const val = (n: string) => (form.current?.querySelector(`[name="${n}"]`) as HTMLInputElement | null)?.value ?? "";
  const numero = (s: string) => Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s) || 0;

  function verSugestao() {
    const kg = numero(val("kg")), km = numero(val("km")), veiculo = val("veiculo");
    if (!kg || !km || !veiculo) { setAviso("Preencha peso, distância e veículo para ver o valor sugerido."); return; }
    setAviso("");
    start(async () => setA(await sugerir({ kg, km, veiculo, uf: val("uf") })));
  }
  function usar(v: number) {
    const i = form.current?.querySelector('[name="valor"]') as HTMLInputElement | null;
    if (i) { i.value = v.toFixed(2).replace(".", ","); i.focus(); }
  }

  return (
    <div ref={form}>
      <ActionForm action={publicar} label={`Publicar e avisar ${nEntregadores} entregador(es)`} busy="Publicando...">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label htmlFor="origem" className="label">Origem</label><input id="origem" name="origem" defaultValue={origem} className="input" /></div>
          <div><label htmlFor="destino" className="label">Cidade de destino</label><input id="destino" name="destino" required className="input" /></div>
          <div><label htmlFor="uf" className="label">UF</label><input id="uf" name="uf" maxLength={2} defaultValue="SP" className="input uppercase" /></div>
          <div><label htmlFor="km" className="label">Distância (km)</label><input id="km" name="km" inputMode="decimal" className="input" /></div>
          <div className="lg:col-span-2"><label htmlFor="endereco" className="label">Endereço de entrega</label><input id="endereco" name="endereco" className="input" placeholder="Só aparece para quem aceitar" /></div>
          <div><label htmlFor="cliente" className="label">Cliente</label><input id="cliente" name="cliente" className="input" /></div>
          <div><label htmlFor="telefoneCliente" className="label">WhatsApp do cliente</label><input id="telefoneCliente" name="telefoneCliente" inputMode="tel" className="input" placeholder="Para os avisos da entrega" /></div>
          <div><label htmlFor="contatoCliente" className="label">Contato no local</label><input id="contatoCliente" name="contatoCliente" className="input" placeholder="Nome e telefone" /></div>
          <div><label htmlFor="produto" className="label">Produto</label><input id="produto" name="produto" className="input" placeholder="Sacos, baldes, lombadas..." /></div>
          <div><label htmlFor="qtd" className="label">Quantidade</label><input id="qtd" name="qtd" inputMode="decimal" className="input" /></div>
          <div><label htmlFor="kg" className="label">Peso total (kg)</label><input id="kg" name="kg" inputMode="decimal" className="input" /></div>
          <div><label htmlFor="veiculo" className="label">Veículo</label>
            <select id="veiculo" name="veiculo" className="input" defaultValue=""><option value="">Qualquer</option>{veiculos.map((v) => <option key={v}>{v}</option>)}</select></div>
          <div><label htmlFor="coleta" className="label">Data da coleta</label><input id="coleta" name="coleta" type="date" className="input" /></div>
          <div><label htmlFor="loja" className="label">Loja</label>
            <select id="loja" name="loja" className="input">{lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></div>
          <div className="lg:col-span-2"><label htmlFor="observacao" className="label">Observação para o entregador</label><input id="observacao" name="observacao" className="input" placeholder="Ex.: descarga por conta do cliente" /></div>
        </div>
        <div className="rounded-xl bg-[#F8F7F6] p-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div><label htmlFor="valor" className="label">Valor pago ao entregador (R$)</label><input id="valor" name="valor" inputMode="decimal" required className="input w-48" /></div>
            <button type="button" onClick={verSugestao} disabled={carregando} className="btn-outline h-11">{carregando ? "Calculando..." : "Ver valor sugerido pelo histórico"}</button>
          </div>
          {aviso && <p role="alert" className="text-sm text-[#A0261C]">{aviso}</p>}
          {a && (
            <div className="flex flex-col gap-2" aria-live="polite">
              <AnaliseFrete a={a} compacto />
              {a.n > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => usar(a.sugerido)} className="btn-primary h-10">Usar {a.sugerido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (mediana paga)</button>
                  <button type="button" onClick={() => usar(Math.round(a.orcamento.q1 / 10) * 10)} className="btn-outline h-10">Usar faixa excelente</button>
                </div>
              )}
            </div>
          )}
        </div>
      </ActionForm>
    </div>
  );
}
