#!/usr/bin/env bash
# Instala o Hub Asfalto Multi em containers Docker, na mesma VPS do ZapPro, sem mexer nele.
# Uso (como root, dentro da pasta do projeto):  sudo bash instalar-vps.sh
set -euo pipefail

cd "$(dirname "$0")"
verde() { printf "\033[1;32m%s\033[0m\n" "$1"; }
erro()  { printf "\033[1;31m%s\033[0m\n" "$1"; exit 1; }

[ "$(id -u)" -eq 0 ] || erro "Rode como root: sudo bash instalar-vps.sh"

# 1. Docker (o instalador do ZapPro normalmente já instalou)
if ! command -v docker >/dev/null; then
  verde "Instalando Docker..."
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || apt-get install -y docker-compose-plugin

# 2. Dados da instalação
if [ ! -f .env ]; then
  read -rp "Domínio do hub (ex.: hub.asfaltomulti.com.br): " DOMINIO
  read -rp "E-mail do administrador: " ADMIN_EMAIL
  read -rsp "Senha do administrador (mín. 8 caracteres): " ADMIN_PASSWORD; echo
  [ ${#ADMIN_PASSWORD} -ge 8 ] || erro "Senha muito curta."
  read -rp "Porta interna do hub [3500]: " HUB_PORT; HUB_PORT=${HUB_PORT:-3500}

  if ss -ltn | grep -q ":${HUB_PORT} "; then erro "A porta ${HUB_PORT} já está em uso. Rode de novo e escolha outra."; fi

  PGPASS=$(openssl rand -hex 24)
  cat > .env <<EOF
POSTGRES_PASSWORD="${PGPASS}"
APP_URL="https://${DOMINIO}"
SESSION_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
ENCRYPTION_KEY="$(openssl rand -base64 32)"
HUB_PORT="${HUB_PORT}"
HUB_DOMAIN="${DOMINIO}"
ADMIN_NAME="Administrador"
ADMIN_EMAIL="${ADMIN_EMAIL}"
ADMIN_PASSWORD="${ADMIN_PASSWORD}"
EOF
  chmod 600 .env
  verde ".env criado com segredos novos."
fi
set -a; . ./.env; set +a

# 3. Containers: banco, tabelas, primeiro admin e o hub
verde "Construindo e subindo os containers (pode levar alguns minutos)..."
docker compose -p hub-asfalto up -d --build db
docker compose -p hub-asfalto --profile tools run --rm migrate
docker compose -p hub-asfalto up -d --build app

# remove a senha do admin do .env depois de criado
sed -i 's/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=""/' .env

# 4. Nginx + HTTPS (usa o Nginx/Certbot que o ZapPro já instalou)
if command -v nginx >/dev/null; then
  cat > /etc/nginx/sites-available/hub-asfalto <<EOF
server {
  server_name ${HUB_DOMAIN};
  client_max_body_size 30M;
  location / {
    proxy_pass http://127.0.0.1:${HUB_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
EOF
  ln -sf /etc/nginx/sites-available/hub-asfalto /etc/nginx/sites-enabled/hub-asfalto
  nginx -t && systemctl reload nginx
  if command -v certbot >/dev/null; then
    certbot --nginx -d "${HUB_DOMAIN}" --non-interactive --agree-tos -m "${ADMIN_EMAIL}" --redirect \
      || echo "Certbot falhou. Confira se o domínio já aponta para o IP desta VPS e rode: certbot --nginx -d ${HUB_DOMAIN}"
  fi
else
  echo "Nginx não encontrado. Aponte um proxy com HTTPS para 127.0.0.1:${HUB_PORT}."
fi

verde "Pronto! Acesse https://${HUB_DOMAIN} e entre com ${ADMIN_EMAIL}."
echo "IMPORTANTE: faça uma cópia do arquivo .env em local seguro (a ENCRYPTION_KEY protege as credenciais das integrações)."
