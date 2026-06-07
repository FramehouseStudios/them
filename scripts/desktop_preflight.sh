#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${ROOT}/them.xcodeproj"
SCHEME="${MAC_DESKTOP_SCHEME:-them-macOS-scaffold}"
CONFIGURATION="${MAC_DESKTOP_CONFIGURATION:-Mac Scaffold Debug}"
DERIVED_DATA_PATH="${MAC_DESKTOP_DERIVED_DATA_PATH:-/tmp/them-macos-desktop-preflight-dd}"
XCODEBUILD_BIN="${XCODEBUILD:-xcodebuild}"

echo "=== Mac Desktop Preflight ==="
echo "Project:       ${PROJECT}"
echo "Scheme:        ${SCHEME}"
echo "Configuration: ${CONFIGURATION}"
echo

"${XCODEBUILD_BIN}" \
  build \
  -project "${PROJECT}" \
  -scheme "${SCHEME}" \
  -configuration "${CONFIGURATION}" \
  -destination "platform=macOS" \
  -derivedDataPath "${DERIVED_DATA_PATH}" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO

echo
echo "[OK] Mac desktop scaffold build succeeds."
