#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-$ROOT/them.xcodeproj}"
SCHEME="${SCHEME:-them}"
CONFIGURATION="${CONFIGURATION:-Debug}"
ONLY_TESTING="${ONLY_TESTING:-themUITests}"
SKIP_TESTING="${SKIP_TESTING:-}"
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

echo "run-v1-ui-smoke: destination=${destination}"
echo "run-v1-ui-smoke: only-testing=${ONLY_TESTING}"
if [[ -n "$SKIP_TESTING" ]]; then
  echo "run-v1-ui-smoke: skip-testing=${SKIP_TESTING}"
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
)
if [[ -n "$SKIP_TESTING" ]]; then
  build_args+=("-skip-testing:${SKIP_TESTING}")
fi
build_args+=(
  -parallel-testing-enabled NO
  -maximum-concurrent-test-simulator-destinations 1
  "$@"
)

# Keep Xcode's normal simulator "Sign to Run Locally" behavior. The V1 UI
# suite exercises remembered credentials in Apple Keychain, and an unsigned
# simulator app is not entitled to use that storage. Keep the stateful UI
# stories on one destination so relaunch assertions cannot race a test clone.
"${XCODEBUILD_BIN}" "${build_args[@]}"
