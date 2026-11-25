# Hub Asfalto Multi

Sistema central da Asfalto Multi: integra Omie, Shopify, Google Ads (só relatórios) e WhatsApp (ZapPro). Funciona no navegador e pode ser instalado no celular como app (PWA).

## O que já está pronto (Fase 1)

- Login com e-mail e senha, sessão de 12 horas.
- Usuários e permissões: perfis Administrador, Financeiro, Comercial e Atendimento, com acesso por módulo (ver ou editar). A matriz fica em `src/lib/permissions.ts`.
- Registro de auditoria (quem fez o quê e quando), na tela de Usuários.
- Aba **Integrações**: você cola as chaves de cada API, o sistema salva **criptografado** (AES-256-GCM) e testa a conexão na hora.
- **Financeiro** lendo do Omie: contas a receber, a pagar, vencidos e diferença prevista.
- Webhooks protegidos para receber eventos do ZapPro e da Shopify.
- Layout com a marca: menu lateral no computador e barra inferior no celular.

Os módulos Pedidos, Estoque, Relatórios, Manuais e WhatsApp já aparecem no menu, com a descrição do que vem nas próximas fases.

## Instalar na VPS (Docker)

Requisitos: Ubuntu 22.04 ou 24.04, Docker e Docker Compose, e um subdomínio apontado para a VPS (ex.: `hub.asfaltomulti.com.br`).

```bash
# 1. Copie a pasta do projeto para a VPS e entre nela
cp .env.example .env

# 2. Preencha o .env. Gere os segredos com:
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 32   # ENCRYPTION_KEY
openssl rand -base64 24   # POSTGRES_PASSWORD

# 3. Suba o banco, crie as tabelas e o primeiro administrador
docker compose up -d db
docker compose run --rm migrate

# 4. Suba o hub
docker compose up -d app
```

O hub fica em `127.0.0.1:3000`. Coloque um proxy com HTTPS na frente (Caddy é o mais simples):

```
hub.asfaltomulti.com.br {
  reverse_proxy 127.0.0.1:3000
}
```

Depois de entrar, apague `ADMIN_PASSWORD` do `.env`.

> **Guarde a `ENCRYPTION_KEY`.** Sem ela não dá para ler as credenciais salvas; seria preciso cadastrar as integrações de novo.

## Conectar as integrações

Entre como administrador e abra **Integrações**.

| Integração | Onde pegar as credenciais |
| --- | --- |
| Omie | Omie › Configurações › Aplicativos › App Key e App Secret |
| Shopify | Admin › Configurações › Apps › Desenvolver apps › criar app › token da Admin API (permissões de leitura de pedidos, produtos e estoque) |
| Google Ads | Developer token na Central de API da conta MCC, mais Client ID/Secret e Refresh Token do Google Cloud. Só leitura. |
| ZapPro | URL do backend (`https://api.seudominio.com`) e o **token da conexão** (Conexões › editar). |

Para receber mensagens do WhatsApp, defina um segredo do webhook no ZapPro dentro do hub e cadastre a URL mostrada na tela num webhook do ZapPro.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local   # aponte DATABASE_URL para um Postgres local
npm run db:migrate && npm run db:seed
npm run dev
```

Mudou o banco em `src/db/schema.ts`? Rode `npm run db:generate` para criar a migração.

## Estrutura

```
src/app/(app)/        telas logadas (painel, financeiro, integracoes, usuarios...)
src/app/api/webhooks/ entrada de webhooks (zappro, shopify)
src/lib/integrations/ conectores de cada API + definição dos campos da aba Integrações
src/lib/permissions.ts perfis e permissões
src/db/schema.ts      tabelas do banco (Drizzle ORM)
```
