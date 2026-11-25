/** Conteúdo editável de um e-mail e o HTML com a marca da loja. Sem dependências de servidor. */

export type EmailConteudo = {
  preheader?: string; // texto que aparece ao lado do assunto na caixa de entrada
  titulo: string;
  texto: string; // parágrafos separados por linha em branco; **negrito**; {{nome}}
  imagemUrl?: string;
  botaoTexto?: string;
  botaoUrl?: string;
  rodape?: string;
};

export type Variaveis = Record<string, string | undefined>;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Troca {{nome}}, {{primeiro_nome}}, {{link_carrinho}} etc. Valor ausente vira vazio (e "nome" vira "cliente"). */
export function aplicarVariaveis(txt: string, v: Variaveis) {
  return txt.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => {
    const key = k.toLowerCase();
    if (key === "nome" || key === "primeiro_nome") return v[key] || "cliente";
    return v[key] ?? "";
  });
}

function paragrafos(texto: string) {
  return texto.trim().split(/\n\s*\n/).map((p) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3E3B3C">${
      esc(p).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`).join("");
}

export type Marca = { nome: string; site: string; logo: string };

export type Links = {
  appUrl: string;
  marca: Marca;
  /** Recebe a URL de destino e devolve a URL rastreada (clique). */
  rastrear?: (url: string) => string;
  pixel?: string; // URL do pixel de abertura
  descadastro: string;
};

export function renderEmail(c: EmailConteudo, v: Variaveis, l: Links) {
  const t = (s?: string) => aplicarVariaveis(s ?? "", v);
  const r = (url: string) => (l.rastrear ? l.rastrear(url) : url);
  const botao = c.botaoTexto && c.botaoUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:999px;background:#C25A14">
        <a href="${esc(r(t(c.botaoUrl)))}" style="display:inline-block;padding:14px 28px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none">${esc(t(c.botaoTexto))}</a>
       </td></tr></table>`
    : "";
  const imagem = c.imagemUrl
    ? `<img src="${esc(c.imagemUrl)}" alt="" width="536" style="display:block;width:100%;max-width:536px;height:auto;border-radius:12px;margin:0 0 20px">`
    : "";
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t(c.titulo))}</title></head>
<body style="margin:0;padding:0;background:#F4F2F1">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(t(c.preheader))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2F1"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:#ffffff;padding:20px 32px;border-bottom:4px solid #C25A14"><img src="${esc(/^https?:/.test(l.marca.logo) ? l.marca.logo : l.appUrl + l.marca.logo)}" alt="${esc(l.marca.nome)}" height="40" style="display:block;height:40px"></td></tr>
<tr><td style="padding:32px">
${imagem}
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:#2B2829">${esc(t(c.titulo))}</h1>
${paragrafos(t(c.texto))}
${botao}
</td></tr>
<tr><td style="padding:20px 32px;background:#F8F7F6;font-size:12px;line-height:1.5;color:#6B6768">
${c.rodape ? `${esc(t(c.rodape))}<br>` : ""}${esc(l.marca.nome)}${l.marca.site ? ` · ${esc(l.marca.site.replace(/^https?:\/\//, ""))}` : ""}<br>
Você recebeu este e-mail por ser cliente ou ter se cadastrado. <a href="${esc(l.descadastro)}" style="color:#6B6768">Não quero mais receber</a>.
</td></tr>
</table></td></tr></table>
${l.pixel ? `<img src="${esc(l.pixel)}" width="1" height="1" alt="" style="display:block">` : ""}
</body></html>`;
}

/** Versão em texto puro (melhora a entrega e é exigida por alguns provedores). */
export function textoPuro(c: EmailConteudo, v: Variaveis, descadastro: string, marca: Marca) {
  const t = (s?: string) => aplicarVariaveis(s ?? "", v);
  return [t(c.titulo), "", t(c.texto).replace(/\*\*/g, ""), c.botaoUrl ? `\n${t(c.botaoTexto)}: ${t(c.botaoUrl)}` : "",
    "", "—", `${marca.nome} ${marca.site}`.trim(), `Não quero mais receber: ${descadastro}`].join("\n");
}
