#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_ENV_FILE="${RELEASE_ENV_FILE:-${ROOT}/them/Release.local.env}"
EXAMPLE_FILE="${ROOT}/them/Release.local.env.example"

is_missing_value() {
  local value="${1:-}"
  case "${value}" in
    ""|REPLACE_WITH_*|*yourdomain*|"\$("*|"https://api.example.com")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

if [[ -f "${RELEASE_ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${RELEASE_ENV_FILE}"
  set +a
else
  if [[ -z "${DEVELOPMENT_TEAM_ID:-}" && -z "${APP_TOKEN_RELEASE:-}" ]]; then
    cat >&2 <<EOF
Missing local release config: ${RELEASE_ENV_FILE}

Create it from the checked-in template:

  cp "${EXAMPLE_FILE}" "${RELEASE_ENV_FILE}"
  chmod 600 "${RELEASE_ENV_FILE}"

Then fill in DEVELOPMENT_TEAM_ID and APP_TOKEN_RELEASE. Keep BACKEND_URL at
https://api.them.io unless the release backend changes.

You can inspect the local config without printing secrets first:

  node "${ROOT}/scripts/release_config_status.mjs"
EOF
    exit 1
  fi
  echo "[release-preflight] ${RELEASE_ENV_FILE} not found; using shell environment only."
fi

missing=()
if is_missing_value "${DEVELOPMENT_TEAM_ID:-}"; then
  missing+=("DEVELOPMENT_TEAM_ID")
fi
if is_missing_value "${APP_TOKEN_RELEASE:-}"; then
  missing+=("APP_TOKEN_RELEASE")
fi

if [[ "${#missing[@]}" -gt 0 ]]; then
  node "${ROOT}/scripts/release_config_status.mjs" --release-env-file="${RELEASE_ENV_FILE}" || true
  printf "[FAIL] Local release config is missing real private value(s): %s\n" "${missing[*]}" >&2
  printf "[INFO] Edit %s and rerun scripts/run_release_preflight.sh.\n" "${RELEASE_ENV_FILE}" >&2
  exit 1
fi

node "${ROOT}/scripts/release_config_status.mjs" --release-env-file="${RELEASE_ENV_FILE}"

RUN_LIVE_BACKEND_CHECK="${RUN_LIVE_BACKEND_CHECK:-1}"
if [[ "${RUN_LIVE_BACKEND_CHECK}" == "1" ]]; then
  APP_TOKEN="${APP_TOKEN:-${APP_TOKEN_RELEASE:-}}" \
    node "${ROOT}/scripts/live_backend_health.mjs" --url="${BACKEND_URL:-https://api.them.io}"
else
  echo "[release-preflight] Skipping live backend health check (RUN_LIVE_BACKEND_CHECK=${RUN_LIVE_BACKEND_CHECK})."
fi

"${ROOT}/scripts/appstore_preflight.sh"
