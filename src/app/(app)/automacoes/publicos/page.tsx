import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { gerarCsv, pessoas, SEGMENTOS } from "@/lib/automacoes/publicos";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Publicos({ searchParams }: { searchParams: { tag?: string } }) {
  await requireModule("automacoes", "edit");
  const contagem = await Promise.all(Object.keys(SEGMENTOS).map(async (k) => [k, gerarCsv(await pessoas(k, searchParams.tag), "meta").total] as const));
  return (
    <>
      <PageHeader title="Públicos de anúncio" subtitle="Listas para remarketing no Google Ads e no Meta Ads. Contatos descadastrados ficam de fora.">
        <Link href="/automacoes" className="btn-outline h-9 px-4">Automações</Link>
      </PageHeader>
      <div className="grid md:grid-cols-2 gap-3">
        {contagem.map(([k, n]) => (
          <section key={k} className="card flex flex-col gap-2">
            <h2 className="font-semibold">{SEGMENTOS[k].rotulo}</h2>
            <p className="text-sm text-graphite">{SEGMENTOS[k].descricao}</p>
            {k === "tag" && (
              <form className="flex gap-2 items-end"><div><label htmlFor="tag" className="label">Etiqueta</label><input id="tag" name="tag" defaultValue={searchParams.tag} className="input" /></div><button className="btn-outline h-11">Contar</button></form>
            )}
            <p className="text-sm"><strong>{n.toLocaleString("pt-BR")}</strong> pessoa(s) com e-mail ou telefone</p>
            {n > 0 && (
              <div className="flex flex-wrap gap-2 mt-auto">
                <a href={`/api/automacoes/publico?segmento=${k}&formato=meta${k === "tag" ? `&tag=${encodeURIComponent(searchParams.tag ?? "")}` : ""}`} className="btn-outline h-10">Baixar para o Meta</a>
                <a href={`/api/automacoes/publico?segmento=${k}&formato=google${k === "tag" ? `&tag=${encodeURIComponent(searchParams.tag ?? "")}` : ""}`} className="btn-outline h-10">Baixar para o Google</a>
              </div>
            )}
          </section>
        ))}
      </div>
      <section className="card text-sm flex flex-col gap-2">
        <h2 className="font-semibold">Como subir</h2>
        <p><strong>Meta:</strong> Gerenciador de Anúncios → Públicos → Criar público → Público personalizado → Lista de clientes → enviar o arquivo.</p>
        <p><strong>Google Ads:</strong> Ferramentas → Gerenciador de público-alvo → Segmentos → + → Lista de clientes → enviar o arquivo.</p>
        <p className="text-graphite-muted">A sincronização automática com as duas contas pode ser ligada depois, quando a API de anúncios estiver liberada em cada conta.</p>
      </section>
    </>
  );
}
