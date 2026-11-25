CREATE TABLE "automacao_aprovacoes" (
	"id" text PRIMARY KEY NOT NULL,
	"execucao_id" text,
	"automacao_id" text,
	"chat" text NOT NULL,
	"nome" text,
	"pedido" text,
	"texto" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"decidida_por" text,
	"decidida_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automacao_execucoes" (
	"id" text PRIMARY KEY NOT NULL,
	"automacao_id" text NOT NULL,
	"chave" text NOT NULL,
	"contexto" jsonb NOT NULL,
	"passo" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ativa' NOT NULL,
	"proxima_em" timestamp with time zone DEFAULT now() NOT NULL,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automacoes" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"grupo" text DEFAULT 'geral' NOT NULL,
	"ativa" boolean DEFAULT false NOT NULL,
	"gatilho" text NOT NULL,
	"gatilho_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"passos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"modelo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carrinhos" ADD COLUMN "telefone" text;--> statement-breakpoint
ALTER TABLE "entregas" ADD COLUMN "telefone_cliente" text;--> statement-breakpoint
ALTER TABLE "wa_chats" ADD COLUMN "optout" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "automacao_aprovacoes" ADD CONSTRAINT "automacao_aprovacoes_execucao_id_automacao_execucoes_id_fk" FOREIGN KEY ("execucao_id") REFERENCES "public"."automacao_execucoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automacao_aprovacoes" ADD CONSTRAINT "automacao_aprovacoes_automacao_id_automacoes_id_fk" FOREIGN KEY ("automacao_id") REFERENCES "public"."automacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automacao_aprovacoes" ADD CONSTRAINT "automacao_aprovacoes_decidida_por_users_id_fk" FOREIGN KEY ("decidida_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automacao_execucoes" ADD CONSTRAINT "automacao_execucoes_automacao_id_automacoes_id_fk" FOREIGN KEY ("automacao_id") REFERENCES "public"."automacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auto_exec_chave_uq" ON "automacao_execucoes" USING btree ("automacao_id","chave");--> statement-breakpoint
CREATE INDEX "auto_exec_fila_idx" ON "automacao_execucoes" USING btree ("status","proxima_em");