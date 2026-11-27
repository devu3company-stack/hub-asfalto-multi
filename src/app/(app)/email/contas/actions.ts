"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit, requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { CAMPOS_SMTP, marcarStatus, salvarConta, smtpDaConta } from "@/lib/email/contas";
import { testarSmtp } from "@/lib/email/envio";
import type { FormMsg } from "@/components/ActionForm";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function salvar(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("email", "edit");
  const id = txt(f, "id") || null;
  const cfg: Record<string, string> = {};
  for (const c of CAMPOS_SMTP) cfg[c.key] = txt(f, c.key);
  let contaId: string;
  try { contaId = await salvarConta(id, txt(f, "nome"), cfg); } catch (e) { return { ok: false, message: e instanceof Error ? e.message : "Não salvou." }; }
  await audit(u.id, id ? "email.conta_editar" : "email.conta_criar", txt(f, "nome") || cfg.user);
  // testa na hora para avisar se a senha ou o servidor estão errados
  try {
    const msg = await testarSmtp((await smtpDaConta(contaId))!);
    await marcarStatus(contaId, true);
    revalidatePath("/email/contas");
    return { ok: true, message: `Salva. ${msg}` };
  } catch (e) {
    const m = e instanceof Error ? e.message : "Falha";
    await marcarStatus(contaId, false, m);
    revalidatePath("/email/contas");
    return { ok: false, message: `Salva, mas o teste de conexão falhou: ${m}` };
  }
}

export async function alternar(f: FormData) {
  await requireModule("email", "edit");
  const c = await db.query.emailContas.findFirst({ where: eq(schema.emailContas.id, txt(f, "id")) });
  if (c) await db.update(schema.emailContas).set({ ativo: !c.ativo }).where(eq(schema.emailContas.id, c.id));
  revalidatePath("/email/contas");
}

export async function excluir(f: FormData) {
  const u = await requireModule("email", "edit");
  const id = txt(f, "id");
  // o que ainda está na fila por esta conta volta para o servidor da loja
  await db.delete(schema.emailContas).where(eq(schema.emailContas.id, id));
  await audit(u.id, "email.conta_excluir", id);
  revalidatePath("/email/contas");
}
