#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-$ROOT/them.xcodeproj}"
SCHEME="${SCHEME:-them}"
CONFIGURATION="${CONFIGURATION:-Debug}"
ONLY_TESTING="${ONLY_TESTING:-themUITests}"

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

xcconfig_args=()
if [[ -n "${THEM_UITEST_RESTORE_XCCONFIG_PATH:-}" ]]; then
  xcconfig_args+=("-xcconfig" "${THEM_UITEST_RESTORE_XCCONFIG_PATH}")
fi

xcodebuild "${xcconfig_args[@]}" test \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration "$CONFIGURATION" \
  -destination "$destination" \
  "-only-testing:${ONLY_TESTING}" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  "$@"
