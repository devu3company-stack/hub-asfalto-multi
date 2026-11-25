CREATE TABLE "carrinhos" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text,
	"nome" text,
	"url" text,
	"valor" double precision DEFAULT 0 NOT NULL,
	"itens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recuperado" boolean DEFAULT false NOT NULL,
	"automacao_iniciada" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contatos" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nome" text,
	"telefone" text,
	"cidade" text,
	"uf" text,
	"origens" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"consentimento" text,
	"descadastrado_em" timestamp with time zone,
	"bounce" boolean DEFAULT false NOT NULL,
	"shopify_id" text,
	"omie_id" text,
	"total_pedidos" integer DEFAULT 0 NOT NULL,
	"total_gasto" double precision DEFAULT 0 NOT NULL,
	"ultima_compra_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contatos_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "email_automacoes" (
	"chave" text PRIMARY KEY NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_campanhas" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"assunto" text NOT NULL,
	"conteudo" jsonb NOT NULL,
	"segmento" jsonb NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"agendada_para" timestamp with time zone,
	"total_destinatarios" integer DEFAULT 0 NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enviada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "email_envios" (
	"id" text PRIMARY KEY NOT NULL,
	"contato_id" text NOT NULL,
	"campanha_id" text,
	"automacao" text,
	"referencia" text,
	"assunto" text NOT NULL,
	"html" text NOT NULL,
	"status" text DEFAULT 'fila' NOT NULL,
	"agendado_para" timestamp with time zone DEFAULT now() NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"erro" text,
	"enviado_em" timestamp with time zone,
	"aberto_em" timestamp with time zone,
	"clicado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_campanhas" ADD CONSTRAINT "email_campanhas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_envios" ADD CONSTRAINT "email_envios_contato_id_contatos_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."contatos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_envios" ADD CONSTRAINT "email_envios_campanha_id_email_campanhas_id_fk" FOREIGN KEY ("campanha_id") REFERENCES "public"."email_campanhas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contatos_ultima_compra_idx" ON "contatos" USING btree ("ultima_compra_em");--> statement-breakpoint
CREATE INDEX "email_envios_fila_idx" ON "email_envios" USING btree ("status","agendado_para");--> statement-breakpoint
CREATE INDEX "email_envios_campanha_idx" ON "email_envios" USING btree ("campanha_id");--> statement-breakpoint
CREATE INDEX "email_envios_contato_idx" ON "email_envios" USING btree ("contato_id");