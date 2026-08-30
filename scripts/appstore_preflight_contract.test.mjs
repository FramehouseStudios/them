import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(repoRoot, file), "utf8");

test("[appstore-preflight] private xcconfig is ignored, excluded from every target, and bundle-forbidden", () => {
  const gitignore = read(".gitignore");
  const project = read("them.xcodeproj/project.pbxproj");
  const preflight = read("scripts/appstore_preflight.sh");
  assert.match(gitignore, /^them\/Release\.local\.xcconfig$/m);
  assert.match(project, /membershipExceptions = \([\s\S]*?"Release\.local\.xcconfig"/);
  const exclusions = [...project.matchAll(/EXCLUDED_SOURCE_FILE_NAMES = \(([\s\S]*?)\n\s*\);/g)];
  assert.equal(exclusions.length, 4);
  for (const exclusion of exclusions) assert.match(exclusion[1], /"Release\.local\.xcconfig"/);
  assert.match(preflight, /for forbidden_env in[^\n]*Release\.local\.xcconfig/);
});

test("[appstore-preflight] validates dedicated iOS Sign in with Apple entitlement semantics", () => {
  const preflight = read("scripts/appstore_preflight.sh");
  assert.match(preflight, /iPhone Release must use a dedicated iOS entitlement file/);
  assert.match(preflight, /plutil -lint/);
  assert.match(preflight, /Print :com\.apple\.developer\.applesignin:0/);
  assert.match(preflight, /== "Default"/);
});

test("[appstore-preflight] performs clean AppIcon source and compiled-product checks", () => {
  const preflight = read("scripts/appstore_preflight.sh");
  assert.match(preflight, /mktemp -d \/tmp\/them-appstore-preflight-dd\.XXXXXX/);
  assert.match(preflight, /release_appicon_contract\.mjs" --catalog=/);
  assert.match(preflight, /release_appicon_contract\.mjs" --built-app=/);
  assert.match(preflight, /fail "Release build succeeded but app bundle was not found/);
});

test("[release-secret-boundary] app token never enters xcodebuild argv", () => {
  const appstore = read("scripts/appstore_preflight.sh");
  const status = read("scripts/release_config_status.mjs");
  assert.doesNotMatch(appstore, /xcodebuild_overrides\+?=.*APP_TOKEN_RELEASE/);
  assert.doesNotMatch(status, /args\.push\(`APP_TOKEN_RELEASE=/);
  assert.match(status, /Never place APP_TOKEN_RELEASE in xcodebuild argv/);
});

test("[release-config-boundary] backend persists through the private include instead of a one-off build override", () => {
  const appstore = read("scripts/appstore_preflight.sh");
  const writer = read("scripts/write_release_xcconfig.mjs");
  const status = read("scripts/release_config_status.mjs");
  assert.doesNotMatch(appstore, /xcodebuild_overrides\+?=.*BACKEND_URL/);
  assert.doesNotMatch(status, /args\.push\(`BACKEND_URL=/);
  assert.match(writer, /`BACKEND_URL = \$\{backend\.replace\(":\/\/", ":\/\$\(\)\/"\)\}`/);
});

test("[release-workflow] one dependent iPhone lane uses immutable install and full wrapper", () => {
  const workflow = read(".github/workflows/release-preflight.yml");
  assert.match(workflow, /release-preflight:\n\s+name: Release Preflight\n\s+needs: live-structural-canary/);
  assert.match(workflow, /run: npm ci/);
  assert.match(workflow, /run: bash \.\/scripts\/run_release_preflight\.sh/);
  assert.match(workflow, /RUN_MAC_DESKTOP_PREFLIGHT: 0/);
});

test("[release-xcconfig] private include follows safe checked-in defaults", () => {
  const config = read("them/Config.xcconfig");
  assert.ok(config.indexOf("APP_TOKEN_RELEASE = REPLACE_WITH_PROD_APP_TOKEN") < config.indexOf('#include? "Release.local.xcconfig"'));
});
