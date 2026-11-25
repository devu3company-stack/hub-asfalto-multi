import type { EmailConteudo } from "./template";

/** Modelos prontos. O texto é um ponto de partida: o time ajusta na tela de Automações/Campanhas. */

export type Passo = { esperaHoras: number; assunto: string; conteudo: EmailConteudo };
export type AutomacaoConfig = { passos: Passo[]; diasSemCompra?: number; intervaloDias?: number };
export type AutomacaoChave = "carrinho" | "poscompra" | "reativacao";

export const AUTOMACOES: Record<AutomacaoChave, { nome: string; descricao: string; padrao: AutomacaoConfig }> = {
  carrinho: {
    nome: "Carrinho abandonado",
    descricao: "Para quem começou a compra na loja e não finalizou. Para sozinho se a pessoa comprar.",
    padrao: {
      passos: [
        {
          esperaHoras: 2,
          assunto: "{{primeiro_nome}}, seu pedido ficou para trás",
          conteudo: {
            preheader: "Os itens continuam reservados no seu carrinho.",
            titulo: "Esqueceu alguma coisa?",
            texto: "Oi, {{primeiro_nome}}! Vimos que você separou produtos na nossa loja, mas não chegou a finalizar o pedido.\n\nSeus itens continuam no carrinho. É só clicar no botão para concluir a compra em poucos segundos.\n\nSe ficou alguma dúvida sobre aplicação, rendimento ou frete, responda este e-mail ou chame a gente no WhatsApp.",
            botaoTexto: "Finalizar meu pedido",
            botaoUrl: "{{link_carrinho}}",
          },
        },
        {
          esperaHoras: 24,
          assunto: "Ainda dá tempo de garantir seu asfalto frio",
          conteudo: {
            preheader: "Pronto para aplicar, sem máquina e sem espera.",
            titulo: "Seu carrinho ainda está esperando",
            texto: "{{primeiro_nome}}, o asfalto frio da {{loja}} é pronto para usar: abre a embalagem, aplica, compacta e já libera o tráfego.\n\n**Enviamos para todo o Brasil**, e o frete aparece na finalização do pedido.\n\nSeu carrinho continua salvo.",
            botaoTexto: "Voltar ao carrinho",
            botaoUrl: "{{link_carrinho}}",
          },
        },
      ],
    },
  },
  poscompra: {
    nome: "Pós-compra",
    descricao: "Sequência para quem comprou: agradecimento, dicas de aplicação e avaliação/recompra.",
    padrao: {
      passos: [
        {
          esperaHoras: 0,
          assunto: "Obrigado pela compra, {{primeiro_nome}}!",
          conteudo: {
            preheader: "Seu pedido {{pedido}} foi recebido.",
            titulo: "Pedido recebido!",
            texto: "Oi, {{primeiro_nome}}! Obrigado por comprar com a {{loja}}.\n\nSeu pedido **{{pedido}}** foi recebido e já está sendo preparado. Você vai receber as informações de envio assim que ele for despachado.\n\nQualquer dúvida, é só responder este e-mail.",
          },
        },
        {
          esperaHoras: 72,
          assunto: "Como aplicar o asfalto frio do jeito certo",
          conteudo: {
            preheader: "4 passos para um reparo que dura.",
            titulo: "Dicas para a aplicação",
            texto: "{{primeiro_nome}}, para o reparo durar mais:\n\n**1. Limpe o buraco:** tire pedras soltas, pó e água parada.\n\n**2. Aplique em camadas:** preencha deixando o material um pouco acima do nível do piso.\n\n**3. Compacte bem:** use soquete, placa vibratória ou até a roda de um carro.\n\n**4. Libere o tráfego:** pode liberar logo em seguida.\n\nPrecisa de ajuda? Fale com a gente no WhatsApp.",
            botaoTexto: "Ver mais dicas",
            botaoUrl: "{{site}}",
          },
        },
        {
          esperaHoras: 24 * 15,
          assunto: "Como ficou o reparo, {{primeiro_nome}}?",
          conteudo: {
            preheader: "Sua opinião ajuda outros clientes.",
            titulo: "Conta pra gente como foi",
            texto: "Oi, {{primeiro_nome}}! Já faz alguns dias que seu pedido chegou. Como ficou o resultado?\n\nSe puder, deixe sua avaliação. Ajuda muito quem está pesquisando.\n\nE quando precisar de mais material, é só pedir pela loja ou pelo WhatsApp.",
            botaoTexto: "Comprar novamente",
            botaoUrl: "{{site}}",
          },
        },
      ],
    },
  },
  reativacao: {
    nome: "Reativação",
    descricao: "Para clientes que não compram há um tempo (compras pela Shopify ou pelo Omie desta loja).",
    padrao: {
      diasSemCompra: 120,
      intervaloDias: 90,
      passos: [
        {
          esperaHoras: 0,
          assunto: "{{primeiro_nome}}, tem buraco novo aparecendo por aí?",
          conteudo: {
            preheader: "Asfalto frio pronto para usar, com envio para todo o Brasil.",
            titulo: "Faz tempo que a gente não se fala",
            texto: "Oi, {{primeiro_nome}}! Faz um tempo desde a sua última compra com a {{loja}}.\n\nSe apareceu buraco novo no pátio, na rua ou na garagem, o asfalto frio resolve rápido: aplica, compacta e libera.\n\nFale com a gente para uma cotação com frete para sua cidade.",
            botaoTexto: "Ver produtos",
            botaoUrl: "{{site}}",
          },
        },
      ],
    },
  },
};

export const MODELO_CAMPANHA: EmailConteudo = {
  preheader: "",
  titulo: "Título da campanha",
  texto: "Oi, {{primeiro_nome}}!\n\nEscreva aqui a mensagem. Separe os parágrafos com uma linha em branco e use **negrito** para destacar.\n\nUm abraço,\nEquipe {{loja}}",
  botaoTexto: "Ver produtos",
  botaoUrl: "{{site}}",
};
