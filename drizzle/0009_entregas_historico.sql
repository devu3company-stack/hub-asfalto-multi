CREATE TABLE "entregadores" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"telefone" text NOT NULL,
	"documento" text,
	"placa" text,
	"veiculos" text[] DEFAULT '{}' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"pin_hash" text NOT NULL,
	"ultimo_acesso" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entregadores_telefone_unique" UNIQUE("telefone")
);
--> statement-breakpoint
CREATE TABLE "entregas" (
	"id" text PRIMARY KEY NOT NULL,
	"loja" text DEFAULT 'asfaltomulti' NOT NULL,
	"origem" text DEFAULT 'Mogi Mirim-SP' NOT NULL,
	"destino" text NOT NULL,
	"uf" text,
	"endereco" text,
	"cliente" text,
	"contato_cliente" text,
	"produto" text,
	"qtd" double precision,
	"kg" double precision DEFAULT 0 NOT NULL,
	"distancia_km" double precision DEFAULT 0 NOT NULL,
	"veiculo" text,
	"valor" double precision NOT NULL,
	"coleta_em" timestamp with time zone,
	"observacao" text,
	"status" text DEFAULT 'publicado' NOT NULL,
	"entregador_id" text,
	"aceito_em" timestamp with time zone,
	"coletado_em" timestamp with time zone,
	"entregue_em" timestamp with time zone,
	"canhoto" text,
	"recebedor" text,
	"entrega_lat" double precision,
	"entrega_lng" double precision,
	"entrega_precisao" double precision,
	"avisados" integer DEFAULT 0 NOT NULL,
	"criado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "frete_historico" (
	"id" text PRIMARY KEY NOT NULL,
	"data" timestamp with time zone NOT NULL,
	"cidade" text,
	"uf" text,
	"produto" text,
	"qtd" double precision,
	"kg" double precision NOT NULL,
	"distancia_km" double precision NOT NULL,
	"veiculo" text NOT NULL,
	"orcamento" double precision NOT NULL,
	"custo" double precision NOT NULL,
	"origem" text DEFAULT 'planilha' NOT NULL,
	"entrega_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_entregador_id_entregadores_id_fk" FOREIGN KEY ("entregador_id") REFERENCES "public"."entregadores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entregas" ADD CONSTRAINT "entregas_criado_por_users_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entregas_status_idx" ON "entregas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "frete_hist_veiculo_idx" ON "frete_historico" USING btree ("veiculo");