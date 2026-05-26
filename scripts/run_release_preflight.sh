#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_ENV_FILE="${RELEASE_ENV_FILE:-${ROOT}/them/Release.local.env}"

if [[ -f "${RELEASE_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${RELEASE_ENV_FILE}"
  set +a
else
  echo "[release-preflight] ${RELEASE_ENV_FILE} not found; using shell environment only."
fi

node "${ROOT}/scripts/release_config_status.mjs" --release-env-file="${RELEASE_ENV_FILE}"

"${ROOT}/scripts/appstore_preflight.sh"
