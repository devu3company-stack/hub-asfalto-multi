FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apk add --no-cache ffmpeg && addgroup -S hub && adduser -S hub -G hub
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# migração e seed rodam com: docker compose run --rm migrate
COPY --from=deps /app/node_modules ./node_modules
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY src/db ./src/db
RUN mkdir -p /app/data/manuais /app/data/whatsapp && chown -R hub:hub /app/data
USER hub
EXPOSE 3000
CMD ["node", "server.js"]
