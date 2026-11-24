#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_FILE="${ROOT_DIR}/public/game.wasm"
MAX_BYTES=256000 # 250 KB budget from docs/specs/00-platform-and-tech.md

mkdir -p "${ROOT_DIR}/public"

(
  cd "${ROOT_DIR}/sim"
  tinygo build \
    -target=wasip1 \
    -buildmode=c-shared \
    -opt=z \
    -panic=trap \
    -no-debug \
    -o "${OUT_FILE}" \
    ./cmd/wasm
)

SIZE_BYTES="$(wc -c < "${OUT_FILE}")"
echo "Built ${OUT_FILE} (${SIZE_BYTES} bytes)"

if (( SIZE_BYTES > MAX_BYTES )); then
  echo "ERROR: WASM binary (${SIZE_BYTES} bytes) exceeds budget (${MAX_BYTES} bytes)" >&2
  exit 1
fi
