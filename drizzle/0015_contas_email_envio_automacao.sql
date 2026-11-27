CREATE TABLE "email_contas" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"config" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'nao_testado' NOT NULL,
	"erro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "automacoes" ADD COLUMN "envio" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campanhas" ADD COLUMN "conta_id" text;--> statement-breakpoint
ALTER TABLE "email_envios" ADD COLUMN "conta_id" text;--> statement-breakpoint
ALTER TABLE "email_envios" ADD COLUMN "remetente_nome" text;--> statement-breakpoint
ALTER TABLE "email_campanhas" ADD CONSTRAINT "email_campanhas_conta_id_email_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."email_contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_envios" ADD CONSTRAINT "email_envios_conta_id_email_contas_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."email_contas"("id") ON DELETE set null ON UPDATE no action;