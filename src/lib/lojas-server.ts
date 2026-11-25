import "server-only";
import { getConfig } from "./integrations/store";
import { getSetting, setSetting } from "./settings";
import { chaveLoja, LOJAS, type LojaId } from "./lojas";

/** Qual Omie atende a loja (pedidos e estoque). Padrão: o Omie da própria loja; se não tiver, o da Asfalto Multi. */
export async function omieDestino(loja: LojaId): Promise<LojaId> {
  const s = (await getSetting(`loja.${loja}.omie`)) as string | undefined;
  if (s && LOJAS.some((l) => l.id === s)) return s as LojaId;
  return (await getConfig(chaveLoja("omie", loja))) ? loja : "asfaltomulti";
}
export async function definirOmieDestino(loja: LojaId, destino: LojaId) {
  await setSetting(`loja.${loja}.omie`, destino);
}
export async function omieDaLoja(loja: LojaId) {
  const dest = await omieDestino(loja);
  return { destino: dest, cfg: await getConfig(chaveLoja("omie", dest)) };
}
export const shopifyDaLoja = (loja: LojaId) => getConfig(chaveLoja("shopify", loja));
