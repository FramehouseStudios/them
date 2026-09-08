import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(backendRoot, "..");
const runtimeVersion = fs.readFileSync(path.join(backendRoot, ".node-version"), "utf8").trim();

test("[runtime-version] Node 24 LTS is the single configured backend runtime", () => {
  assert.match(runtimeVersion, /^24\.\d+\.\d+$/);

  const packageJson = JSON.parse(fs.readFileSync(path.join(backendRoot, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(backendRoot, "package-lock.json"), "utf8"));
  assert.equal(packageJson.engines?.node, ">=24 <25");
  assert.equal(packageLock.packages?.[""]?.engines?.node, packageJson.engines.node);

  const dockerfile = fs.readFileSync(path.join(backendRoot, "Dockerfile"), "utf8");
  const images = [...dockerfile.matchAll(/^FROM node:([^@\s]+)@sha256:([a-f0-9]{64})/gm)];
  assert.equal(images.length, 2, "both Docker stages must use a digest-pinned Node image");
  assert.deepEqual(images.map((match) => match[1]), ["24.20.0-alpine", "24.20.0-alpine"]);
  assert.equal(images[0][2], images[1][2], "both Docker stages must use the same reviewed image digest");
});

test("[runtime-version] every setup-node action reads backend/.node-version", () => {
  const workflowsDirectory = path.join(repoRoot, ".github", "workflows");
  const workflowFiles = fs.readdirSync(workflowsDirectory)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => path.join(workflowsDirectory, name));

  let setupNodeUses = 0;
  for (const file of workflowFiles) {
    const source = fs.readFileSync(file, "utf8");
    setupNodeUses += (source.match(/uses:\s*actions\/setup-node@/g) || []).length;
    assert.doesNotMatch(source, /^\s*node-version:/m, path.basename(file));
    const versionFileUses = (source.match(/node-version-file:\s*backend\/\.node-version/g) || []).length;
    const setupUsesInFile = (source.match(/uses:\s*actions\/setup-node@/g) || []).length;
    assert.equal(versionFileUses, setupUsesInFile, path.basename(file));
  }
  assert.equal(setupNodeUses, 7, "unexpected setup-node call count; review every new runtime lane");
});
