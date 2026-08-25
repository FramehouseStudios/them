#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STUDIO_APP_PID=0

osascript_run() {
  local args=()
  local line
  for line in "$@"; do
    args+=(-e "$line")
  done
  osascript "${args[@]}"
}

read_default() {
  defaults read io.them.them "$1" 2>/dev/null || true
}

write_default_int() {
  defaults write io.them.them "$1" -int "$2"
}

sleep_ms() {
  perl -e 'select(undef,undef,undef,$ARGV[0]/1000)' "$1"
}

wait_for_command() {
  local description="$1"
  local timeout_ms="$2"
  local interval_ms="$3"
  shift 3
  local deadline=$(( $(python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
) + timeout_ms ))

  while (( $(python3 - <<'PY'
import time
print(int(time.time() * 1000))
PY
) < deadline )); do
    if "$@"; then
      return 0
    fi
    sleep_ms "$interval_ms"
  done

  echo "Timed out waiting for ${description}" >&2
  exit 1
}

find_debug_app_path() {
  find ~/Library/Developer/Xcode/DerivedData -path '*Build/Products/Debug/them.app/Contents/MacOS/them' -exec stat -f '%m %N' {} \; \
    | sort -nr | head -n 1 | cut -d' ' -f2- | sed 's#/Contents/MacOS/them$##'
}

activate_app() {
  [[ "$STUDIO_APP_PID" =~ ^[0-9]+$ ]] && (( STUDIO_APP_PID > 0 ))
  osascript_run \
    'tell application "System Events"' \
    "set frontmost of first process whose unix id is ${STUDIO_APP_PID} to true" \
    'end tell' >/dev/null
}

owns_studio_app_pid() {
  local executable command
  [[ "$STUDIO_APP_PID" =~ ^[0-9]+$ ]] && (( STUDIO_APP_PID > 0 )) || return 1
  executable="${APP_PATH}/Contents/MacOS/them"
  command=$(ps -p "$STUDIO_APP_PID" -o command= 2>/dev/null || true)
  [[ "$command" == "${executable} --studio-eval" || "$command" == "${executable} --studio-eval "* ]]
}

cleanup_owned_studio_app() {
  owns_studio_app_pid || return 0
  kill -TERM "$STUDIO_APP_PID" 2>/dev/null || true
  for _ in {1..20}; do
    owns_studio_app_pid || return 0
    sleep_ms 50
  done
  if owns_studio_app_pid; then
    kill -KILL "$STUDIO_APP_PID" 2>/dev/null || true
  fi
}

seed_counter() {
  local open_token focus_token
  open_token=$(read_default studio_debug_open_token)
  focus_token=$(read_default studio_debug_focus_page_token)
  open_token=${open_token:-0}
  focus_token=${focus_token:-0}
  DEBUG_TOKEN_COUNTER=1
  if [[ "$open_token" =~ ^[0-9]+$ ]] && (( open_token > DEBUG_TOKEN_COUNTER )); then
    DEBUG_TOKEN_COUNTER=$open_token
  fi
  if [[ "$focus_token" =~ ^[0-9]+$ ]] && (( focus_token > DEBUG_TOKEN_COUNTER )); then
    DEBUG_TOKEN_COUNTER=$focus_token
  fi
}

next_debug_token() {
  DEBUG_TOKEN_COUNTER=$((DEBUG_TOKEN_COUNTER + 1))
  echo "$DEBUG_TOKEN_COUNTER"
}

wait_for_studio_open_ack() {
  local token="$1"
  wait_for_command "Studio open ack ${token}" 15000 150 bash -lc "[[ \"\$(defaults read io.them.them studio_debug_open_ack_token 2>/dev/null || echo 0)\" == \"${token}\" ]]"
}

ensure_studio_visible() {
  activate_app
  local token
  token=$(next_debug_token)
  write_default_int studio_debug_open_token "$token"
  wait_for_studio_open_ack "$token"
  sleep_ms 900
  activate_app
}

focus_draft_editor() {
  local token
  token=$(next_debug_token)
  write_default_int studio_debug_focus_page_token "$token"
  wait_for_command "draft editor focus ack ${token}" 10000 150 bash -lc "[[ \"\$(defaults read io.them.them studio_debug_focus_page_ack_token 2>/dev/null || echo 0)\" == \"${token}\" ]]"
  sleep_ms 450
}

active_element_raw() {
  local debug_raw raw
  debug_raw=$(read_default studio_debug_active_screenplay_element_raw)
  raw=$(read_default studio_active_screenplay_element_v1)
  if [[ -n "$debug_raw" ]]; then
    printf '%s' "$debug_raw"
  else
    printf '%s' "$raw"
  fi
}

