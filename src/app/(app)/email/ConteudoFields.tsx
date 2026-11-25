"use client";
import { useMemo, useState } from "react";
import { renderEmail, type EmailConteudo, type Marca } from "@/lib/email/template";

/** Campos do conteúdo de um e-mail + pré-visualização ao vivo. `p` prefixa os nomes (automação com vários e-mails). */
export default function ConteudoFields({ inicial, p = "", variaveis = [], marca }: { inicial: EmailConteudo; p?: string; variaveis?: string[]; marca: Marca }) {
  const [c, setC] = useState<EmailConteudo>(inicial);
  const set = (k: keyof EmailConteudo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setC({ ...c, [k]: e.target.value });
  const html = useMemo(() => renderEmail(c, {
    nome: "Maria Silva", primeiro_nome: "Maria", link_carrinho: marca.site, pedido: "#1001", cidade: "Mogi Mirim", loja: marca.nome, site: marca.site,
  }, { appUrl: typeof window === "undefined" ? "" : window.location.origin, descadastro: "#", marca }), [c, marca]);
  const id = (k: string) => `${p}${k}`;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="flex flex-col gap-3">
        <div>
          <label htmlFor={id("titulo")} className="label">Título (dentro do e-mail)</label>
          <input id={id("titulo")} name={id("titulo")} value={c.titulo} onChange={set("titulo")} required className="input" />
        </div>
        <div>
          <label htmlFor={id("texto")} className="label">Texto</label>
          <textarea id={id("texto")} name={id("texto")} value={c.texto} onChange={set("texto")} rows={9} required className="input h-auto py-3 leading-relaxed" />
          <p className="text-xs text-graphite-muted mt-1">
            Linha em branco separa parágrafos. **texto** fica em negrito. Variáveis: {["{{primeiro_nome}}", "{{nome}}", "{{loja}}", "{{site}}", ...variaveis].join(", ")}
          </p>
        </div>
        <div>
          <label htmlFor={id("preheader")} className="label">Texto de prévia <span className="text-graphite-muted font-normal">(aparece ao lado do assunto)</span></label>
          <input id={id("preheader")} name={id("preheader")} value={c.preheader ?? ""} onChange={set("preheader")} className="input" />
        </div>
        <div>
          <label htmlFor={id("imagemUrl")} className="label">Imagem <span className="text-graphite-muted font-normal">(link https, opcional)</span></label>
          <input id={id("imagemUrl")} name={id("imagemUrl")} value={c.imagemUrl ?? ""} onChange={set("imagemUrl")} className="input" placeholder="https://asfaltomulti.com.br/wp-content/uploads/..." />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={id("botaoTexto")} className="label">Texto do botão</label>
            <input id={id("botaoTexto")} name={id("botaoTexto")} value={c.botaoTexto ?? ""} onChange={set("botaoTexto")} className="input" />
          </div>
          <div>
            <label htmlFor={id("botaoUrl")} className="label">Link do botão</label>
            <input id={id("botaoUrl")} name={id("botaoUrl")} value={c.botaoUrl ?? ""} onChange={set("botaoUrl")} className="input" placeholder="https://" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="label">Pré-visualização</span>
        <iframe title="Pré-visualização do e-mail" srcDoc={html} sandbox="" className="w-full h-[560px] rounded-xl border border-surface-line bg-white" />
      </div>
    </div>
  );
}
