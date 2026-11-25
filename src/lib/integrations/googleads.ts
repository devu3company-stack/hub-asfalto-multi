import "server-only";
import type { Config } from "./store";

async function accessToken(cfg: Config) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? "Falha ao renovar o token do Google.");
  return data.access_token as string;
}

function headers(cfg: Config, token: string) {
  const h: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": cfg.developerToken,
    "Content-Type": "application/json",
  };
  if (cfg.loginCustomerId) h["login-customer-id"] = cfg.loginCustomerId.replace(/-/g, "");
  return h;
}

const api = (cfg: Config) => `https://googleads.googleapis.com/${cfg.apiVersion || "v21"}`;

export async function testGoogleAds(cfg: Config) {
  for (const k of ["developerToken", "clientId", "clientSecret", "refreshToken", "customerId"]) {
    if (!cfg[k]) throw new Error("Preencha todos os campos obrigatórios.");
  }
  const token = await accessToken(cfg);
  const res = await fetch(`${api(cfg)}/customers:listAccessibleCustomers`, { headers: headers(cfg, token), cache: "no-store" });
  if (!res.ok) throw new Error(`Google Ads respondeu ${res.status}. Confira o developer token e a versão da API.`);
  return "Conectado ao Google Ads (somente leitura).";
}

export type CampanhaLinha = { nome: string; custo: number; cliques: number; conversoes: number };

/** Métricas por campanha num período (GAQL). Apenas leitura. */
export async function relatorioCampanhas(cfg: Config, de: string, ate: string): Promise<CampanhaLinha[]> {
  const token = await accessToken(cfg);
  const cid = cfg.customerId.replace(/-/g, "");
  const query = `SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.conversions
    FROM campaign WHERE segments.date BETWEEN '${de}' AND '${ate}'`;
  const res = await fetch(`${api(cfg)}/customers/${cid}/googleAds:search`, {
    method: "POST",
    headers: headers(cfg, token),
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Google Ads respondeu ${res.status}`);
  type Linha = { campaign?: { name?: string }; metrics?: { costMicros?: string; clicks?: string; conversions?: number } };
  const data: { results?: Linha[] } = await res.json();
  return (data.results ?? []).map((r) => ({
    nome: r.campaign?.name ?? "",
    custo: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
    cliques: Number(r.metrics?.clicks ?? 0),
    conversoes: Number(r.metrics?.conversions ?? 0),
  }));
}
