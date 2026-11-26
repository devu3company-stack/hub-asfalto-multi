ALTER TYPE "public"."role" ADD VALUE 'MARKETING';--> statement-breakpoint
CREATE TABLE "disparo_contatos" (
	"id" text PRIMARY KEY NOT NULL,
	"disparo_id" text NOT NULL,
	"telefone" text NOT NULL,
	"nome" text,
	"empresa" text,
	"vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"conexao_id" text,
	"erro" text,
	"enviado_em" timestamp with time zone,
	"ordem" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disparos" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"motivo_pausa" text,
	"mensagens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"midia" text,
	"midia_tipo" text,
	"midia_mime" text,
	"midia_nome" text,
	"rodape_sair" boolean DEFAULT true NOT NULL,
	"conexoes" text[] DEFAULT '{}' NOT NULL,
	"intervalo_min" integer DEFAULT 40 NOT NULL,
	"intervalo_max" integer DEFAULT 90 NOT NULL,
	"lote_tamanho" integer DEFAULT 20 NOT NULL,
	"lote_pausa" integer DEFAULT 15 NOT NULL,
	"limite_dia" integer DEFAULT 150 NOT NULL,
	"janela_inicio" integer DEFAULT 9 NOT NULL,
	"janela_fim" integer DEFAULT 19 NOT NULL,
	"sabado" boolean DEFAULT true NOT NULL,
	"domingo" boolean DEFAULT false NOT NULL,
	"conferir_numero" boolean DEFAULT true NOT NULL,
	"inicio_em" timestamp with time zone,
	"criado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "disparo_contatos" ADD CONSTRAINT "disparo_contatos_disparo_id_disparos_id_fk" FOREIGN KEY ("disparo_id") REFERENCES "public"."disparos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disparos" ADD CONSTRAINT "disparos_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "disparo_contato_uq" ON "disparo_contatos" USING btree ("disparo_id","telefone");--> statement-breakpoint
CREATE INDEX "disparo_contato_fila_idx" ON "disparo_contatos" USING btree ("disparo_id","status","ordem");