import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";

export const DEFAULTS = {
  "whatsapp.canal": "qr", // qr | oficial
  "ia.ligada": "nao", // sim | nao
  "ia.provedor": "ia", // ia | ia_openai | ia_gemini | ia_compat
  "frete.cepOrigem": "", // CEP de onde saem as mercadorias
  "ia.instrucoes":
    "Você é o atendente virtual da Asfalto Multi, empresa de Mogi Mirim/SP que vende asfalto frio estocável e produtos para pavimentação, com envio para todo o Brasil. " +
    "Responda em português, de forma curta, educada e objetiva. Ajude com dúvidas sobre os produtos, aplicação e pedidos. " +
    "Para orçamento, peça: produto, quantidade, cidade/CEP de entrega e nome. " +
    "Nunca invente preços, prazos ou estoque: se não souber, diga que um atendente vai confirmar.",
} as const;

export type SettingKey = keyof typeof DEFAULTS;

/** Chaves fixas (DEFAULTS) ou dinâmicas, como "loja.lojadoasfalto.omie". */
export async function getSetting(key: SettingKey | (string & {})): Promise<string> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, key) });
  return row?.value ?? (DEFAULTS as Record<string, string>)[key] ?? "";
}

export async function setSetting(key: SettingKey | (string & {}), value: string) {
  await db.insert(schema.settings).values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}
