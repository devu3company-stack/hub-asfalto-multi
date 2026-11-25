import "server-only";
import { getConfig, type Config } from "../integrations/store";
import { getSetting } from "../settings";
import { cotarTabelaPropria, numBR, type Detalhe } from "./motor";

export type Item = {
  descricao: string;
  quantidade: number;
  pesoKg: number; // por unidade
  alturaCm: number;
  larguraCm: number;
  comprimentoCm: number;
  valorUnit: number; // R$ por unidade
};

export type Opcao = {
  fonte: "Tabela própria" | "Melhor Envio";
  transportadora: string;
  servico: string;
  valor: number;
  prazoDias: number | null;
  observacao?: string;
  detalhe?: Detalhe;
};

export type Cotacao = { opcoes: Opcao[]; erros: string[] };

const digits = (s: string) => s.replace(/\D/g, "");

/* ----------------------------- Melhor Envio ----------------------------- */

const meBase = (cfg: Config) => (cfg.sandbox === "sim" ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br");
const meHeaders = (cfg: Config) => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  Authorization: `Bearer ${cfg.token}`,
  "User-Agent": `Hub Asfalto Multi (${cfg.email || "contato@asfaltomulti.com.br"})`,
});

async function cotarMelhorEnvio(cfg: Config, cepOrigem: string, cepDestino: string, itens: Item[]): Promise<Opcao[]> {
  if (!cfg.token) throw new Error("Melhor Envio: informe o token.");
  const r = await fetch(`${meBase(cfg)}/api/v2/me/shipment/calculate`, {
    method: "POST",
    headers: meHeaders(cfg),
    body: JSON.stringify({
      from: { postal_code: digits(cepOrigem) },
      to: { postal_code: digits(cepDestino) },
      products: itens.map((it, i) => ({
        id: `item${i + 1}`,
        width: it.larguraCm, height: it.alturaCm, length: it.comprimentoCm,
        weight: it.pesoKg, insurance_value: it.valorUnit, quantity: it.quantidade,
      })),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Melhor Envio respondeu ${r.status}: ${data?.message ?? ""}`);
  return (Array.isArray(data) ? data : [])
    .filter((s: { error?: string; price?: string }) => !s.error && s.price)
    .map((s: { name: string; price: string; custom_price?: string; delivery_time?: number; custom_delivery_time?: number; company?: { name?: string } }): Opcao => ({
      fonte: "Melhor Envio",
      transportadora: s.company?.name ?? "",
      servico: s.name,
      valor: numBR(s.custom_price ?? s.price),
      prazoDias: s.custom_delivery_time ?? s.delivery_time ?? null,
    }))
    .filter((o) => Number.isFinite(o.valor));
}

async function testarMelhorEnvio(cfg: Config) {
  if (!cfg.token) throw new Error("Informe o token.");
  const r = await fetch(`${meBase(cfg)}/api/v2/me`, { headers: meHeaders(cfg), cache: "no-store" });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.message ?? `Melhor Envio respondeu ${r.status}`);
  return `Melhor Envio conectado (${data.firstname ?? data.email ?? "conta ok"}).`;
}

export const FRETE_TESTERS = { melhorenvio: testarMelhorEnvio };

/* ------------------------------- Cotação -------------------------------- */

export async function cepOrigemPadrao(loja?: string) {
  const [porLoja, s, me] = await Promise.all([loja ? getSetting(`frete.cepOrigem.${loja}`) : "", getSetting("frete.cepOrigem"), getConfig("melhorenvio")]);
  return porLoja || s || me?.cepOrigem || "";
}

export async function provedoresConectados() {
  const me = await getConfig("melhorenvio");
  return { melhorenvio: Boolean(me) };
}

/** Cota na tabela própria e no Melhor Envio (se conectado) ao mesmo tempo, da opção mais barata para a mais cara. */
export async function cotar(cepOrigem: string, cepDestino: string, itens: Item[]): Promise<Cotacao> {
  const me = await getConfig("melhorenvio");
  const jobs: Promise<Opcao[]>[] = [
    cotarTabelaPropria(cepDestino, itens).then((l) => l.map((o): Opcao => ({ fonte: "Tabela própria", ...o }))),
  ];
  if (me) jobs.push(cotarMelhorEnvio(me, cepOrigem, cepDestino, itens));

  const results = await Promise.allSettled(jobs);
  const opcoes: Opcao[] = [];
  const erros: string[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") opcoes.push(...r.value);
    else erros.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
  }
  if (!opcoes.length && !erros.length) erros.push("Nenhuma transportadora atende esse CEP. Cadastre as rotas em Fretes › Transportadoras.");
  opcoes.sort((a, b) => a.valor - b.valor);
  return { opcoes, erros };
}
