import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { can, type ModuleKey, type Role } from "./permissions";
import { SESSION_COOKIE, verifySession } from "./session";

export async function getCurrentUser() {
  const s = await verifySession(cookies().get(SESSION_COOKIE)?.value);
  if (!s) return null;
  // Confere no banco a cada requisição: usuário desativado ou com perfil alterado perde o acesso na hora.
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, s.sub) });
  if (!user || !user.active) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role as Role };
}

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireModule(module: ModuleKey, need: "view" | "edit" = "view") {
  const u = await requireUser();
  if (!can(u.role, module, need)) redirect("/sem-acesso");
  return u;
}

export async function audit(userId: string | null, action: string, details?: string) {
  await db.insert(schema.auditLogs).values({ userId, action, details });
}
