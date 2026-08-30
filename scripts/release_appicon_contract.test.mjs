import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(repoRoot, "scripts", "release_appicon_contract.mjs");
const sourceIcon = path.join(repoRoot, "them", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-1024.png");

function makeCatalog(images, mutatePng) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "io-them-appicon-"));
  fs.writeFileSync(path.join(directory, "Contents.json"), JSON.stringify({ images, info: { author: "xcode", version: 1 } }));
  const png = fs.readFileSync(sourceIcon);
  if (mutatePng) mutatePng(png);
  fs.writeFileSync(path.join(directory, "Icon.png"), png);
  return directory;
}

function run(catalog) {
  return spawnSync(process.execPath, [script, `--catalog=${catalog}`], { cwd: repoRoot, encoding: "utf8" });
}

const base = { filename: "Icon.png", idiom: "universal", platform: "ios", size: "1024x1024" };

test("[release-appicon] selects the base iOS slot independent of ordering", () => {
  const directory = makeCatalog([
    { idiom: "mac", scale: "1x", size: "16x16" },
    { ...base, appearances: [{ appearance: "luminosity", value: "dark" }], filename: undefined },
    base,
  ]);
  try {
    const result = run(directory);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "Icon.png");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("[release-appicon] rejects a missing assigned base slot", () => {
  const directory = makeCatalog([{ idiom: "mac", scale: "1x", size: "16x16" }]);
  try {
    const result = run(directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /exactly one base universal iOS/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("[release-appicon] rejects alpha-bearing PNG input", () => {
  const directory = makeCatalog([base], (png) => { png[25] = 6; });
  try {
    const result = run(directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be opaque/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
