import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

// Coverage lint, not semantic redirect proof. Native callbacks and the real
// Foundation loopback experiment prove behavior; this catches missed callers.
const appRoot = new URL("../../them/", import.meta.url);
test("[ios-redirect] every async data/bytes request opts into the origin guard", () => {
  let checked = 0;
  let dedicated = 0;
  for (const file of readdirSync(appRoot, { recursive: true }).filter(name => name.endsWith(".swift"))) {
    const source = readFileSync(new URL(file, appRoot), "utf8");
    for (const match of source.matchAll(/\.(?:data|bytes)\s*\(\s*for\s*:[^)]*\)/g)) {
      assert.match(match[0], /delegate:\s*BackendHTTPRedirectGuard\.shared/, file);
      checked++;
    }
    const tasks = [...source.matchAll(/\.dataTask\s*\(\s*with:/g)];
    if (tasks.length) assert.equal(file, "BackendClient.swift", "A dedicated session needs a reviewed redirect delegate.");
    dedicated += tasks.length;
  }
  assert.ok(checked >= 71, "The app request inventory must not disappear from the lint.");
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
