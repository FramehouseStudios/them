#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-${ROOT}/them.xcodeproj}"
IOS_SCHEME="${IOS_SCHEME:-them}"
IOS_CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
MACOS_SCHEME="${MACOS_SCHEME:-them-macOS-scaffold}"
MACOS_CONFIGURATION="${MACOS_CONFIGURATION:-Mac Scaffold Debug}"
XCODEBUILD_BIN="${XCODEBUILD:-xcodebuild}"
INCLUDE_MACOS="${SCREENPLAY_SAVE_INCLUDE_MACOS:-1}"
if [[ "${INCLUDE_MACOS}" != "0" && "${INCLUDE_MACOS}" != "1" ]]; then
  echo "screenplay-save-network-fault-smokes: SCREENPLAY_SAVE_INCLUDE_MACOS must be 0 or 1." >&2
  exit 2
fi
ARTIFACT_DIR="${ARTIFACT_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/them-screenplay-save-network-fault-smokes}"
mkdir -p "${ARTIFACT_DIR}"
result_bundle_path="${SCREENPLAY_SAVE_RESULT_BUNDLE_PATH:-${V1_UI_RESULT_BUNDLE_PATH:-${ARTIFACT_DIR}/screenplay-save-network-fault-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$.xcresult}}"
if [[ -n "${SCREENPLAY_SAVE_TEST_IDENTIFIER:-}" ]]; then
  test_identifiers=("${SCREENPLAY_SAVE_TEST_IDENTIFIER}")
else
  test_identifiers=(
    "themUITests/V1SmokeUITests/test_screenplay_save_outbox_survives_relaunch_and_reconnects_once"
    "themUITests/V1SmokeUITests/test_screenplay_save_outbox_refreshes_auth_and_resolves_stale_conflict_once"
  )
fi

only_testing_args=()
for test_identifier in "${test_identifiers[@]}"; do
  only_testing_args+=("-only-testing:${test_identifier}")
done

echo "=== Screenplay Save Network-Fault Smokes ==="
echo "Project:            ${PROJECT}"
echo "iPhone destination: resolved by the canonical clean-simulator runner"
echo "macOS destination:  platform=macOS"

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

macos_build_args+=(-resultBundlePath "${result_bundle_path%.xcresult}-macos.xcresult")

ios_runner_args=(-quiet)
for ((index = 1; index < ${#test_identifiers[@]}; index++)); do
  ios_runner_args+=("-only-testing:${test_identifiers[index]}")
done
PROJECT="${PROJECT}" SCHEME="${IOS_SCHEME}" CONFIGURATION="${IOS_CONFIGURATION}" \
  XCODEBUILD="${XCODEBUILD_BIN}" ONLY_TESTING="${test_identifiers[0]}" \
  V1_UI_RESULT_BUNDLE_PATH="${result_bundle_path}" \
  THEM_UITEST_RESTORE_XCCONFIG_PATH="${THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH:-}" \
  bash "${ROOT}/scripts/run_v1_ui_smoke.sh" "${ios_runner_args[@]}"
if [[ "${INCLUDE_MACOS}" == "1" ]]; then
  "${XCODEBUILD_BIN}" "${macos_build_args[@]}"
fi

if [[ "${INCLUDE_MACOS}" == "1" ]]; then
echo "[OK] iPhone and macOS queued screenplay saves recover exactly once across reconnect, expired auth, and stale-version resolution."
else
echo "[OK] Signed iPhone queued screenplay saves recover exactly once across reconnect, expired auth, and stale-version resolution."
fi
