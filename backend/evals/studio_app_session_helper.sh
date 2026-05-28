#!/bin/bash

set -e

APP_PATH=""
PROCESS_NAME="them"
TIMEOUT_SECONDS="${STUDIO_APP_SESSION_HELPER_TIMEOUT_SECONDS:-20}"
POLL_MILLIS="${STUDIO_APP_SESSION_HELPER_POLL_MILLIS:-250}"
POLL_SECONDS="$(awk "BEGIN { printf \"%.3f\", ${POLL_MILLIS}/1000 }")"
LAST_STAGE="not_started"
STALE_PIDS=()
RELAUNCHED_PIDS=()
CURRENT_PIDS=()
FRESH_PID=0
REUSED_EXISTING_SESSION=0
HAD_EXISTING_SESSION=0
SESSION_MODE="fresh_relaunch"
ERROR_MESSAGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-path)
      APP_PATH="${2:-}"
      shift 2
      ;;
    --process-name)
      PROCESS_NAME="${2:-them}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -z "$APP_PATH" ]]; then
  ERROR_MESSAGE="Missing --app-path"
  LAST_STAGE="arg_validation_failed"
fi

resolve_app_executable() {
  local clean_path="${APP_PATH%/}"
  local bundled_executable="${clean_path}/Contents/MacOS/${PROCESS_NAME}"
  if [[ -x "$bundled_executable" ]]; then
    printf '%s' "$bundled_executable"
    return 0
  fi
  if [[ -x "$clean_path" ]]; then
    printf '%s' "$clean_path"
    return 0
  fi
  return 1
}

