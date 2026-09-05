import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const qualityGate = readFileSync(new URL("../.github/workflows/quality-gate.yml", import.meta.url), "utf8");
const migrationsCheck = readFileSync(new URL("../.github/workflows/migrations-check.yml", import.meta.url), "utf8");
const autoMerge = readFileSync(new URL("../.github/workflows/auto-merge-tier1.yml", import.meta.url), "utf8");
const project = readFileSync(new URL("../them.xcodeproj/project.pbxproj", import.meta.url), "utf8");

function projectObjectIDs(source) {
  // Objects are defined at two-tab indentation; deeper TargetAttributes IDs are references.
  return [...source.matchAll(/^\t\t([A-F0-9]{24})(?: \/\*[^\n]*?\*\/)? = \{/gm)].map((match) => match[1]);
}

test("[ci-merge-safety] Xcode project object definitions have unique IDs", () => {
  const ids = projectObjectIDs(project);
  assert.ok(ids.length > 20, "must inspect the project objects, not an empty match");
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, [], "duplicate project IDs can silently pass plutil but break Xcode");
});

test("[ci-merge-safety] project ID check catches a configuration colliding with a sources phase", () => {
  const fixture = '\t\tA1B2C30E2F50000100AAA001 /* Sources */ = {isa = PBXSourcesBuildPhase; };\n'
    + '\t\tA1B2C30E2F50000100AAA001 /* Mac Scaffold Debug */ = {\n\t\t\tisa = XCBuildConfiguration;\n\t\t};\n';
  const ids = projectObjectIDs(fixture);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 1);
});

