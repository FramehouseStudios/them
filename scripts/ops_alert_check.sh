#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
APP_TOKEN="${APP_TOKEN:-}"
MAX_ERROR_RATE="${ALERT_MAX_ERROR_RATE:-0.22}"
MAX_P95_MS="${ALERT_MAX_P95_MS:-9500}"

hdr=()
if [[ -n "${APP_TOKEN}" ]]; then
  hdr=(-H "X-APP-TOKEN: ${APP_TOKEN}")
fi

raw="$(curl -sS "${hdr[@]}" "${BASE_URL%/}/ops/metrics")"

status="$(printf '%s' "${raw}" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(String(j.status||"unknown"));}catch{process.stdout.write("parse_error");}})')"
err_rate="$(printf '%s' "${raw}" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(String(Number(j.metrics?.errorRate||0)));}catch{process.stdout.write("1");}})')"
p95="$(printf '%s' "${raw}" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(String(Number(j.metrics?.p95TotalMs||0)));}catch{process.stdout.write("999999");}})')"

echo "[ops-alert] status=${status} error_rate=${err_rate} p95_ms=${p95}"

if [[ "${status}" == "degraded" ]]; then
  echo "[ops-alert] FAIL: backend status is degraded"
  exit 1
fi

awk -v e="${err_rate}" -v max="${MAX_ERROR_RATE}" 'BEGIN{exit !(e<=max)}' || {
  echo "[ops-alert] FAIL: error_rate ${err_rate} > ${MAX_ERROR_RATE}"
  exit 1
}

awk -v p="${p95}" -v max="${MAX_P95_MS}" 'BEGIN{exit !(p<=max)}' || {
  echo "[ops-alert] FAIL: p95_ms ${p95} > ${MAX_P95_MS}"
  exit 1
}

echo "[ops-alert] PASS"
