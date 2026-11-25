import { NextResponse, type NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { getConfig } from "@/lib/integrations/store";
import { verifyShopifyWebhook } from "@/lib/integrations/shopify";
import { aoCheckout, aoPedido } from "@/lib/email/automacoes";
import { registrarPedido } from "@/lib/pedidos";
import { chaveLoja, LOJAS, type LojaId } from "@/lib/lojas";

export const dynamic = "force-dynamic";

/** Recebe webhooks da Shopify: guarda para a sincronização com o Omie e alimenta o e-mail marketing
 * (checkouts/create, checkouts/update = carrinho abandonado; orders/create = compra/pós-compra). */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  // descobre de qual loja veio pela assinatura (cada loja tem o seu segredo)
  let loja: LojaId | null = null;
  for (const l of LOJAS) {
    const cfg = await getConfig(chaveLoja("shopify", l.id));
    if (cfg?.webhookSecret && verifyShopifyWebhook(raw, req.headers.get("x-shopify-hmac-sha256"), cfg.webhookSecret)) { loja = l.id; break; }
  }
  if (!loja) return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const topic = req.headers.get("x-shopify-topic");
  await db.insert(schema.webhookEvents).values({ provider: `shopify@${loja}`, payload: { topic, body: payload } });
  try {
    if (topic === "checkouts/create" || topic === "checkouts/update") await aoCheckout(loja, payload as never);
    if (topic === "orders/create" || topic === "orders/paid" || topic === "orders/updated") await registrarPedido(loja, payload as never);
    if (topic === "orders/create") await aoPedido(loja, payload as never);
  } catch (e) {
    console.error("webhook shopify:", e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
