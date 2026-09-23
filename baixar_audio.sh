#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || "${1:-}" == "help" ]]; then
    exec "$SCRIPT_DIR/download_media.sh" --help
fi

exec "$SCRIPT_DIR/download_media.sh" audio "$@"
