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

validate_release_env_file() {
  local file="$1"
  local permissions=""

  if [[ -L "${file}" ]]; then
    printf "[FAIL] Local release config must not be a symlink: %s\n" "${file}" >&2
    return 1
  fi
  if [[ ! -f "${file}" ]]; then
    printf "[FAIL] Local release config must be a regular file: %s\n" "${file}" >&2
    return 1
  fi
  if permissions="$(stat -f '%Lp' "${file}" 2>/dev/null)"; then
    :
  elif permissions="$(stat -c '%a' "${file}" 2>/dev/null)"; then
    :
  else
    printf "[FAIL] Could not inspect local release config permissions: %s\n" "${file}" >&2
    return 1
  fi
  if [[ "${permissions}" != "600" ]]; then
    printf "[FAIL] Local release config must have mode 600 (found %s): %s\n" "${permissions}" "${file}" >&2
    printf "[INFO] Run: chmod 600 %s\n" "${file}" >&2
    return 1
  fi
}

if [[ -e "${RELEASE_ENV_FILE}" || -L "${RELEASE_ENV_FILE}" ]]; then
  validate_release_env_file "${RELEASE_ENV_FILE}"
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

Then fill in DEVELOPMENT_TEAM_ID, APP_TOKEN_RELEASE, and OPENAI_API_KEY. Keep
BACKEND_URL at https://api.them.io unless the release backend changes.

You can inspect the local config without printing secrets first:

  node "${ROOT}/scripts/release_config_status.mjs"
EOF
    exit 1
  fi
  echo "[release-preflight] ${RELEASE_ENV_FILE} not found; using shell environment only."
fi

missing=()
RUN_LIVE_STUDIO_STRUCTURAL_CANARY="${RUN_LIVE_STUDIO_STRUCTURAL_CANARY:-1}"
RUN_QUALITY_GATE="${RUN_QUALITY_GATE:-1}"
RUN_EVAL="${RUN_EVAL:-1}"
RUN_TALK_RECOVERY_GATE="${RUN_TALK_RECOVERY_GATE:-1}"
RUN_SPECULATIVE_REUSE_GATE="${RUN_SPECULATIVE_REUSE_GATE:-1}"
RUN_SMOKE="${RUN_SMOKE:-1}"
if is_missing_value "${DEVELOPMENT_TEAM_ID:-}"; then
  missing+=("DEVELOPMENT_TEAM_ID")
fi
if is_missing_value "${APP_TOKEN_RELEASE:-}"; then
  missing+=("APP_TOKEN_RELEASE")
fi
requires_openai="$(node "${ROOT}/scripts/release_gate_policy.mjs")"
if [[ "${requires_openai}" == "1" ]] && is_missing_value "${OPENAI_API_KEY:-}"; then
  missing+=("OPENAI_API_KEY")
fi

if [[ "${#missing[@]}" -gt 0 ]]; then
  node "${ROOT}/scripts/release_config_status.mjs" --release-env-file="${RELEASE_ENV_FILE}" || true
  printf "[FAIL] Local release config is missing real private value(s): %s\n" "${missing[*]}" >&2
  printf "[INFO] Edit %s and rerun scripts/run_release_preflight.sh.\n" "${RELEASE_ENV_FILE}" >&2
  exit 1
fi

node "${ROOT}/scripts/release_config_status.mjs" --release-env-file="${RELEASE_ENV_FILE}"

RUN_VOICE_LATENCY_GATE="${RUN_VOICE_LATENCY_GATE:-1}"
if [[ "${RUN_VOICE_LATENCY_GATE}" == "1" ]]; then
  "${ROOT}/scripts/run_voice_latency_gate.sh"
else
  echo "[release-preflight] Skipping voice latency gate (RUN_VOICE_LATENCY_GATE=${RUN_VOICE_LATENCY_GATE})."
fi

RUN_VOICE_NETWORK_FAULT_GATE="${RUN_VOICE_NETWORK_FAULT_GATE:-1}"
if [[ "${RUN_VOICE_NETWORK_FAULT_GATE}" == "1" ]]; then
  "${ROOT}/scripts/run_voice_network_fault_smokes.sh"
else
  echo "[release-preflight] Skipping voice network-fault gate (RUN_VOICE_NETWORK_FAULT_GATE=${RUN_VOICE_NETWORK_FAULT_GATE})."
fi

RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE="${RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE:-1}"
RUN_WRITER_BLOCK_QUALITY_GATE="${RUN_WRITER_BLOCK_QUALITY_GATE:-1}"
if [[ "${RUN_WRITER_BLOCK_QUALITY_GATE}" == "1" ]]; then
  npm --prefix "${ROOT}/backend" run eval:writer-block-rescue
