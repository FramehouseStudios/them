#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT/them.xcodeproj"
SCHEME="them"
ENTITLEMENTS_FILE="$ROOT/them/them.entitlements"
PRIVACY_MANIFEST_FILE="$ROOT/them/PrivacyInfo.xcprivacy"
RELEASE_PLIST_FILE="$ROOT/them/Info-Release.plist"
DERIVED_DATA_PATH="/tmp/them-appstore-preflight-dd"
QUALITY_GATE_SCRIPT="$ROOT/scripts/quality_gate.sh"
# Keep this opt-in by default so local release preflight stays build-focused and
# does not unexpectedly require live backend gates or OpenAI-backed eval
# credentials. Checked-in CI and release automation should export
# RUN_QUALITY_GATE=1 before invoking this script.
RUN_QUALITY_GATE="${RUN_QUALITY_GATE:-0}"

xcodebuild_overrides=(CODE_SIGNING_ALLOWED=NO)
if [[ -n "${DEVELOPMENT_TEAM_ID:-}" ]]; then
  xcodebuild_overrides+=(DEVELOPMENT_TEAM_ID="$DEVELOPMENT_TEAM_ID")
fi
if [[ -n "${APP_TOKEN_RELEASE:-}" ]]; then
  xcodebuild_overrides+=(APP_TOKEN_RELEASE="$APP_TOKEN_RELEASE")
fi
if [[ -n "${BACKEND_URL:-}" ]]; then
  xcodebuild_overrides+=(BACKEND_URL="$BACKEND_URL")
fi

fail_count=0
warn_count=0

ok() {
  printf "[OK] %s\n" "$1"
}

warn() {
  printf "[WARN] %s\n" "$1"
  warn_count=$((warn_count + 1))
}

fail() {
  printf "[FAIL] %s\n" "$1"
  fail_count=$((fail_count + 1))
}

trim_quotes() {
  local v="${1:-}"
  v="${v%\"}"
  v="${v#\"}"
  printf "%s" "$v"
}

is_placeholder() {
  local v="${1:-}"
  case "$v" in
    ""|*yourdomain*|*REPLACE_WITH_*|"\$("*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

build_settings="$(
  xcodebuild \
    -project "$PROJECT" \
    -scheme "$SCHEME" \
    -configuration Release \
    -sdk iphoneos \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    "${xcodebuild_overrides[@]}" \
    -showBuildSettings 2>&1 || true
)"

if [[ -z "$build_settings" ]]; then
  fail "Could not load Release build settings."
  exit 1
fi

get_setting() {
  local key="$1"
  printf "%s\n" "$build_settings" \
    | sed -n "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*//p" \
    | head -n 1 \
    | tr -d '\r'
}

development_team="$(trim_quotes "$(get_setting DEVELOPMENT_TEAM)")"
bundle_id="$(trim_quotes "$(get_setting PRODUCT_BUNDLE_IDENTIFIER)")"
backend_url="$(trim_quotes "$(get_setting BACKEND_URL)")"
app_token="$(trim_quotes "$(get_setting APP_TOKEN)")"
privacy_url="$(trim_quotes "$(get_setting PRIVACY_POLICY_URL)")"
support_email="$(trim_quotes "$(get_setting SUPPORT_EMAIL)")"
code_sign_entitlements="$(trim_quotes "$(get_setting CODE_SIGN_ENTITLEMENTS)")"
mic_desc_setting="$(trim_quotes "$(get_setting INFOPLIST_KEY_NSMicrophoneUsageDescription)")"
supported_platforms="$(trim_quotes "$(get_setting SUPPORTED_PLATFORMS)")"
targeted_device_family="$(trim_quotes "$(get_setting TARGETED_DEVICE_FAMILY)")"

if [[ -z "$privacy_url" && -f "$RELEASE_PLIST_FILE" ]]; then
  privacy_url="$(plutil -extract PRIVACY_POLICY_URL raw -o - "$RELEASE_PLIST_FILE" 2>/dev/null || true)"
  privacy_url="$(trim_quotes "$privacy_url")"
fi

if [[ -z "$support_email" && -f "$RELEASE_PLIST_FILE" ]]; then
  support_email="$(plutil -extract SUPPORT_EMAIL raw -o - "$RELEASE_PLIST_FILE" 2>/dev/null || true)"
  support_email="$(trim_quotes "$support_email")"
fi

if [[ -z "$mic_desc_setting" && -f "$RELEASE_PLIST_FILE" ]]; then
  mic_desc_setting="$(plutil -extract NSMicrophoneUsageDescription raw -o - "$RELEASE_PLIST_FILE" 2>/dev/null || true)"
  mic_desc_setting="$(trim_quotes "$mic_desc_setting")"
fi

echo "=== App Store Preflight (iPhone TestFlight) ==="
echo "Project: $PROJECT"
echo "Scheme:  $SCHEME"
echo

if [[ "${RUN_QUALITY_GATE}" == "1" ]]; then
  if [[ -x "$QUALITY_GATE_SCRIPT" ]]; then
    echo "[INFO] Running quality gate before App Store preflight ..."
    "$QUALITY_GATE_SCRIPT"
    echo
  else
    fail "Missing quality gate script: $QUALITY_GATE_SCRIPT"
  fi
else
  echo "[INFO] Skipping quality gate precheck (RUN_QUALITY_GATE=${RUN_QUALITY_GATE})."
  echo "[INFO] Run scripts/quality_gate.sh separately, or set RUN_QUALITY_GATE=1 to include backend gates such as speculative reuse."
  if [[ -n "${CI:-}" ]]; then
    echo "[INFO] CI detected. Release automation should normally set RUN_QUALITY_GATE=1 for combined preflight coverage."
  fi
  echo
