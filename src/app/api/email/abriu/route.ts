import { and, eq, isNull } from "drizzle-orm";
import { type NextRequest } from "next/server";
import { db, schema } from "@/lib/db";
import { conferir } from "@/lib/email/envio";

export const dynamic = "force-dynamic";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Pixel de abertura. */
export async function GET(req: NextRequest) {
  const v = conferir(req.nextUrl.searchParams.get("t"));
  if (v?.startsWith("e:")) {
    const id = v.slice(2);
    await db.update(schema.emailEnvios).set({ abertoEm: new Date() })
      .where(and(eq(schema.emailEnvios.id, id), isNull(schema.emailEnvios.abertoEm))).catch(() => {});
  }
  return new Response(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });
}