else
  echo "[release-preflight] Skipping deterministic writer-block quality gate (RUN_WRITER_BLOCK_QUALITY_GATE=${RUN_WRITER_BLOCK_QUALITY_GATE})."
fi

if [[ "${RUN_LIVE_STUDIO_STRUCTURAL_CANARY}" == "1" ]]; then
  npm --prefix "${ROOT}/backend" run eval:live-studio-story-quality
else
  echo "[release-preflight] Skipping live Studio story-quality canary (RUN_LIVE_STUDIO_STRUCTURAL_CANARY=${RUN_LIVE_STUDIO_STRUCTURAL_CANARY})."
fi

if [[ "${RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE}" == "1" ]]; then
  npm --prefix "${ROOT}/backend" run eval:studio-instinct-writer-block-ui
else
  echo "[release-preflight] Skipping Studio instinct writer-block gate (RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE=${RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE})."
fi

RUN_V1_UI_SMOKE_GATE="${RUN_V1_UI_SMOKE_GATE:-1}"
if [[ "${RUN_V1_UI_SMOKE_GATE}" == "1" ]]; then
  "${ROOT}/scripts/run_v1_ui_smoke.sh"
else
  echo "[release-preflight] Skipping signed iPhone V1 UI smoke (RUN_V1_UI_SMOKE_GATE=${RUN_V1_UI_SMOKE_GATE})."
fi

RUN_LIVE_BACKEND_CHECK="${RUN_LIVE_BACKEND_CHECK:-1}"
if [[ "${RUN_LIVE_BACKEND_CHECK}" == "1" ]]; then
  APP_TOKEN="${APP_TOKEN:-${APP_TOKEN_RELEASE:-}}" \
    node "${ROOT}/scripts/live_backend_health.mjs" --url="${BACKEND_URL:-https://api.them.io}"
else
  echo "[release-preflight] Skipping live backend health check (RUN_LIVE_BACKEND_CHECK=${RUN_LIVE_BACKEND_CHECK})."
fi

RUN_PUBLIC_RELEASE_SURFACE_CHECK="${RUN_PUBLIC_RELEASE_SURFACE_CHECK:-1}"
if [[ "${RUN_PUBLIC_RELEASE_SURFACE_CHECK}" == "1" ]]; then
  RELEASE_PLIST_FILE="${ROOT}/them/Info-Release.plist"
  shipped_privacy_url="$(plutil -extract PRIVACY_POLICY_URL raw -o - "${RELEASE_PLIST_FILE}" 2>/dev/null || true)"
  if is_missing_value "${shipped_privacy_url}" || [[ "${shipped_privacy_url}" != https://* ]]; then
    echo "[FAIL] Info-Release.plist must contain the canonical HTTPS PRIVACY_POLICY_URL shipped by the app." >&2
    exit 1
  fi
  if [[ -n "${PRIVACY_POLICY_URL:-}" && "${PRIVACY_POLICY_URL}" != "${shipped_privacy_url}" ]]; then
    echo "[FAIL] PRIVACY_POLICY_URL (${PRIVACY_POLICY_URL}) does not match the URL shipped in Info-Release.plist (${shipped_privacy_url})." >&2
    exit 1
  fi
  node "${ROOT}/scripts/release_public_surface_health.mjs" \
    --url="${shipped_privacy_url}"
else
  echo "[release-preflight] Skipping public privacy-policy check (RUN_PUBLIC_RELEASE_SURFACE_CHECK=${RUN_PUBLIC_RELEASE_SURFACE_CHECK})."
fi

RUN_MAC_DESKTOP_PREFLIGHT="${RUN_MAC_DESKTOP_PREFLIGHT:-0}"
if [[ "${RUN_MAC_DESKTOP_PREFLIGHT}" == "1" ]]; then
  MAC_DESKTOP_CONFIGURATION="${MAC_DESKTOP_CONFIGURATION:-Mac Scaffold Release}" \
    MAC_DESKTOP_ACTION="${MAC_DESKTOP_ACTION:-archive}" \
    "${ROOT}/scripts/desktop_preflight.sh"
else
  echo "[release-preflight] Mac scaffold is outside the iPhone-only V1 release gate (RUN_MAC_DESKTOP_PREFLIGHT=${RUN_MAC_DESKTOP_PREFLIGHT})."
fi

"${ROOT}/scripts/appstore_preflight.sh"
