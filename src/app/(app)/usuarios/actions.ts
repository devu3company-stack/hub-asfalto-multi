"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit, requireModule } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const U = schema.users;

const ROLES = ["ADMIN", "FINANCEIRO", "COMERCIAL", "ATENDIMENTO", "LOGISTICA", "MARKETING"] as const;

const novo = z.object({
  name: z.string().trim().min(2, "Informe o nome."),
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres."),
  role: z.enum(ROLES),
});

export type UserFormState = { ok?: boolean; message?: string } | undefined;

export async function criarUsuario(_p: UserFormState, form: FormData): Promise<UserFormState> {
  const me = await requireModule("usuarios", "edit");
  const parsed = novo.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { name, email, password, role } = parsed.data;
  if (await db.query.users.findFirst({ where: eq(U.email, email) })) return { ok: false, message: "Já existe um usuário com esse e-mail." };
  await db.insert(U).values({ name, email, role, passwordHash: await bcrypt.hash(password, 12) });
  await audit(me.id, "usuario.criar", `${email} (${role})`);
  revalidatePath("/usuarios");
  return { ok: true, message: `Usuário ${name} criado.` };
}

export async function atualizarUsuario(form: FormData) {
  const me = await requireModule("usuarios", "edit");
  const id = String(form.get("id"));
  const role = z.enum(ROLES).parse(form.get("role"));
  const active = form.get("active") === "on";
  // Evita que o administrador se tranque fora do sistema.
  if (id === me.id && (role !== "ADMIN" || !active)) return;
  await db.update(U).set({ role, active }).where(eq(U.id, id));
  await audit(me.id, "usuario.atualizar", `${id}: ${role}, ${active ? "ativo" : "inativo"}`);
  revalidatePath("/usuarios");
}

export async function redefinirSenha(form: FormData) {
  const me = await requireModule("usuarios", "edit");
  const id = String(form.get("id"));
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return;
  await db.update(U).set({ passwordHash: await bcrypt.hash(password, 12) }).where(eq(U.id, id));
  await audit(me.id, "usuario.senha", id);
  revalidatePath("/usuarios");
}
