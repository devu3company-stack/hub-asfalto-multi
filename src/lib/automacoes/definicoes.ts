/**
 * Catálogo das automações: gatilhos ("Quando"), passos ("Então") e modelos prontos.
 * Usado pelo motor (servidor) e pelos editores (regras e fluxo visual), por isso não importa nada do servidor.
 */

export type Campo = {
  k: string;
  rotulo: string;
  tipo: "texto" | "textarea" | "numero" | "palavras" | "etapa" | "select" | "bool" | "loja";
  opcoes?: { v: string; r: string }[];
  ajuda?: string;
  padrao?: string | number | boolean;
};

export const GRUPOS: Record<string, string> = {
  followup: "Follow-up de orçamento e lead",
  duvidas: "Dúvidas e produtos no WhatsApp",
  frete: "Avisos do frete ao cliente",
  remarketing: "Remarketing e pós-venda",
  geral: "Outras",
};

export const GATILHOS: Record<string, { rotulo: string; descricao: string; campos: Campo[] }> = {
  "whatsapp.mensagem": {
    rotulo: "Cliente mandou mensagem no WhatsApp",
    descricao: "Quando a mensagem tiver alguma das palavras",
    campos: [{ k: "palavras", rotulo: "Palavras ou frases (uma por linha)", tipo: "palavras", ajuda: "Sem diferença de maiúscula ou acento. Vazio = qualquer mensagem." }],
  },
  "crm.lead_criado": { rotulo: "Lead novo no funil", descricao: "Quando um lead ou negociação é criado (manual ou pelo CPF/CNPJ no WhatsApp)", campos: [] },
  "crm.etapa": {
    rotulo: "Negociação entrou numa etapa",
    descricao: "Quando a negociação é movida para a etapa",
    campos: [{ k: "etapa", rotulo: "Etapa", tipo: "etapa" }],
  },
  "crm.parado": {
    rotulo: "Negociação parada",
    descricao: "Quando a negociação fica sem nenhuma atualização por",
    campos: [{ k: "dias", rotulo: "Dias parada", tipo: "numero", padrao: 5 }, { k: "etapa", rotulo: "Só nesta etapa (opcional)", tipo: "etapa" }],
  },
  "pedido.pago": {
    rotulo: "Pedido pago na loja virtual",
    descricao: "Quando um pedido da Shopify é pago",
    campos: [{ k: "loja", rotulo: "Loja", tipo: "loja" }],
  },
  "carrinho.abandonado": {
    rotulo: "Carrinho abandonado",
    descricao: "Quando o cliente começa a compra e não finaliza em",
    campos: [{ k: "horas", rotulo: "Horas sem finalizar", tipo: "numero", padrao: 2 }, { k: "loja", rotulo: "Loja", tipo: "loja" }],
  },
  "cliente.inativo": {
    rotulo: "Cliente sem comprar",
    descricao: "Quando um cliente completa X dias desde a última compra",
    campos: [{ k: "dias", rotulo: "Dias sem comprar", tipo: "numero", padrao: 90 }],
  },
  "entrega.status": {
    rotulo: "Andamento da entrega",
    descricao: "Quando o frete do app de entregadores muda para",
    campos: [{ k: "status", rotulo: "Situação", tipo: "select", opcoes: [
      { v: "aceito", r: "Entregador confirmado" }, { v: "coletado", r: "Saiu para entrega" }, { v: "entregue", r: "Entregue" }] }],
  },
};

