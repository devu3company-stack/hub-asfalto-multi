import { LOJAS } from "../lojas";
/** Definição das integrações exibidas na aba Integrações (sem segredos; pode ir para o cliente). */
export type Field = {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
  help?: string;
  optional?: boolean;
};

export type ProviderDef = {
  id: string;
  name: string;
  /** Uma conexão por loja (Shopify, Omie, e-mail). */
  porLoja?: boolean;
  loja?: string;
  description: string;
  docs: string;
  fields: Field[];
};

export const PROVIDERS: ProviderDef[] = [
  {
    id: "omie",
    porLoja: true,
    name: "Omie ERP",
    description: "Pedidos, clientes, estoque e financeiro (contas a receber e a pagar).",
    docs: "https://developer.omie.com.br/",
    fields: [
      { key: "appKey", label: "App Key", placeholder: "Ex.: 1234567890123" },
      { key: "appSecret", label: "App Secret", secret: true },
    ],
  },
  {
    id: "shopify",
    porLoja: true,
    name: "Shopify",
    description: "Pedidos e produtos da loja virtual. Use um app personalizado com token da Admin API.",
    docs: "https://shopify.dev/docs/api/admin-rest",
    fields: [
      { key: "shop", label: "Loja", placeholder: "minhaloja.myshopify.com" },
      { key: "accessToken", label: "Token da Admin API", secret: true, placeholder: "shpat_..." },
      { key: "apiVersion", label: "Versão da API", placeholder: "2025-01", optional: true },
      { key: "webhookSecret", label: "Segredo dos webhooks", secret: true, optional: true },
    ],
  },
  {
    id: "googleads",
    name: "Google Ads (somente relatórios)",
    description: "Leitura de campanhas, custos e conversões. Nenhuma alteração é feita nas campanhas.",
    docs: "https://developers.google.com/google-ads/api/docs/start",
    fields: [
      { key: "developerToken", label: "Developer Token", secret: true },
      { key: "clientId", label: "OAuth Client ID" },
      { key: "clientSecret", label: "OAuth Client Secret", secret: true },
      { key: "refreshToken", label: "Refresh Token", secret: true },
      { key: "customerId", label: "ID da conta (cliente)", placeholder: "123-456-7890" },
      { key: "loginCustomerId", label: "ID da conta MCC", optional: true, help: "Só se o acesso for por uma conta gerente." },
      { key: "apiVersion", label: "Versão da API", placeholder: "v21", optional: true },
    ],
  },
  {
    id: "smtp",
    porLoja: true,
    name: "E-mail marketing — servidor de envio (SMTP)",
    description: "Conta de e-mail do domínio usada para os disparos. Hostinger: smtp.hostinger.com, porta 465. O hub respeita os limites por hora e por dia abaixo para não bloquear a conta.",
    docs: "https://support.hostinger.com",
    fields: [
      { key: "host", label: "Servidor SMTP", placeholder: "smtp.hostinger.com" },
      { key: "port", label: "Porta", placeholder: "465" },
      { key: "user", label: "Usuário (e-mail completo)", placeholder: "contato@asfaltomulti.com.br" },
      { key: "pass", label: "Senha do e-mail", secret: true },
      { key: "fromName", label: "Nome do remetente", placeholder: "Asfalto Multi", optional: true },
      { key: "fromEmail", label: "E-mail do remetente", placeholder: "Igual ao usuário", optional: true },
      { key: "replyTo", label: "Responder para", placeholder: "vendas@asfaltomulti.com.br", optional: true },
      { key: "limitePorHora", label: "Limite por hora", placeholder: "80", optional: true, help: "Confira o limite do seu plano de e-mail. Na dúvida, deixe 80." },
      { key: "limitePorDia", label: "Limite por dia", placeholder: "800", optional: true },
    ],
  },
  {
    id: "melhorenvio",
    name: "Fretes — Melhor Envio",
    description: "Cotação gratuita com Correios, Jadlog, Azul Cargo, Loggi e outras. Token em Melhor Envio › Integrações › Permissões de acesso.",
    docs: "https://docs.melhorenvio.com.br/",
    fields: [
      { key: "token", label: "Token de acesso", secret: true },
      { key: "email", label: "E-mail técnico", placeholder: "voce@empresa.com.br", help: "Exigido pelo Melhor Envio para identificar o sistema." },
      { key: "cepOrigem", label: "CEP de origem (expedição)", placeholder: "13800-000" },
      { key: "sandbox", label: "Ambiente de testes?", optional: true, placeholder: "nao", help: "Escreva sim para usar o sandbox." },
    ],
  },
  {
    id: "whatsapp_oficial",
    name: "WhatsApp — API oficial (Meta)",
    description: "Conexão oficial da Meta (WhatsApp Cloud API). A conexão por QR code fica na tela WhatsApp e não precisa de chaves.",
    docs: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
    fields: [
      { key: "phoneNumberId", label: "ID do número de telefone", placeholder: "Ex.: 123456789012345" },
      { key: "accessToken", label: "Token de acesso permanente", secret: true, help: "Gerado por um usuário do sistema no Business Manager." },
      { key: "appSecret", label: "Chave secreta do app", secret: true, help: "Meta for Developers › seu app › Configurações › Básico." },
      { key: "verifyToken", label: "Token de verificação do webhook", help: "Invente uma palavra e use a mesma no cadastro do webhook na Meta." },
      { key: "apiVersion", label: "Versão da API", placeholder: "v21.0", optional: true },
    ],
  },
  {
    id: "ia",
    name: "IA — Claude (Anthropic)",
    description: "Pode ser usada pelo atendente do WhatsApp. Qual IA responde, as instruções e o liga/desliga ficam na tela WhatsApp.",
    docs: "https://docs.claude.com/en/api/getting-started",
    fields: [
      { key: "apiKey", label: "Chave da API", secret: true, placeholder: "sk-ant-..." },
      { key: "model", label: "Modelo", placeholder: "claude-sonnet-5-5", optional: true },
    ],
  },
  {
    id: "ia_openai",
    name: "IA — ChatGPT (OpenAI)",
    description: "Pode ser usada pelo atendente do WhatsApp. Chave em platform.openai.com › API keys.",
    docs: "https://platform.openai.com/docs/quickstart",
    fields: [
      { key: "apiKey", label: "Chave da API", secret: true, placeholder: "sk-..." },
      { key: "model", label: "Modelo", placeholder: "gpt-4o-mini", optional: true },
    ],
  },
  {
    id: "ia_gemini",
    name: "IA — Gemini (Google)",
    description: "Pode ser usada pelo atendente do WhatsApp. Chave no Google AI Studio.",
    docs: "https://ai.google.dev/gemini-api/docs/api-key",
    fields: [
      { key: "apiKey", label: "Chave da API", secret: true, placeholder: "AIza..." },
      { key: "model", label: "Modelo", placeholder: "gemini-2.5-flash", optional: true },
    ],
  },
  {
    id: "ia_compat",
    name: "IA — outra (compatível com OpenAI)",
    description: "Para DeepSeek, Groq, OpenRouter, Mistral, Ollama e outras que seguem o padrão da API da OpenAI.",
    docs: "",
    fields: [
      { key: "baseUrl", label: "URL da API", placeholder: "https://api.deepseek.com/v1", help: "Endereço base, sem /chat/completions no final." },
      { key: "apiKey", label: "Chave da API", secret: true, optional: true },
      { key: "model", label: "Modelo", placeholder: "deepseek-chat" },
    ],
  },
];

/** Lista final: integrações por loja aparecem uma vez para cada loja (ex.: "shopify@lojadoasfalto"). */
export const INTEGRACOES: ProviderDef[] = PROVIDERS.flatMap((p) =>
  p.porLoja ? LOJAS.map((l) => ({ ...p, id: `${p.id}@${l.id}`, loja: l.id, name: `${p.name} · ${l.nome}` })) : [p]);

export const providerById = (id: string) => INTEGRACOES.find((p) => p.id === id);
