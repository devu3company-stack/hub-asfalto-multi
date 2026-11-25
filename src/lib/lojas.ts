/** As duas lojas atendidas pelo hub. Integrações de Shopify, Omie e e-mail são separadas por loja. */
export const LOJAS = [
  { id: "asfaltomulti", nome: "Asfalto Multi", site: "https://asfaltomulti.com.br", logo: "/logo.png" },
  { id: "lojadoasfalto", nome: "Loja do Asfalto", site: "", logo: "/logo.png" },
] as const;

export type LojaId = (typeof LOJAS)[number]["id"];
export const LOJA_PADRAO: LojaId = "asfaltomulti";
export const lojaValida = (v: unknown): LojaId => (LOJAS.some((l) => l.id === v) ? (v as LojaId) : LOJA_PADRAO);
export const nomeLoja = (id: string) => LOJAS.find((l) => l.id === id)?.nome ?? id;

/** Chave da integração de uma loja: "shopify@lojadoasfalto". */
export const chaveLoja = (base: "shopify" | "omie" | "smtp", loja: LojaId) => `${base}@${loja}`;
export const baseProvider = (id: string) => id.split("@")[0];
export const lojaDoProvider = (id: string) => id.split("@")[1] as LojaId | undefined;