export const PASSOS: Record<string, { rotulo: string; campos: Campo[]; cor: string }> = {
  esperar: { rotulo: "Esperar", cor: "#6B7280", campos: [
    { k: "dias", rotulo: "Dias", tipo: "numero", padrao: 0 }, { k: "horas", rotulo: "Horas", tipo: "numero", padrao: 0 }, { k: "minutos", rotulo: "Minutos", tipo: "numero", padrao: 0 }] },
  whatsapp: { rotulo: "Mandar WhatsApp", cor: "#1E8A44", campos: [
    { k: "texto", rotulo: "Mensagem", tipo: "textarea" },
    { k: "aprovacao", rotulo: "Vendedor aprova antes de enviar", tipo: "bool", padrao: false }] },
  email: { rotulo: "Mandar e-mail", cor: "#2563EB", campos: [
    { k: "assunto", rotulo: "Assunto", tipo: "texto" }, { k: "titulo", rotulo: "Título", tipo: "texto" }, { k: "texto", rotulo: "Texto", tipo: "textarea" },
    { k: "botaoTexto", rotulo: "Texto do botão (opcional)", tipo: "texto" }, { k: "botaoUrl", rotulo: "Link do botão (opcional)", tipo: "texto" }] },
  orcamento: { rotulo: "Preparar orçamento para o vendedor aprovar", cor: "#E87722", campos: [
    { k: "instrucao", rotulo: "Orientação para a IA montar a resposta", tipo: "textarea", padrao: "Monte uma resposta de orçamento com os produtos e preços que o cliente pediu. Se faltar quantidade ou CEP, pergunte." }] },
  enviar_manual: { rotulo: "Responder com o manual do produto", cor: "#7C3AED", campos: [
    { k: "pdf", rotulo: "Mandar o PDF do manual junto", tipo: "bool", padrao: true }] },
  pesquisa_nps: { rotulo: "Enviar pesquisa de satisfação (NPS 0 a 10)", cor: "#1E8A44", campos: [] },
  responder_ia: { rotulo: "Responder com a IA (produtos, estoque, pedidos e manuais)", cor: "#7C3AED", campos: [] },
  criar_lead: { rotulo: "Criar lead no funil (se não existir)", cor: "#E87722", campos: [{ k: "titulo", rotulo: "Nome da negociação (opcional)", tipo: "texto" }] },
  tarefa: { rotulo: "Criar tarefa para o vendedor", cor: "#E87722", campos: [
    { k: "tipo", rotulo: "Tipo", tipo: "select", opcoes: [{ v: "whatsapp", r: "WhatsApp" }, { v: "ligacao", r: "Ligação" }, { v: "email", r: "E-mail" }, { v: "tarefa", r: "Tarefa" }] },
    { k: "descricao", rotulo: "Descrição", tipo: "texto" }, { k: "prazoHoras", rotulo: "Prazo (horas)", tipo: "numero", padrao: 2 }] },
  mover_etapa: { rotulo: "Mover negociação de etapa", cor: "#E87722", campos: [{ k: "etapa", rotulo: "Etapa", tipo: "etapa" }] },
  marcar_perdida: { rotulo: "Marcar negociação como perdida", cor: "#A0261C", campos: [{ k: "motivo", rotulo: "Motivo", tipo: "texto", padrao: "Sem resposta" }] },
  tag: { rotulo: "Colocar etiqueta no contato", cor: "#2563EB", campos: [{ k: "tag", rotulo: "Etiqueta", tipo: "texto" }] },
  parar_se_respondeu: { rotulo: "Parar se o cliente respondeu", cor: "#374151", campos: [] },
  parar_se_fechou: { rotulo: "Parar se a negociação foi fechada ou mudou de etapa", cor: "#374151", campos: [] },
  parar_se_comprou: { rotulo: "Parar se o cliente comprou", cor: "#374151", campos: [] },
};

export const VARIAVEIS: { v: string; r: string }[] = [
  { v: "{{primeiro_nome}}", r: "Primeiro nome" }, { v: "{{nome}}", r: "Nome completo" }, { v: "{{loja}}", r: "Nome da loja" },
  { v: "{{site}}", r: "Site da loja" }, { v: "{{pedido}}", r: "Número do pedido" }, { v: "{{valor}}", r: "Valor" },
  { v: "{{link_carrinho}}", r: "Link do carrinho" }, { v: "{{destino}}", r: "Cidade da entrega" }, { v: "{{entregador}}", r: "Nome do entregador" },
  { v: "{{link_comprovante}}", r: "Foto do canhoto" }, { v: "{{etapa}}", r: "Etapa do funil" },
];

export type Passo = { id: string; tipo: string; config: Record<string, unknown> };
export type Modelo = { chave: string; nome: string; grupo: string; descricao: string; gatilho: string; gatilhoConfig: Record<string, unknown>; passos: Omit<Passo, "id">[] };

