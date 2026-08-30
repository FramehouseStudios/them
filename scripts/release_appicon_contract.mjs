#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function fail(message) {
  console.error(message);
  process.exit(1);
}

function arg(name) {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
}

function inspectPng(file) {
  const data = fs.readFileSync(file);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (data.length < 33 || !data.subarray(0, 8).equals(signature)) fail("assigned AppIcon is not a valid PNG");

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = -1;
  let hasTransparencyChunk = false;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("ascii", offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > data.length) fail("assigned AppIcon PNG is truncated");
    if (type === "IHDR") {
      if (length !== 13) fail("assigned AppIcon PNG has an invalid IHDR chunk");
      width = data.readUInt32BE(offset + 8);
      height = data.readUInt32BE(offset + 12);
      colorType = data[offset + 17];
    }
    if (type === "tRNS") hasTransparencyChunk = true;
    offset = end;
    if (type === "IEND") break;
  }
  if (width !== 1024 || height !== 1024) fail(`assigned AppIcon must be 1024x1024 (got ${width}x${height})`);
  if (colorType === 4 || colorType === 6 || hasTransparencyChunk) fail("assigned AppIcon must be opaque (alpha/transparency found)");
}

function validateSource(catalog) {
  const manifestPath = path.join(catalog, "Contents.json");
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`could not parse AppIcon Contents.json: ${error.message}`);
  }
  const matches = (manifest.images || []).filter((image) =>
    image?.platform === "ios"
    && image?.idiom === "universal"
    && image?.size === "1024x1024"
    && !image?.appearances,
  );
  if (matches.length !== 1) fail("AppIcon must contain exactly one base universal iOS 1024x1024 slot");
  const filename = String(matches[0].filename || "");
  if (!filename || path.basename(filename) !== filename) fail("the base universal iOS AppIcon slot has no safe filename");
  const file = path.join(catalog, filename);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) fail(`assigned AppIcon image is missing or empty: ${filename}`);
  inspectPng(file);
  console.log(filename);
}

function validateBuiltApp(app) {
  if (!fs.existsSync(app) || !fs.statSync(app).isDirectory()) fail(`Release build succeeded but app bundle is missing: ${app}`);
  const info = path.join(app, "Info.plist");
  const assets = path.join(app, "Assets.car");
  if (!fs.existsSync(info)) fail("Release app bundle is missing Info.plist");
  if (!fs.existsSync(assets) || fs.statSync(assets).size === 0) fail("Release app bundle is missing a non-empty Assets.car");

  const iconResult = spawnSync("plutil", ["-extract", "CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconName", "raw", "-o", "-", info], { encoding: "utf8" });
  const iconName = String(iconResult.stdout || "").trim();
  if (iconResult.status !== 0 || iconName !== "AppIcon") fail(`Release Info.plist primary icon must be AppIcon (got ${iconName || "missing"})`);

  const assetResult = spawnSync("/usr/bin/assetutil", ["--info", assets], { encoding: "utf8" });
  if (assetResult.status !== 0) fail(`assetutil could not inspect compiled Assets.car: ${(assetResult.stderr || "unknown error").trim()}`);
  if (!/AppIcon/i.test(assetResult.stdout || "")) fail("compiled Assets.car does not contain an AppIcon rendition");
  console.log("AppIcon source, Info.plist metadata, and compiled rendition are present");
}

const catalog = arg("catalog");
const builtApp = arg("built-app");
if (catalog && !builtApp) validateSource(path.resolve(catalog));
else if (builtApp && !catalog) validateBuiltApp(path.resolve(builtApp));
else fail("pass exactly one of --catalog=PATH or --built-app=PATH");
