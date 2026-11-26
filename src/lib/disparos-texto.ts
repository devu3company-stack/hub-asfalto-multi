/** Textos e ritmo dos disparos (usado no servidor e na pré-visualização da tela). */

// ───────── Proteção: modelos de ritmo ─────────

export const RITMOS = {
  seguro: { rotulo: "Seguro (recomendado)", intervaloMin: 45, intervaloMax: 120, loteTamanho: 15, lotePausa: 20, limiteDia: 100 },
  moderado: { rotulo: "Moderado", intervaloMin: 30, intervaloMax: 80, loteTamanho: 25, lotePausa: 15, limiteDia: 200 },
  rapido: { rotulo: "Rápido (só número antigo e lista de clientes)", intervaloMin: 15, intervaloMax: 45, loteTamanho: 40, lotePausa: 10, limiteDia: 350 },
} as const;

/** Mensagens por hora que um número consegue mandar com esse ritmo (média). */
export function porHora(d: { intervaloMin: number; intervaloMax: number; loteTamanho: number; lotePausa: number }) {
  const media = (d.intervaloMin + d.intervaloMax) / 2;
  const ciclo = d.loteTamanho * media + d.lotePausa * 60;
  return Math.max(1, Math.round((3600 / ciclo) * d.loteTamanho));
}

// ───────── Telefones e textos ─────────

export function normalizarTelefone(v: unknown) {
  const d = String(v ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) return "55" + d;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}


/** Variáveis {{nome}}, {{primeiro_nome}}, {{empresa}} e qualquer coluna da planilha; depois o "spintax" {Olá|Oi|Bom dia}. */
export function renderizar(texto: string, c: { nome: string | null; empresa: string | null; vars: Record<string, string> }) {
  const nome = (c.nome ?? "").trim();
  const v: Record<string, string> = { ...c.vars, nome, primeiro_nome: nome.split(/\s+/)[0] ?? "", empresa: (c.empresa ?? "").trim() };
  let t = texto;
  // Sem o dado: tira a vírgula/espaço que sobraria ("Oi, {{primeiro_nome}}!" → "Oi!").
  for (const k of Object.keys(v)) if (!v[k]) t = t.replace(new RegExp(`[,\\s]*\\{\\{\\s*${k}\\s*\\}\\}`, "g"), "");
  t = t.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => v[k] ?? "");
  t = t.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, ops: string) => { const o = ops.split("|"); return o[Math.floor(Math.random() * o.length)]; });
  return t.replace(/[ \t]{2,}/g, " ").replace(/ ([,.!?])/g, "$1").trim();
}

export const RODAPE = "\n\n_Se não quiser receber mais mensagens, responda SAIR._";

