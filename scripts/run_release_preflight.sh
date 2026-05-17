#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${RELEASE_ENV_FILE:-$ROOT/them/Release.local.env}"
EXAMPLE_FILE="$ROOT/them/Release.local.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  cat >&2 <<EOF
Missing local release config: $ENV_FILE

Create it from the checked-in template:

  cp "$EXAMPLE_FILE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"

Then fill in DEVELOPMENT_TEAM_ID, BACKEND_URL, and APP_TOKEN.

You can inspect the local config without printing secrets first:

  node "$ROOT/scripts/release_config_status.mjs"
EOF
  exit 1
fi

mode=""
if mode="$(stat -f "%Lp" "$ENV_FILE" 2>/dev/null)"; then
  :
elif mode="$(stat -c "%a" "$ENV_FILE" 2>/dev/null)"; then
  :
fi

if [[ -n "$mode" ]]; then
  last_two="${mode: -2}"
  if [[ "$last_two" != "00" ]]; then
    printf "[WARN] %s is readable by group/others; run: chmod 600 %s\n" "$ENV_FILE" "$ENV_FILE" >&2
  fi
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

missing=()
for key in DEVELOPMENT_TEAM_ID BACKEND_URL APP_TOKEN; do
  if [[ -z "${!key:-}" || "${!key}" == REPLACE_WITH_* || "${!key}" == "https://api.example.com" ]]; then
    missing+=("$key")
  fi
done

if [[ "${#missing[@]}" -gt 0 ]]; then
  printf "[FAIL] Local release config is missing real value(s): %s\n" "${missing[*]}" >&2
  printf "[INFO] Edit %s and rerun scripts/run_release_preflight.sh.\n" "$ENV_FILE" >&2
  exit 1
fi

exec "$ROOT/scripts/appstore_preflight.sh"