test("[ci-merge-safety] quality gate runs on pull requests with secret-backed gates disabled", () => {
  assert.match(qualityGate, /^\s+pull_request:\n\s+types: \[opened, synchronize, reopened, ready_for_review\]/m);
  assert.match(qualityGate, /RUN_EVAL: \$\{\{ github\.event_name == 'pull_request' && '0'/);
  assert.match(qualityGate, /RUN_CANON: \$\{\{ github\.event_name == 'pull_request' && '1'/);
  assert.match(qualityGate, /RUN_SPECULATIVE_REUSE_GATE: \$\{\{ github\.event_name == 'pull_request' && '0'/);
  assert.match(qualityGate, /RUN_SMOKE: \$\{\{ github\.event_name == 'pull_request' && '0'/);
  assert.match(qualityGate, /RUN_TALK_RECOVERY_GATE: \$\{\{ github\.event_name == 'pull_request' && '0'/);
  assert.match(qualityGate, /RUN_ALERT: \$\{\{ github\.event_name == 'pull_request' && '0'/);
});

test("[ci-merge-safety] complete backend tests gate pull requests and main pushes without provider secrets", () => {
  assert.match(qualityGate, /^\s+push:\n\s+branches:\n\s+- main/m);
  const backendJob = qualityGate.match(/\n  backend-tests:\n[\s\S]*?\n  quality-gate:/)?.[0] || "";
  assert.match(backendJob, /name: Backend tests/);
  assert.match(backendJob, /working-directory: backend\n\s+run: npm ci/);
  assert.match(backendJob, /working-directory: backend\n\s+run: npm test/);
  assert.doesNotMatch(backendJob, /OPENAI_API_KEY|APP_TOKEN|secrets\./);
});

test("[ci-merge-safety] deterministic signed iOS and Swift UI smokes fail the quality-gate job", () => {
  const v1UISmokeStep = qualityGate.match(
    /- name: Run signed iOS V1 UI smoke tests[\s\S]*?run: scripts\/run_v1_ui_smoke\.sh/,
  )?.[0] || "";
  const networkFaultStep = qualityGate.match(
    /- name: Run signed iPhone and macOS voice network-fault smokes[\s\S]*?run: scripts\/run_voice_network_fault_smokes\.sh/,
  )?.[0] || "";

  assert.notEqual(v1UISmokeStep, "", "signed V1 UI smoke step is missing");
  assert.notEqual(networkFaultStep, "", "signed voice network-fault step is missing");
  assert.doesNotMatch(v1UISmokeStep, /continue-on-error/);
  assert.doesNotMatch(networkFaultStep, /continue-on-error/);
  assert.match(qualityGate, /iOS V1 UI smoke: enforced \(signed themUITests; no provider secret\)/);
  assert.match(qualityGate, /Voice network faults: enforced \(signed iPhone \+ macOS fixture smokes\)/);
});

test("[ci-merge-safety] persistence changes exercise the migration workflow on PRs and main", () => {
  assert.match(migrationsCheck, /^\s+pull_request:\n\s+paths:/m);
  assert.match(migrationsCheck, /^\s+push:\n\s+branches:\n\s+- main\n\s+paths:/m);
  assert.match(migrationsCheck, /backend\/lib\/persistence_postgres\.js/);
  assert.match(migrationsCheck, /backend\/tests\/persistence_adapter\.test\.mjs/);
  assert.match(migrationsCheck, /backend\/tests\/persistence_postgres_live\.test\.mjs/);
  assert.match(migrationsCheck, /working-directory: backend\n\s+run: npm ci/);
  assert.match(migrationsCheck, /node --test backend\/tests\/persistence_postgres_live\.test\.mjs/);
});

test("[ci-merge-safety] required quality gate enforces signed iOS units and native macOS exports", () => {
  const iosStep = qualityGate.match(/      - name: Run complete signed iOS unit test bundle \(required\)[\s\S]*?(?=\n      - name:)/)?.[0] || "";
  const macStep = qualityGate.match(/      - name: Run signed macOS local export unit tests \(required\)[\s\S]*?(?=\n      - name:)/)?.[0] || "";
  assert.match(iosStep, /ONLY_TESTING: themTests\n/);
  assert.match(iosStep, /run: scripts\/run_v1_ui_smoke\.sh/);
  assert.match(macStep, /-scheme them-macOS-scaffold/);
  assert.match(macStep, /-configuration 'Mac Scaffold Debug'/);
  assert.match(macStep, /-destination 'platform=macOS'/);
  assert.match(macStep, /-only-testing:themTests\/ScreenplayLocalExportTests/);
  assert.match(macStep, /-only-testing:themTests\/ScreenplayPrintMacRenderingTests/);
  for (const step of [iosStep, macStep]) {
    assert.match(step, /CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=YES/);
    assert.match(step, /-resultBundlePath/);
    assert.doesNotMatch(step, /continue-on-error|\n\s+if:|CODE_SIGNING_ALLOWED=NO|CODE_SIGNING_REQUIRED=NO/);
  }

  const scheme = readFileSync(new URL("../them.xcodeproj/xcshareddata/xcschemes/them-macOS-scaffold.xcscheme", import.meta.url), "utf8");
  const testables = scheme.match(/<Testables>[\s\S]*?<\/Testables>/)?.[0] || "";
  assert.match(testables, /skipped = "NO"[\s\S]*?BlueprintName = "themTests"/);
  const macConfig = project.match(/C2A86109E4D84776BFC117A5 \/\* Mac Scaffold Debug \*\/ = \{[\s\S]*?name = "Mac Scaffold Debug";/)?.[0] || "";
  assert.match(macConfig, /SUPPORTED_PLATFORMS = macosx;/);
  assert.match(macConfig, /TEST_HOST = "\$\(BUILT_PRODUCTS_DIR\)\/them\.app\/Contents\/MacOS\/them";/);
  const unitConfigs = project.match(/Build configuration list for PBXNativeTarget "themTests" \*\/ = \{[\s\S]*?defaultConfigurationIsVisible/)?.[0] || "";
  assert.match(unitConfigs, /C2A86109E4D84776BFC117A5 \/\* Mac Scaffold Debug \*\//);
});

test("[ci-merge-safety] writer-loop failures retain their diagnostic result bundle", () => {
  const runner = readFileSync(new URL("../backend/evals/run_studio_ios_writer_loop_contract_smoke.mjs", import.meta.url), "utf8");
  assert.match(runner, /Writer-loop diagnostic result retained at/);
  assert.doesNotMatch(runner, /(?:rmSync|unlinkSync)\(RESULT_BUNDLE_PATH/);
  assert.match(runner, /unlinkSync\(XCCONFIG_PATH\)/, "temporary launch configuration still gets cleaned up");
  assert.match(qualityGate, /\/tmp\/io-them-studio-ios-writer-loop-\*\.xcresult/);
});

test("[ci-merge-safety] auto-merge refuses risky release/auth/privacy paths", () => {
  const requiredFragments = [
    "^\\.github/",
    "(^|/)Dockerfile$",
    "^backend/render\\.yaml$",
    "\\.entitlements$",
    "PrivacyInfo\\.xcprivacy$",
    "^backend/config\\.js$",
    "^backend/migrations/",
    "quality_gate",
    "pre_flight",
    "Release\\.local\\.env$",
    "\\.env",
    "user_auth",
    "auth_routes",
    "account_routes",
    "account_lifecycle_store",
    "memory_route_auth",
    "screenplay_route_auth",
    "memory-export-delete-decision-packet",
  ];

  assert.match(autoMerge, /risky_path_re=/);
  for (const fragment of requiredFragments) {
    assert.ok(
      autoMerge.includes(fragment),
      `auto-merge risky path deny list is missing ${fragment}`,
    );
  }
  assert.match(autoMerge, /touches risky path\(s\); refusing agent auto-merge/);
});

test("[ci-merge-safety] auto-merge requires trusted project approval", () => {
  assert.match(autoMerge, /approved_via_review=/);
  assert.match(autoMerge, /OWNER.*MEMBER.*COLLABORATOR/);
  assert.ok(autoMerge.includes('^(Codex|Project) supervisor update: approved'));
  assert.match(autoMerge, /There is no quiet-time\s+# fallback/);
  assert.match(autoMerge, /for forbidden in tier-2 tier-3 needs-human do-not-merge block-merge/);
});
