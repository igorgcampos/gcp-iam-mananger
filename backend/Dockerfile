# syntax=docker/dockerfile:1

# ---- Build stage: instala apenas as dependências de produção ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- Production stage ----
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs src ./src

USER 1001:1001

# O Cloud Run injeta a variável PORT em runtime; 3001 é o padrão local da app (src/index.js)
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["sh", "-c", "node -e \"require('http').get('http://localhost:'+(process.env.PORT||3001)+'/api/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))\""]

CMD ["node", "src/index.js"]
