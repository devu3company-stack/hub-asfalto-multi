"use server";
import { revalidatePath } from "next/cache";
import { audit, requireModule } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import { AI_PROVIDERS } from "@/lib/ai";
import { qrLogout } from "@/lib/whatsapp/gateway";
import { chatKey, sendMessage, setAiPaused } from "@/lib/whatsapp/service";

export type SendState = { ok?: boolean; message?: string } | undefined;

export async function enviar(_p: SendState, form: FormData): Promise<SendState> {
  const u = await requireModule("whatsapp", "edit");
  const chat = chatKey(String(form.get("chat") ?? ""));
  const text = String(form.get("text") ?? "").trim();
  if (!chat || !text) return { ok: false, message: "Informe o número e a mensagem." };
  try {
    await sendMessage(chat, text, "humano", { userId: u.id });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Falha ao enviar." };
  }
  revalidatePath("/whatsapp");
  return { ok: true };
}

export async function alternarIAConversa(form: FormData) {
  const u = await requireModule("whatsapp", "edit");
  const chat = String(form.get("chat"));
  const pausar = form.get("pausar") === "1";
  await setAiPaused(chat, pausar);
  await audit(u.id, pausar ? "whatsapp.ia.pausar" : "whatsapp.ia.retomar", chat);
  revalidatePath("/whatsapp");
}

export async function salvarConfig(form: FormData) {
  const u = await requireModule("integracoes", "edit");
  await setSetting("whatsapp.canal", form.get("canal") === "oficial" ? "oficial" : "qr");
  await setSetting("ia.ligada", form.get("ia") === "on" ? "sim" : "nao");
  const prov = String(form.get("provedor") ?? "");
  if ((AI_PROVIDERS as readonly string[]).includes(prov)) await setSetting("ia.provedor", prov);
  const instr = String(form.get("instrucoes") ?? "").trim();
  if (instr) await setSetting("ia.instrucoes", instr.slice(0, 6000));
  await audit(u.id, "whatsapp.config");
  revalidatePath("/whatsapp");
}

export async function desconectarQr() {
  const u = await requireModule("integracoes", "edit");
  await qrLogout();
  await audit(u.id, "whatsapp.qr.desconectar");
  revalidatePath("/whatsapp");
}
