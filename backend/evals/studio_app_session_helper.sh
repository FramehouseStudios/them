#!/bin/bash

set -e

APP_PATH=""
APP_EXECUTABLE=""
PROCESS_NAME="them"
LAUNCH_ARGS=()
REQUIRE_STUDIO_EVAL_SESSION=0
CLEANUP_ONLY=0
APP_LAUNCH_ENV_KEYS=(
  APP_TOKEN
  BACKEND_BASE_URL
  BACKEND_URL
  BACKEND_FALLBACK_URL
  THEM_UITEST_BACKEND_BASE_URL
  THEM_UITEST_APP_TOKEN
  THEM_UITEST_USER_ID
  THEM_UITEST_CLIENT_TOKEN
  THEM_UITEST_CLIENT_TOKEN_BASE_URL
  THEM_UITEST_CLIENT_TOKEN_EXPIRY
  THEM_UITEST_CLIENT_TOKEN_CACHED_AT
  THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN
  THEM_UITEST_AUTH_DEBUG_ACCESS_TOKEN_ENABLED
  THEM_UITEST_AUTH_DEBUG_REFRESH_TOKEN
  THEM_UITEST_AUTH_SIGNED_IN
  THEM_UITEST_STUDIO_FULL_THREAD_STATE_JSON
  THEM_UITEST_STUDIO_ASK_NOTE_HISTORY_JSON
  THEM_UITEST_STUDIO_DIFF_ACKNOWLEDGED_JSON
  THEM_UITEST_STUDIO_DIFF_ACKNOWLEDGED_WRITEIDS_JSON
  THEM_UITEST_STUDIO_APPLIED_MEMORY_JSON
)
TIMEOUT_SECONDS="${STUDIO_APP_SESSION_HELPER_TIMEOUT_SECONDS:-20}"
POLL_MILLIS="${STUDIO_APP_SESSION_HELPER_POLL_MILLIS:-250}"
POLL_SECONDS="$(awk "BEGIN { printf \"%.3f\", ${POLL_MILLIS}/1000 }")"
LAST_STAGE="not_started"
STALE_PIDS=()
PRELAUNCH_PIDS=()
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
    --launch-arg)
      LAUNCH_ARGS+=("${2:-}")
      shift 2
      ;;
    --cleanup-only)
      CLEANUP_ONLY=1
      shift
      ;;
    *)
      shift
      ;;
  esac
done

for LAUNCH_ARG in "${LAUNCH_ARGS[@]}"; do
  if [[ "$LAUNCH_ARG" == "--studio-eval" ]]; then
    REQUIRE_STUDIO_EVAL_SESSION=1
    break
  fi
done

if [[ -z "$APP_PATH" && "$CLEANUP_ONLY" -ne 1 ]]; then
  ERROR_MESSAGE="Missing --app-path"
  LAST_STAGE="arg_validation_failed"
fi

if [[ "$CLEANUP_ONLY" -eq 1 && "$REQUIRE_STUDIO_EVAL_SESSION" -ne 1 ]]; then
  ERROR_MESSAGE="--cleanup-only requires --launch-arg --studio-eval"
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

pid_matches_app_executable() {
  local candidate_pid="$1"
  local candidate_command
  candidate_command="$(ps -p "$candidate_pid" -o command= 2>/dev/null || true)"
  [[ -n "$candidate_command" ]] || return 1
  [[ "$candidate_command" == "$APP_EXECUTABLE" || "$candidate_command" == "$APP_EXECUTABLE "* ]]
}

pid_matches_requested_session() {
  local candidate_pid="$1"
  local candidate_command
  pid_matches_app_executable "$candidate_pid" || return 1
  if [[ "$REQUIRE_STUDIO_EVAL_SESSION" -eq 0 ]]; then
    return 0
  fi
  candidate_command="$(ps -p "$candidate_pid" -o command= 2>/dev/null || true)"
  [[ "$candidate_command" == *" --studio-eval" || "$candidate_command" == *" --studio-eval "* ]]
}

pid_matches_marked_studio_eval_process() {
  local candidate_pid="$1"
  local candidate_command candidate_executable candidate_basename
  candidate_command="$(ps -p "$candidate_pid" -o command= 2>/dev/null || true)"
  [[ -n "$candidate_command" ]] || return 1
  candidate_executable="$(ps -p "$candidate_pid" -o comm= 2>/dev/null || true)"
  [[ -n "$candidate_executable" ]] || return 1
  candidate_basename="${candidate_executable##*/}"
  [[ "$candidate_basename" == "$PROCESS_NAME" ]] || return 1
  [[ "$candidate_command" == *" --studio-eval" || "$candidate_command" == *" --studio-eval "* ]]
}

