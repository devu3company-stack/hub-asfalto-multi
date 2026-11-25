import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { decrypt, encrypt } from "../crypto";

export type Config = Record<string, string>;
const t = schema.integrations;

export async function getConfig(provider: string): Promise<Config | null> {
  const row = await db.query.integrations.findFirst({ where: eq(t.provider, provider) });
  if (!row || !row.enabled) return null;
  try {
    return JSON.parse(decrypt(row.config));
  } catch {
    return null;
  }
}

/** Salva mantendo segredos antigos quando o campo vier vazio (o formulário nunca mostra o segredo salvo). */
export async function saveConfig(provider: string, incoming: Config) {
  const current = (await getConfig(provider)) ?? {};
  const merged: Config = { ...current };
  for (const [k, v] of Object.entries(incoming)) {
    if (v.trim() !== "") merged[k] = v.trim();
  }
  const config = encrypt(JSON.stringify(merged));
  await db.insert(t).values({ provider, config })
    .onConflictDoUpdate({ target: t.provider, set: { config, status: "nao_testado", lastError: null } });
  return merged;
}

export async function setStatus(provider: string, ok: boolean, error?: string) {
  await db.update(t)
    .set({ status: ok ? "ok" : "erro", lastError: ok ? null : (error ?? "Erro").slice(0, 500), lastTestedAt: new Date() })
    .where(eq(t.provider, provider));
}

export async function listIntegrations() {
  return db.select().from(t);
}

export async function removeIntegration(provider: string) {
  await db.delete(t).where(eq(t.provider, provider));
}
