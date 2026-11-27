# Hub Asfalto Multi — contexto do projeto

Leia este arquivo antes de mexer no código. Ele resume o que já foi feito, como o sistema está montado e o que ainda falta.
Responda sempre em **português do Brasil**.

## O que é
Hub interno da Asfalto Multi (cliente da U3 Company / Jesimiel). Atende **duas lojas: Asfalto Multi e LojaDoAsfalto**.
Junta ERP Omie, Shopify, WhatsApp, CRM, fretes, entregas, e-mail marketing, automações e disparos num só sistema.

- Produção: https://hub.u3company.com
- VPS Hostinger: `2.25.121.252` (srv2121935.hstgr.cloud, Ubuntu). **O plano vence em 2026-12-02: renovar.**
- Repositório: github.com/devu3company-stack/hub-asfalto-multi (branch principal)

## Stack
- Next.js 14 (App Router, `output: standalone`), Server Actions com `useFormState`, Tailwind
- Drizzle ORM + postgres-js; migrações em `drizzle/` (0000–0014), rodadas por `scripts/migrate.ts`
- Gateway do WhatsApp em `whatsapp-gateway/index.mjs` (Baileys 6.7.x), container separado
- Docker Compose: `docker-compose.yml` + `docker-compose.caddy.yml` (Caddy faz o HTTPS). Projeto compose: `hub-asfalto`
- `src/instrumentation.ts` liga dois workers: e-mail + automações (a cada 60 s) e disparos (a cada 5 s)
- O Dockerfile instala ffmpeg (conversão de áudio). O `next.config.mjs` tem `serverActions.bodySizeLimit = 20mb` e
  `outputFileTracingIncludes: ./node_modules/*/require.mjs`. **Não remova esse include**, senão o exceljs quebra no standalone.

## Como publicar (deploy)
Pelo terminal da VPS (hPanel → VPS → Gerenciar → Console web, ou SSH):
```bash
# app + migrações (roda em segundo plano e grava o log)
setsid nohup /root/atualizar-hub.sh > /root/hub-update.out 2>&1 < /dev/null &
tail -f /root/hub-update.out        # termina com FIM-0 quando deu certo

# só quando mexer no gateway do WhatsApp:
cd /root/hub-asfalto-multi && docker compose -p hub-asfalto -f docker-compose.yml -f docker-compose.caddy.yml up -d --build whatsapp
```
O `.env` fica **só na VPS**: nunca commitar segredos. As variáveis estão em `.env.example`.

Para checar antes de subir: `npx tsc --noEmit -p .` e `npx next lint --dir src`.

## Perfis e módulos
- Perfis (`src/lib/permissions.ts`): ADMIN, FINANCEIRO, COMERCIAL, ATENDIMENTO, LOGISTICA, MARKETING.
- Módulos: painel, crm, pedidos, estoque, relatorios, financeiro, fretes, entregas, automacoes, disparos, email, manuais, whatsapp, integracoes, usuarios.
- Para checar acesso: `requireModule(modulo, "view" | "edit")` e `can(role, modulo, nivel)`.
- Integrações e tabelas de transportadora exigem `integracoes: edit`, ou seja, só o admin.

## O que já existe (por área)

### CRM (`src/lib/crm.ts`, `src/app/(app)/crm`)
- Kanban no estilo RD Station: funis, etapas, motivos de perda, tarefas e histórico.
- Lead manual rápido, para contatos por telefone, WhatsApp ou na loja.
- Lead automático quando o cliente manda CPF/CNPJ válido no WhatsApp (`leadDoWhatsApp`).
  - Cada conversa é processada em fila, para não duplicar o lead.
  - Pode ser ligado e desligado em CRM → config.
- Busca por nome, telefone ou documento (busca por dígitos a partir de 3).

