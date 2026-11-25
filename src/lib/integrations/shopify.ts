import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import type { Config } from "./store";

function base(cfg: Config) {
  const shop = cfg.shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${shop}/admin/api/${cfg.apiVersion || "2025-01"}`;
}

async function get<T>(cfg: Config, path: string): Promise<T> {
  const res = await fetch(base(cfg) + path, {
    headers: { "X-Shopify-Access-Token": cfg.accessToken },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Shopify respondeu ${res.status}`);
  return res.json();
}

export async function testShopify(cfg: Config) {
  if (!cfg.shop || !cfg.accessToken) throw new Error("Informe a loja e o token.");
  const r = await get<{ shop: { name: string } }>(cfg, "/shop.json");
  return `Conectado à loja ${r.shop.name}.`;
}

export async function listarPedidos(cfg: Config, limit = 20) {
  const r = await get<{ orders: unknown[] }>(cfg, `/orders.json?status=any&limit=${limit}`);
  return r.orders;
}

/** Confere a assinatura HMAC de um webhook da Shopify. */
export function verifyShopifyWebhook(rawBody: string, hmacHeader: string | null, secret: string) {
  if (!hmacHeader) return false;
  const digest = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(hmacHeader);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Percorre um recurso paginado da Admin API (cabeçalho Link / page_info). */
async function* paginas<T>(cfg: Config, path: string, chave: string): AsyncGenerator<T[]> {
  let url: string | null = base(cfg) + path;
  for (let i = 0; url && i < 200; i++) {
    const res: Response = await fetch(url, { headers: { "X-Shopify-Access-Token": cfg.accessToken }, cache: "no-store" });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000)); i--; continue; }
    if (!res.ok) throw new Error(`Shopify respondeu ${res.status}`);
    const data = (await res.json()) as Record<string, T[]>;
    yield data[chave] ?? [];
    const link = res.headers.get("link") ?? "";
    url = link.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null;
  }
}

export type ClienteShopify = {
  id: number; email?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null;
  email_marketing_consent?: { state?: string } | null;
  default_address?: { city?: string | null; province_code?: string | null; phone?: string | null } | null;
};
export type PedidoShopify = { id: number; email?: string | null; created_at: string; total_price?: string; cancelled_at?: string | null };

export async function* clientesShopify(cfg: Config) {
  yield* paginas<ClienteShopify>(cfg, "/customers.json?limit=250&fields=id,email,first_name,last_name,phone,email_marketing_consent,default_address", "customers");
}

export async function* pedidosShopify(cfg: Config, desde: Date) {
  yield* paginas<PedidoShopify>(cfg, `/orders.json?status=any&limit=250&fields=id,email,created_at,total_price,cancelled_at&created_at_min=${desde.toISOString()}`, "orders");
}

/* ------------------------------- GraphQL Admin API ------------------------------- */

export async function gql<T>(cfg: Config, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const res = await fetch(`${base(cfg)}/graphql.json`, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": cfg.accessToken, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    if (!res.ok) throw new Error(`Shopify respondeu ${res.status}`);
    const j = (await res.json()) as { data?: T; errors?: { message: string; extensions?: { code?: string } }[] };
    if (j.errors?.some((e) => e.extensions?.code === "THROTTLED")) { await new Promise((r) => setTimeout(r, 2000)); continue; }
    if (j.errors?.length) throw new Error(`Shopify: ${j.errors.map((e) => e.message).join("; ")}`);
    return j.data as T;
  }
  throw new Error("Shopify: muitas requisições, tente de novo em instantes.");
}

export type VarianteShopify = {
  id: string; sku: string | null; title: string; price: string; inventoryQuantity: number | null;
  product: { id: string; title: string; status: string };
  inventoryItem: { id: string; measurement: { weight: { unit: string; value: number } | null } | null };
  altura: { value: string } | null; largura: { value: string } | null; comprimento: { value: string } | null;
};

/** Todas as variantes da loja, com peso e (se existirem) metacampos custom.altura/largura/comprimento em cm. */
export async function variantesShopify(cfg: Config) {
  const out: VarianteShopify[] = [];
  let after: string | null = null;
  for (let i = 0; i < 100; i++) {
    const d: { productVariants: { nodes: VarianteShopify[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } = await gql(cfg, `
      query($after: String) { productVariants(first: 200, after: $after) {
        nodes { id sku title price inventoryQuantity
          product { id title status }
          inventoryItem { id measurement { weight { unit value } } }
          altura: metafield(namespace: "custom", key: "altura") { value }
          largura: metafield(namespace: "custom", key: "largura") { value }
          comprimento: metafield(namespace: "custom", key: "comprimento") { value } }
        pageInfo { hasNextPage endCursor } } }`, { after });
    out.push(...d.productVariants.nodes);
    if (!d.productVariants.pageInfo.hasNextPage) break;
    after = d.productVariants.pageInfo.endCursor;
  }
  return out;
}

export async function localPrincipal(cfg: Config) {
  const d = await gql<{ locations: { nodes: { id: string; name: string }[] } }>(cfg, `{ locations(first: 1, query: "active:true") { nodes { id name } } }`);
  const l = d.locations.nodes[0];
  if (!l) throw new Error("A Shopify não tem nenhum local de estoque ativo.");
  return l;
}

/** Define o estoque disponível de vários itens num local (até 250 por chamada). */
export async function definirEstoque(cfg: Config, locationId: string, itens: { inventoryItemId: string; quantity: number }[]) {
  for (let i = 0; i < itens.length; i += 250) {
    const d = await gql<{ inventorySetQuantities: { userErrors: { message: string }[] } }>(cfg, `
      mutation($input: InventorySetQuantitiesInput!) { inventorySetQuantities(input: $input) { userErrors { message } } }`, {
      input: {
        name: "available", reason: "correction", ignoreCompareQuantity: true,
        quantities: itens.slice(i, i + 250).map((x) => ({ inventoryItemId: x.inventoryItemId, locationId, quantity: Math.max(0, Math.floor(x.quantity)) })),
      },
    });
    const erros = d.inventorySetQuantities.userErrors;
    if (erros.length) throw new Error(`Shopify: ${erros.map((e) => e.message).join("; ")}`);
  }
}

/** Busca um pedido pelo número (#1001) — usado pela IA para informar status. */
export async function pedidoPorNumero(cfg: Config, numero: string) {
  const n = numero.replace(/\D/g, "");
  const d = await gql<{ orders: { nodes: { name: string; displayFinancialStatus: string; displayFulfillmentStatus: string; createdAt: string;
    fulfillments: { trackingInfo: { company: string | null; number: string | null; url: string | null }[] }[] }[] } }>(cfg, `
    query($q: String!) { orders(first: 1, query: $q) { nodes { name displayFinancialStatus displayFulfillmentStatus createdAt
      fulfillments(first: 3) { trackingInfo(first: 3) { company number url } } } } }`, { q: `name:${n}` });
  return d.orders.nodes[0] ?? null;
}
