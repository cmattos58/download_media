# ---- Estágio 1: gera o CSS do Tailwind (precisa das devDependencies) ----
FROM node:24-alpine AS assets
WORKDIR /app
COPY package*.json tailwind.config.js ./
RUN npm ci
COPY public ./public
RUN npm run build:css

# ---- Estágio 2: imagem final ----
FROM node:24-alpine

# yt-dlp pode ser fixado com --build-arg YTDLP_VERSION=2025.01.01 (padrão: latest)
ARG YTDLP_VERSION=latest

RUN apk add --no-cache \
    ffmpeg \
    python3 \
    ca-certificates \
    curl \
    bash \
    && if [ "$YTDLP_VERSION" = "latest" ]; then \
         URL=https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp; \
       else \
         URL=https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp; \
       fi \
    && curl -fL "$URL" -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
COPY --from=assets /app/public/css/tailwind.css ./public/css/tailwind.css

RUN mkdir -p downloads/videos downloads/audios data

EXPOSE 3000

ENV PORT=3000 \
    HOST=0.0.0.0 \
    NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fs http://localhost:${PORT}/api/health || exit 1

CMD ["node", "server.js"]
