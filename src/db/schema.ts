import { boolean, doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

export const roleEnum = pgEnum("role", ["ADMIN", "FINANCEIRO", "COMERCIAL", "ATENDIMENTO"]);

const id = () => text("id").primaryKey().$defaultFn(() => createId());

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("ATENDIMENTO"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const auditLogs = pgTable("audit_logs", {
  id: id(),
  userId: text("user_id").references(() => users.id),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_logs_created_at_idx").on(t.createdAt)]);

/** Credenciais de cada API, guardadas criptografadas (AES-256-GCM). */
export const integrations = pgTable("integrations", {
  id: id(),
  provider: text("provider").notNull().unique(), // omie | shopify | googleads | zappro
  config: text("config").notNull(), // JSON criptografado
  enabled: boolean("enabled").notNull().default(true),
  status: text("status").notNull().default("nao_testado"), // ok | erro | nao_testado
  lastError: text("last_error"),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Eventos recebidos por webhook (ZapPro, Shopify), para processamento. */
export const webhookEvents = pgTable("webhook_events", {
  id: id(),
  provider: text("provider").notNull(),
  payload: jsonb("payload").notNull(),
  processed: boolean("processed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("webhook_events_provider_processed_idx").on(t.provider, t.processed)]);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

/** Transportadoras com tabela de frete própria (motor de cálculo do hub). */
export const transportadoras = pgTable("transportadoras", {
  id: id(),
  nome: text("nome").notNull(),
  cnpj: text("cnpj"),
  fatorCubagem: doublePrecision("fator_cubagem").notNull().default(300), // kg por m³
  prazoExtra: integer("prazo_extra").notNull().default(0), // dias somados a todas as rotas (ex.: coleta)
  ativo: boolean("ativo").notNull().default(true),
  observacao: text("observacao"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Uma linha da tabela de frete: faixa de CEP de destino com preços por faixa de peso e taxas. */
export const freteRotas = pgTable("frete_rotas", {
  id: id(),
  transportadoraId: text("transportadora_id").notNull().references(() => transportadoras.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  cepInicio: text("cep_inicio").notNull(),
  cepFim: text("cep_fim").notNull(),
  prazoDias: integer("prazo_dias").notNull(),
  faixas: jsonb("faixas").notNull(), // [{ ateKg, valor }] em ordem crescente
  excedenteKg: doublePrecision("excedente_kg").notNull().default(0), // R$ por kg acima da última faixa
  freteMinimo: doublePrecision("frete_minimo").notNull().default(0),
  adValoremPct: doublePrecision("ad_valorem_pct").notNull().default(0), // frete-valor, % da NF
  grisPct: doublePrecision("gris_pct").notNull().default(0),
  grisMin: doublePrecision("gris_min").notNull().default(0),
  pedagioPor100kg: doublePrecision("pedagio_por_100kg").notNull().default(0),
  taxaDespacho: doublePrecision("taxa_despacho").notNull().default(0), // TAS / despacho, por embarque
  outrasTaxas: doublePrecision("outras_taxas").notNull().default(0), // TDE, TRT etc., por embarque
  icmsPct: doublePrecision("icms_pct").notNull().default(0), // calculado "por dentro"
  ativo: boolean("ativo").notNull().default(true),
}, (t) => [index("frete_rotas_cep_idx").on(t.cepInicio, t.cepFim), index("frete_rotas_transp_idx").on(t.transportadoraId)]);

export const transportadorasRelations = relations(transportadoras, ({ many }) => ({ rotas: many(freteRotas) }));
export const freteRotasRelations = relations(freteRotas, ({ one }) => ({
  transportadora: one(transportadoras, { fields: [freteRotas.transportadoraId], references: [transportadoras.id] }),
}));

/** Cotações de frete feitas no hub (itens e opções retornadas ficam em JSON). */
/** Produtos com dados de envio. Vêm do Omie (peso bruto e medidas) e podem ter paletização definida no hub. */
export const produtos = pgTable("produtos", {
  id: id(),
  loja: text("loja").notNull().default("asfaltomulti"), // lojas.ts
  omieId: text("omie_id"), // codigo_produto do Omie
  shopifyVariantId: text("shopify_variant_id"), // variante da Shopify (Loja do Asfalto)
  shopifyInventoryItemId: text("shopify_inventory_item_id"),
  estoque: doublePrecision("estoque"), // saldo no Omie (null = não consultado)
  estoqueMinimo: doublePrecision("estoque_minimo").notNull().default(0),
  estoqueEm: timestamp("estoque_em", { withTimezone: true }),
  codigo: text("codigo"), // código/SKU exibido no Omie
  descricao: text("descricao").notNull(),
  unidade: text("unidade"),
  pesoKg: doublePrecision("peso_kg").notNull().default(0), // peso bruto por unidade
  alturaCm: doublePrecision("altura_cm").notNull().default(0),
  larguraCm: doublePrecision("largura_cm").notNull().default(0),
  comprimentoCm: doublePrecision("comprimento_cm").notNull().default(0),
  valorUnit: doublePrecision("valor_unit").notNull().default(0),
  medidasNoHub: boolean("medidas_no_hub").notNull().default(false), // true = peso/medidas editados no hub; a sincronização não sobrescreve
  paleteQtd: integer("palete_qtd").notNull().default(0), // unidades por palete (0 = não paletiza)
  paletePesoKg: doublePrecision("palete_peso_kg").notNull().default(0), // peso do palete cheio (0 = calcula)
  paleteAlturaCm: doublePrecision("palete_altura_cm").notNull().default(0),
  paleteLarguraCm: doublePrecision("palete_largura_cm").notNull().default(0),
  paleteComprimentoCm: doublePrecision("palete_comprimento_cm").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("produtos_desc_idx").on(t.descricao),
  uniqueIndex("produtos_loja_omie_uq").on(t.loja, t.omieId),
  uniqueIndex("produtos_loja_shopify_uq").on(t.loja, t.shopifyVariantId),
]);

export const freteCotacoes = pgTable("frete_cotacoes", {
  id: id(),
  loja: text("loja").notNull().default("asfaltomulti"),
  userId: text("user_id").references(() => users.id),
  cliente: text("cliente"),
  cepOrigem: text("cep_origem").notNull(),
  cepDestino: text("cep_destino").notNull(),
  valorMercadoria: text("valor_mercadoria").notNull(),
  pesoTotal: text("peso_total").notNull(),
  itens: jsonb("itens").notNull(),
  opcoes: jsonb("opcoes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("frete_cotacoes_created_at_idx").on(t.createdAt)]);

export const freteCotacoesRelations = relations(freteCotacoes, ({ one }) => ({
  user: one(users, { fields: [freteCotacoes.userId], references: [users.id] }),
}));

/** Configurações simples do sistema (canal de envio do WhatsApp, IA ligada, instruções da IA...). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

/** Uma conversa do WhatsApp (um contato). `chat` = número só com dígitos (ou o identificador do WhatsApp). */
export const waChats = pgTable("wa_chats", {
  chat: text("chat").primaryKey(),
  name: text("name"),
  channel: text("channel").notNull().default("qr"), // qr | oficial — por onde chegou a última mensagem
  aiPaused: boolean("ai_paused").notNull().default(false),
  optout: boolean("optout").notNull().default(false), // pediu para não receber mensagens de marketing (respondeu SAIR)
  lastText: text("last_text"),
  lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("wa_chats_last_at_idx").on(t.lastAt)]);

export const waMessages = pgTable("wa_messages", {
  id: text("id").primaryKey().$defaultFn(() => createId()), // id do WhatsApp quando houver
  chat: text("chat").notNull(),
  channel: text("channel").notNull(), // qr | oficial
  fromMe: boolean("from_me").notNull(),
  sentBy: text("sent_by").notNull(), // cliente | ia | humano
  userId: text("user_id"),
  text: text("text").notNull(),
  midia: text("midia"), // nome do arquivo em data/whatsapp
  midiaTipo: text("midia_tipo"), // imagem | audio | video | documento | figurinha
  midiaMime: text("midia_mime"),
  midiaNome: text("midia_nome"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("wa_messages_chat_idx").on(t.chat, t.createdAt)]);

/* ------------------------------- E-mail marketing ------------------------------- */

/** Contatos de e-mail (Shopify, Omie, WhatsApp, planilha, formulário). Um por e-mail. */
export const contatos = pgTable("contatos", {
  id: id(),
  email: text("email").notNull().unique(), // sempre minúsculo
  nome: text("nome"),
  telefone: text("telefone"),
  cidade: text("cidade"),
  uf: text("uf"),
  lojas: text("lojas").array().notNull().default([]), // lojas com que o contato tem relação
  origens: text("origens").array().notNull().default([]), // shopify | omie | whatsapp | planilha | formulario | manual
  tags: text("tags").array().notNull().default([]),
  consentimento: text("consentimento"), // como o contato aceitou receber (ex.: "formulário do site", "aceitou marketing na Shopify")
  descadastradoEm: timestamp("descadastrado_em", { withTimezone: true }),
  bounce: boolean("bounce").notNull().default(false), // e-mail inválido: não envia mais
  shopifyId: text("shopify_id"),
  omieId: text("omie_id"),
  totalPedidos: integer("total_pedidos").notNull().default(0),
  totalGasto: doublePrecision("total_gasto").notNull().default(0),
  ultimaCompraEm: timestamp("ultima_compra_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("contatos_ultima_compra_idx").on(t.ultimaCompraEm)]);

/** Campanha manual (um e-mail para um segmento). */
export const emailCampanhas = pgTable("email_campanhas", {
  id: id(),
  loja: text("loja").notNull().default("asfaltomulti"),
  nome: text("nome").notNull(),
  assunto: text("assunto").notNull(),
  conteudo: jsonb("conteudo").notNull(), // EmailConteudo
  segmento: jsonb("segmento").notNull(), // Segmento
  status: text("status").notNull().default("rascunho"), // rascunho | agendada | enviando | enviada | cancelada
  agendadaPara: timestamp("agendada_para", { withTimezone: true }),
  totalDestinatarios: integer("total_destinatarios").notNull().default(0),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  enviadaEm: timestamp("enviada_em", { withTimezone: true }),
});

/** Configuração das automações (carrinho, pós-compra, reativação). */
export const emailAutomacoes = pgTable("email_automacoes", {
  chave: text("chave").primaryKey(), // carrinho@loja | poscompra@loja | reativacao@loja
  ativo: boolean("ativo").notNull().default(false),
  config: jsonb("config").notNull(), // passos e prazos
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Cada e-mail a enviar/enviado. Também é a fila. */
export const emailEnvios = pgTable("email_envios", {
  id: id(),
  loja: text("loja").notNull().default("asfaltomulti"), // define o servidor de envio (SMTP) usado
  contatoId: text("contato_id").notNull().references(() => contatos.id, { onDelete: "cascade" }),
  campanhaId: text("campanha_id").references(() => emailCampanhas.id, { onDelete: "cascade" }),
  automacao: text("automacao"), // chave da automação + passo (ex.: "carrinho:0")
  referencia: text("referencia"), // id do checkout/pedido que gerou (evita duplicar)
  assunto: text("assunto").notNull(),
  html: text("html").notNull(),
  status: text("status").notNull().default("fila"), // fila | enviado | erro | cancelado
  agendadoPara: timestamp("agendado_para", { withTimezone: true }).notNull().defaultNow(),
  tentativas: integer("tentativas").notNull().default(0),
  erro: text("erro"),
  enviadoEm: timestamp("enviado_em", { withTimezone: true }),
  abertoEm: timestamp("aberto_em", { withTimezone: true }),
  clicadoEm: timestamp("clicado_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("email_envios_fila_idx").on(t.status, t.agendadoPara),
  index("email_envios_campanha_idx").on(t.campanhaId),
  index("email_envios_contato_idx").on(t.contatoId),
]);

/** Checkouts da Shopify, para o carrinho abandonado. */
export const carrinhos = pgTable("carrinhos", {
  id: text("id").primaryKey(), // token do checkout na Shopify
  loja: text("loja").notNull().default("lojadoasfalto"),
  email: text("email"),
  nome: text("nome"),
  telefone: text("telefone"),
  url: text("url"),
  valor: doublePrecision("valor").notNull().default(0),
  itens: jsonb("itens").notNull().default([]),
  recuperado: boolean("recuperado").notNull().default(false),
  automacaoIniciada: boolean("automacao_iniciada").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const emailEnviosRelations = relations(emailEnvios, ({ one }) => ({
  contato: one(contatos, { fields: [emailEnvios.contatoId], references: [contatos.id] }),
  campanha: one(emailCampanhas, { fields: [emailEnvios.campanhaId], references: [emailCampanhas.id] }),
}));

/* ------------------------------ Fase 2: pedidos ------------------------------ */

/** Pedidos da Shopify e a situação do envio para o Omie. */
export const pedidos = pgTable("pedidos", {
  id: id(),
  loja: text("loja").notNull(),
  shopifyId: text("shopify_id").notNull(),
  numero: text("numero").notNull(), // #1001
  cliente: text("cliente"),
  email: text("email"),
  documento: text("documento"), // CPF/CNPJ
  total: doublePrecision("total").notNull().default(0),
  pagamento: text("pagamento"), // financial_status da Shopify
  status: text("status").notNull().default("pendente"), // pendente | enviado | erro | ignorado
  omieDestino: text("omie_destino"), // loja cujo Omie recebe
  omiePedido: text("omie_pedido"), // codigo_pedido no Omie
  omieNumero: text("omie_numero"),
  erro: text("erro"),
  tentativas: integer("tentativas").notNull().default(0),
  payload: jsonb("payload").notNull(),
  criadoNaLoja: timestamp("criado_na_loja", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("pedidos_loja_shopify_uq").on(t.loja, t.shopifyId), index("pedidos_status_idx").on(t.status)]);

/* ------------------------------ Fase 4: manuais ------------------------------ */

export const manuais = pgTable("manuais", {
  id: id(),
  titulo: text("titulo").notNull(),
  loja: text("loja"), // null = vale para as duas
  produtoId: text("produto_id").references(() => produtos.id, { onDelete: "set null" }),
  arquivo: text("arquivo").notNull(), // nome do arquivo salvo no volume
  nomeOriginal: text("nome_original").notNull(),
  tamanho: integer("tamanho").notNull(),
  paginas: integer("paginas").notNull().default(0),
  usarNaIA: boolean("usar_na_ia").notNull().default(true),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Texto do manual por página, para a busca e para a IA. */
export const manualTrechos = pgTable("manual_trechos", {
  id: id(),
  manualId: text("manual_id").notNull().references(() => manuais.id, { onDelete: "cascade" }),
  pagina: integer("pagina").notNull(),
  texto: text("texto").notNull(),
}, (t) => [index("manual_trechos_manual_idx").on(t.manualId)]);

export const manuaisRelations = relations(manuais, ({ one, many }) => ({
  produto: one(produtos, { fields: [manuais.produtoId], references: [produtos.id] }),
  trechos: many(manualTrechos),
}));

/* ------------------------------ CRM (funil de vendas) ------------------------------ */

export const crmFunis = pgTable("crm_funis", {
  id: id(),
  nome: text("nome").notNull(),
  ordem: integer("ordem").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crmEtapas = pgTable("crm_etapas", {
  id: id(),
  funilId: text("funil_id").notNull().references(() => crmFunis.id, { onDelete: "cascade" }),
  nome: text("nome").notNull(),
  ordem: integer("ordem").notNull().default(0),
}, (t) => [index("crm_etapas_funil_idx").on(t.funilId)]);

export const crmNegociacoes = pgTable("crm_negociacoes", {
  id: id(),
  funilId: text("funil_id").notNull().references(() => crmFunis.id, { onDelete: "cascade" }),
  etapaId: text("etapa_id").notNull().references(() => crmEtapas.id, { onDelete: "restrict" }),
  titulo: text("titulo").notNull(),
  loja: text("loja").notNull().default("asfaltomulti"),
  contato: text("contato"),
  empresa: text("empresa"),
  telefone: text("telefone"), // só dígitos; liga com a conversa do WhatsApp
  documento: text("documento"), // CPF/CNPJ só dígitos
  email: text("email"),
  valor: doublePrecision("valor").notNull().default(0),
  qualificacao: integer("qualificacao").notNull().default(0), // 0 a 5 estrelas
  fonte: text("fonte"),
  previsaoFechamento: timestamp("previsao_fechamento", { withTimezone: true }),
  responsavelId: text("responsavel_id").references(() => users.id, { onDelete: "set null" }),
  status: text("status").notNull().default("andamento"), // andamento | ganha | perdida
  motivoPerda: text("motivo_perda"),
  cotacaoId: text("cotacao_id"),
  pedidoId: text("pedido_id"),
  ordem: doublePrecision("ordem").notNull().default(0), // posição dentro da etapa
  fechadaEm: timestamp("fechada_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("crm_neg_funil_idx").on(t.funilId, t.status), index("crm_neg_tel_idx").on(t.telefone)]);

export const crmTarefas = pgTable("crm_tarefas", {
  id: id(),
  negociacaoId: text("negociacao_id").notNull().references(() => crmNegociacoes.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull().default("tarefa"), // ligacao | whatsapp | email | reuniao | visita | tarefa
  descricao: text("descricao").notNull(),
  quando: timestamp("quando", { withTimezone: true }).notNull(),
  responsavelId: text("responsavel_id").references(() => users.id, { onDelete: "set null" }),
  concluida: boolean("concluida").notNull().default(false),
  concluidaEm: timestamp("concluida_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("crm_tarefas_neg_idx").on(t.negociacaoId), index("crm_tarefas_quando_idx").on(t.concluida, t.quando)]);

export const crmHistorico = pgTable("crm_historico", {
  id: id(),
  negociacaoId: text("negociacao_id").notNull().references(() => crmNegociacoes.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  tipo: text("tipo").notNull(), // nota | etapa | status | criada | tarefa | edicao
  texto: text("texto").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("crm_hist_neg_idx").on(t.negociacaoId)]);

export const crmNegociacoesRelations = relations(crmNegociacoes, ({ one, many }) => ({
  etapa: one(crmEtapas, { fields: [crmNegociacoes.etapaId], references: [crmEtapas.id] }),
  responsavel: one(users, { fields: [crmNegociacoes.responsavelId], references: [users.id] }),
  tarefas: many(crmTarefas),
  historico: many(crmHistorico),
}));
export const crmTarefasRelations = relations(crmTarefas, ({ one }) => ({
  negociacao: one(crmNegociacoes, { fields: [crmTarefas.negociacaoId], references: [crmNegociacoes.id] }),
  responsavel: one(users, { fields: [crmTarefas.responsavelId], references: [users.id] }),
}));
export const crmHistoricoRelations = relations(crmHistorico, ({ one }) => ({
  negociacao: one(crmNegociacoes, { fields: [crmHistorico.negociacaoId], references: [crmNegociacoes.id] }),
  user: one(users, { fields: [crmHistorico.userId], references: [users.id] }),
}));
export const crmEtapasRelations = relations(crmEtapas, ({ one }) => ({ funil: one(crmFunis, { fields: [crmEtapas.funilId], references: [crmFunis.id] }) }));

// ───────── Histórico de fretes (base da análise, veio da planilha "Histórico de Preços Fretes") ─────────

export const freteHistorico = pgTable("frete_historico", {
  id: id(),
  data: timestamp("data", { withTimezone: true }).notNull(),
  cidade: text("cidade"),
  uf: text("uf"),
  produto: text("produto"),
  qtd: doublePrecision("qtd"),
  kg: doublePrecision("kg").notNull(),
  distanciaKm: doublePrecision("distancia_km").notNull(),
  veiculo: text("veiculo").notNull(),
  orcamento: doublePrecision("orcamento").notNull(), // valor que o freteiro pediu
  custo: doublePrecision("custo").notNull(), // valor pago no fim
  origem: text("origem").notNull().default("planilha"), // planilha | entrega | manual
  entregaId: text("entrega_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("frete_hist_veiculo_idx").on(t.veiculo)]);

// ───────── Entregadores externos e fretes publicados para eles ─────────

export const entregadores = pgTable("entregadores", {
  id: id(),
  nome: text("nome").notNull(),
  telefone: text("telefone").notNull().unique(), // só dígitos, com 55
  documento: text("documento"),
  placa: text("placa"),
  veiculos: text("veiculos").array().notNull().default([]), // vazio = recebe todos
  ativo: boolean("ativo").notNull().default(true),
  pinHash: text("pin_hash").notNull(),
  ultimoAcesso: timestamp("ultimo_acesso", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const entregas = pgTable("entregas", {
  id: id(),
  loja: text("loja").notNull().default("asfaltomulti"),
  origem: text("origem").notNull().default("Mogi Mirim-SP"),
  destino: text("destino").notNull(), // cidade
  uf: text("uf"),
  endereco: text("endereco"),
  cliente: text("cliente"),
  contatoCliente: text("contato_cliente"),
  telefoneCliente: text("telefone_cliente"), // WhatsApp do cliente para os avisos da entrega
  produto: text("produto"),
  qtd: doublePrecision("qtd"),
  kg: doublePrecision("kg").notNull().default(0),
  distanciaKm: doublePrecision("distancia_km").notNull().default(0),
  veiculo: text("veiculo"),
  valor: doublePrecision("valor").notNull(), // pago ao entregador
  coletaEm: timestamp("coleta_em", { withTimezone: true }),
  observacao: text("observacao"),
  status: text("status").notNull().default("publicado"), // publicado | aceito | coletado | entregue | cancelado
  entregadorId: text("entregador_id").references(() => entregadores.id, { onDelete: "set null" }),
  aceitoEm: timestamp("aceito_em", { withTimezone: true }),
  coletadoEm: timestamp("coletado_em", { withTimezone: true }),
  entregueEm: timestamp("entregue_em", { withTimezone: true }),
  canhoto: text("canhoto"), // arquivo em data/entregas
  recebedor: text("recebedor"),
  entregaLat: doublePrecision("entrega_lat"),
  entregaLng: doublePrecision("entrega_lng"),
  entregaPrecisao: doublePrecision("entrega_precisao"),
  avisados: integer("avisados").notNull().default(0),
  criadoPor: text("criado_por").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("entregas_status_idx").on(t.status)]);

export const entregasRelations = relations(entregas, ({ one }) => ({
  entregador: one(entregadores, { fields: [entregas.entregadorId], references: [entregadores.id] }),
  autor: one(users, { fields: [entregas.criadoPor], references: [users.id] }),
}));

// ───────── Automações (regras "Quando → Então"; o editor visual usa a mesma estrutura) ─────────

export const automacoes = pgTable("automacoes", {
  id: id(),
  nome: text("nome").notNull(),
  grupo: text("grupo").notNull().default("geral"), // followup | duvidas | frete | remarketing | geral
  ativa: boolean("ativa").notNull().default(false),
  gatilho: text("gatilho").notNull(),
  gatilhoConfig: jsonb("gatilho_config").$type<Record<string, unknown>>().notNull().default({}),
  passos: jsonb("passos").$type<{ id: string; tipo: string; config: Record<string, unknown> }[]>().notNull().default([]),
  modelo: text("modelo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automacaoExecucoes = pgTable("automacao_execucoes", {
  id: id(),
  automacaoId: text("automacao_id").notNull().references(() => automacoes.id, { onDelete: "cascade" }),
  chave: text("chave").notNull(), // evita rodar duas vezes para o mesmo evento
  contexto: jsonb("contexto").$type<Record<string, string | number | null | undefined>>().notNull(),
  passo: integer("passo").notNull().default(0),
  status: text("status").notNull().default("ativa"), // ativa | esperando | rodando | concluida | cancelada | erro
  proximaEm: timestamp("proxima_em", { withTimezone: true }).notNull().defaultNow(),
  log: jsonb("log").$type<{ em: string; texto: string }[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("auto_exec_chave_uq").on(t.automacaoId, t.chave), index("auto_exec_fila_idx").on(t.status, t.proximaEm)]);

export const automacaoAprovacoes = pgTable("automacao_aprovacoes", {
  id: id(),
  execucaoId: text("execucao_id").references(() => automacaoExecucoes.id, { onDelete: "cascade" }),
  automacaoId: text("automacao_id").references(() => automacoes.id, { onDelete: "cascade" }),
  chat: text("chat").notNull(),
  nome: text("nome"),
  pedido: text("pedido"), // o que o cliente escreveu
  texto: text("texto").notNull(), // mensagem sugerida
  status: text("status").notNull().default("pendente"), // pendente | enviada | descartada
  decididaPor: text("decidida_por").references(() => users.id, { onDelete: "set null" }),
  decididaEm: timestamp("decidida_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const automacaoExecucoesRelations = relations(automacaoExecucoes, ({ one }) => ({
  automacao: one(automacoes, { fields: [automacaoExecucoes.automacaoId], references: [automacoes.id] }),
}));
export const automacaoAprovacoesRelations = relations(automacaoAprovacoes, ({ one }) => ({
  automacao: one(automacoes, { fields: [automacaoAprovacoes.automacaoId], references: [automacoes.id] }),
}));
