import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

// Coverage lint, not semantic HTTP redirect proof. Native callback tests
// characterize the shared guard's decisions; this catches missed callers.
const appRoot = new URL("../../them/", import.meta.url);
const dedicatedOwner = "BackendTalkStreamingTransport.swift";

// Preserve offsets while ignoring literal/comment delimiters in call bodies.
function codeOnly(source) {
  return source.replace(/"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
    value => " ".repeat(value.length));
}

function balanced(source, opening) {
  const code = codeOnly(source.slice(opening));
  const closing = { "(": ")", "[": "]", "{": "}" }, stack = [];
  for (let index = 0; index < code.length; index++) {
    const char = code[index];
    if (closing[char]) stack.push(closing[char]);
    else if ([")", "]", "}"].includes(char)) {
      assert.equal(char, stack.pop(), "Unbalanced Swift call/block in redirect coverage lint");
      if (!stack.length) return { body: source.slice(opening + 1, opening + index), end: opening + index + 1 };
    }
  }
  assert.fail("Unterminated Swift call/block in redirect coverage lint");
}

function argumentsOf(body) {
  const code = codeOnly(body), args = [];
  let depth = 0, start = 0;
  for (let index = 0; index < code.length; index++) {
    if ("([{".includes(code[index])) depth++;
    else if (")]}".includes(code[index])) depth--;
    else if (code[index] === "," && depth === 0) {
      args.push(code.slice(start, index).trim()); start = index + 1;
    }
  }
  args.push(code.slice(start).trim());
  return args;
}

