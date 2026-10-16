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

echo "=== Voice Network-Fault Smokes ==="
echo "Project:            ${PROJECT}"
PROJECT="${PROJECT}" SCHEME="${IOS_SCHEME}" CONFIGURATION="${IOS_CONFIGURATION}" \
ONLY_TESTING="${TEST_IDENTIFIER}" bash "${ROOT}/scripts/run_v1_ui_smoke.sh" \
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