pid_matches_teardown_scope() {
  local candidate_pid="$1"
  if [[ "$REQUIRE_STUDIO_EVAL_SESSION" -eq 1 ]]; then
    pid_matches_marked_studio_eval_process "$candidate_pid"
    return
  fi
  pid_matches_requested_session "$candidate_pid"
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

      appExePattern = "/" proc ".app/Contents/MacOS/" proc "([[:space:]]|$)"
      if (base == proc || cmd ~ appExePattern) {
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
    if [[ -n "$value" ]] && pid_matches_requested_session "$value"; then
      CURRENT_PIDS+=("$value")
    fi
  done < <(read_pid_array)
}

refresh_teardown_pids() {
  CURRENT_PIDS=()
  local value
  while IFS= read -r value; do
    if [[ -n "$value" ]] && pid_matches_teardown_scope "$value"; then
      CURRENT_PIDS+=("$value")
    fi
  done < <(read_pid_array)
}

pid_not_in_launch_baseline() {
  local candidate="$1"
  local baseline_pid
  for baseline_pid in "${STALE_PIDS[@]}" "${PRELAUNCH_PIDS[@]}"; do
    if [[ "$baseline_pid" == "$candidate" ]]; then
      return 1
    fi
  done
  return 0
}

wait_until_stale_processes_exit() {
  local deadline=$((SECONDS + TIMEOUT_SECONDS))
  local pid
  while (( SECONDS <= deadline )); do
    local found=0
    for pid in "${STALE_PIDS[@]}"; do
      if pid_matches_teardown_scope "$pid"; then
        found=1
        break
      fi
    done
    if [[ "$found" -eq 0 ]]; then
      return 0
    fi
    sleep "$POLL_SECONDS"
  done
  for pid in "${STALE_PIDS[@]}"; do
    if pid_matches_teardown_scope "$pid"; then
      return 1
    fi
  done
  return 0
}

wait_for_fresh_pid() {
  local deadline=$((SECONDS + TIMEOUT_SECONDS))
  local pid
  while (( SECONDS <= deadline )); do
    refresh_current_pids
    RELAUNCHED_PIDS=()
    for pid in "${CURRENT_PIDS[@]}"; do
      if pid_not_in_launch_baseline "$pid"; then
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
    if pid_not_in_launch_baseline "$pid"; then
      RELAUNCHED_PIDS+=("$pid")
    fi
  done
  return 1
}

if [[ -z "$ERROR_MESSAGE" && "$CLEANUP_ONLY" -ne 1 ]]; then
  APP_EXECUTABLE="$(resolve_app_executable || true)"
  if [[ -z "$APP_EXECUTABLE" ]]; then
    LAST_STAGE="launch_failed"
    ERROR_MESSAGE="Could not resolve executable for app path"
  else
    RESOLVED_APP_PATH="$(realpath "$APP_PATH" 2>/dev/null || true)"
    RESOLVED_APP_EXECUTABLE="$(realpath "$APP_EXECUTABLE" 2>/dev/null || true)"
    [[ -n "$RESOLVED_APP_PATH" ]] && APP_PATH="$RESOLVED_APP_PATH"
    [[ -n "$RESOLVED_APP_EXECUTABLE" ]] && APP_EXECUTABLE="$RESOLVED_APP_EXECUTABLE"
  fi
fi

refresh_teardown_pids
STALE_PIDS=("${CURRENT_PIDS[@]}")
if [[ ${#STALE_PIDS[@]} -gt 0 ]]; then
  HAD_EXISTING_SESSION=1
fi

if [[ -z "$ERROR_MESSAGE" ]]; then
  if [[ ${#STALE_PIDS[@]} -gt 0 ]]; then
    LAST_STAGE="term_kill_sent"
    pid=""
    for pid in "${STALE_PIDS[@]}"; do
      if pid_matches_teardown_scope "$pid"; then
        kill "$pid" >/dev/null 2>&1 || true
      fi
    done
    if ! wait_until_stale_processes_exit; then
      LAST_STAGE="force_kill_sent"
      for pid in "${STALE_PIDS[@]}"; do
        if pid_matches_teardown_scope "$pid"; then
          kill -9 "$pid" >/dev/null 2>&1 || true
        fi
      done
      if ! wait_until_stale_processes_exit; then
        LAST_STAGE="teardown_failed"
        ERROR_MESSAGE="Timed out waiting for forced THEM processes to clear"
      fi
    fi
  fi
fi

if [[ "$CLEANUP_ONLY" -eq 1 ]]; then
  if [[ -n "$ERROR_MESSAGE" ]]; then
    emit_result 0
    exit 1
  fi
  LAST_STAGE="done"
  SESSION_MODE="cleanup_only"
  emit_result 1
  exit 0
fi

if [[ -z "$ERROR_MESSAGE" ]]; then
  LAST_STAGE="launch_requested"
  refresh_current_pids
  PRELAUNCH_PIDS=("${CURRENT_PIDS[@]}")
  OPEN_ARGS=(-na "$APP_PATH")
  for ENV_KEY in "${APP_LAUNCH_ENV_KEYS[@]}"; do
    ENV_VALUE="${!ENV_KEY-}"
    if [[ -n "$ENV_VALUE" ]]; then
      OPEN_ARGS+=(--env "${ENV_KEY}=${ENV_VALUE}")
    fi
  done
  if [[ ${#LAUNCH_ARGS[@]} -gt 0 ]]; then
    OPEN_ARGS+=(--args "${LAUNCH_ARGS[@]}")
  fi
  if ! open "${OPEN_ARGS[@]}" >/tmp/them_studio_app_session.out 2>/tmp/them_studio_app_session.err; then
    LAST_STAGE="launch_failed"
    ERROR_MESSAGE="LaunchServices could not open the requested app path"
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