function asyncCalls(source) {
  return [...source.matchAll(/\.(data|bytes)\s*\(\s*for\s*:/g)].map(match => {
    const opening = source.indexOf("(", match.index);
    const receiver = source.slice(0, match.index).match(/[\w.]+$/)?.[0] ?? "";
    return { receiver, method: match[1], ...balanced(source, opening) };
  });
}

function dedicatedTransportIsGuarded(source) {
  const code = codeOnly(source);
  assert.equal([...code.matchAll(/\.dataTask\s*\(\s*with\s*:/g)].length, 1,
    "Canonical dedicated transport must contain exactly one data task");
  const dataFunction = code.indexOf("static func data(");
  assert.ok(dataFunction >= 0, "Canonical transport data wrapper disappeared");
  const signature = balanced(source, source.indexOf("(", dataFunction));
  const data = codeOnly(balanced(source, source.indexOf("{", signature.end)).body);
  assert.match(data, /let delegate\s*=\s*TalkStreamingDelegate\(/);
  assert.match(data, /let session\s*=\s*URLSession\(configuration:\s*configuration,\s*delegate:\s*delegate,\s*delegateQueue:\s*nil\)/);
  assert.match(data, /session\.dataTask\(with:\s*request\)/);

  const classStart = code.indexOf("private final class TalkStreamingDelegate:");
  assert.ok(classStart >= 0, "Canonical dedicated delegate disappeared");
  const delegate = balanced(source, source.indexOf("{", classStart)).body;
  const delegateCode = codeOnly(delegate);
  const redirectLabel = delegateCode.indexOf("willPerformHTTPRedirection response: HTTPURLResponse");
  assert.ok(redirectLabel >= 0, "Dedicated redirect callback disappeared");
  const callbackStart = delegateCode.lastIndexOf("func urlSession(", redirectLabel);
  assert.ok(callbackStart >= 0);
  const callbackSignature = balanced(delegate, delegate.indexOf("(", callbackStart));
  const callback = codeOnly(balanced(delegate, delegate.indexOf("{", callbackSignature.end)).body);
  assert.match(callback, /BackendHTTPRedirectGuard\.shared\.urlSession\(session,\s*task:\s*task,\s*willPerformHTTPRedirection:\s*response,\s*newRequest:\s*request,\s*completionHandler:\s*completionHandler\)/);
  return true;
}

function checkCoverage(sources) {
  const canonical = sources.get(dedicatedOwner);
  assert.ok(canonical, "Canonical dedicated transport is required before trusting its wrapper");
  const wrapperIsGuarded = dedicatedTransportIsGuarded(canonical);
  let checked = 0, dedicated = 0, wrapped = 0;
  const transportFiles = new Set();
  for (const [file, source] of sources) {
    for (const call of asyncCalls(source)) {
      if (call.receiver === "BackendTalkStreamingTransport" && call.method === "data") {
        assert.ok(wrapperIsGuarded); wrapped++; continue;
      }
      assert.ok(argumentsOf(call.body).some(arg => /^delegate:\s*BackendHTTPRedirectGuard\.shared$/.test(arg)), file);
      transportFiles.add(file); checked++;
    }
    const tasks = [...codeOnly(source).matchAll(/\.dataTask\s*\(\s*with\s*:/g)];
    if (tasks.length) assert.equal(file, dedicatedOwner, "A dedicated session needs a reviewed redirect delegate.");
    dedicated += tasks.length;
  }
  assert.equal(dedicated, 1);
  return { checked, wrapped, transportFiles };
}

const canonicalSource = () => readFileSync(new URL(dedicatedOwner, appRoot), "utf8");

test("[ios-redirect] every async data/bytes request opts into the origin guard", () => {
  const sources = new Map(readdirSync(appRoot, { recursive: true }).filter(name => name.endsWith(".swift"))
    .map(file => [file, readFileSync(new URL(file, appRoot), "utf8")]));
  const { checked, wrapped, transportFiles } = checkCoverage(sources);
  // Owner-guarded helpers consolidated BackendMemoryAPI's old calls. The
  // explicitly qualified streaming wrapper is reviewed through its delegate.
  assert.deepEqual([...transportFiles].sort(), ["BackendClient.swift", "BackendMemoryAPI.swift",
    "ElevenLabsTtsClient.swift", "OfflineTalkOutbox.swift", "OfflineTalkPageRecoveryUITestFixture.swift", "ScreenplayLiveDraftSync.swift"],
    "A transport surface disappeared or a new one needs review.");
  assert.ok(checked > 0); assert.ok(wrapped > 0);
});

test("[ios-redirect] dedicated talk session delegates redirect decisions to the same guard", () => {
  assert.equal(dedicatedTransportIsGuarded(canonicalSource()), true);
});

test("[ios-redirect] nested callback guards cannot impersonate a native call delegate", () => {
  const sources = source => new Map([[dedicatedOwner, canonicalSource()], ["Fixture.swift", source]]);
  const nested = "session.data(for: request, transform: { nested(value: 1, delegate: BackendHTTPRedirectGuard.shared) })";
  assert.throws(() => checkCoverage(sources(nested)));
  assert.throws(() => checkCoverage(sources("session.bytes(for: makeRequest(value: 1))")));
  assert.throws(() => checkCoverage(sources("OtherTransport.data(for: request, configuration: configuration)")));
  assert.throws(() => checkCoverage(sources("BackendTalkStreamingTransport.bytes(for: request, configuration: configuration)")));
  assert.throws(() => checkCoverage(sources('session.data(for: request, note: "delegate: BackendHTTPRedirectGuard.shared")')));
  assert.doesNotThrow(() => checkCoverage(sources(nested.slice(0, -1) + ", delegate: BackendHTTPRedirectGuard.shared)")));
});

test("[ios-redirect] wrapper exemption fails if its canonical delegate is removed or bypassed", () => {
  const original = canonicalSource();
  const wrapper = "BackendTalkStreamingTransport.data(for: request, configuration: configuration, retainAcceptedResponse: { data, http in try await keep(data, response: http) })";
  for (const altered of [original.replace("delegate: delegate, delegateQueue: nil", "delegate: nil, delegateQueue: nil"),
    original.replace("BackendHTTPRedirectGuard.shared.urlSession", "UnreviewedRedirectHandler.shared.urlSession"),
    original.replace("willPerformHTTPRedirection response: HTTPURLResponse", "unreviewedRedirect response: HTTPURLResponse")]) {
    assert.notEqual(altered, original);
    assert.throws(() => checkCoverage(new Map([[dedicatedOwner, altered], ["Fixture.swift", wrapper]])));
  }
  assert.throws(() => checkCoverage(new Map([[dedicatedOwner, original], ["Other.swift", "session.dataTask(with: request)"]])));
});