active_element_label() {
  local label raw
  label=$(read_default studio_debug_active_screenplay_element_label)
  if [[ -n "$label" ]]; then
    printf '%s' "$label"
    return
  fi

  raw=$(active_element_raw)
  case "$raw" in
    sceneHeading) printf '%s' 'Scene Heading' ;;
    action) printf '%s' 'Action' ;;
    character) printf '%s' 'Character' ;;
    dialogue) printf '%s' 'Dialogue' ;;
    parenthetical) printf '%s' 'Parenthetical' ;;
    transition) printf '%s' 'Transition' ;;
    *) printf '%s' "$raw" ;;
  esac
}

wait_for_active_element() {
  local expected_raw="$1"
  local expected_label="$2"
  wait_for_command "active element ${expected_label}" 5000 120 bash -lc "[[ \"\$(defaults read io.them.them studio_debug_active_screenplay_element_raw 2>/dev/null || defaults read io.them.them studio_active_screenplay_element_v1 2>/dev/null || true)\" == \"${expected_raw}\" ]] && [[ \"\$(defaults read io.them.them studio_debug_active_screenplay_element_label 2>/dev/null || true)\" == \"${expected_label}\" || -z \"\$(defaults read io.them.them studio_debug_active_screenplay_element_label 2>/dev/null || true)\" ]]"
}

send_command_number() {
  local number="$1"
  activate_app
  osascript_run \
    'delay 0.15' \
    'tell application "System Events"' \
    "set frontmost of first process whose unix id is ${STUDIO_APP_PID} to true" \
    'delay 0.05' \
    "keystroke \"${number}\" using {command down}" \
    'end tell' >/dev/null
}

send_tab() {
  local backward="$1"
  activate_app
  if [[ "$backward" == "1" ]]; then
    osascript_run \
      'delay 0.15' \
      'tell application "System Events"' \
      "set frontmost of first process whose unix id is ${STUDIO_APP_PID} to true" \
      'delay 0.05' \
      'key code 48 using {shift down}' \
      'end tell' >/dev/null
  else
    osascript_run \
      'delay 0.15' \
      'tell application "System Events"' \
      "set frontmost of first process whose unix id is ${STUDIO_APP_PID} to true" \
      'delay 0.05' \
      'key code 48' \
      'end tell' >/dev/null
  fi
}

press_and_assert() {
  local kind="$1"
  local key="$2"
  local expected_raw="$3"
  local expected_label="$4"

  case "$kind" in
    command) send_command_number "$key" ;;
    tab) send_tab 0 ;;
    backtab) send_tab 1 ;;
  esac

  wait_for_active_element "$expected_raw" "$expected_label"
}

APP_PATH=$(find_debug_app_path)
if [[ -z "$APP_PATH" ]]; then
  echo "Could not locate Debug them.app" >&2
  exit 1
fi

SESSION_OUTPUT=$("${SCRIPT_DIR}/studio_app_session_helper.sh" \
  --app-path "$APP_PATH" \
  --launch-arg --studio-eval)
STUDIO_APP_PID=$(awk -F= '$1 == "FRESH_PID" { print $2 }' <<<"$SESSION_OUTPUT" | tail -n 1)
if [[ ! "$STUDIO_APP_PID" =~ ^[0-9]+$ ]] || (( STUDIO_APP_PID <= 0 )); then
  echo "Studio session helper did not return an owned PID" >&2
  exit 1
fi
trap cleanup_owned_studio_app EXIT

seed_counter

ensure_studio_visible
focus_draft_editor

STEPS=(
  'Cmd+1|command|1|sceneHeading|Scene Heading'
  'Cmd+2|command|2|action|Action'
  'Cmd+3|command|3|character|Character'
  'Cmd+4|command|4|dialogue|Dialogue'
  'Cmd+5|command|5|parenthetical|Parenthetical'
  'Cmd+6|command|6|transition|Transition'
  'Tab|tab||sceneHeading|Scene Heading'
  'Shift+Tab|backtab||transition|Transition'
)

echo '{'
echo '  "ok": true,'
printf '  "appPath": "%s",\n' "$APP_PATH"
echo '  "observed": ['

for i in "${!STEPS[@]}"; do
  IFS='|' read -r name kind key expected_raw expected_label <<< "${STEPS[$i]}"
  press_and_assert "$kind" "$key" "$expected_raw" "$expected_label"
  label=$(active_element_label)
  raw=$(active_element_raw)
  if (( i + 1 == ${#STEPS[@]} )); then
    printf '    "%s => %s [%s]"\n' "$name" "$label" "$raw"
  else
    printf '    "%s => %s [%s]",\n' "$name" "$label" "$raw"
  fi
done

echo '  ],'
printf '  "finalActiveElementRaw": "%s",\n' "$(active_element_raw)"
printf '  "finalActiveElementLabel": "%s"\n' "$(active_element_label)"
echo '}'
echo 'studio-screenplay-shortcuts-smoke: ok'
