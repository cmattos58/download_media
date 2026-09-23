#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-audio}"
URLS_FILE="${URLS_FILE:-videos.txt}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VIDEO_OUTPUT_DIR="${VIDEO_OUTPUT_DIR:-./downloads}"
VIDEO_FORMAT="${VIDEO_FORMAT:-bestvideo+bestaudio/best}"
VIDEO_MERGE_FORMAT="${VIDEO_MERGE_FORMAT:-mkv}"
VIDEO_LOG_FILE="${VIDEO_LOG_FILE:-downloads.log}"

AUDIO_OUTPUT_DIR="${AUDIO_OUTPUT_DIR:-./audios}"
AUDIO_FORMAT="${AUDIO_FORMAT:-mp3}"
AUDIO_QUALITY="${AUDIO_QUALITY:-192K}"
AUDIO_LOG_FILE="${AUDIO_LOG_FILE:-audios.log}"

OUTPUT_TEMPLATE="%(title).200B [%(id)s].%(ext)s"

usage() {
    cat <<'EOF'
Uso:
  ./download_media.sh audio
  ./download_media.sh video

Variaveis opcionais:
  URLS_FILE           Arquivo com URLs. Padrao: videos.txt
  VIDEO_OUTPUT_DIR    Pasta de saida para videos. Padrao: ./downloads
  VIDEO_LOG_FILE      Log de videos. Padrao: downloads.log
  AUDIO_OUTPUT_DIR    Pasta de saida para audios. Padrao: ./audios
  AUDIO_LOG_FILE      Log de audios. Padrao: audios.log
EOF
}

log() {
    local level="$1"
    local message="$2"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" | tee -a "$LOG_FILE"
}

check_dependency() {
    local dependency="$1"
    local install_hint="$2"

    if ! command -v "$dependency" >/dev/null 2>&1; then
        log "ERRO" "$dependency nao encontrado no PATH. Instale com: $install_hint"
        exit 1
    fi
}

trim() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s\n' "$value"
}

validate_mode() {
    case "$MODE" in
        audio|video) ;;
        -h|--help|help)
            usage
            exit 0
            ;;
        *)
            usage
            exit 1
            ;;
    esac
}

setup_mode() {
    case "$MODE" in
        audio)
            OUTPUT_DIR="$AUDIO_OUTPUT_DIR"
            LOG_FILE="$AUDIO_LOG_FILE"
            START_MESSAGE="Iniciando extracao de audio em $AUDIO_FORMAT a partir de $URLS_FILE"
            SUCCESS_LABEL="Audio salvo"
            FAILURE_LABEL="Erro ao extrair audio"
            ;;
        video)
            OUTPUT_DIR="$VIDEO_OUTPUT_DIR"
            LOG_FILE="$VIDEO_LOG_FILE"
            START_MESSAGE="Iniciando downloads de video a partir de $URLS_FILE"
            SUCCESS_LABEL="Download concluido"
            FAILURE_LABEL="Erro ao baixar"
            ;;
    esac
}

run_download() {
    local url="$1"

    case "$MODE" in
        audio)
            yt-dlp \
                -f "bestaudio/best" \
                --extract-audio \
                --audio-format "$AUDIO_FORMAT" \
                --audio-quality "$AUDIO_QUALITY" \
                --continue \
                --no-overwrites \
                --no-progress \
                -o "$OUTPUT_DIR/$OUTPUT_TEMPLATE" \
                "$url" >>"$LOG_FILE" 2>&1
            ;;
        video)
            yt-dlp \
                -f "$VIDEO_FORMAT" \
                --merge-output-format "$VIDEO_MERGE_FORMAT" \
                --continue \
                --no-overwrites \
                --no-progress \
                -o "$OUTPUT_DIR/$OUTPUT_TEMPLATE" \
                "$url" >>"$LOG_FILE" 2>&1
            ;;
    esac
}

validate_mode
setup_mode

check_dependency "yt-dlp" "sudo dnf install yt-dlp ou pip install yt-dlp"
if [[ "$MODE" == "audio" ]]; then
    check_dependency "ffmpeg" "sudo dnf install ffmpeg"
fi

if [[ ! -f "$URLS_FILE" ]]; then
    LOG_FILE="${LOG_FILE:-download_media.log}"
    log "ERRO" "Arquivo $URLS_FILE nao encontrado"
    exit 1
fi

mkdir -p "$OUTPUT_DIR"
touch "$LOG_FILE"

total=0
successes=0
failures=0

log "INFO" "$START_MESSAGE"

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
    line="$(trim "$raw_line")"

    if [[ -z "$line" || "$line" == \#* ]]; then
        continue
    fi

    total=$((total + 1))
    log "INFO" "Processando: $line"

    if run_download "$line"; then
        successes=$((successes + 1))
        log "SUCESSO" "$SUCCESS_LABEL: $line"
    else
        failures=$((failures + 1))
        log "FALHA" "$FAILURE_LABEL: $line"
    fi
done < "$URLS_FILE"

log "INFO" "Resumo: total=$total sucesso=$successes falha=$failures"
