#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-$ROOT/them.xcodeproj}"
SCHEME="${SCHEME:-them}"
CONFIGURATION="${CONFIGURATION:-Debug}"
ONLY_TESTING="${ONLY_TESTING:-themUITests}"
XCODEBUILD_BIN="${XCODEBUILD:-xcodebuild}"

if [[ -n "${IOS_SIMULATOR_DESTINATION:-}" ]]; then
  destination="$IOS_SIMULATOR_DESTINATION"
elif [[ -n "${IOS_SIMULATOR_NAME:-}" ]]; then
  destination="platform=iOS Simulator,name=${IOS_SIMULATOR_NAME}"
else
  simulator_name="$(
    xcrun simctl list devices available \
      | sed -n 's/^[[:space:]]*\(iPhone[^()]*\) (.*/\1/p' \
      | head -n 1 \
      | sed 's/[[:space:]]*$//'
  )"
  if [[ -z "$simulator_name" ]]; then
    echo "run-v1-ui-smoke: no available iPhone simulator found." >&2
    echo "Set IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,name=<device>' to override." >&2
    exit 2
  fi
  destination="platform=iOS Simulator,name=${simulator_name}"
fi

# Boot the simulator before xcodebuild so a cold boot on a fresh CI runner is
# not paid inside the first test's launch wait. Idempotent: an already-booted
# device is left alone. A name-based destination is resolved once and then
# pinned to that exact UDID so boot and test can never select different clones.
case "$destination" in
  *"name="*)
    boot_name="${destination##*name=}"
    boot_name="${boot_name%%,*}"
    boot_udid="$(
      xcrun simctl list devices available \
        | sed -n "s/^[[:space:]]*${boot_name} (\([0-9A-F-]*\)) (.*/\1/p" \
        | head -n 1
    )"
    if [[ -n "$boot_udid" ]]; then
      destination="platform=iOS Simulator,id=${boot_udid}"
      xcrun simctl boot "$boot_udid" >/dev/null 2>&1 || true
      if xcrun simctl bootstatus "$boot_udid" -b >/dev/null 2>&1; then
        echo "run-v1-ui-smoke: simulator ${boot_udid} booted"
      else
        echo "run-v1-ui-smoke: simulator ${boot_udid} boot status unknown; continuing" >&2
      fi
    fi
    ;;
esac

echo "run-v1-ui-smoke: destination=${destination}"
echo "run-v1-ui-smoke: only-testing=${ONLY_TESTING}"

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
  "$@"
)

# Keep Xcode's normal simulator "Sign to Run Locally" behavior. The V1 UI
# suite exercises remembered credentials in Apple Keychain, and an unsigned
# simulator app is not entitled to use that storage. Keep the stateful UI
# stories on one destination so relaunch assertions cannot race a test clone.
# Per-test execution time allowances turn a wedged simulator into a failed
# test in minutes instead of holding the job until the runner limit; the
# slowest single story (the integrated writer loop) measured ~324 s on a
# GitHub macos runner, so 900 s leaves headroom without masking a hang.
"${XCODEBUILD_BIN}" "${build_args[@]}"
