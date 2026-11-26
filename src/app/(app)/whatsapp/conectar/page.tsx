import Link from "next/link";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { can } from "@/lib/permissions";
import { qrStatus } from "@/lib/whatsapp/gateway";
import { garantirConexaoDoUsuario } from "@/lib/whatsapp/conexoes";
import { PageHeader } from "@/components/ui";
import QrPanel from "../QrPanel";
import OficialForm from "../config/OficialForm";
import { alternarIA, conectar, desconectar, vincularOficial } from "../actions";

export const dynamic = "force-dynamic";
const K = schema.waConexoes;

export default async function MeuWhatsApp({ searchParams }: { searchParams: { u?: string; tipo?: string } }) {
  const user = await requireModule("whatsapp");
  const admin = user.role === "ADMIN";
  // O administrador configura o WhatsApp de qualquer usuário.
  const equipe = admin ? (await db.query.users.findMany({ where: eq(schema.users.active, true), columns: { id: true, name: true, role: true }, orderBy: asc(schema.users.name) }))
    .filter((x) => can(x.role, "whatsapp")) : [];
  const alvo = admin && searchParams.u ? equipe.find((x) => x.id === searchParams.u) ?? user : user;
  const proprio = alvo.id === user.id;
  const tipo = searchParams.tipo === "oficial" ? "oficial" : "qr";
  const cx = await garantirConexaoDoUsuario(alvo);
  const st = await qrStatus(cx.id);
  const [oficiais, livres] = await Promise.all([
    db.query.waConexoes.findMany({ where: and(eq(K.userId, alvo.id), eq(K.tipo, "oficial")) }),
    admin ? db.query.waConexoes.findMany({ where: and(eq(K.tipo, "oficial"), or(isNull(K.userId), eq(K.userId, alvo.id))) }) : Promise.resolve([]),
  ]);
  const usuarios = equipe.map((x) => ({ id: x.id, name: x.name }));
  const q = (t: string) => `/whatsapp/conectar?${admin && !proprio ? `u=${alvo.id}&` : ""}tipo=${t}`;

  return (
    <>
      <PageHeader title={proprio ? "Meu WhatsApp" : `WhatsApp de ${alvo.name}`} subtitle="Cada pessoa tem o próprio número: as conversas dele aparecem para ela (e para o administrador).">
        <Link href="/whatsapp" className="btn-outline h-9 px-4">Conversas</Link>
      </PageHeader>

      {admin && (
        <form className="card flex flex-wrap items-end gap-3">
          <div><label htmlFor="u" className="label">Configurar o WhatsApp de</label>
            <select id="u" name="u" defaultValue={alvo.id} className="input w-64">{equipe.map((x) => <option key={x.id} value={x.id}>{x.name}{x.id === user.id ? " (você)" : ""}</option>)}</select></div>
          <input type="hidden" name="tipo" value={tipo} />
          <button className="btn-outline h-11">Abrir</button>
        </form>
      )}

      <nav aria-label="Tipo de conexão" className="flex gap-2">
        <Link href={q("qr")} aria-current={tipo === "qr" ? "page" : undefined} className={`px-4 h-11 inline-flex items-center rounded-full text-sm font-semibold ${tipo === "qr" ? "bg-graphite-dark text-white" : "bg-white border border-surface-line"}`}>QR code (número comum)</Link>
        <Link href={q("oficial")} aria-current={tipo === "oficial" ? "page" : undefined} className={`px-4 h-11 inline-flex items-center rounded-full text-sm font-semibold ${tipo === "oficial" ? "bg-graphite-dark text-white" : "bg-white border border-surface-line"}`}>API oficial (Meta){oficiais.length ? ` · ${oficiais.length}` : ""}</Link>
      </nav>

      {tipo === "qr" ? (
        <div className="grid lg:grid-cols-3 gap-4 items-start">
          <section className="card flex flex-col gap-3 lg:col-span-2">
            <h2 className="font-display font-bold text-lg">Conexão por QR code</h2>
            {!proprio && <p className="text-sm text-graphite">Leia o QR com o celular de {alvo.name.split(" ")[0]} (WhatsApp › Aparelhos conectados › Conectar aparelho).</p>}
            <QrPanel conexao={cx.id} initial={st}
              semQr={<form action={conectar}><input type="hidden" name="conexao" value={cx.id} /><button className="btn-primary">{proprio ? "Conectar meu WhatsApp" : `Gerar QR para ${alvo.name.split(" ")[0]}`}</button></form>}>
              <form action={desconectar}><input type="hidden" name="conexao" value={cx.id} /><button className="text-sm font-semibold text-[#A0261C] min-h-[44px]">Desconectar este número</button></form>
            </QrPanel>
            {st.status === "indisponivel" && <p className="text-sm text-graphite-muted">O serviço de conexão não respondeu agora. Tente de novo em instantes.</p>}
          </section>
          <section className="card flex flex-col gap-3">
            <h2 className="font-display font-bold text-lg">IA e automações neste número</h2>
            <p className="text-sm text-graphite">Ligado: a atendente com IA e as automações respondem por este número. Desligado: só a pessoa responde.</p>
            <form action={alternarIA} className="flex items-center gap-3">
              <input type="hidden" name="conexao" value={cx.id} />
              <button role="switch" aria-checked={cx.iaLigada} aria-label="IA e automações neste número"
                className={`w-14 h-8 rounded-full relative transition ${cx.iaLigada ? "bg-[#1E8A44]" : "bg-[#D9D6D4]"}`}>
                <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${cx.iaLigada ? "left-7" : "left-1"}`} />
              </button>
              <span className="font-semibold">{cx.iaLigada ? "Ligadas" : "Desligadas"}</span>
            </form>
          </section>
        </div>
      ) : (
        <section className="card flex flex-col gap-4">
          <div>
            <h2 className="font-display font-bold text-lg">Números da API oficial {proprio ? "com você" : `com ${alvo.name.split(" ")[0]}`}</h2>
            <p className="text-sm text-graphite">Não precisa de QR: a Meta conecta. Só dá para mandar mensagem livre a quem escreveu nas últimas 24 horas.</p>
          </div>
          {!oficiais.length && <p className="text-sm text-graphite-muted">Nenhum número oficial {proprio ? "com você" : "com esta pessoa"}.{!admin ? " Peça ao administrador para vincular um." : ""}</p>}
          {oficiais.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-3 text-sm rounded-xl border border-surface-line p-3">
              <strong>{o.nome}</strong><span className="text-graphite">{o.numero ?? `ID ${o.phoneNumberId}`}</span>
              <form action={alternarIA}><input type="hidden" name="conexao" value={o.id} /><button className="btn-outline h-9 px-3 text-sm">IA e automações: {o.iaLigada ? "ligadas" : "desligadas"}</button></form>
              {admin && <form action={vincularOficial} className="ml-auto"><input type="hidden" name="conexao" value={o.id} /><input type="hidden" name="userId" value="" /><button className="text-sm text-[#A0261C] font-semibold">Tirar desta pessoa</button></form>}
            </div>
          ))}
          {admin && (
            <>
              {livres.filter((l) => l.userId !== alvo.id).length > 0 && (
                <form action={vincularOficial} className="flex flex-wrap items-end gap-3 border-t border-surface-line pt-3">
                  <input type="hidden" name="userId" value={alvo.id} />
                  <div><label htmlFor="vin" className="label">Vincular número oficial já cadastrado (sem dono)</label>
                    <select id="vin" name="conexao" className="input w-72">{livres.filter((l) => l.userId !== alvo.id).map((l) => <option key={l.id} value={l.id}>{l.nome} · {l.numero ?? l.phoneNumberId}</option>)}</select></div>
                  <button className="btn-primary h-11">Vincular a {alvo.name.split(" ")[0]}</button>
                </form>
              )}
              <div className="border-t border-surface-line pt-3">
                <p className="font-semibold mb-2">Cadastrar novo número oficial para {alvo.name.split(" ")[0]}</p>
                <OficialForm usuarios={usuarios} donoPadrao={alvo.id} />
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
