CREATE TABLE "produtos" (
	"id" text PRIMARY KEY NOT NULL,
	"omie_id" text,
	"codigo" text,
	"descricao" text NOT NULL,
	"unidade" text,
	"peso_kg" double precision DEFAULT 0 NOT NULL,
	"altura_cm" double precision DEFAULT 0 NOT NULL,
	"largura_cm" double precision DEFAULT 0 NOT NULL,
	"comprimento_cm" double precision DEFAULT 0 NOT NULL,
	"valor_unit" double precision DEFAULT 0 NOT NULL,
	"medidas_no_hub" boolean DEFAULT false NOT NULL,
	"palete_qtd" integer DEFAULT 0 NOT NULL,
	"palete_peso_kg" double precision DEFAULT 0 NOT NULL,
	"palete_altura_cm" double precision DEFAULT 0 NOT NULL,
	"palete_largura_cm" double precision DEFAULT 0 NOT NULL,
	"palete_comprimento_cm" double precision DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_omie_id_unique" UNIQUE("omie_id")
);
--> statement-breakpoint
CREATE INDEX "produtos_desc_idx" ON "produtos" USING btree ("descricao");