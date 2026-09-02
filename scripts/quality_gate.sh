#!/usr/bin/env bash
set -euo pipefail

# Gate controls:
# - RUN_EVAL=1 runs the prompt regression suite.
# - RUN_SPECULATIVE_REUSE_GATE=1 runs the backend speculative /talk reuse smoke.
# - RUN_SMOKE=1 runs the broader smoke.sh app/backend checks.
# - RUN_TALK_RECOVERY_GATE=1 runs the talk recovery contract test.
# - RUN_ALERT=1 runs ops alert checks.
# - RUN_LOAD=1 runs the load profile.
# - RUN_PAGE_CRAFT=1 runs heuristic page craft eval (F1).
# - RUN_CRAFT_COMPLETENESS_GATE=1 generates a fresh report through the
#   production analyzer, then validates its schema, evidence, counts, scopes,
#   and completeness. Set CRAFT_GATE_FIXTURE only for an explicit external RC
#   report; a checked-in static fixture is never the default release proof.
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
RUN_CANON="${RUN_CANON:-1}"
RUN_PAGE_CRAFT="${RUN_PAGE_CRAFT:-1}"
CRAFT_GATE_FIXTURE="${CRAFT_GATE_FIXTURE:-}"

cd "${BACKEND_DIR}"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

# Keep every gate client on the same backend the gate starts. Local .env files
# commonly move PORT away from 3000; without this normalization the server can
# start on that custom port while individual smokes silently probe a stale
# process on 3000.
GATE_PORT="${QUALITY_GATE_PORT:-${PORT:-3000}}"
GATE_BASE_URL="${BASE_URL:-http://127.0.0.1:${GATE_PORT}}"
export PORT="${GATE_PORT}"
export BASE_URL="${GATE_BASE_URL}"
export THEM_BASE_URL="${THEM_BASE_URL:-${GATE_BASE_URL}}"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ "${RUN_SERVER:-0}" == "1" ]]; then
  echo "[quality-gate] starting backend on ${GATE_BASE_URL} ..."
  if [[ "${RUN_TALK_RECOVERY_GATE}" == "1" ]]; then
    TALK_TEST_DEBUG_FAILURE_ENABLED=1 npm start >"${LOG_FILE}" 2>&1 &
  else
    npm start >"${LOG_FILE}" 2>&1 &
  fi
  SERVER_PID="$!"
  SERVER_READY=0
  for _attempt in {1..100}; do
    if ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
      echo "[quality-gate] backend exited before becoming ready."
      tail -n 80 "${LOG_FILE}" || true
      exit 1
    fi
    if grep -q "Backend listening on" "${LOG_FILE}" \
      && curl -fsS "${GATE_BASE_URL}/health" >/dev/null 2>&1; then
      SERVER_READY=1
      break
    fi
    sleep 0.1
  done
  if [[ "${SERVER_READY}" != "1" ]]; then
    echo "[quality-gate] backend did not become ready on ${GATE_BASE_URL}."
    tail -n 80 "${LOG_FILE}" || true
    exit 1
  fi
fi

if [[ "${RUN_CANON}" == "1" ]]; then
  # Umbrella canon-pinning eval (PR #171). Chains every merged
  # canon eval (creative-memory shape, block-signal-history-bounds,
  # archetype-canon, trait-library-canon, twist-engine-canon,
  # block-detector-canon, format-linter-canon, etc.). Pure
  # deterministic — no external API, no network. If a canon eval
  # regresses, this fails fast before we spend time on the slower
  # external-API gates below.
  #
  # This is already STRICT MODE: `set -euo pipefail` at the top of
  # this script means a non-zero exit from `npm run eval:canon`
  # aborts the gate, which in turn blocks the auto-merge-tier1
  # workflow_run trigger. No additional wiring needed — canon
  # regressions block merge today.
  echo "[quality-gate] running canon umbrella (npm run eval:canon) [strict — exits 1 on regression] ..."
  npm run eval:canon
else
  echo "[quality-gate] skipping canon umbrella (RUN_CANON=${RUN_CANON})"
fi

if [[ "${RUN_PAGE_CRAFT}" == "1" ]]; then
  echo "[quality-gate] running page craft eval [heuristic] ..."
  node evals/page_craft/run_page_craft_eval.mjs
else
  echo "[quality-gate] skipping page craft eval (RUN_PAGE_CRAFT=${RUN_PAGE_CRAFT})"
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
  if [[ -n "${CRAFT_GATE_FIXTURE}" ]]; then
    echo "[quality-gate] running craft completeness gate (explicit fixture=${CRAFT_GATE_FIXTURE}) ..."
    node "${ROOT_DIR}/scripts/check_craft_completeness.mjs" --file "${CRAFT_GATE_FIXTURE}"
  else
    CRAFT_FRESH_REPORT="${TMPDIR:-/tmp}/io-them-craft-contract-complete-$$.json"
    echo "[quality-gate] generating fresh craft contract report (${CRAFT_FRESH_REPORT}) ..."
    node "${BACKEND_DIR}/evals/run_craft_analysis_contract_eval.mjs" --write-complete-report "${CRAFT_FRESH_REPORT}"
    node "${ROOT_DIR}/scripts/check_craft_completeness.mjs" --file "${CRAFT_FRESH_REPORT}"
  fi
else
  echo "[quality-gate] skipping craft completeness gate (RUN_CRAFT_COMPLETENESS_GATE=${RUN_CRAFT_COMPLETENESS_GATE})"
fi

echo "[quality-gate] PASS"
