#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_URL="${BASE_URL:-http://localhost:3000}"
ENV_FILE="${SCRIPT_DIR}/.env"
AUDIO_FILE="${1:-${SCRIPT_DIR}/test.wav}"

if [[ ! -f "${AUDIO_FILE}" ]]; then
  echo "FAIL: audio file not found: ${AUDIO_FILE}"
  exit 1
fi

if [[ -z "${APP_TOKEN:-}" ]] && [[ -f "${ENV_FILE}" ]]; then
  APP_TOKEN="$(awk -F= '/^APP_TOKEN=/{print substr($0,11)}' "${ENV_FILE}" | tr -d '\r')"
fi
APP_TOKEN="${APP_TOKEN:-them-dev}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

health_code() {
  curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/health"
}

require_code() {
  local got="$1"
  local want="$2"
  local label="$3"
  if [[ "${got}" != "${want}" ]]; then
    echo "FAIL: ${label} expected ${want}, got ${got}"
    exit 1
  fi
  echo "PASS: ${label} (${got})"
}

echo "== THEM backend smoke =="
echo "base_url=${BASE_URL}"
echo "audio_file=${AUDIO_FILE}"

H_CODE="$(health_code)"
require_code "${H_CODE}" "200" "health"

SESSION_JSON_FILE="${TMP_DIR}/session.json"
curl -sS \
  -H "X-APP-TOKEN: ${APP_TOKEN}" \
  -X POST \
  "${BASE_URL}/session" > "${SESSION_JSON_FILE}"

CLIENT_TOKEN="$(node -e 'const fs=require("fs");const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,"utf8"));process.stdout.write(j.client_token||"");' "${SESSION_JSON_FILE}")"
if [[ -z "${CLIENT_TOKEN}" ]]; then
  echo "FAIL: session missing client_token"
  exit 1
fi
echo "PASS: session (client_token issued)"

HISTORY_CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  -H "X-APP-TOKEN: ${APP_TOKEN}" \
  -H "X-Client-Token: ${CLIENT_TOKEN}" \
  "${BASE_URL}/history?limit=5")"
require_code "${HISTORY_CODE}" "200" "history"

MEMORIES_CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  -H "X-APP-TOKEN: ${APP_TOKEN}" \
  -H "X-Client-Token: ${CLIENT_TOKEN}" \
  "${BASE_URL}/memories?limit=5")"
require_code "${MEMORIES_CODE}" "200" "memories"

TALK_HEADERS="${TMP_DIR}/talk.headers"
TALK_AUDIO="${TMP_DIR}/talk.mp3"
curl -sS --max-time 70 \
  -D "${TALK_HEADERS}" \
  -o "${TALK_AUDIO}" \
  -H "X-APP-TOKEN: ${APP_TOKEN}" \
  -H "X-Client-Token: ${CLIENT_TOKEN}" \
  -F "file=@${AUDIO_FILE};type=audio/wav" \
  "${BASE_URL}/talk"

TALK_STATUS="$(awk 'NR==1{print $2}' "${TALK_HEADERS}")"
require_code "${TALK_STATUS}" "200" "talk"

TTS_PROVIDER="$(grep -i '^x-tts-provider:' "${TALK_HEADERS}" | awk -F': ' '{print $2}' | tr -d '\r' || true)"
TURN_STATUS="$(grep -i '^x-turn-status:' "${TALK_HEADERS}" | awk -F': ' '{print $2}' | tr -d '\r' || true)"
REPLY_HEADER="$(grep -i '^x-reply:' "${TALK_HEADERS}" | head -n1 | cut -d' ' -f2- | tr -d '\r' || true)"
AUDIO_BYTES="$(wc -c < "${TALK_AUDIO}" | tr -d ' ')"

if [[ "${AUDIO_BYTES}" -le 0 ]]; then
  echo "FAIL: talk produced empty audio"
  exit 1
fi

echo "PASS: talk audio bytes=${AUDIO_BYTES}"
echo "INFO: tts_provider=${TTS_PROVIDER:-unknown} turn_status=${TURN_STATUS:-unknown}"
if [[ -n "${REPLY_HEADER}" ]]; then
  echo "INFO: reply_header_present=yes"
else
  echo "INFO: reply_header_present=no"
fi

echo "ALL CHECKS PASSED"
