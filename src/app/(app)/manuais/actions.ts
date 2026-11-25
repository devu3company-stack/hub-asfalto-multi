"use server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { audit, requireModule } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { excluirManual, salvarManual } from "@/lib/manuais";
import { LOJAS } from "@/lib/lojas";
import type { FormMsg } from "@/components/ActionForm";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function enviarManual(_p: FormMsg, f: FormData): Promise<FormMsg> {
  const u = await requireModule("manuais", "edit");
  const arq = f.get("arquivo");
  if (!(arq instanceof File) || !arq.size) return { ok: false, message: "Escolha o PDF." };
  const titulo = txt(f, "titulo") || arq.name.replace(/\.pdf$/i, "");
  const loja = LOJAS.some((l) => l.id === txt(f, "loja")) ? txt(f, "loja") : null;
  try {
    const r = await salvarManual(arq, { titulo, loja, produtoId: txt(f, "produtoId") || null, usarNaIA: f.get("usarNaIA") === "sim", userId: u.id });
    await audit(u.id, "manual.enviar", titulo);
    revalidatePath("/manuais");
    return r.comTexto
      ? { ok: true, message: `"${titulo}" salvo: ${r.paginas} página(s), texto lido em ${r.comTexto}.` }
      : { ok: true, message: `"${titulo}" salvo, mas o PDF parece ser imagem escaneada: não deu para ler o texto, então ele não entra na busca nem na IA.` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao salvar o PDF." };
  }
}

export async function removerManual(f: FormData) {
  const u = await requireModule("manuais", "edit");
  const id = txt(f, "id");
  await excluirManual(id);
  await audit(u.id, "manual.excluir", id);
  revalidatePath("/manuais");
}

export async function alternarIA(f: FormData) {
  await requireModule("manuais", "edit");
  const id = txt(f, "id");
  const m = await db.query.manuais.findFirst({ where: eq(schema.manuais.id, id) });
  if (m) await db.update(schema.manuais).set({ usarNaIA: !m.usarNaIA }).where(eq(schema.manuais.id, id));
  revalidatePath("/manuais");
}
