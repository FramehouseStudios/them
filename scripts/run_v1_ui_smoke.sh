#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-$ROOT/them.xcodeproj}"
SCHEME="${SCHEME:-them}"
CONFIGURATION="${CONFIGURATION:-Debug}"
ONLY_TESTING="${ONLY_TESTING:-themUITests}"
XCODEBUILD_BIN="${XCODEBUILD:-xcodebuild}"
XCRUN_BIN="${XCRUN:-xcrun}"
ARTIFACT_DIR="${ARTIFACT_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/them-v1-ui-smoke}"
mkdir -p "${ARTIFACT_DIR}"
result_bundle_path="${V1_UI_RESULT_BUNDLE_PATH:-${ARTIFACT_DIR}/v1-ui-smoke-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$.xcresult}"

# These invariants belong to this runner, not appended Xcode arguments.
# Otherwise a later destination/parallel option can bypass the exact-device
# guarantee after an unrelated simulator has already been erased.
for arg in "$@"; do
  case "$arg" in
    -destination|-destination=*|-parallel-testing-enabled|-parallel-testing-enabled=*|CODE_SIGNING_ALLOWED=NO|CODE_SIGNING_REQUIRED=NO)
      echo "run-v1-ui-smoke: destination, non-parallel testing and signing are owned by the clean-simulator runner; use IOS_SIMULATOR_DESTINATION to select a device." >&2
      exit 2
      ;;
  esac
done

if [[ -n "${IOS_SIMULATOR_DESTINATION:-}" ]]; then
  destination="$IOS_SIMULATOR_DESTINATION"
elif [[ -n "${IOS_SIMULATOR_NAME:-}" ]]; then
  destination="platform=iOS Simulator,name=${IOS_SIMULATOR_NAME}"
else
  if [[ "${CI:-}" != "true" ]]; then
    echo "run-v1-ui-smoke: select an explicit task-owned simulator with IOS_SIMULATOR_DESTINATION or IOS_SIMULATOR_NAME before erasing local state." >&2
    exit 2
  fi
  destination=""
fi

echo "run-v1-ui-smoke: destination=${destination}"
echo "run-v1-ui-smoke: only-testing=${ONLY_TESTING}"

# Always start each proof on a known simulator state. Previous installs can
# leave Keychain/UserDefaults state behind and turn a launch-time sync test into
# a state-dependent pass or a SwiftUI publishing loop. Resolve the exact device
# selected for xcodebuild, erase it, then boot it before tests begin.
if [[ -n "$destination" && "$destination" != *"platform=iOS Simulator"* ]]; then
  echo "run-v1-ui-smoke: destination must be an iOS Simulator so it can be erased safely: ${destination}" >&2
  exit 2
fi

if [[ -n "$destination" && "$destination" != *"id="* && "$destination" != *"name="* ]]; then
  echo "run-v1-ui-smoke: cannot resolve the simulator UDID; use a destination with name= or id= so the proof can erase its device." >&2
  exit 2
fi

destination="$("$XCRUN_BIN" simctl list devices available --json \
  | node "${ROOT}/scripts/resolve_ios_simulator.mjs" "$destination" "${CI:-}")"
simulator_udid="${destination##*id=}"
simulator_udid="${simulator_udid%%,*}"
echo "run-v1-ui-smoke: resolved destination=${destination}"

"$XCRUN_BIN" simctl shutdown "$simulator_udid" >/dev/null 2>&1 || true
"$XCRUN_BIN" simctl erase "$simulator_udid"
"$XCRUN_BIN" simctl boot "$simulator_udid" >/dev/null 2>&1 || true
if "$XCRUN_BIN" simctl bootstatus "$simulator_udid" -b >/dev/null 2>&1; then
  echo "run-v1-ui-smoke: erased and booted simulator ${simulator_udid}"
else
  echo "run-v1-ui-smoke: simulator ${simulator_udid} did not finish booting; refusing an unproven state." >&2
  exit 2
fi

build_args=()
if [[ -n "${THEM_UITEST_RESTORE_XCCONFIG_PATH:-}" ]]; then
  build_args+=("-xcconfig" "${THEM_UITEST_RESTORE_XCCONFIG_PATH}")
fi

build_args+=(
  test
  -project "$PROJECT"
  -scheme "$SCHEME"
  -configuration "$CONFIGURATION"
  -destination "$destination"
  "-only-testing:${ONLY_TESTING}"
  -parallel-testing-enabled NO
  -maximum-concurrent-test-simulator-destinations 1
  -test-timeouts-enabled YES
  -default-test-execution-time-allowance "${UI_TEST_TIME_ALLOWANCE_SECONDS:-900}"
  -maximum-test-execution-time-allowance "${UI_TEST_MAX_TIME_ALLOWANCE_SECONDS:-1500}"
)

# Callers that orchestrate a named UI scenario may supply their own result
# bundle path. Preserve that path and add the per-run default only when absent.
caller_has_result_bundle=0
for arg in "$@"; do
  case "$arg" in
    -resultBundlePath|-resultBundlePath=*) caller_has_result_bundle=1 ;;
  esac
done
if [[ "$caller_has_result_bundle" == 0 ]]; then
  build_args+=(-resultBundlePath "$result_bundle_path")
fi
build_args+=("$@")

# Keep Xcode's normal simulator "Sign to Run Locally" behavior. The V1 UI
# suite exercises remembered credentials in Apple Keychain, and an unsigned
# simulator app is not entitled to use that storage. Keep the stateful UI
# stories on one destination so relaunch assertions cannot race a test clone.
# Per-test execution time allowances turn a wedged simulator into a failed
# test in minutes instead of holding the job until the runner limit; the
# slowest single story (the integrated writer loop) measured ~324 s on a
# GitHub macos runner, so 900 s leaves headroom without masking a hang.
"${XCODEBUILD_BIN}" "${build_args[@]}"
