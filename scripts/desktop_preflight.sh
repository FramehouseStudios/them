#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${ROOT}/them.xcodeproj"
SCHEME="${MAC_DESKTOP_SCHEME:-them-macOS-scaffold}"
CONFIGURATION="${MAC_DESKTOP_CONFIGURATION:-Mac Scaffold Debug}"
ACTION="${MAC_DESKTOP_ACTION:-build}"
DERIVED_DATA_PATH="${MAC_DESKTOP_DERIVED_DATA_PATH:-/tmp/them-macos-desktop-preflight-dd}"
ARCHIVE_PATH="${MAC_DESKTOP_ARCHIVE_PATH:-/tmp/them-macos-desktop-preflight.xcarchive}"
XCODEBUILD_BIN="${XCODEBUILD:-xcodebuild}"

case "${ACTION}" in
  build)
    DESTINATION="${MAC_DESKTOP_DESTINATION:-platform=macOS}"
    ;;
  archive)
    DESTINATION="${MAC_DESKTOP_DESTINATION:-generic/platform=macOS}"
    ;;
  *)
    echo "[FAIL] Unsupported MAC_DESKTOP_ACTION: ${ACTION} (expected build or archive)." >&2
    exit 2
    ;;
esac

echo "=== Mac Desktop Preflight ==="
echo "Project:       ${PROJECT}"
echo "Scheme:        ${SCHEME}"
echo "Configuration: ${CONFIGURATION}"
echo "Action:        ${ACTION}"
if [[ "${ACTION}" == "archive" ]]; then
  echo "Archive:       ${ARCHIVE_PATH}"
fi
echo

XCODEBUILD_ARGS=(
  "${ACTION}"
  -project "${PROJECT}"
  -scheme "${SCHEME}"
  -configuration "${CONFIGURATION}"
  -destination "${DESTINATION}"
  -derivedDataPath "${DERIVED_DATA_PATH}"
  CODE_SIGNING_ALLOWED=NO
  CODE_SIGNING_REQUIRED=NO
  CODE_SIGN_ENTITLEMENTS=
  ENABLE_APP_SANDBOX=NO
  REGISTER_APP_GROUPS=NO
)

if [[ "${ACTION}" == "archive" ]]; then
  XCODEBUILD_ARGS+=(
    -archivePath "${ARCHIVE_PATH}"
  )
fi

"${XCODEBUILD_BIN}" "${XCODEBUILD_ARGS[@]}"

echo
echo "[OK] Mac desktop scaffold ${ACTION} succeeds."