### WhatsApp (`src/lib/whatsapp/*`, `src/app/(app)/whatsapp`)
- **Uma conexão por usuário** (tabela `wa_conexoes`).
  - ids: `principal`, `u_<userId>` (QR), `of_<phoneNumberId>` (API oficial).
  - Cada usuário vê as suas conexões; o admin vê todas e configura a de qualquer usuário em `/whatsapp/conectar?u=<id>`.
- `conexaoPara()` decide por qual número enviar: o que foi pedido → o do usuário → o da última conversa → o padrão (setting `whatsapp.conexaoPadrao`).
- As conversas têm chave composta `(conexao_id, chat)`.
- QR (Baileys):
  - Várias sessões: `/s/:id/{status,start,send,check,contato,logout}`, `GET /sessoes`, `MAX_SESSOES=15`.
  - A sessão `principal` fica em `/data/auth`; as demais em `/data/sessoes/<id>` (volume `wa_sessoes`).
- Contatos `@lid`:
  - Viram o número real (`senderPn` ou mapa de contatos).
  - O nome segue esta ordem: agenda > pushName > notify > verifiedName.
  - Conversas duplicadas (lid + número) são juntadas (`juntarLid`).
- API oficial (Cloud API):
  - O app da Meta fica em Integrações (`whatsapp_oficial`).
  - Pode haver vários números, cada um com dono e token próprio opcional.
  - O webhook `/api/webhooks/whatsapp-oficial` roteia pelo `phone_number_id` e ignora o número de teste da Meta (123456123).
  - Ele grava o "último aviso recebido" e **repassa** o corpo original, com `X-Hub-Signature-256`, para as URLs do setting `whatsapp.oficial.repassar`. Isso serve porque o número também é usado em outro CRM.
- Recursos:
  - Fotos, arquivos, vídeo e áudio gravado (ffmpeg em `midia.ts`).
  - Tela cheia, com as configurações em `/whatsapp/config`.
  - IA por número (`iaLigada`) e IA pausada por conversa.
- Atendimento (`atendimento.ts`):
  - Mensagem fora do expediente.
  - Finalizar conversa com pesquisa NPS de 0 a 10 (NPS = promotores 9–10 menos detratores 0–6).
  - Transferir conversa: troca o responsável no CRM, cria tarefa e quem transferiu continua vendo a conversa, só leitura.
- Ordem do `handleIncoming` (service.ts):
  1. reabrirSePreciso
  2. tratarRespostaNps
  3. leadDoWhatsApp
  4. SAIR (opt-out)
  5. fora do expediente
  6. se a IA estiver desligada, para aqui
  7. automações `whatsapp.mensagem`
  8. resposta da IA
- Testes antigos do WhatsApp já foram apagados da produção.

### Fretes (`src/lib/frete/*`, `src/app/(app)/fretes`)
- Motor próprio de cotação com as tabelas das transportadoras (sem Data Frete), mais o Melhor Envio opcional.
  - Peso taxado = maior entre peso real e peso cubado.
  - Depois entram faixas, excedente por kg, ad valorem, GRIS, pedágio, taxas, frete mínimo e ICMS por dentro.
- Histórico de fretes importado da planilha "Histórico de Preços Fretes.xlsm" (`historico.ts`).
  - "Avaliar frete" compara com fretes parecidos (quartis iguais ao QUARTILE.INC do Excel).
- **Cadastros de logística** (último commit): abas Transportadoras (`/fretes/transportadoras`), Entregadores (`/entregas/entregadores`) e Planilhas (`/fretes/planilhas`).
  - A aba Planilhas importa a tabela CSV de uma transportadora e o histórico .xlsx.
  - Componente das abas: `src/components/CadastrosTabs.tsx`.

### Entregas (`src/lib/entregas.ts`, `src/app/(app)/entregas`, app `src/app/entregador`)
- Entregadores externos cadastrados pela equipe. Eles entram com WhatsApp e senha de 6 números.
- Publicar frete:
  - Valor fixo; o primeiro que aceitar leva.
  - Aviso no WhatsApp para os entregadores com o veículo certo.
  - Descarga com ajudante (chapa), com valor somado ao custo.
