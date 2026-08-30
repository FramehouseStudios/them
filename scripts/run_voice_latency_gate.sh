#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="${PROJECT:-${ROOT}/them.xcodeproj}"
SCHEME="${SCHEME:-them}"
CONFIGURATION="${CONFIGURATION:-Debug}"
XCODEBUILD_BIN="${XCODEBUILD:-xcodebuild}"
NODE_BIN="${NODE_BIN:-node}"

if [[ -n "${IOS_SIMULATOR_DESTINATION:-}" ]]; then
  destination="${IOS_SIMULATOR_DESTINATION}"
elif [[ -n "${IOS_SIMULATOR_NAME:-}" ]]; then
  destination="platform=iOS Simulator,name=${IOS_SIMULATOR_NAME}"
else
  simulator_name="$(
    xcrun simctl list devices available \
      | sed -n 's/^[[:space:]]*\(iPhone[^()]*\) (.*/\1/p' \
      | head -n 1 \
      | sed 's/[[:space:]]*$//'
  )"
  if [[ -z "${simulator_name}" ]]; then
    echo "voice-latency-gate: no available iPhone simulator found." >&2
    echo "Set IOS_SIMULATOR_DESTINATION='platform=iOS Simulator,name=<device>' to override." >&2
    exit 2
  fi
  destination="platform=iOS Simulator,name=${simulator_name}"
fi

echo "=== Voice Latency Gate ==="
echo "Project:     ${PROJECT}"
echo "Destination: ${destination}"

"${NODE_BIN}" --test \
  "${ROOT}/backend/tests/realtime_bridge_simulator.test.mjs"

"${XCODEBUILD_BIN}" -quiet test \
  -project "${PROJECT}" \
  -scheme "${SCHEME}" \
  -configuration "${CONFIGURATION}" \
  -destination "${destination}" \
  -only-testing:themTests/ClementineLatencyTelemetryTests \
  -only-testing:themTests/ClementineRealtimeBridgeEventTests \
  -only-testing:themTests/StudioResponseStreamingTests \
  -only-testing:themTests/VoiceNetworkConditionSmokeTests \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO

echo "[OK] Voice latency SLO and network-condition smokes pass."
