#!/usr/bin/env bash
set -euo pipefail

# Runs the iOS unit bundle (`themTests`) on an iPhone simulator. Required in
# the Quality Gate since 2026-09-06, ahead of the integrated writer loop, so a
# red unit run blocks a merge instead of hiding on main (five classes were red
# on main for days before #441/#452 because only UI stories were gated).
#
# Thin wrapper over run_v1_ui_smoke.sh so both iOS gate steps share one
# simulator-discovery, boot, and signing path (the unit host still needs the
# normal "Sign to Run Locally" signing; an unsigned host cannot use Keychain).
# Same overrides apply: IOS_SIMULATOR_DESTINATION, IOS_SIMULATOR_NAME, PROJECT,
# SCHEME, CONFIGURATION. Unit tests are sub-second, so the per-test allowance
# is tight: a wedged test fails in minutes instead of holding the runner.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export ONLY_TESTING="${ONLY_TESTING:-themTests}"
export UI_TEST_TIME_ALLOWANCE_SECONDS="${UI_TEST_TIME_ALLOWANCE_SECONDS:-120}"
export UI_TEST_MAX_TIME_ALLOWANCE_SECONDS="${UI_TEST_MAX_TIME_ALLOWANCE_SECONDS:-300}"

echo "run-ios-unit-tests: delegating to run_v1_ui_smoke.sh with only-testing=${ONLY_TESTING}"
exec bash "${ROOT}/scripts/run_v1_ui_smoke.sh" "$@"
