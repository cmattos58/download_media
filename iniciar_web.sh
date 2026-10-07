#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================================="
echo "    Iniciando MediaFetch Web (Painel de Download)        "
echo "=========================================================="

# 1. Verificar Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "[ERRO] Node.js não encontrado. Por favor instale o Node.js v22 ou superior."
    exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if (( NODE_MAJOR < 22 )); then
    echo "[ERRO] Node.js v22 ou superior é necessário (encontrado: $(node --version))."
    exit 1
fi

# 2. Verificar dependências de sistema (yt-dlp e ffmpeg)
if ! command -v yt-dlp >/dev/null 2>&1; then
    echo "[AVISO] yt-dlp não encontrado no PATH. Os downloads podem falhar."
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
    echo "[AVISO] ffmpeg não encontrado no PATH. A conversão de áudio precisa do ffmpeg."
fi

# 3. Garantir instalação dos pacotes npm
if [[ ! -d "node_modules" ]]; then
    echo "[INFO] Instalando dependências npm..."
    npm install
fi

# 3b. Gerar o CSS local (Tailwind) quando disponível; senão usa o já gerado
if [[ -x "node_modules/.bin/tailwindcss" ]]; then
    npm run build:css >/dev/null 2>&1 || echo "[AVISO] Falha ao gerar o CSS; usando o arquivo existente."
fi
if [[ ! -f "public/css/tailwind.css" ]]; then
    echo "[ERRO] public/css/tailwind.css não existe. Rode: npm install && npm run build:css"
    exit 1
fi

# 4. Criar pastas necessárias
mkdir -p downloads/videos downloads/audios data

# 5. Iniciar o servidor
PORT="${PORT:-3001}"
export PORT

echo "[INFO] Iniciando servidor na porta $PORT..."
exec node server.js