const p = (tipo: string, config: Record<string, unknown> = {}) => ({ tipo, config });

export const MODELOS: Modelo[] = [
  // ── Follow-up ──
  {
    chave: "followup_orcamento", grupo: "followup", nome: "Orçamento sem resposta",
    descricao: "Depois do orçamento: lembra o cliente em 2 dias, cria tarefa de ligação, tenta de novo e marca como perdido se ele sumir.",
    gatilho: "crm.etapa", gatilhoConfig: { etapa: "Orçamento enviado" },
    passos: [
      p("esperar", { dias: 2 }), p("parar_se_respondeu"), p("parar_se_fechou"),
      p("whatsapp", { texto: "Oi, {{primeiro_nome}}! Tudo bem? Conseguiu ver o orçamento que te mandamos? Se quiser, ajusto quantidade ou prazo pra você. 😉" }),
      p("tarefa", { tipo: "ligacao", descricao: "Ligar: orçamento sem resposta há 2 dias", prazoHoras: 24 }),
      p("esperar", { dias: 3 }), p("parar_se_respondeu"), p("parar_se_fechou"),
      p("whatsapp", { texto: "{{primeiro_nome}}, vou deixar seu orçamento separado mais alguns dias. Qualquer dúvida é só me chamar aqui!" }),
      p("esperar", { dias: 3 }), p("parar_se_respondeu"), p("parar_se_fechou"),
      p("marcar_perdida", { motivo: "Sem resposta" }),
    ],
  },
  {
    chave: "followup_lead_novo", grupo: "followup", nome: "Lead novo: responder rápido",
    descricao: "Cria a tarefa de contato para o vendedor assim que o lead entra, com prazo de 1 hora.",
    gatilho: "crm.lead_criado", gatilhoConfig: {},
    passos: [p("tarefa", { tipo: "whatsapp", descricao: "Fazer o primeiro contato com o lead", prazoHoras: 1 })],
  },
  {
    chave: "followup_parado", grupo: "followup", nome: "Negociação parada",
    descricao: "Se a negociação ficar 5 dias sem movimento, cria tarefa para o vendedor retomar.",
    gatilho: "crm.parado", gatilhoConfig: { dias: 5 },
    passos: [p("tarefa", { tipo: "whatsapp", descricao: "Negociação parada há 5 dias: retomar contato", prazoHoras: 4 })],
  },
  // ── Dúvidas e produtos ──
  {
    chave: "duvida_aplicacao", grupo: "duvidas", nome: "Como aplicar / rendimento",
    descricao: "Cliente pergunta como aplicar, rendimento ou secagem: responde com o trecho do manual e manda o PDF.",
    gatilho: "whatsapp.mensagem", gatilhoConfig: { palavras: ["como aplicar", "aplicação", "aplicacao", "rendimento", "rende quanto", "secagem", "tempo de cura", "como usar", "modo de uso"] },
    passos: [p("enviar_manual", { pdf: true })],
  },
  {
    chave: "duvida_orcamento", grupo: "duvidas", nome: "Pedido de preço / orçamento",
    descricao: "Cliente pergunta preço ou pede orçamento: cria o lead, a IA monta a resposta e o vendedor aprova antes de enviar.",
    gatilho: "whatsapp.mensagem", gatilhoConfig: { palavras: ["orçamento", "orcamento", "preço", "preco", "quanto custa", "qual o valor", "valor do", "valor da"] },
    passos: [p("criar_lead"), p("orcamento", { instrucao: "Monte uma resposta de orçamento com os produtos e preços que o cliente pediu. Se faltar quantidade ou CEP de entrega, pergunte." }), p("mover_etapa", { etapa: "Contato feito" })],
  },
  {
    chave: "duvida_frete", grupo: "duvidas", nome: "Pergunta de frete / entrega",
    descricao: "Cliente pergunta do frete: pede o CEP e a quantidade e cria o lead para o vendedor cotar.",
    gatilho: "whatsapp.mensagem", gatilhoConfig: { palavras: ["frete", "entrega", "entregam", "envia para", "mandam para", "cep"] },
    passos: [
      p("whatsapp", { texto: "Entregamos sim! 🚚 Me passa o *CEP de entrega* e a *quantidade* que você precisa que eu já calculo o frete pra você." }),
      p("criar_lead"), p("tarefa", { tipo: "whatsapp", descricao: "Cotar frete (cliente perguntou no WhatsApp)", prazoHoras: 1 }),
    ],
  },
  {
    chave: "duvida_estoque", grupo: "duvidas", nome: "Tem em estoque?",
    descricao: "Cliente pergunta se tem o produto: a IA responde com o estoque atual.",
    gatilho: "whatsapp.mensagem", gatilhoConfig: { palavras: ["tem em estoque", "estoque", "pronta entrega", "tem disponível", "tem disponivel"] },
    passos: [p("responder_ia")],
  },
  // ── Frete ──
  {
    chave: "frete_confirmado", grupo: "frete", nome: "Entrega confirmada",
    descricao: "Avisa o cliente quando um entregador pega o frete.",
    gatilho: "entrega.status", gatilhoConfig: { status: "aceito" },
    passos: [p("whatsapp", { texto: "Oi, {{primeiro_nome}}! Seu pedido para {{destino}} já tem entregador confirmado: {{entregador}}. Avisamos quando sair. 📦" })],
  },
  {
    chave: "frete_saiu", grupo: "frete", nome: "Saiu para entrega",
    descricao: "Avisa o cliente quando a carga é coletada.",
    gatilho: "entrega.status", gatilhoConfig: { status: "coletado" },
    passos: [p("whatsapp", { texto: "{{primeiro_nome}}, seu pedido saiu para entrega! 🚚 O entregador {{entregador}} está a caminho de {{destino}}." })],
  },
  {
    chave: "frete_entregue", grupo: "frete", nome: "Entregue com comprovante",
    descricao: "Avisa que foi entregue com o link da foto do canhoto e, 3 dias depois, pede avaliação.",
    gatilho: "entrega.status", gatilhoConfig: { status: "entregue" },
    passos: [
      p("whatsapp", { texto: "Entregue! ✅ Seu pedido chegou em {{destino}}. Comprovante: {{link_comprovante}}\nObrigado pela confiança, {{primeiro_nome}}!" }),
      p("esperar", { dias: 3 }),
      p("whatsapp", { texto: "{{primeiro_nome}}, deu tudo certo com o material? Se puder, conta pra gente como foi — sua opinião ajuda muito! ⭐" }),
    ],
  },
  {
    chave: "frete_nps", grupo: "frete", nome: "Pesquisa de satisfação após a entrega",
    descricao: "1 dia depois da entrega, pergunta de 0 a 10 quanto o cliente recomendaria a empresa (NPS).",
    gatilho: "entrega.status", gatilhoConfig: { status: "entregue" },
    passos: [p("esperar", { dias: 1 }), p("pesquisa_nps")],
  },
  // ── Remarketing e pós-venda ──
  {
    chave: "rmkt_carrinho", grupo: "remarketing", nome: "Carrinho abandonado no WhatsApp",
    descricao: "2 horas depois do carrinho abandonado, chama no WhatsApp com o link; tenta de novo no dia seguinte. (O e-mail continua no E-mail marketing.)",
    gatilho: "carrinho.abandonado", gatilhoConfig: { horas: 2 },
    passos: [
      p("whatsapp", { texto: "Oi, {{primeiro_nome}}! Vi que você separou alguns itens na {{loja}} e não finalizou. Ficou alguma dúvida de frete ou prazo? Seu carrinho: {{link_carrinho}}" }),
      p("esperar", { dias: 1 }), p("parar_se_comprou"), p("parar_se_respondeu"),
      p("whatsapp", { texto: "{{primeiro_nome}}, seu carrinho ainda está salvo: {{link_carrinho}}\nSe preferir, fecho o pedido por aqui com você. 😉" }),
    ],
  },
  {
    chave: "rmkt_poscompra", grupo: "remarketing", nome: "Pós-compra",
    descricao: "Agradece a compra e, 10 dias depois, pergunta como foi e oferece ajuda na aplicação.",
    gatilho: "pedido.pago", gatilhoConfig: {},
    passos: [
      p("whatsapp", { texto: "Obrigado pela compra, {{primeiro_nome}}! Pedido {{pedido}} confirmado. Qualquer dúvida sobre a aplicação, é só chamar aqui. 🙌" }),
      p("esperar", { dias: 10 }),
      p("whatsapp", { texto: "{{primeiro_nome}}, como ficou o serviço? Se precisar de mais material ou de alguma dica de aplicação, estou por aqui." }),
      p("tag", { tag: "pos-venda-feito" }),
    ],
  },
  {
    chave: "rmkt_inativo", grupo: "remarketing", nome: "Cliente sumido (90 dias)",
    descricao: "Cliente completou 90 dias sem comprar: manda WhatsApp e e-mail e marca para o público de anúncios.",
    gatilho: "cliente.inativo", gatilhoConfig: { dias: 90 },
    passos: [
      p("tag", { tag: "inativo-90d" }),
      p("whatsapp", { texto: "Oi, {{primeiro_nome}}! Faz um tempo que não te vemos por aqui. Tem obra nova vindo? Me chama que eu te ajudo com o material e o frete. 🚧" }),
      p("email", { assunto: "{{primeiro_nome}}, sentimos sua falta", titulo: "Tem obra nova vindo?", texto: "Faz um tempo desde a sua última compra na {{loja}}.\n\nSe precisar de material ou quiser uma cotação de frete, é só responder este e-mail ou chamar no WhatsApp.", botaoTexto: "Ver produtos", botaoUrl: "{{site}}" }),
    ],
  },
];

