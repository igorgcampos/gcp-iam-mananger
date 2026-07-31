# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Baked into the static bundle at build time (Vite only exposes VITE_*
# vars, and this is a public project id, not a secret).
ARG VITE_GCP_PROJECT_ID
ENV VITE_GCP_PROJECT_ID=${VITE_GCP_PROJECT_ID}

RUN npm run build

# ---- Production stage: static files served by an unprivileged nginx ----
# nginx-unprivileged runs as non-root and listens on 8080 by default,
# which matches Cloud Run's requirement to listen on $PORT out of the box.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS production

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template

# PORT: overridden by Cloud Run at runtime; BACKEND_URL: set per-environment
# (docker-compose service name locally, backend Cloud Run URL in prod).
ENV PORT=8080 \
    BACKEND_URL=http://backend:3001

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["sh", "-c", "wget -qO- \"http://127.0.0.1:${PORT}/\" >/dev/null || exit 1"]

CMD ["nginx", "-g", "daemon off;"]
