CREATE TABLE "manuais" (
	"id" text PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"loja" text,
	"produto_id" text,
	"arquivo" text NOT NULL,
	"nome_original" text NOT NULL,
	"tamanho" integer NOT NULL,
	"paginas" integer DEFAULT 0 NOT NULL,
	"usar_na_ia" boolean DEFAULT true NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_trechos" (
	"id" text PRIMARY KEY NOT NULL,
	"manual_id" text NOT NULL,
	"pagina" integer NOT NULL,
	"texto" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedidos" (
	"id" text PRIMARY KEY NOT NULL,
	"loja" text NOT NULL,
	"shopify_id" text NOT NULL,
	"numero" text NOT NULL,
	"cliente" text,
	"email" text,
	"documento" text,
	"total" double precision DEFAULT 0 NOT NULL,
	"pagamento" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"omie_destino" text,
	"omie_pedido" text,
	"omie_numero" text,
	"erro" text,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"criado_na_loja" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "produtos" DROP CONSTRAINT "produtos_omie_id_unique";--> statement-breakpoint
ALTER TABLE "carrinhos" ADD COLUMN "loja" text DEFAULT 'lojadoasfalto' NOT NULL;--> statement-breakpoint
ALTER TABLE "contatos" ADD COLUMN "lojas" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_campanhas" ADD COLUMN "loja" text DEFAULT 'asfaltomulti' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_envios" ADD COLUMN "loja" text DEFAULT 'asfaltomulti' NOT NULL;--> statement-breakpoint
ALTER TABLE "frete_cotacoes" ADD COLUMN "loja" text DEFAULT 'asfaltomulti' NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "loja" text DEFAULT 'asfaltomulti' NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "shopify_variant_id" text;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "shopify_inventory_item_id" text;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "estoque" double precision;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "estoque_minimo" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "produtos" ADD COLUMN "estoque_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "manuais" ADD CONSTRAINT "manuais_produto_id_produtos_id_fk" FOREIGN KEY ("produto_id") REFERENCES "public"."produtos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manuais" ADD CONSTRAINT "manuais_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_trechos" ADD CONSTRAINT "manual_trechos_manual_id_manuais_id_fk" FOREIGN KEY ("manual_id") REFERENCES "public"."manuais"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_trechos_manual_idx" ON "manual_trechos" USING btree ("manual_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_loja_shopify_uq" ON "pedidos" USING btree ("loja","shopify_id");--> statement-breakpoint
CREATE INDEX "pedidos_status_idx" ON "pedidos" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_loja_omie_uq" ON "produtos" USING btree ("loja","omie_id");--> statement-breakpoint
CREATE UNIQUE INDEX "produtos_loja_shopify_uq" ON "produtos" USING btree ("loja","shopify_variant_id");--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
UPDATE "contatos" SET "lojas" = ARRAY['asfaltomulti'] WHERE "lojas" = '{}';--> statement-breakpoint
UPDATE "email_automacoes" SET "chave" = "chave" || '@asfaltomulti' WHERE "chave" NOT LIKE '%@%';
