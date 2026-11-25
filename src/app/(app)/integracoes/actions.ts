"use server";
import { revalidatePath } from "next/cache";
import { audit, requireModule } from "@/lib/auth";
import { providerById } from "@/lib/integrations/providers";
import { removeIntegration, saveConfig, setStatus } from "@/lib/integrations/store";
import { TESTERS } from "@/lib/integrations";
import { baseProvider, lojaValida } from "@/lib/lojas";
import { setSetting } from "@/lib/settings";

export type IntegrationState = { ok?: boolean; message?: string } | undefined;

export async function saveAndTest(_prev: IntegrationState, form: FormData): Promise<IntegrationState> {
  const user = await requireModule("integracoes", "edit");
  const id = String(form.get("provider"));
  const def = providerById(id);
  if (!def) return { ok: false, message: "Integração desconhecida." };

  const incoming: Record<string, string> = {};
  for (const f of def.fields) incoming[f.key] = String(form.get(f.key) ?? "");
  const cfg = await saveConfig(id, incoming);
  await audit(user.id, "integracao.salvar", id);

  try {
    const msg = await TESTERS[baseProvider(id)](cfg);
    await setStatus(id, true);
    revalidatePath("/integracoes");
    return { ok: true, message: msg };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha no teste.";
    await setStatus(id, false, msg);
    revalidatePath("/integracoes");
    return { ok: false, message: `Salvo, mas o teste falhou: ${msg}` };
  }
}

export async function disconnect(form: FormData) {
  const user = await requireModule("integracoes", "edit");
  const id = String(form.get("provider"));
  await removeIntegration(id);
  await audit(user.id, "integracao.desconectar", id);
  revalidatePath("/integracoes");
}

export async function salvarLoja(_p: IntegrationState, form: FormData): Promise<{ ok: boolean; message: string }> {
  const user = await requireModule("integracoes", "edit");
  const loja = lojaValida(String(form.get("loja")));
  const site = String(form.get("site") ?? "").trim();
  const logo = String(form.get("logo") ?? "").trim();
  if ((site && !/^https?:\/\//.test(site)) || (logo && !/^https:\/\//.test(logo))) return { ok: false, message: "Site e logo precisam começar com https://" };
  await setSetting(`loja.${loja}.nome`, String(form.get("nome") ?? "").trim());
  await setSetting(`loja.${loja}.site`, site);
  await setSetting(`loja.${loja}.logo`, logo);
  await audit(user.id, "loja.salvar", loja);
  revalidatePath("/integracoes");
  return { ok: true, message: "Loja salva." };
}
