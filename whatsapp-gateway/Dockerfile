FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache git
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.mjs ./
RUN mkdir -p /data/auth /data/sessoes && chown -R node:node /data
USER node
ENV PORT=3100 AUTH_DIR=/data/auth
EXPOSE 3100
CMD ["node", "index.mjs"]
