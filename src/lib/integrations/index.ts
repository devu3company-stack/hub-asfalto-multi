import "server-only";
import type { Config } from "./store";
import { testOmie } from "./omie";
import { testShopify } from "./shopify";
import { testGoogleAds } from "./googleads";
import { testOficial } from "../whatsapp/oficial";
import { makeTester } from "../ai";
import { FRETE_TESTERS } from "../frete";
import { testarSmtp } from "../email/envio";

export const TESTERS: Record<string, (cfg: Config) => Promise<string>> = {
  omie: testOmie,
  shopify: testShopify,
  googleads: testGoogleAds,
  smtp: testarSmtp,
  melhorenvio: FRETE_TESTERS.melhorenvio,
  whatsapp_oficial: testOficial,
  ia: makeTester("ia"),
  ia_openai: makeTester("ia_openai"),
  ia_gemini: makeTester("ia_gemini"),
  ia_compat: makeTester("ia_compat"),
};