export function novoId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Resumo de um passo em uma linha (lista de regras e caixinhas do fluxo). */
export function resumoPasso(s: { tipo: string; config: Record<string, unknown> }) {
  const c = s.config ?? {};
  switch (s.tipo) {
    case "esperar": {
      const partes = [c.dias ? `${c.dias} dia(s)` : "", c.horas ? `${c.horas} h` : "", c.minutos ? `${c.minutos} min` : ""].filter(Boolean);
      return `Esperar ${partes.join(" e ") || "0 min"}`;
    }
    case "whatsapp": return `WhatsApp${c.aprovacao ? " (com aprovação)" : ""}: "${String(c.texto ?? "").slice(0, 60)}${String(c.texto ?? "").length > 60 ? "…" : ""}"`;
    case "email": return `E-mail: ${c.assunto ?? ""}`;
    case "tarefa": return `Tarefa: ${c.descricao ?? ""}`;
    case "mover_etapa": return `Mover para "${c.etapa ?? ""}"`;
    case "marcar_perdida": return `Marcar perdida: ${c.motivo ?? ""}`;
    case "tag": return `Etiqueta "${c.tag ?? ""}"`;
    default: return PASSOS[s.tipo]?.rotulo ?? s.tipo;
  }
}

export function resumoGatilho(g: string, cfg: Record<string, unknown>) {
  const d = GATILHOS[g];
  if (!d) return g;
  switch (g) {
    case "whatsapp.mensagem": { const ps = (cfg.palavras as string[] | undefined) ?? []; return ps.length ? `Mensagem com "${ps.slice(0, 3).join('", "')}"${ps.length > 3 ? "…" : ""}` : "Qualquer mensagem no WhatsApp"; }
    case "crm.etapa": return `Negociação entrou em "${cfg.etapa ?? "?"}"`;
    case "crm.parado": return `Negociação parada há ${cfg.dias ?? 5} dias${cfg.etapa ? ` em "${cfg.etapa}"` : ""}`;
    case "carrinho.abandonado": return `Carrinho abandonado há ${cfg.horas ?? 2} h`;
    case "cliente.inativo": return `${cfg.dias ?? 90} dias sem comprar`;
    case "entrega.status": return `Entrega: ${GATILHOS[g].campos[0].opcoes?.find((o) => o.v === cfg.status)?.r ?? cfg.status}`;
    default: return d.rotulo;
  }
}