- Fluxo do entregador no app: aceitar → coletei → entreguei, com foto do canhoto e localização.
  - O comprovante fica em `/comprovante/[t]`.
- A entrega concluída entra no histórico de fretes e dispara `entrega.status` nas automações.

### Automações (`src/lib/automacoes/*`, `src/app/(app)/automacoes`)
- Regras no formato Quando → Então, com modelos prontos (follow-up, dúvidas, avisos de entrega, remarketing, pós-venda, NPS pós-frete).
- Gatilhos:
  - WhatsApp: `whatsapp.mensagem`.
  - CRM: `crm.lead_criado`, `crm.etapa`, `crm.parado`.
  - Vendas: `pedido.pago`, `carrinho.abandonado`, `cliente.inativo`.
  - Entregas: `entrega.status`.
- Passos:
  - Envios: esperar, whatsapp, email, orcamento, enviar_manual, responder_ia, pesquisa_nps.
  - Ações no CRM: criar_lead, tarefa, mover_etapa, marcar_perdida, tag.
  - Paradas: parar_se_respondeu, parar_se_fechou, parar_se_comprou.
- Regras de envio:
  - Mensagens só das 8h às 20h.
  - Quem responde SAIR não recebe mais nada.
  - Gatilho por palavra-chave não repete antes de 12 h.
  - **Orçamento nunca vai direto**: entra na fila de aprovação do vendedor.
- Públicos de anúncio (Meta/Google) em `/automacoes/publicos`.

### Disparos em massa (`src/lib/disparos*.ts`, `src/app/(app)/disparos`) — perfil Marketing
- Variáveis (nome, empresa), versões de texto (spintax) e vários números se revezando.
- Proteção contra bloqueio:
  - Intervalo entre mensagens, lotes com pausa e limite por dia.
  - Janela de horário e checagem se o número tem WhatsApp.
  - Pausa sozinho depois de 3 falhas.
  - Ritmos prontos: seguro, moderado e rápido.
- Pula quem respondeu SAIR.
- Lembrar o cliente dos termos do WhatsApp e da LGPD (consentimento).

### Outros (fases anteriores)
- Pedidos Shopify → Omie e estoque.
- Manuais em PDF, consultados pela IA.
- E-mail marketing próprio por SMTP: campanhas, carrinho abandonado, pós-compra e reativação.
- Integrações (credenciais criptografadas com `ENCRYPTION_KEY`).

## Pendências e ideias em aberto
1. **Erro da Meta #10 ("Viewer cannot access the provided Paid Message Account")** ao enviar pela API oficial.
   - Provável causa: o número é cobrado pelo parceiro do outro CRM.
   - Conferir em Business Suite → Contas do WhatsApp → Parceiros.
   - Se o número for só dele: token de usuário do sistema com `whatsapp_business_messaging` e `whatsapp_business_management`, mais forma de pagamento no Gerenciador do WhatsApp.
2. Modelos de mensagem (templates) da API oficial, para disparos e conversas depois da janela de 24 h.
3. Construtor visual de fluxos para as automações (fase 2).
4. Comparar com o "Inteligência Bot" (o chatbot que usam hoje no número principal). Esperando prints do cliente.
5. Sistema de SEO (escopo não definido).
6. Orçamentos que chegam por WhatsApp e Gmail, com aprovação do vendedor antes de enviar.
7. Documento de como conectar cada integração.

## Regras de trabalho
- Nunca commitar `.env`, tokens ou senhas, nem repetir credenciais em respostas.
- Nunca copiar código do ZapPro (licença proprietária).
- Apagar dados de produção só com confirmação explícita do Jesimiel.
- Textos da interface em pt-BR simples e neutros em gênero ("a pessoa responsável", não "o Maria").
- Layout acessível: alvos de toque com pelo menos 44 px, `label` em todo campo, cores da marca (`brand`, laranja `#E87722`).
