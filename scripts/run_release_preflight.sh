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

# Gate bookkeeping: every gate records whether it ran or was skipped so the
# end-of-run summary can say exactly what this preflight proved. A run that
# skipped any default-on gate ends with PARTIAL, never with a green line.
ran_gates=()
skipped_gates=()
partial=0

record_gate_ran() {
  ran_gates+=("$1")
}

record_gate_skipped() {
  local name="$1"
  local flag="$2"
  local default_on="${3:-1}"
  skipped_gates+=("${name} (${flag}=${!flag})")
  if [[ "${default_on}" == "1" ]]; then
    partial=1
  fi
}

print_preflight_summary() {
  echo
  echo "[release-preflight] Gate summary"
  if [[ "${#ran_gates[@]}" -gt 0 ]]; then
    printf "  ran:     %s\n" "${ran_gates[@]}"
  else
    echo "  ran:     (none)"
  fi
  if [[ "${#skipped_gates[@]}" -gt 0 ]]; then
    printf "  skipped: %s\n" "${skipped_gates[@]}"
  else
    echo "  skipped: (none)"
  fi
  if [[ "${partial}" == "1" ]]; then
    echo "[release-preflight] PARTIAL: default-on gate(s) were skipped; this run does not prove release readiness."
  else
    echo "[release-preflight] GREEN: every default-on gate ran and passed."
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
requires_openai=0
if [[ "${RUN_LIVE_STUDIO_STRUCTURAL_CANARY}" == "1" ]]; then
  requires_openai=1
fi
if [[ "${RUN_QUALITY_GATE}" == "1" ]] && { \
  [[ "${RUN_EVAL}" == "1" ]] \
  || [[ "${RUN_TALK_RECOVERY_GATE}" == "1" ]] \
  || [[ "${RUN_SPECULATIVE_REUSE_GATE}" == "1" ]] \
  || [[ "${RUN_SMOKE}" == "1" ]]; \
}; then
  requires_openai=1
fi
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
  record_gate_ran "voice-latency"
else
  echo "[release-preflight] Skipping voice latency gate (RUN_VOICE_LATENCY_GATE=${RUN_VOICE_LATENCY_GATE})."
  record_gate_skipped "voice-latency" RUN_VOICE_LATENCY_GATE 1
fi

RUN_VOICE_NETWORK_FAULT_GATE="${RUN_VOICE_NETWORK_FAULT_GATE:-1}"
if [[ "${RUN_VOICE_NETWORK_FAULT_GATE}" == "1" ]]; then
  "${ROOT}/scripts/run_voice_network_fault_smokes.sh"
  record_gate_ran "voice-network-fault"
else
  echo "[release-preflight] Skipping voice network-fault gate (RUN_VOICE_NETWORK_FAULT_GATE=${RUN_VOICE_NETWORK_FAULT_GATE})."
  record_gate_skipped "voice-network-fault" RUN_VOICE_NETWORK_FAULT_GATE 1
fi

RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE="${RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE:-1}"
RUN_WRITER_BLOCK_QUALITY_GATE="${RUN_WRITER_BLOCK_QUALITY_GATE:-1}"
if [[ "${RUN_WRITER_BLOCK_QUALITY_GATE}" == "1" ]]; then
  npm --prefix "${ROOT}/backend" run eval:writer-block-rescue
  record_gate_ran "writer-block-quality"
else
  echo "[release-preflight] Skipping deterministic writer-block quality gate (RUN_WRITER_BLOCK_QUALITY_GATE=${RUN_WRITER_BLOCK_QUALITY_GATE})."
  record_gate_skipped "writer-block-quality" RUN_WRITER_BLOCK_QUALITY_GATE 1
fi

if [[ "${RUN_LIVE_STUDIO_STRUCTURAL_CANARY}" == "1" ]]; then
  npm --prefix "${ROOT}/backend" run eval:live-studio-story-quality
  record_gate_ran "live-studio-story-quality"
else
  echo "[release-preflight] Skipping live Studio story-quality canary (RUN_LIVE_STUDIO_STRUCTURAL_CANARY=${RUN_LIVE_STUDIO_STRUCTURAL_CANARY})."
  record_gate_skipped "live-studio-story-quality" RUN_LIVE_STUDIO_STRUCTURAL_CANARY 1
fi

if [[ "${RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE}" == "1" ]]; then
  npm --prefix "${ROOT}/backend" run eval:studio-instinct-writer-block-ui
  record_gate_ran "studio-instinct-writer-block"
else
  echo "[release-preflight] Skipping Studio instinct writer-block gate (RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE=${RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE})."
  record_gate_skipped "studio-instinct-writer-block" RUN_STUDIO_INSTINCT_WRITER_BLOCK_GATE 1
fi

RUN_V1_UI_SMOKE_GATE="${RUN_V1_UI_SMOKE_GATE:-1}"
if [[ "${RUN_V1_UI_SMOKE_GATE}" == "1" ]]; then
  "${ROOT}/scripts/run_v1_ui_smoke.sh"
  record_gate_ran "v1-ui-smoke"
else
  echo "[release-preflight] Skipping signed iPhone V1 UI smoke (RUN_V1_UI_SMOKE_GATE=${RUN_V1_UI_SMOKE_GATE})."
  record_gate_skipped "v1-ui-smoke" RUN_V1_UI_SMOKE_GATE 1
fi

RUN_LIVE_BACKEND_CHECK="${RUN_LIVE_BACKEND_CHECK:-1}"
if [[ "${RUN_LIVE_BACKEND_CHECK}" == "1" ]]; then
  APP_TOKEN="${APP_TOKEN:-${APP_TOKEN_RELEASE:-}}" \
    node "${ROOT}/scripts/live_backend_health.mjs" --url="${BACKEND_URL:-https://api.them.io}"
  record_gate_ran "live-backend-health"
else
  echo "[release-preflight] Skipping live backend health check (RUN_LIVE_BACKEND_CHECK=${RUN_LIVE_BACKEND_CHECK})."
  record_gate_skipped "live-backend-health" RUN_LIVE_BACKEND_CHECK 1
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
  record_gate_ran "public-privacy-policy"
else
  echo "[release-preflight] Skipping public privacy-policy check (RUN_PUBLIC_RELEASE_SURFACE_CHECK=${RUN_PUBLIC_RELEASE_SURFACE_CHECK})."
  record_gate_skipped "public-privacy-policy" RUN_PUBLIC_RELEASE_SURFACE_CHECK 1
fi

RUN_MAC_DESKTOP_PREFLIGHT="${RUN_MAC_DESKTOP_PREFLIGHT:-0}"
if [[ "${RUN_MAC_DESKTOP_PREFLIGHT}" == "1" ]]; then
  MAC_DESKTOP_CONFIGURATION="${MAC_DESKTOP_CONFIGURATION:-Mac Scaffold Release}" \
    MAC_DESKTOP_ACTION="${MAC_DESKTOP_ACTION:-archive}" \
    "${ROOT}/scripts/desktop_preflight.sh"
  record_gate_ran "mac-desktop-preflight"
else
  echo "[release-preflight] Mac scaffold is outside the iPhone-only V1 release gate (RUN_MAC_DESKTOP_PREFLIGHT=${RUN_MAC_DESKTOP_PREFLIGHT})."
  record_gate_skipped "mac-desktop-preflight" RUN_MAC_DESKTOP_PREFLIGHT 0
fi

"${ROOT}/scripts/appstore_preflight.sh"
record_gate_ran "appstore-preflight"

# release_config_status.mjs ran unconditionally above; name it so the summary is complete.
ran_gates=("release-config-status" "${ran_gates[@]}")

print_preflight_summary
