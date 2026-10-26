import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

// Coverage lint, not semantic HTTP redirect proof. Native callback tests
// characterize the shared guard's decisions; this catches missed callers.
const appRoot = new URL("../../them/", import.meta.url);
test("[ios-redirect] every async data/bytes request opts into the origin guard", () => {
  let checked = 0;
  let dedicated = 0;
  const transportFiles = new Set();
  for (const file of readdirSync(appRoot, { recursive: true }).filter(name => name.endsWith(".swift"))) {
    const source = readFileSync(new URL(file, appRoot), "utf8");
    for (const match of source.matchAll(/\.(?:data|bytes)\s*\(\s*for\s*:[^)]*\)/g)) {
      assert.match(match[0], /delegate:\s*BackendHTTPRedirectGuard\.shared/, file);
      transportFiles.add(file);
      checked++;
    }
    const tasks = [...source.matchAll(/\.dataTask\s*\(\s*with:/g)];
    if (tasks.length) assert.equal(file, "BackendClient.swift", "A dedicated session needs a reviewed redirect delegate.");
    dedicated += tasks.length;
  }
  // Guard the transport surfaces, not duplicated HTTP implementations. Owner-
  // guarded helpers deliberately consolidated BackendMemoryAPI's old calls.
  assert.deepEqual([...transportFiles].sort(), ["BackendClient.swift", "BackendMemoryAPI.swift",
    "ElevenLabsTtsClient.swift", "OfflineTalkOutbox.swift", "ScreenplayLiveDraftSync.swift"],
    "A transport surface disappeared or a new one needs review.");
  assert.ok(checked > 0);
  assert.equal(dedicated, 1);
});

test("[ios-redirect] dedicated talk session delegates redirect decisions to the same guard", () => {
  const source = readFileSync(new URL("BackendClient.swift", appRoot), "utf8");
  const delegate = source.slice(source.indexOf("private final class TalkStreamingDelegate:"),
    source.indexOf("private func dataForTalkRequestStreaming("));
  assert.match(delegate, /willPerformHTTPRedirection response: HTTPURLResponse/);
  assert.match(delegate, /BackendHTTPRedirectGuard\.shared\.urlSession/);
  assert.equal([...source.matchAll(/\.dataTask\(with:/g)].length, 1);
  assert.match(source, /URLSession\(configuration: configuration, delegate: delegate, delegateQueue: nil\)/);
});
