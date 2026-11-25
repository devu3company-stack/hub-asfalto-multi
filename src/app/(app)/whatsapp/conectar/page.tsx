import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { qrStatus } from "@/lib/whatsapp/gateway";
import { garantirConexaoDoUsuario } from "@/lib/whatsapp/conexoes";
import { PageHeader } from "@/components/ui";
import QrPanel from "../QrPanel";
import { alternarIA, conectar, desconectar } from "../actions";

export const dynamic = "force-dynamic";

export default async function MeuWhatsApp() {
  const user = await requireModule("whatsapp");
  const cx = await garantirConexaoDoUsuario(user);
  const st = await qrStatus(cx.id);
  return (
    <>
      <PageHeader title="Meu WhatsApp" subtitle="Seu número, só seu: as conversas dele aparecem para você (e para o administrador).">
        <Link href="/whatsapp" className="btn-outline h-9 px-4">Conversas</Link>
      </PageHeader>
      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <section className="card flex flex-col gap-3 lg:col-span-2">
          <h2 className="font-display font-bold text-lg">Conexão</h2>
          <QrPanel conexao={cx.id} initial={st}
            semQr={<form action={conectar}><input type="hidden" name="conexao" value={cx.id} /><button className="btn-primary">Conectar meu WhatsApp</button></form>}>
            <form action={desconectar}><input type="hidden" name="conexao" value={cx.id} /><button className="text-sm font-semibold text-[#A0261C] min-h-[44px]">Desconectar meu número</button></form>
          </QrPanel>
          {st.status === "indisponivel" && <p className="text-sm text-graphite-muted">O serviço de conexão não respondeu agora. Tente de novo em instantes.</p>}
        </section>
        <section className="card flex flex-col gap-3">
          <h2 className="font-display font-bold text-lg">IA e automações no meu número</h2>
          <p className="text-sm text-graphite">Ligado: a atendente com IA e as automações (follow-up, dúvidas, avisos) respondem pelo seu número. Desligado: só você responde.</p>
          <p className="text-sm">O lead automático pelo CPF/CNPJ funciona sempre, e os leads do seu número ficam com você no funil.</p>
          <form action={alternarIA} className="flex items-center gap-3">
            <input type="hidden" name="conexao" value={cx.id} />
            <button role="switch" aria-checked={cx.iaLigada} aria-label="IA e automações no meu número"
              className={`w-14 h-8 rounded-full relative transition ${cx.iaLigada ? "bg-[#1E8A44]" : "bg-[#D9D6D4]"}`}>
              <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${cx.iaLigada ? "left-7" : "left-1"}`} />
            </button>
            <span className="font-semibold">{cx.iaLigada ? "Ligadas" : "Desligadas"}</span>
          </form>
        </section>
      </div>
    </>
  );
}