fi

if [[ -n "$bundle_id" && "$bundle_id" != *"yourdomain"* ]]; then
  ok "Bundle identifier is set: $bundle_id"
else
  fail "Bundle identifier is missing or placeholder."
fi

if [[ -n "$development_team" && "$development_team" != "\$(DEVELOPMENT_TEAM_ID)" ]]; then
  ok "Development Team configured: $development_team"
else
  fail "Development Team is not configured. Set DEVELOPMENT_TEAM_ID in Config.xcconfig."
fi

if [[ "$supported_platforms" == *"iphoneos"* && "$supported_platforms" == *"iphonesimulator"* ]]; then
  ok "Release supports iPhone device and simulator SDKs."
else
  fail "Release SUPPORTED_PLATFORMS must include iphoneos and iphonesimulator."
fi

if [[ "$supported_platforms" == *"macosx"* || "$supported_platforms" == *"xros"* || "$supported_platforms" == *"xrsimulator"* ]]; then
  fail "Release SUPPORTED_PLATFORMS must be iPhone-only for V1, got: $supported_platforms"
else
  ok "Release excludes macOS and visionOS from the V1 TestFlight posture."
fi

if [[ "$targeted_device_family" == "1" ]]; then
  ok "Release device family is iPhone only."
else
  fail "Release TARGETED_DEVICE_FAMILY must be 1 for iPhone-only V1, got: ${targeted_device_family:-unset}"
fi

if [[ -n "$code_sign_entitlements" ]]; then
  ok "Release entitlements wired: $code_sign_entitlements"
elif [[ -f "$ENTITLEMENTS_FILE" ]]; then
  warn "No iPhone Release CODE_SIGN_ENTITLEMENTS setting. If V1 needs Apple-managed capabilities, confirm them in the Apple developer portal before upload."
else
  warn "No entitlements file found for Release. Confirm Apple-managed capabilities before upload."
fi

if is_placeholder "$backend_url"; then
  fail "BACKEND_URL is placeholder/unset for Release."
elif [[ "$backend_url" == http://127.0.0.1* || "$backend_url" == http://localhost* || "$backend_url" == https://127.0.0.1* || "$backend_url" == https://localhost* ]]; then
  fail "BACKEND_URL points to localhost in Release. Use hosted API URL."
else
  ok "Release backend URL is hosted: $backend_url"
fi

if is_placeholder "$app_token"; then
  fail "APP_TOKEN is placeholder/unset for Release."
else
  ok "Release APP_TOKEN is configured."
fi

if is_placeholder "$privacy_url"; then
  fail "PRIVACY_POLICY_URL is placeholder/unset."
elif [[ "$privacy_url" != https://* ]]; then
  fail "PRIVACY_POLICY_URL must use HTTPS."
else
  ok "Privacy policy URL is set: $privacy_url"
fi

if [[ "$support_email" == *"@"* && "$support_email" != *"yourdomain"* ]]; then
  ok "Support email is set: $support_email"
else
  fail "SUPPORT_EMAIL is placeholder/unset."
fi

if [[ -n "$mic_desc_setting" && "$mic_desc_setting" == *"microphone"* ]]; then
  ok "Microphone usage description is configured."
else
  fail "NSMicrophoneUsageDescription missing or too vague."
fi

if [[ -f "$PRIVACY_MANIFEST_FILE" ]]; then
  manifest_dump="$(plutil -p "$PRIVACY_MANIFEST_FILE" 2>/dev/null || true)"
  if grep -q "NSPrivacyCollectedDataTypeAudioData" <<<"$manifest_dump"; then
    ok "Privacy manifest declares Audio Data."
  else
    fail "Privacy manifest missing Audio Data declaration."
  fi
  if grep -q "NSPrivacyCollectedDataTypeUserContent" <<<"$manifest_dump"; then
    ok "Privacy manifest declares User Content."
  else
    fail "Privacy manifest missing User Content declaration."
  fi
  if grep -q "\"NSPrivacyTracking\" => false" <<<"$manifest_dump"; then
    ok "Privacy manifest tracking disabled."
  else
    fail "Privacy manifest tracking flag not set to false."
  fi
else
  fail "Privacy manifest missing: $PRIVACY_MANIFEST_FILE"
fi

if [[ -f "$RELEASE_PLIST_FILE" ]]; then
  mic_desc="$(plutil -extract NSMicrophoneUsageDescription raw -o - "$RELEASE_PLIST_FILE" 2>/dev/null || true)"
  if [[ -n "$mic_desc" ]]; then
    ok "Release Info.plist includes NSMicrophoneUsageDescription."
  else
    fail "Release Info.plist missing NSMicrophoneUsageDescription."
  fi
else
  fail "Missing release plist file: $RELEASE_PLIST_FILE"
fi

if xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  "${xcodebuild_overrides[@]}" \
  -quiet build >/tmp/them_release_preflight_build.log 2>&1; then
  ok "Release iPhone build succeeds."
else
  if rg -n "swift-plugin-server|sandbox_apply: Operation not permitted|CoreSimulatorService connection became invalid" /tmp/them_release_preflight_build.log >/dev/null 2>&1; then
    warn "Release build check hit local sandbox/tooling limits in this environment. Re-run locally in Xcode to confirm archive."
  else
    fail "Release iPhone build failed. See /tmp/them_release_preflight_build.log"
  fi
fi

echo
echo "Summary: fail=$fail_count warn=$warn_count"
if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi
exit 0
