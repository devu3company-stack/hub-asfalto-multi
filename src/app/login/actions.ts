"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { firstAllowedHref, type Role } from "@/lib/permissions";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session";

export async function login(_prev: { error?: string } | undefined, form: FormData) {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) });
  const ok = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 600)); // dificulta tentativa e erro
    return { error: "E-mail ou senha incorretos." };
  }
  const token = await signSession({ sub: user.id, name: user.name, role: user.role as Role });
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  await audit(user.id, "login");
  redirect(firstAllowedHref(user.role as Role));
}

export async function logout() {
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}
