"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit, requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { setSetting } from "@/lib/settings";
import { chaveLoja, lojaValida, nomeLoja } from "@/lib/lojas";
import { definirOmieDestino } from "@/lib/lojas-server";
import { enviarAoOmie, importarPedidos } from "@/lib/pedidos";
import { getConfig } from "@/lib/integrations/store";
import { gql } from "@/lib/integrations/shopify";
import { appUrl } from "@/lib/email/envio";
import type { FormMsg } from "@/components/ActionForm";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const editar = () => requireModule("pedidos", "edit");

export async function enviar(f: FormData) {
  const u = await editar();
  const id = txt(f, "id");
  await enviarAoOmie(id).catch(() => {});
  await audit(u.id, "pedido.enviar_omie", id);
  revalidatePath("/pedidos");
}

export async function ignorar(f: FormData) {
  const u = await editar();
  const id = txt(f, "id");
  const p = await db.query.pedidos.findFirst({ where: eq(schema.pedidos.id, id) });
  if (p && p.status !== "enviado") {
    await db.update(schema.pedidos).set({ status: p.status === "ignorado" ? "pendente" : "ignorado", updatedAt: new Date() }).where(eq(schema.pedidos.id, id));
    await audit(u.id, "pedido.ignorar", p.numero);
  }
  revalidatePath("/pedidos");
}

export async function salvarDocumento(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await editar();
  const doc = txt(f, "documento").replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) return { ok: false, message: "CPF (11 dígitos) ou CNPJ (14 dígitos)." };
  await db.update(schema.pedidos).set({ documento: doc, updatedAt: new Date() }).where(eq(schema.pedidos.id, txt(f, "id")));
  await audit(u.id, "pedido.documento", txt(f, "id"));
  revalidatePath("/pedidos");
  return { ok: true, message: "Documento salvo. Agora é só enviar ao Omie." };
}

export async function salvarConfig(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("integracoes", "edit");
  const loja = lojaValida(txt(f, "loja"));
  await definirOmieDestino(loja, lojaValida(txt(f, "omieDestino")));
  await setSetting(`pedidos.${loja}.automatico`, f.get("automatico") === "sim" ? "sim" : "nao");
  await setSetting(`estoque.${loja}.automatico`, f.get("estoqueAuto") === "sim" ? "sim" : "nao");
  if (txt(f, "contaCorrente")) await setSetting(`pedidos.${loja}.contaCorrente`, txt(f, "contaCorrente"));
  if (txt(f, "categoria")) await setSetting(`pedidos.${loja}.categoria`, txt(f, "categoria"));
  await audit(u.id, "pedidos.config", nomeLoja(loja));
  revalidatePath("/pedidos");
  return { ok: true, message: "Configuração salva." };
}

export async function importar(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await editar();
  const loja = lojaValida(txt(f, "loja"));
  try {
    const n = await importarPedidos(loja, Math.min(90, Math.max(1, Number(txt(f, "dias")) || 30)));
    await audit(u.id, "pedidos.importar", `${nomeLoja(loja)}: ${n}`);
    revalidatePath("/pedidos");
    return { ok: true, message: `${n} pedido(s) novo(s) trazido(s) da Shopify.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao importar." };
  }
}

/** Cria na Shopify os webhooks que o hub usa (pedidos e carrinhos). */
export async function registrarWebhooks(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("integracoes", "edit");
  const loja = lojaValida(txt(f, "loja"));
  const cfg = await getConfig(chaveLoja("shopify", loja));
  if (!cfg) return { ok: false, message: "Conecte a Shopify desta loja em Integrações." };
  const url = `${appUrl()}/api/webhooks/shopify`;
  const topicos = ["ORDERS_CREATE", "ORDERS_UPDATED", "CHECKOUTS_CREATE", "CHECKOUTS_UPDATE"];
  const erros: string[] = [];
  try {
    const atuais = await gql<{ webhookSubscriptions: { nodes: { topic: string; endpoint: { callbackUrl?: string } }[] } }>(cfg,
      `{ webhookSubscriptions(first: 50) { nodes { topic endpoint { ... on WebhookHttpEndpoint { callbackUrl } } } } }`);
    for (const t of topicos) {
      if (atuais.webhookSubscriptions.nodes.some((n) => n.topic === t && n.endpoint.callbackUrl === url)) continue;
      const r = await gql<{ webhookSubscriptionCreate: { userErrors: { message: string }[] } }>(cfg, `
        mutation($t: WebhookSubscriptionTopic!, $u: URL!) { webhookSubscriptionCreate(topic: $t, webhookSubscription: { callbackUrl: $u, format: JSON }) { userErrors { message } } }`,
        { t, u: url });
      erros.push(...r.webhookSubscriptionCreate.userErrors.map((e) => `${t}: ${e.message}`));
    }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao falar com a Shopify." };
  }
  await audit(u.id, "pedidos.webhooks", nomeLoja(loja));
  return erros.length ? { ok: false, message: erros.join(" · ") } : { ok: true, message: "Webhooks criados. Pedidos e carrinhos novos chegam sozinhos no hub." };
}
