# Imagem base Linux Alpine com Node.js
FROM node:24-alpine

# Instala yt-dlp, ffmpeg e dependências
RUN apk add --no-cache \
    ffmpeg \
    python3 \
    py3-pip \
    ca-certificates \
    curl \
    bash \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

# Copia dependências e instala
COPY package*.json ./
RUN npm install --omit=dev

# Copia código-fonte
COPY . .

# Cria diretórios de persistência
RUN mkdir -p downloads/videos downloads/audios data

EXPOSE 3000

ENV PORT=3000 \
    HOST=0.0.0.0 \
    NODE_ENV=production

CMD ["node", "server.js"]
