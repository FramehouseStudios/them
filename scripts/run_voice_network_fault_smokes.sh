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
ARTIFACT_DIR="${ARTIFACT_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/them-voice-network-fault-smokes}"
mkdir -p "${ARTIFACT_DIR}"
result_bundle_prefix="${ARTIFACT_DIR}/voice-network-fault-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$"

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

"${XCODEBUILD_BIN}" test \
  -project "${PROJECT}" \
  -scheme "${IOS_SCHEME}" \
  -configuration "${IOS_CONFIGURATION}" \
  -destination "${ios_destination}" \
  -only-testing:"${TEST_IDENTIFIER}" \
  -resultBundlePath "${result_bundle_prefix}-ios.xcresult"

"${XCODEBUILD_BIN}" build \
  -project "${PROJECT}" \
  -scheme "${MACOS_SCHEME}" \
  -configuration "${MACOS_CONFIGURATION}" \
  -destination "platform=macOS" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY=- \
  CODE_SIGN_ENTITLEMENTS= \
  ENABLE_APP_SANDBOX=NO \
  REGISTER_APP_GROUPS=NO

echo "[OK] iPhone voice network-fault smoke and macOS scaffold build pass."
