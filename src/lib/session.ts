import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./permissions";

export const SESSION_COOKIE = "hub_session";
const MAX_AGE = 60 * 60 * 12; // 12 horas

export type SessionPayload = { sub: string; name: string; role: Role };

function key() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET ausente ou curto (mínimo 32 caracteres).");
  return new TextEncoder().encode(secret);
}

export async function signSession(p: SessionPayload) {
  return new SignJWT({ name: p.name, role: p.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key());
}

export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return { sub: payload.sub as string, name: payload.name as string, role: payload.role as Role };
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE;
