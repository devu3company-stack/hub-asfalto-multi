import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { users } from "../src/db/schema";

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 8) {
    throw new Error("Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 8 caracteres) no .env antes de rodar o seed.");
  }
  const sql = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
  const db = drizzle(sql);
  const [exists] = await db.select().from(users).where(eq(users.email, email));
  if (exists) {
    console.log(`Administrador ${email} já existe.`);
  } else {
    await db.insert(users).values({
      name: process.env.ADMIN_NAME ?? "Administrador",
      email,
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 12),
    });
    console.log(`Administrador ${email} criado.`);
  }
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
