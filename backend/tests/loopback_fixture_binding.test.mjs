import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { parse } from "acorn";
import { simple } from "acorn-walk";

function implicitWildcardListenersWithIPv4Client(source) {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", locations: true });
  let hasIPv4Client = false;
  const listeners = [];
  simple(ast, {
    Literal(node) {
      if (typeof node.value === "string" && node.value.includes("http://127.0.0.1:")) hasIPv4Client = true;
    },
    TemplateElement(node) {
      if (node.value.raw.includes("http://127.0.0.1:")) hasIPv4Client = true;
    },
    CallExpression(node) {
      const callee = node.callee;
      if (callee.type !== "MemberExpression") return;
      const method = callee.computed ? callee.property.value : callee.property.name;
      if (method !== "listen" || node.arguments[0]?.value !== 0) return;
      const host = node.arguments[1];
      if (!host || ["ArrowFunctionExpression", "FunctionExpression"].includes(host.type)
        || (host.type === "Identifier" && host.name === "undefined")) {
        listeners.push(node.loc.start.line);
      }
    },
  });
  return hasIPv4Client ? listeners : [];
}

function testSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? testSources(target) : /\.[cm]?js$/.test(entry.name) ? [target] : [];
  });
}

test("[loopback-fixtures] detector handles omitted hosts and listening callbacks", () => {
  const client = "fetch(`http://127.0.0.1:${port}/health`);";
  for (const listener of ["app.listen(0);", "app.listen(0, () => done());", "app.listen(0, function () {});", "app.listen(0, undefined);"]) {
    assert.deepEqual(implicitWildcardListenersWithIPv4Client(`${listener}\n${client}`), [1]);
  }
  assert.deepEqual(implicitWildcardListenersWithIPv4Client(`app.listen(0, "127.0.0.1", () => done());\n${client}`), []);
  assert.deepEqual(implicitWildcardListenersWithIPv4Client("app.listen(0); fetch(`http://[::1]:${port}/health`);"), []);
  assert.deepEqual(implicitWildcardListenersWithIPv4Client(`const example = "app.listen(0)";\n${client}`), []);
});

test("[loopback-fixtures] IPv4 HTTP clients do not use implicit wildcard ephemeral listeners", () => {
  // On macOS an IPv6 wildcard ephemeral listener and an IPv4 loopback client
  // can select different listeners. Bind fixture servers to the client host.
  const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
  const mismatches = testSources(testsDirectory).flatMap((file) => {
    const source = fs.readFileSync(file, "utf8");
    return implicitWildcardListenersWithIPv4Client(source).map((line) => `${path.relative(testsDirectory, file)}:${line}`);
  });
  assert.deepEqual(mismatches, [], "Bind listen(0) fixtures with IPv4 clients explicitly to 127.0.0.1");
});
