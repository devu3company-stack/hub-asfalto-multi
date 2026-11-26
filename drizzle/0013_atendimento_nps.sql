CREATE TABLE "nps_respostas" (
	"id" text PRIMARY KEY NOT NULL,
	"conexao_id" text NOT NULL,
	"chat" text NOT NULL,
	"nome" text,
	"user_id" text,
	"origem" text DEFAULT 'atendimento' NOT NULL,
	"nota" integer,
	"comentario" text,
	"respondida_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_transferencias" (
	"id" text PRIMARY KEY NOT NULL,
	"chat" text NOT NULL,
	"nome" text,
	"de_conexao" text NOT NULL,
	"de_user_id" text,
	"para_user_id" text NOT NULL,
	"para_conexao" text,
	"nota" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wa_chats" ADD COLUMN "status" text DEFAULT 'aberto' NOT NULL;--> statement-breakpoint
ALTER TABLE "wa_chats" ADD COLUMN "fora_enviado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wa_chats" ADD COLUMN "nps_etapa" text;--> statement-breakpoint
ALTER TABLE "wa_chats" ADD COLUMN "nps_id" text;--> statement-breakpoint
ALTER TABLE "nps_respostas" ADD CONSTRAINT "nps_respostas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_transferencias" ADD CONSTRAINT "wa_transferencias_de_user_id_users_id_fk" FOREIGN KEY ("de_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_transferencias" ADD CONSTRAINT "wa_transferencias_para_user_id_users_id_fk" FOREIGN KEY ("para_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nps_criado_idx" ON "nps_respostas" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "wa_transf_para_idx" ON "wa_transferencias" USING btree ("para_user_id","chat");