CREATE TABLE "crm_etapas" (
	"id" text PRIMARY KEY NOT NULL,
	"funil_id" text NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_funis" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_historico" (
	"id" text PRIMARY KEY NOT NULL,
	"negociacao_id" text NOT NULL,
	"user_id" text,
	"tipo" text NOT NULL,
	"texto" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_negociacoes" (
	"id" text PRIMARY KEY NOT NULL,
	"funil_id" text NOT NULL,
	"etapa_id" text NOT NULL,
	"titulo" text NOT NULL,
	"loja" text DEFAULT 'asfaltomulti' NOT NULL,
	"contato" text,
	"empresa" text,
	"telefone" text,
	"email" text,
	"valor" double precision DEFAULT 0 NOT NULL,
	"qualificacao" integer DEFAULT 0 NOT NULL,
	"fonte" text,
	"previsao_fechamento" timestamp with time zone,
	"responsavel_id" text,
	"status" text DEFAULT 'andamento' NOT NULL,
	"motivo_perda" text,
	"cotacao_id" text,
	"pedido_id" text,
	"ordem" double precision DEFAULT 0 NOT NULL,
	"fechada_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_tarefas" (
	"id" text PRIMARY KEY NOT NULL,
	"negociacao_id" text NOT NULL,
	"tipo" text DEFAULT 'tarefa' NOT NULL,
	"descricao" text NOT NULL,
	"quando" timestamp with time zone NOT NULL,
	"responsavel_id" text,
	"concluida" boolean DEFAULT false NOT NULL,
	"concluida_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_etapas" ADD CONSTRAINT "crm_etapas_funil_id_crm_funis_id_fk" FOREIGN KEY ("funil_id") REFERENCES "public"."crm_funis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_historico" ADD CONSTRAINT "crm_historico_negociacao_id_crm_negociacoes_id_fk" FOREIGN KEY ("negociacao_id") REFERENCES "public"."crm_negociacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_historico" ADD CONSTRAINT "crm_historico_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_negociacoes" ADD CONSTRAINT "crm_negociacoes_funil_id_crm_funis_id_fk" FOREIGN KEY ("funil_id") REFERENCES "public"."crm_funis"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_negociacoes" ADD CONSTRAINT "crm_negociacoes_etapa_id_crm_etapas_id_fk" FOREIGN KEY ("etapa_id") REFERENCES "public"."crm_etapas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_negociacoes" ADD CONSTRAINT "crm_negociacoes_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tarefas" ADD CONSTRAINT "crm_tarefas_negociacao_id_crm_negociacoes_id_fk" FOREIGN KEY ("negociacao_id") REFERENCES "public"."crm_negociacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_tarefas" ADD CONSTRAINT "crm_tarefas_responsavel_id_users_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_etapas_funil_idx" ON "crm_etapas" USING btree ("funil_id");--> statement-breakpoint
CREATE INDEX "crm_hist_neg_idx" ON "crm_historico" USING btree ("negociacao_id");--> statement-breakpoint
CREATE INDEX "crm_neg_funil_idx" ON "crm_negociacoes" USING btree ("funil_id","status");--> statement-breakpoint
CREATE INDEX "crm_neg_tel_idx" ON "crm_negociacoes" USING btree ("telefone");--> statement-breakpoint
CREATE INDEX "crm_tarefas_neg_idx" ON "crm_tarefas" USING btree ("negociacao_id");--> statement-breakpoint
CREATE INDEX "crm_tarefas_quando_idx" ON "crm_tarefas" USING btree ("concluida","quando");