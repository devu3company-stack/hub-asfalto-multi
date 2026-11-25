import "server-only";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "../db";

export const SEGMENTOS: Record<string, { rotulo: string; descricao: string }> = {
  clientes: { rotulo: "Clientes que já compraram", descricao: "Para anúncios de recompra e para excluir das campanhas de aquisição." },
  inativos: { rotulo: "Clientes sem comprar há 90 dias", descricao: "Reativação: quem comprou e sumiu." },
  leads: { rotulo: "Leads do funil que não compraram", descricao: "Negociações em andamento ou perdidas." },
  carrinho: { rotulo: "Carrinho abandonado (30 dias)", descricao: "Remarketing de quem quase comprou." },
  tag: { rotulo: "Contatos com uma etiqueta", descricao: "Ex.: inativo-90d, pos-venda-feito." },
};

type Pessoa = { email?: string | null; telefone?: string | null; nome?: string | null; cidade?: string | null; uf?: string | null };

export async function pessoas(seg: string, tag?: string): Promise<Pessoa[]> {
  const K = schema.contatos;
  const ok = isNull(K.descadastradoEm);
  switch (seg) {
    case "clientes": return db.select().from(K).where(and(ok, gt(K.totalPedidos, 0)));
    case "inativos": return db.select().from(K).where(and(ok, lt(K.ultimaCompraEm, new Date(Date.now() - 90 * 86400_000))));
    case "tag": return tag ? db.select().from(K).where(and(ok, sql`${tag} = any(${K.tags})`)) : [];
    case "carrinho": {
      const C = schema.carrinhos;
      return db.select({ email: C.email, telefone: C.telefone, nome: C.nome }).from(C).where(and(eq(C.recuperado, false), gt(C.createdAt, new Date(Date.now() - 30 * 86400_000))));
    }
    case "leads": {
      const N = schema.crmNegociacoes;
      return db.select({ email: N.email, telefone: N.telefone, nome: N.contato }).from(N).where(sql`${N.status} in ('andamento','perdida')`);
    }
    default: return [];
  }
}

const csv = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const fone = (t?: string | null) => { const d = String(t ?? "").replace(/\D/g, ""); return d.length === 10 || d.length === 11 ? `+55${d}` : d.length >= 12 ? `+${d}` : ""; };

/** CSV no formato aceito pelo Meta (público personalizado) ou pelo Google Ads (Customer Match). As plataformas criptografam ao subir. */
export function gerarCsv(lista: Pessoa[], formato: "meta" | "google") {
  const vistos = new Set<string>();
  const linhas: string[] = [];
  for (const p of lista) {
    const email = String(p.email ?? "").trim().toLowerCase(), tel = fone(p.telefone);
    if (!email && !tel) continue;
    const k = email || tel;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const [fn, ...resto] = String(p.nome ?? "").trim().split(/\s+/);
    const ln = resto.join(" ");
    linhas.push((formato === "meta" ? [email, tel, fn ?? "", ln, p.cidade ?? "", p.uf ?? "", "BR"] : [email, tel, fn ?? "", ln, "BR", ""]).map((x) => csv(String(x))).join(","));
  }
  const cab = formato === "meta" ? "email,phone,fn,ln,ct,st,country" : "Email,Phone,First Name,Last Name,Country,Zip";
  return { csv: [cab, ...linhas].join("\n"), total: linhas.length };
}
