import "server-only";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { eq, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db, schema } from "../db";

/** Fase 4: PDFs dos produtos, com o texto de cada página para busca e para a IA. */

export const PASTA = process.env.MANUAIS_DIR ?? path.join(process.cwd(), "data", "manuais");
export const caminho = (arquivo: string) => path.join(PASTA, path.basename(arquivo));

async function extrairPaginas(buf: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(buf);
  const { text } = await extractText(pdf, { mergePages: false });
  return (text as string[]).map((t) => t.replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim());
}

export async function salvarManual(arquivo: File, dados: { titulo: string; loja: string | null; produtoId: string | null; usarNaIA: boolean; userId: string }) {
  if (arquivo.type !== "application/pdf" && !arquivo.name.toLowerCase().endsWith(".pdf")) throw new Error("Envie um arquivo PDF.");
  if (arquivo.size > 30_000_000) throw new Error("PDF muito grande (máx. 30 MB).");
  const buf = new Uint8Array(await arquivo.arrayBuffer());
  if (String.fromCharCode(...buf.slice(0, 4)) !== "%PDF") throw new Error("O arquivo não parece ser um PDF válido.");
  let paginas: string[] = [];
  try { paginas = await extrairPaginas(buf.slice()); } catch { paginas = []; }
  const id = createId();
  const nomeArquivo = `${id}.pdf`;
  await mkdir(PASTA, { recursive: true });
  await writeFile(caminho(nomeArquivo), buf);
  await db.insert(schema.manuais).values({
    id, titulo: dados.titulo, loja: dados.loja, produtoId: dados.produtoId, arquivo: nomeArquivo, nomeOriginal: arquivo.name.slice(0, 200),
    tamanho: arquivo.size, paginas: paginas.length, usarNaIA: dados.usarNaIA, userId: dados.userId,
  });
  const trechos = paginas.map((texto, i) => ({ manualId: id, pagina: i + 1, texto })).filter((t) => t.texto.length > 20);
  for (let i = 0; i < trechos.length; i += 200) await db.insert(schema.manualTrechos).values(trechos.slice(i, i + 200));
  return { id, paginas: paginas.length, comTexto: trechos.length };
}

export async function excluirManual(id: string) {
  const m = await db.query.manuais.findFirst({ where: eq(schema.manuais.id, id) });
  if (!m) return;
  await db.delete(schema.manuais).where(eq(schema.manuais.id, id));
  await unlink(caminho(m.arquivo)).catch(() => {});
}

export const lerArquivo = (arquivo: string) => readFile(caminho(arquivo));

export type Resultado = { manualId: string; titulo: string; pagina: number; trecho: string; rank: number };

/** Busca em português (sem acento, com radicais) nos trechos. `soIA` = só manuais liberados para a IA. */
export async function buscar(termo: string, opts: { loja?: string; soIA?: boolean; limite?: number } = {}): Promise<Resultado[]> {
  const q = termo.trim().slice(0, 200);
  if (q.length < 2) return [];
  const r = await db.execute<Resultado>(sql`
    with consulta as (select websearch_to_tsquery('portuguese', unaccent(${q})) as tq)
    select t.manual_id as "manualId", m.titulo, t.pagina,
      ts_headline('portuguese', t.texto, consulta.tq, 'MaxWords=45, MinWords=20, MaxFragments=2, StartSel=«, StopSel=»') as trecho,
      ts_rank(to_tsvector('portuguese', unaccent(t.texto)), consulta.tq) as rank
    from manual_trechos t join manuais m on m.id = t.manual_id, consulta
    where to_tsvector('portuguese', unaccent(t.texto)) @@ consulta.tq
      ${opts.soIA ? sql`and m.usar_na_ia` : sql``}
      ${opts.loja ? sql`and (m.loja is null or m.loja = ${opts.loja})` : sql``}
    order by rank desc limit ${opts.limite ?? 20}`);
  return r as unknown as Resultado[];
}

/** Texto das páginas mais relevantes (para a IA), limitado em tamanho. */
export async function contextoManuais(pergunta: string, loja?: string, maxChars = 3500) {
  const palavras = pergunta.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{4,}/g) ?? [];
  if (!palavras.length) return "";
  const termo = Array.from(new Set(palavras)).slice(0, 12).join(" OR ");
  const achados = await buscar(termo, { loja, soIA: true, limite: 4 });
  if (!achados.length) return "";
  const paginas = await db.execute<{ titulo: string; pagina: number; texto: string }>(sql`
    select m.titulo, t.pagina, t.texto from manual_trechos t join manuais m on m.id = t.manual_id
    where (t.manual_id, t.pagina) in (${sql.join(achados.map((a) => sql`(${a.manualId}, ${a.pagina})`), sql`, `)})`);
  let out = "";
  for (const p of paginas as unknown as { titulo: string; pagina: number; texto: string }[]) {
    const bloco = `[${p.titulo}, pág. ${p.pagina}]\n${p.texto}\n\n`;
    if (out.length + bloco.length > maxChars) { out += bloco.slice(0, Math.max(0, maxChars - out.length)); break; }
    out += bloco;
  }
  return out.trim();
}
