import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const script = path.join(repoRoot, "scripts/desktop_preflight.sh");

test('[release-backend] public default precedes private configuration and stays outside Debug', () => {
  const release = fs.readFileSync(path.join(repoRoot, 'them/Release.xcconfig'), 'utf8');
  const shared = fs.readFileSync(path.join(repoRoot, 'them/Config.xcconfig'), 'utf8');
  const project = fs.readFileSync(path.join(repoRoot, 'them.xcodeproj/project.pbxproj'), 'utf8');
  assert.match(release, /BACKEND_URL = https:\/\$\(\)\/them-backend\.onrender\.com/);
  assert.ok(release.indexOf('BACKEND_URL =') < release.indexOf('#include "Config.xcconfig"'));
  assert.match(shared, /#include\? "Release\.local\.xcconfig"/);
  assert.equal((project.match(/baseConfigurationReference = .*\/\* Release\.xcconfig \*\//g) || []).length, 2);
  assert.match(project, /BACKEND_URL = "http:\/\/localhost:3000"/);
  assert.doesNotMatch(project, /BACKEND_URL = "https:\/\/api\.them\.io"/);
  assert.match(project, /membershipExceptions = \([\s\S]*?"Release\.xcconfig"/);
});

test("[desktop-preflight] keeps the shared scheme archiveable with a production Mac configuration", () => {
  const scheme = fs.readFileSync(
    path.join(repoRoot, "them.xcodeproj/xcshareddata/xcschemes/them-macOS-scaffold.xcscheme"),
    "utf8",
  );
  const project = fs.readFileSync(
    path.join(repoRoot, "them.xcodeproj/project.pbxproj"),
    "utf8",
  );

  assert.match(scheme, /buildForArchiving = "YES"/);
  assert.match(scheme, /<ProfileAction\s+buildConfiguration = "Mac Scaffold Release"/);
  assert.match(scheme, /<ArchiveAction\s+buildConfiguration = "Mac Scaffold Release"/);

  const releaseBlocks = project.match(
    /\/\* Mac Scaffold Release \*\/ = \{[\s\S]*?name = "Mac Scaffold Release";\n\s*\};/g,
  );
  assert.equal(releaseBlocks?.length, 2, "expected project and app release configurations");
  assert.ok(releaseBlocks.some((block) => block.includes('SWIFT_ACTIVE_COMPILATION_CONDITIONS = "THEM_MAC_SHELL $(inherited)"')));
  assert.ok(releaseBlocks.some((block) => block.includes("SUPPORTED_PLATFORMS = macosx")));
  assert.ok(releaseBlocks.some((block) => block.includes('/* Release.xcconfig */')));
  assert.ok(releaseBlocks.every((block) => !block.includes('BACKEND_URL =')));
  assert.ok(releaseBlocks.some((block) => block.includes('INFOPLIST_FILE = "them/Info-Release.plist"')));
  assert.ok(releaseBlocks.some((block) => block.includes('INFOPLIST_KEY_LSApplicationCategoryType = "public.app-category.productivity"')));
  assert.ok(releaseBlocks.every((block) => block.includes("THEM_MAC_SHELL = YES")));
});

test("[desktop-preflight] invokes the active Mac desktop scaffold build", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-desktop-preflight-"));
  const log = path.join(tmp, "xcodebuild.args");
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  fs.writeFileSync(fakeXcodebuild, [
    "#!/usr/bin/env bash",
    "printf '%s\\n' \"$@\" > \"$XCODEBUILD_ARGS_LOG\"",
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcodebuild, 0o755);

  const r = spawnSync("bash", [script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      XCODEBUILD: fakeXcodebuild,
      XCODEBUILD_ARGS_LOG: log,
      MAC_DESKTOP_DERIVED_DATA_PATH: path.join(tmp, "dd"),
    },
    encoding: "utf8",
  });

  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Mac Desktop Preflight/);
  assert.match(r.stdout, /Mac desktop scaffold build succeeds/);

  const args = fs.readFileSync(log, "utf8").split("\n").filter(Boolean);
  assert.ok(args.includes("build"));
  assert.ok(args.includes("-project"));
  assert.ok(args.includes(path.join(repoRoot, "them.xcodeproj")));
  assert.ok(args.includes("-scheme"));
  assert.ok(args.includes("them-macOS-scaffold"));
  assert.ok(args.includes("-configuration"));
  assert.ok(args.includes("Mac Scaffold Debug"));
  assert.ok(args.includes("-destination"));
  assert.ok(args.includes("platform=macOS"));
  assert.ok(args.includes("CODE_SIGNING_ALLOWED=NO"));
  assert.ok(args.includes("CODE_SIGNING_REQUIRED=NO"));
});

test("[desktop-preflight] archives the production Mac configuration when requested", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-desktop-archive-preflight-"));
  const log = path.join(tmp, "xcodebuild.args");
  const fakeXcodebuild = path.join(tmp, "xcodebuild");
  const archivePath = path.join(tmp, "them.xcarchive");
  fs.writeFileSync(fakeXcodebuild, [
    "#!/usr/bin/env bash",
    "printf '%s\\n' \"$@\" > \"$XCODEBUILD_ARGS_LOG\"",
    "exit 0",
    "",
  ].join("\n"));
  fs.chmodSync(fakeXcodebuild, 0o755);

  const r = spawnSync("bash", [script], {
    cwd: repoRoot,
    env: {
      ...process.env,
      XCODEBUILD: fakeXcodebuild,
      XCODEBUILD_ARGS_LOG: log,
      MAC_DESKTOP_ACTION: "archive",
      MAC_DESKTOP_CONFIGURATION: "Mac Scaffold Release",
      MAC_DESKTOP_ARCHIVE_PATH: archivePath,
      MAC_DESKTOP_DERIVED_DATA_PATH: path.join(tmp, "dd"),
    },
    encoding: "utf8",
  });

  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Action:\s+archive/);
  assert.match(r.stdout, /Mac desktop scaffold archive succeeds/);

  const args = fs.readFileSync(log, "utf8").split("\n").filter(Boolean);
  assert.ok(args.includes("archive"));
  assert.ok(args.includes("Mac Scaffold Release"));
  assert.ok(args.includes("generic/platform=macOS"));
  assert.ok(args.includes("-archivePath"));
  assert.ok(args.includes(archivePath));
  assert.ok(args.includes("CODE_SIGN_ENTITLEMENTS="));
  assert.ok(args.includes("ENABLE_APP_SANDBOX=NO"));
  assert.ok(args.includes("REGISTER_APP_GROUPS=NO"));
});
