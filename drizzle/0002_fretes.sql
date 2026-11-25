CREATE TABLE "frete_cotacoes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"cliente" text,
	"cep_origem" text NOT NULL,
	"cep_destino" text NOT NULL,
	"valor_mercadoria" text NOT NULL,
	"peso_total" text NOT NULL,
	"itens" jsonb NOT NULL,
	"opcoes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "frete_rotas" (
	"id" text PRIMARY KEY NOT NULL,
	"transportadora_id" text NOT NULL,
	"nome" text NOT NULL,
	"cep_inicio" text NOT NULL,
	"cep_fim" text NOT NULL,
	"prazo_dias" integer NOT NULL,
	"faixas" jsonb NOT NULL,
	"excedente_kg" double precision DEFAULT 0 NOT NULL,
	"frete_minimo" double precision DEFAULT 0 NOT NULL,
	"ad_valorem_pct" double precision DEFAULT 0 NOT NULL,
	"gris_pct" double precision DEFAULT 0 NOT NULL,
	"gris_min" double precision DEFAULT 0 NOT NULL,
	"pedagio_por_100kg" double precision DEFAULT 0 NOT NULL,
	"taxa_despacho" double precision DEFAULT 0 NOT NULL,
	"outras_taxas" double precision DEFAULT 0 NOT NULL,
	"icms_pct" double precision DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transportadoras" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"cnpj" text,
	"fator_cubagem" double precision DEFAULT 300 NOT NULL,
	"prazo_extra" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "frete_cotacoes" ADD CONSTRAINT "frete_cotacoes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frete_rotas" ADD CONSTRAINT "frete_rotas_transportadora_id_transportadoras_id_fk" FOREIGN KEY ("transportadora_id") REFERENCES "public"."transportadoras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "frete_cotacoes_created_at_idx" ON "frete_cotacoes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "frete_rotas_cep_idx" ON "frete_rotas" USING btree ("cep_inicio","cep_fim");--> statement-breakpoint
CREATE INDEX "frete_rotas_transp_idx" ON "frete_rotas" USING btree ("transportadora_id");