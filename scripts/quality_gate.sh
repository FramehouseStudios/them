#!/usr/bin/env bash
set -euo pipefail

# Gate controls:
# - RUN_EVAL=1 runs the prompt regression suite.
# - RUN_SPECULATIVE_REUSE_GATE=1 runs the backend speculative /talk reuse smoke.
# - RUN_SMOKE=1 runs the broader smoke.sh app/backend checks.
# - RUN_TALK_RECOVERY_GATE=1 runs the talk recovery contract test.
# - RUN_ALERT=1 runs ops alert checks.
# - RUN_LOAD=1 runs the load profile.
# - RUN_CRAFT_COMPLETENESS_GATE=1 smokes the T23 craft completeness gate
#   against backend/fixtures/craft/report_complete.json. Verifies the
#   gate script works; real RC runs should also point CRAFT_GATE_FIXTURE
#   at a project-specific fixture or pass --project/--version to check
#   a stored report.
# Set any of these to 0 to skip that section intentionally.
# This script is the canonical place to document gate env vars for local runs
# and any external CI that is not checked into this repository.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
LOG_FILE="${LOG_FILE:-/tmp/them-quality-gate-backend.log}"
ENV_FILE="${BACKEND_DIR}/.env"
RUN_EVAL="${RUN_EVAL:-1}"
RUN_STRICT_CASE_MINS="${RUN_STRICT_CASE_MINS:-1}"
RUN_SPECULATIVE_REUSE_GATE="${RUN_SPECULATIVE_REUSE_GATE:-1}"
RUN_ALERT="${RUN_ALERT:-1}"
RUN_LOAD="${RUN_LOAD:-0}"
RUN_TALK_RECOVERY_GATE="${RUN_TALK_RECOVERY_GATE:-1}"
RUN_CRAFT_COMPLETENESS_GATE="${RUN_CRAFT_COMPLETENESS_GATE:-1}"
CRAFT_GATE_FIXTURE="${CRAFT_GATE_FIXTURE:-${BACKEND_DIR}/fixtures/craft/report_complete.json}"

cd "${BACKEND_DIR}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ "${RUN_SERVER:-0}" == "1" ]]; then
  echo "[quality-gate] starting backend ..."
  if [[ "${RUN_TALK_RECOVERY_GATE}" == "1" ]]; then
    TALK_TEST_DEBUG_FAILURE_ENABLED=1 npm run start:env >"${LOG_FILE}" 2>&1 &
  else
    npm run start:env >"${LOG_FILE}" 2>&1 &
  fi
  SERVER_PID="$!"
  sleep 2
fi

if [[ "${RUN_EVAL}" == "1" ]]; then
  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    echo "[quality-gate] OPENAI_API_KEY is missing."
    echo "[quality-gate] Set OPENAI_API_KEY in env or ${ENV_FILE}."
    exit 2
  fi
  echo "[quality-gate] running regression eval ..."
  if [[ "${RUN_STRICT_CASE_MINS}" == "1" ]]; then
    EVAL_STRICT_CASE_MINS=1 npm run eval:regression
  else
    npm run eval:regression
  fi
else
  echo "[quality-gate] skipping regression eval (RUN_EVAL=${RUN_EVAL})"
fi

if [[ "${RUN_SPECULATIVE_REUSE_GATE}" == "1" ]]; then
  echo "[quality-gate] running speculative reuse smoke ..."
  npm run eval:speculative-reuse
else
  echo "[quality-gate] skipping speculative reuse smoke (RUN_SPECULATIVE_REUSE_GATE=${RUN_SPECULATIVE_REUSE_GATE})"
fi

if [[ "${RUN_SMOKE:-1}" == "1" ]]; then
  echo "[quality-gate] running smoke ..."
  npm run smoke
fi

if [[ "${RUN_TALK_RECOVERY_GATE}" == "1" ]]; then
  if [[ -z "${OPENAI_API_KEY:-}" ]]; then
    echo "[quality-gate] OPENAI_API_KEY is missing."
    echo "[quality-gate] Required for talk recovery reliability gate."
    exit 2
  fi
  echo "[quality-gate] running talk recovery contract gate ..."
  TEST_BACKEND_URL="${BASE_URL:-http://localhost:3000}" \
  TALK_TEST_ENFORCE=1 \
  TALK_TEST_RECOVERY_ONLY=1 \
  TALK_TEST_DEBUG_FAILURE_ENABLED=1 \
  npm run test:talk-recovery
fi

if [[ "${RUN_ALERT}" == "1" ]]; then
  echo "[quality-gate] checking ops alerts ..."
  APP_TOKEN="${APP_TOKEN:-}" BASE_URL="${BASE_URL:-http://localhost:3000}" bash "${ROOT_DIR}/scripts/ops_alert_check.sh"
fi

if [[ "${RUN_LOAD}" == "1" ]]; then
  echo "[quality-gate] running load profile ..."
  npm run load:profile
fi

if [[ "${RUN_CRAFT_COMPLETENESS_GATE}" == "1" ]]; then
  echo "[quality-gate] running craft completeness gate (fixture=${CRAFT_GATE_FIXTURE}) ..."
  node "${ROOT_DIR}/scripts/check_craft_completeness.mjs" --file "${CRAFT_GATE_FIXTURE}"
else
  echo "[quality-gate] skipping craft completeness gate (RUN_CRAFT_COMPLETENESS_GATE=${RUN_CRAFT_COMPLETENESS_GATE})"
fi

echo "[quality-gate] PASS"
