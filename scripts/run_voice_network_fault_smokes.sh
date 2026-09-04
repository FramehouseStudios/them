#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-${ROOT}/them.xcodeproj}"
IOS_SCHEME="${IOS_SCHEME:-them}"
IOS_CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
MACOS_SCHEME="${MACOS_SCHEME:-them-macOS-scaffold}"
MACOS_CONFIGURATION="${MACOS_CONFIGURATION:-Mac Scaffold Debug}"
XCODEBUILD_BIN="${XCODEBUILD:-xcodebuild}"
TEST_IDENTIFIER="${NETWORK_FAULT_TEST_IDENTIFIER:-themUITests/V1SmokeUITests/test_realtime_network_faults_resolve_exactly_once}"

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
    echo "voice-network-fault-smokes: no available iPhone simulator found." >&2
    echo "Set IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,name=<device>' to override." >&2
    exit 2
  fi
  ios_destination="platform=iOS Simulator,name=${simulator_name}"
fi

echo "=== Voice Network-Fault Smokes ==="
echo "Project:            ${PROJECT}"
echo "iPhone destination: ${ios_destination}"
echo "macOS destination:  platform=macOS"

"${XCODEBUILD_BIN}" -quiet test \
  -project "${PROJECT}" \
  -scheme "${IOS_SCHEME}" \
  -configuration "${IOS_CONFIGURATION}" \
  -destination "${ios_destination}" \
  -only-testing:"${TEST_IDENTIFIER}" \
  -parallel-testing-enabled NO \
  -maximum-concurrent-test-simulator-destinations 1

# Keep Xcode's normal simulator "Sign to Run Locally" behavior. Even this
# focused UI test launches through the shared V1 helper, whose state reset
# clears Keychain credentials and must run with the app's simulator entitlement.

"${XCODEBUILD_BIN}" -quiet test \
  -project "${PROJECT}" \
  -scheme "${MACOS_SCHEME}" \
  -configuration "${MACOS_CONFIGURATION}" \
  -destination "platform=macOS" \
  -only-testing:"${TEST_IDENTIFIER}" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY=- \
  CODE_SIGN_ENTITLEMENTS= \
  ENABLE_APP_SANDBOX=NO \
  REGISTER_APP_GROUPS=NO

echo "[OK] iPhone and macOS speech/transcription/thinking/playback fault smokes pass."