current_pids() {
  {
    pgrep -x "$PROCESS_NAME" 2>/dev/null || true

    # Some environments return an incomplete list from pgrep (or fail to query
    # sysmond) even when duplicate app instances are running. Merge pgrep with
    # ps and System Events discovery so relaunch teardown remains deterministic.
    ps -Ao pid=,command= 2>/dev/null | awk -v proc="$PROCESS_NAME" '
    {
      pid = $1
      $1 = ""
      cmd = $0
      sub(/^ +/, "", cmd)

      split(cmd, parts, /[[:space:]]+/)
      exe = parts[1]
      base = exe
      sub(/^.*\//, "", base)

      appExePattern = "/" proc ".app/Contents/MacOS/" proc "$"
      if (base == proc || exe ~ appExePattern) {
        print pid
      }
    }
    ' || true

    osascript \
      -e 'try' \
      -e "tell application \"System Events\" to get unix id of every process whose name is \"$PROCESS_NAME\"" \
      -e 'on error' \
      -e 'return ""' \
      -e 'end try' 2>/dev/null | tr ',' '\n' | tr -d ' ' || true
  } | awk 'NF && $1 ~ /^[0-9]+$/ { print $1 }' | sort -u
}

read_pid_array() {
  local raw
  raw="$(current_pids)"
  if [[ -z "$raw" ]]; then
    return 0
  fi
  while IFS= read -r line; do
    [[ -n "$line" ]] && printf '%s\n' "$line"
  done <<< "$raw"
}

join_array() {
  local joined=""
  local first=1
  for value in "$@"; do
    if [[ $first -eq 1 ]]; then
      joined="$value"
      first=0
    else
      joined="${joined},${value}"
    fi
  done
  printf '%s' "$joined"
}

emit_result() {
  local ok_flag="${1:-0}"
  echo "OK=${ok_flag}"
  echo "STALE_PIDS=$(join_array "${STALE_PIDS[@]}")"
  echo "RELAUNCHED_PIDS=$(join_array "${RELAUNCHED_PIDS[@]}")"
  echo "REUSED_EXISTING_SESSION=${REUSED_EXISTING_SESSION}"
  echo "HAD_EXISTING_SESSION=${HAD_EXISTING_SESSION}"
  echo "LAST_TEARDOWN_STAGE=${LAST_STAGE}"
  echo "FRESH_PID=${FRESH_PID}"
  echo "SESSION_MODE=${SESSION_MODE}"
  echo "ERROR_MESSAGE=${ERROR_MESSAGE}"
}

refresh_current_pids() {
  CURRENT_PIDS=()
  local value
  while IFS= read -r value; do
    [[ -n "$value" ]] && CURRENT_PIDS+=("$value")
  done < <(read_pid_array)
}

pid_not_in_stale() {
  local candidate="$1"
  local stale
  for stale in "${STALE_PIDS[@]}"; do
    if [[ "$stale" == "$candidate" ]]; then
      return 1
    fi
  done
  return 0
}

maybe_kill_debugserver_parent() {
  local child_pid="$1"
  local parent_pid
  local parent_command
  parent_pid="$(ps -p "$child_pid" -o ppid= 2>/dev/null | tr -d ' ' || true)"
  if [[ -z "$parent_pid" || "$parent_pid" == "0" ]]; then
    return 0
  fi
  parent_command="$(ps -p "$parent_pid" -o command= 2>/dev/null || true)"
  if [[ "$parent_command" == *"debugserver"* ]]; then
    LAST_STAGE="debugserver_kill_sent"
    kill -9 "$parent_pid" >/dev/null 2>&1 || true
  fi
}

wait_until_no_processes() {
  local deadline=$((SECONDS + TIMEOUT_SECONDS))
  while (( SECONDS <= deadline )); do
    refresh_current_pids
    if [[ ${#CURRENT_PIDS[@]} -eq 0 ]]; then
      return 0
    fi
    sleep "$POLL_SECONDS"
  done
  refresh_current_pids
  return 1
}

wait_for_fresh_pid() {
  local deadline=$((SECONDS + TIMEOUT_SECONDS))
  local pid
  while (( SECONDS <= deadline )); do
    refresh_current_pids
    RELAUNCHED_PIDS=()
    for pid in "${CURRENT_PIDS[@]}"; do
      if pid_not_in_stale "$pid"; then
        RELAUNCHED_PIDS+=("$pid")
      fi
    done
    if [[ ${#RELAUNCHED_PIDS[@]} -gt 0 ]]; then
      FRESH_PID="${RELAUNCHED_PIDS[0]}"
      return 0
    fi
    sleep "$POLL_SECONDS"
  done
  refresh_current_pids
  RELAUNCHED_PIDS=()
  for pid in "${CURRENT_PIDS[@]}"; do
    if pid_not_in_stale "$pid"; then
      RELAUNCHED_PIDS+=("$pid")
    fi
  done
  return 1
}

refresh_current_pids
STALE_PIDS=("${CURRENT_PIDS[@]}")
if [[ ${#STALE_PIDS[@]} -gt 0 ]]; then
  HAD_EXISTING_SESSION=1
fi

if [[ -z "$ERROR_MESSAGE" ]]; then
  if [[ ${#STALE_PIDS[@]} -gt 0 ]]; then
    LAST_STAGE="quit_requested"
    osascript -e 'try' -e 'tell application "them" to quit' -e 'end try' >/dev/null 2>&1 || true
    if ! wait_until_no_processes; then
      LAST_STAGE="term_kill_sent"
      pid=""
      for pid in "${STALE_PIDS[@]}"; do
        kill "$pid" >/dev/null 2>&1 || true
      done
      if ! wait_until_no_processes; then
        LAST_STAGE="force_kill_sent"
        for pid in "${STALE_PIDS[@]}"; do
          kill -9 "$pid" >/dev/null 2>&1 || true
          maybe_kill_debugserver_parent "$pid"
        done
        if ! wait_until_no_processes; then
          LAST_STAGE="teardown_failed"
          ERROR_MESSAGE="Timed out waiting for forced THEM processes to clear"
        fi
      fi
    fi
  fi
fi

if [[ -z "$ERROR_MESSAGE" ]]; then
  LAST_STAGE="launch_requested"
  APP_EXECUTABLE="$(resolve_app_executable || true)"
  if [[ -z "$APP_EXECUTABLE" ]]; then
    LAST_STAGE="launch_failed"
    ERROR_MESSAGE="Could not resolve executable for app path"
  fi
fi

if [[ -z "$ERROR_MESSAGE" ]]; then
  nohup "$APP_EXECUTABLE" >/tmp/them_studio_app_session.out 2>/tmp/them_studio_app_session.err &
  FRESH_PID="$!"
  disown "$FRESH_PID" >/dev/null 2>&1 || true
  if [[ -z "$FRESH_PID" || "$FRESH_PID" == "0" ]]; then
    LAST_STAGE="launch_failed"
    ERROR_MESSAGE="direct executable launch failed for app path"
  fi
fi

if [[ -z "$ERROR_MESSAGE" ]]; then
  if ! wait_for_fresh_pid; then
    LAST_STAGE="fresh_pid_wait_failed"
    ERROR_MESSAGE="Timed out waiting for a fresh THEM PID after relaunch"
  else
    LAST_STAGE="fresh_pid_observed"
  fi
fi

if [[ -n "$ERROR_MESSAGE" ]]; then
  emit_result 0
  exit 1
fi

LAST_STAGE="done"
emit_result 1
exit 0
