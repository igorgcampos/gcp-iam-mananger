# syntax=docker/dockerfile:1

# ---- Build stage: gera o bundle estático ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Embutido no bundle estático em tempo de build (o Vite só expõe vars
# com prefixo VITE_, e este é um project id público, não um segredo).
ARG VITE_GCP_PROJECT_ID
ENV VITE_GCP_PROJECT_ID=${VITE_GCP_PROJECT_ID}

RUN npm run build

# ---- Production stage: arquivos estáticos servidos por um nginx sem privilégios ----
# O nginx-unprivileged já roda como non-root e escuta na porta 8080 por padrão,
# o que já atende à exigência do Cloud Run de escutar em $PORT.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

# Explícito por clareza e defesa em profundidade: a imagem base já roda como
# non-root (UID 101, usuário "nginx") por padrão, mas declarar aqui documenta
# a intenção e protege caso a imagem base mude no futuro.
USER 101

# PORT: sobrescrita pelo Cloud Run em runtime; BACKEND_URL: definida por ambiente
# (nome do serviço no docker-compose localmente, URL do backend no Cloud Run em produção).
ENV PORT=8080 \
    BACKEND_URL=http://backend:3001

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["sh", "-c", "wget -qO- \"http://127.0.0.1:${PORT}/\" >/dev/null || exit 1"]

CMD ["nginx", "-g", "daemon off;"]
