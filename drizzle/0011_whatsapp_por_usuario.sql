ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'LOGISTICA';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wa_conexoes" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"tipo" text DEFAULT 'qr' NOT NULL,
	"user_id" text,
	"ia_ligada" boolean DEFAULT false NOT NULL,
	"numero" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "wa_conexoes" ADD CONSTRAINT "wa_conexoes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_chats" ADD COLUMN "conexao_id" text DEFAULT 'principal' NOT NULL;--> statement-breakpoint
ALTER TABLE "wa_messages" ADD COLUMN "conexao_id" text DEFAULT 'principal' NOT NULL;--> statement-breakpoint
ALTER TABLE "wa_chats" DROP CONSTRAINT IF EXISTS "wa_chats_pkey";--> statement-breakpoint
ALTER TABLE "wa_chats" ADD CONSTRAINT "wa_chats_conexao_id_chat_pk" PRIMARY KEY("conexao_id","chat");--> statement-breakpoint
DROP INDEX IF EXISTS "wa_messages_chat_idx";--> statement-breakpoint
CREATE INDEX "wa_messages_chat_idx" ON "wa_messages" USING btree ("conexao_id","chat","created_at");--> statement-breakpoint
ALTER TABLE "automacao_aprovacoes" ADD COLUMN "conexao_id" text;--> statement-breakpoint
ALTER TABLE "entregas" ADD COLUMN "descarga" text DEFAULT 'destinatario' NOT NULL;--> statement-breakpoint
ALTER TABLE "entregas" ADD COLUMN "ajudantes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "entregas" ADD COLUMN "valor_descarga" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
-- O número que já estava conectado vira do primeiro administrador (dá para trocar o dono em WhatsApp → Números da equipe).
INSERT INTO "wa_conexoes" ("id", "nome", "tipo", "user_id", "ia_ligada")
SELECT 'principal', coalesce(u."name", 'Número principal'), 'qr', u."id",
       coalesce((SELECT s."value" = 'sim' FROM "settings" s WHERE s."key" = 'ia.ligada'), false)
FROM (SELECT 1) x LEFT JOIN LATERAL (SELECT "id", "name" FROM "users" WHERE "role" = 'ADMIN' AND "active" ORDER BY "created_at" LIMIT 1) u ON true
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Conversas da API oficial passam a ser da conexão "oficial".
INSERT INTO "wa_conexoes" ("id", "nome", "tipo", "ia_ligada")
SELECT 'oficial', 'API oficial', 'oficial', coalesce((SELECT s."value" = 'sim' FROM "settings" s WHERE s."key" = 'ia.ligada'), false)
WHERE EXISTS (SELECT 1 FROM "wa_chats" WHERE "channel" = 'oficial')
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "wa_chats" SET "conexao_id" = 'oficial' WHERE "channel" = 'oficial';--> statement-breakpoint
UPDATE "wa_messages" SET "conexao_id" = 'oficial' WHERE "channel" = 'oficial';
