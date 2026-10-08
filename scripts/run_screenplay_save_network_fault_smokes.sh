#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-${ROOT}/them.xcodeproj}"
IOS_SCHEME="${IOS_SCHEME:-them}"
IOS_CONFIGURATION="${IOS_CONFIGURATION:-Debug}"
MACOS_SCHEME="${MACOS_SCHEME:-them-macOS-scaffold}"
MACOS_CONFIGURATION="${MACOS_CONFIGURATION:-Mac Scaffold Debug}"
XCODEBUILD_BIN="${XCODEBUILD:-xcodebuild}"
XCRUN_BIN="${XCRUN:-xcrun}"
INCLUDE_MACOS="${SCREENPLAY_SAVE_INCLUDE_MACOS:-1}"
ARTIFACT_DIR="${ARTIFACT_DIR:-${RUNNER_TEMP:-${TMPDIR:-/tmp}}/them-screenplay-save-network-fault-smokes}"
if [[ "${INCLUDE_MACOS}" != "0" && "${INCLUDE_MACOS}" != "1" ]]; then
  echo "screenplay-save-network-fault-smokes: SCREENPLAY_SAVE_INCLUDE_MACOS must be 0 or 1." >&2
  exit 2
fi
mkdir -p "${ARTIFACT_DIR}"
result_bundle_path="${SCREENPLAY_SAVE_RESULT_BUNDLE_PATH:-${ARTIFACT_DIR}/screenplay-save-network-fault-${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}-$$.xcresult}"
if [[ -n "${SCREENPLAY_SAVE_TEST_IDENTIFIER:-}" ]]; then
  test_identifiers=("${SCREENPLAY_SAVE_TEST_IDENTIFIER}")
else
  test_identifiers=(
    "themUITests/V1SmokeUITests/test_screenplay_save_outbox_survives_relaunch_and_reconnects_once"
    "themUITests/V1SmokeUITests/test_screenplay_save_outbox_refreshes_auth_and_resolves_stale_conflict_once"
    "themUITests/V1SmokeUITests/test_screenplay_delete_all_survives_offline_relaunch_and_saves_once"
  )
fi

if [[ -n "${IOS_SIMULATOR_DESTINATION:-}" ]]; then
  ios_destination="${IOS_SIMULATOR_DESTINATION}"
elif [[ -n "${IOS_SIMULATOR_NAME:-}" ]]; then
  ios_destination="platform=iOS Simulator,name=${IOS_SIMULATOR_NAME}"
else
  simulator_name="$(
    "${XCRUN_BIN}" simctl list devices available \
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

if [[ "${ios_destination}" == *"id="* ]]; then
  simulator_udid="${ios_destination##*id=}"
  simulator_udid="${simulator_udid%%,*}"
elif [[ "${ios_destination}" == *"name="* ]]; then
  simulator_name="${ios_destination##*name=}"
  simulator_name="${simulator_name%%,*}"
  simulator_udid="$(
    "${XCRUN_BIN}" simctl list devices available \
      | sed -n "s/^[[:space:]]*${simulator_name} (\\([0-9A-F-]*\\)) (.*/\\1/p" \
      | head -n 1
  )"
else
  echo "screenplay-save-network-fault-smokes: cannot resolve an erasable iPhone simulator from ${ios_destination}." >&2
  exit 2
fi

if [[ -z "${simulator_udid}" ]]; then
  echo "screenplay-save-network-fault-smokes: could not resolve an erasable iPhone simulator from ${ios_destination}." >&2
  exit 2
fi

"${XCRUN_BIN}" simctl shutdown "${simulator_udid}" >/dev/null 2>&1 || true
"${XCRUN_BIN}" simctl erase "${simulator_udid}"
"${XCRUN_BIN}" simctl boot "${simulator_udid}" >/dev/null 2>&1 || true
if ! "${XCRUN_BIN}" simctl bootstatus "${simulator_udid}" -b >/dev/null 2>&1; then
  echo "screenplay-save-network-fault-smokes: simulator ${simulator_udid} did not finish booting." >&2
  exit 2
fi

only_testing_args=()
for test_identifier in "${test_identifiers[@]}"; do
  only_testing_args+=("-only-testing:${test_identifier}")
done

echo "=== Screenplay Save Network-Fault Smokes ==="
echo "Project:            ${PROJECT}"
echo "iPhone destination: ${ios_destination}"
if [[ "${INCLUDE_MACOS}" == "1" ]]; then
  echo "macOS destination:  platform=macOS"
fi

ios_build_args=()
if [[ -n "${THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH:-}" ]]; then
  ios_build_args+=("-xcconfig" "${THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH}")
fi
ios_build_args+=(
  test
  -project "${PROJECT}"
  -scheme "${IOS_SCHEME}"
  -configuration "${IOS_CONFIGURATION}"
  -destination "${ios_destination}"
  "${only_testing_args[@]}"
  -parallel-testing-enabled NO
  -test-timeouts-enabled YES
  -default-test-execution-time-allowance 900
  -maximum-test-execution-time-allowance 1500
  -resultBundlePath "${result_bundle_path}"
)

macos_build_args=()
if [[ -n "${THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH:-}" ]]; then
  macos_build_args+=("-xcconfig" "${THEM_UITEST_SCREENPLAY_SAVE_XCCONFIG_PATH}")
fi
macos_build_args+=(
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
if [[ "${INCLUDE_MACOS}" == "1" ]]; then
  "${XCODEBUILD_BIN}" "${macos_build_args[@]}"
fi

if [[ "${INCLUDE_MACOS}" == "1" ]]; then
  echo "[OK] iPhone and macOS queued screenplay saves recover exactly once across reconnect, expired auth, and stale-version resolution."
else
  echo "[OK] Signed iPhone queued screenplay saves recover exactly once across reconnect, expired auth, and stale-version resolution."
fi
