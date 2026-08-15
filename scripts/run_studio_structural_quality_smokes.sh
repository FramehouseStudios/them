#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-${ROOT}/them.xcodeproj}"
IOS_SCHEME="${IOS_SCHEME:-them}"
IOS_CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
MACOS_SCHEME="${MACOS_SCHEME:-them-macOS-scaffold}"
MACOS_CONFIGURATION="${MACOS_CONFIGURATION:-Mac Scaffold Debug}"
XCODEBUILD_BIN="${XCODEBUILD:-xcodebuild}"
TEST_IDENTIFIER="${STRUCTURAL_QUALITY_TEST_IDENTIFIER:-themUITests/V1SmokeUITests/test_structural_repair_is_canon_aware_for_typed_and_voice_studio_turns}"

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
    echo "studio-structural-quality-smokes: no available iPhone simulator found." >&2
    echo "Set IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,name=<device>' to override." >&2
    exit 2
  fi
  ios_destination="platform=iOS Simulator,name=${simulator_name}"
fi

echo "=== Studio Structural-Quality Smokes ==="
echo "Project:            ${PROJECT}"
echo "iPhone destination: ${ios_destination}"
echo "macOS destination:  platform=macOS"

"${XCODEBUILD_BIN}" -quiet test \
  -project "${PROJECT}" \
  -scheme "${IOS_SCHEME}" \
  -configuration "${IOS_CONFIGURATION}" \
  -destination "${ios_destination}" \
  -only-testing:"${TEST_IDENTIFIER}" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO

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

echo "[OK] iPhone and macOS typed/voice structural repair smokes pass."
