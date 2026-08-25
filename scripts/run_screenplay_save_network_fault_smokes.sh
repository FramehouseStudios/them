#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-${ROOT}/them.xcodeproj}"
IOS_SCHEME="${IOS_SCHEME:-them}"
IOS_CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
MACOS_SCHEME="${MACOS_SCHEME:-them-macOS-scaffold}"
MACOS_CONFIGURATION="${MACOS_CONFIGURATION:-Mac Scaffold Debug}"
XCODEBUILD_BIN="${XCODEBUILD:-xcodebuild}"
if [[ -n "${SCREENPLAY_SAVE_TEST_IDENTIFIER:-}" ]]; then
  test_identifiers=("${SCREENPLAY_SAVE_TEST_IDENTIFIER}")
else
  test_identifiers=(
    "themUITests/V1SmokeUITests/test_screenplay_save_outbox_survives_relaunch_and_reconnects_once"
    "themUITests/V1SmokeUITests/test_screenplay_save_outbox_refreshes_auth_and_resolves_stale_conflict_once"
  )
fi

if [[ -n "${IOS_SIMULATOR_DESTINATION:-}" ]]; then
  ios_destination="${IOS_SIMULATOR_DESTINATION}"
elif [[ -n "${IOS_SIMULATOR_NAME:-}" ]]; then
  ios_destination="platform=iOS Simulator,name=${IOS_SIMULATOR_NAME}"
else
  simulator_name="$(
    xcrun simctl list devices available \
      | sed -n 's/^[[:space:]]*\(iPhone[^()]*\) (.*/\1/p' \
      | head -n 1 \
      | sed 's/[[:space:]]*$//'
  )"
  if [[ -z "${simulator_name}" ]]; then
    echo "screenplay-save-network-fault-smokes: no available iPhone simulator found." >&2
    echo "Set IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,name=<device>' to override." >&2
    exit 2
  fi
  ios_destination="platform=iOS Simulator,name=${simulator_name}"
fi

only_testing_args=()
for test_identifier in "${test_identifiers[@]}"; do
  only_testing_args+=("-only-testing:${test_identifier}")
done

echo "=== Screenplay Save Network-Fault Smokes ==="
echo "Project:            ${PROJECT}"
echo "iPhone destination: ${ios_destination}"
echo "macOS destination:  platform=macOS"

ios_build_args=()
if [[ -n "${THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH:-}" ]]; then
  ios_build_args+=("-xcconfig" "${THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH}")
fi
ios_build_args+=(
  -quiet
  test
  -project "${PROJECT}"
  -scheme "${IOS_SCHEME}"
  -configuration "${IOS_CONFIGURATION}"
  -destination "${ios_destination}"
  "${only_testing_args[@]}"
  CODE_SIGNING_ALLOWED=NO
  CODE_SIGNING_REQUIRED=NO
)

macos_build_args=()
if [[ -n "${THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH:-}" ]]; then
  macos_build_args+=("-xcconfig" "${THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH}")
fi
macos_build_args+=(
  -quiet
  test
  -project "${PROJECT}"
  -scheme "${MACOS_SCHEME}"
  -configuration "${MACOS_CONFIGURATION}"
  -destination "platform=macOS"
  "${only_testing_args[@]}"
  CODE_SIGN_STYLE=Manual
  CODE_SIGN_IDENTITY=-
  CODE_SIGN_ENTITLEMENTS=
  ENABLE_APP_SANDBOX=NO
  REGISTER_APP_GROUPS=NO
)

"${XCODEBUILD_BIN}" "${ios_build_args[@]}"
"${XCODEBUILD_BIN}" "${macos_build_args[@]}"

echo "[OK] iPhone and macOS queued screenplay saves recover exactly once across reconnect, expired auth, and stale-version resolution."
