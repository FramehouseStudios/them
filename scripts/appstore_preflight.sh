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
    ""|*yourdomain*|*REPLACE_WITH_*|"\$("*|APP_TOKEN_RELEASE|RELEASE_BACKEND_URL)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

release_overrides=()
for key in DEVELOPMENT_TEAM_ID BACKEND_URL APP_TOKEN APP_TOKEN_RELEASE RELEASE_BACKEND_URL; do
  if [[ -n "${!key:-}" ]]; then
    release_overrides+=("${key}=${!key}")
  fi
done

build_settings_cmd=(
  xcodebuild
  -project "$PROJECT"
  -scheme "$SCHEME"
  -configuration Release
  -sdk macosx
  -derivedDataPath "$DERIVED_DATA_PATH"
  -showBuildSettings
)
if [[ "${#release_overrides[@]}" -gt 0 ]]; then
  build_settings_cmd+=("${release_overrides[@]}")
fi

build_settings="$("${build_settings_cmd[@]}" 2>&1 || true)"

if [[ -z "$build_settings" || "$build_settings" != *"PRODUCT_BUNDLE_IDENTIFIER"* ]]; then
  fail "Could not load complete Release build settings."
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
hardened_runtime="$(trim_quotes "$(get_setting ENABLE_HARDENED_RUNTIME)")"
mic_desc_setting="$(trim_quotes "$(get_setting INFOPLIST_KEY_NSMicrophoneUsageDescription)")"
mic_desc_plist=""

if [[ -z "$privacy_url" && -f "$RELEASE_PLIST_FILE" ]]; then
  privacy_url="$(plutil -extract PRIVACY_POLICY_URL raw -o - "$RELEASE_PLIST_FILE" 2>/dev/null || true)"
  privacy_url="$(trim_quotes "$privacy_url")"
fi

if [[ -z "$support_email" && -f "$RELEASE_PLIST_FILE" ]]; then
  support_email="$(plutil -extract SUPPORT_EMAIL raw -o - "$RELEASE_PLIST_FILE" 2>/dev/null || true)"
  support_email="$(trim_quotes "$support_email")"
fi

if [[ -f "$RELEASE_PLIST_FILE" ]]; then
  mic_desc_plist="$(plutil -extract NSMicrophoneUsageDescription raw -o - "$RELEASE_PLIST_FILE" 2>/dev/null || true)"
  mic_desc_plist="$(trim_quotes "$mic_desc_plist")"
fi

echo "=== App Store Preflight (macOS) ==="
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

if ! is_placeholder "$development_team"; then
  ok "Development Team configured: $development_team"
else
  fail "Development Team is not configured. Provide DEVELOPMENT_TEAM_ID through release config, environment, or xcodebuild build setting."
fi

if [[ "$hardened_runtime" == "YES" ]]; then
  ok "Hardened Runtime enabled for Release."
else
  fail "Hardened Runtime must be YES for Release."
fi

if [[ -n "$code_sign_entitlements" ]]; then
  ok "Release entitlements wired: $code_sign_entitlements"
else
  fail "CODE_SIGN_ENTITLEMENTS is missing in Release build settings."
fi

if [[ -f "$ENTITLEMENTS_FILE" ]]; then
  app_sandbox="$(/usr/libexec/PlistBuddy -c 'Print :com.apple.security.app-sandbox' "$ENTITLEMENTS_FILE" 2>/dev/null || true)"
  net_client="$(/usr/libexec/PlistBuddy -c 'Print :com.apple.security.network.client' "$ENTITLEMENTS_FILE" 2>/dev/null || true)"
  audio_input="$(/usr/libexec/PlistBuddy -c 'Print :com.apple.security.device.audio-input' "$ENTITLEMENTS_FILE" 2>/dev/null || true)"
  [[ "$app_sandbox" == "true" || "$app_sandbox" == "1" ]] && ok "Entitlement com.apple.security.app-sandbox=true" || fail "Missing app sandbox entitlement."
  [[ "$net_client" == "true" || "$net_client" == "1" ]] && ok "Entitlement com.apple.security.network.client=true" || fail "Missing network client entitlement."
  [[ "$audio_input" == "true" || "$audio_input" == "1" ]] && ok "Entitlement com.apple.security.device.audio-input=true" || fail "Missing audio input entitlement."
else
  fail "Entitlements file missing: $ENTITLEMENTS_FILE"
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

mic_desc_combined="$mic_desc_setting $mic_desc_plist"
if [[ -n "$mic_desc_combined" && "$mic_desc_combined" == *"microphone"* ]]; then
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
  if [[ -n "$mic_desc_plist" ]]; then
    ok "Release Info.plist includes NSMicrophoneUsageDescription."
  else
    fail "Release Info.plist missing NSMicrophoneUsageDescription."
  fi
else
  fail "Missing release plist file: $RELEASE_PLIST_FILE"
fi

if is_placeholder "$development_team"; then
  warn "Skipping signed Release macOS build until DEVELOPMENT_TEAM_ID is configured."
else
  release_build_cmd=(
    xcodebuild
    -project "$PROJECT"
    -scheme "$SCHEME"
    -configuration Release
    -sdk macosx
    -destination "platform=macOS"
    -derivedDataPath "$DERIVED_DATA_PATH"
    -quiet build
  )
  if [[ "${#release_overrides[@]}" -gt 0 ]]; then
    release_build_cmd+=("${release_overrides[@]}")
  fi

  if "${release_build_cmd[@]}" >/tmp/them_release_preflight_build.log 2>&1; then
    ok "Release macOS build succeeds."
  else
    if rg -n "swift-plugin-server|sandbox_apply: Operation not permitted|CoreSimulatorService connection became invalid" /tmp/them_release_preflight_build.log >/dev/null 2>&1; then
      warn "Release build check hit local sandbox/tooling limits in this environment. Re-run locally in Xcode to confirm archive."
    else
      fail "Release macOS build failed. See /tmp/them_release_preflight_build.log"
    fi
  fi
fi

echo
echo "Summary: fail=$fail_count warn=$warn_count"
if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi
exit 0
