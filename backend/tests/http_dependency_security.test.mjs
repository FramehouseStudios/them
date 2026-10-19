import assert from "node:assert/strict";
import { test } from "node:test";
import proxyaddr from "proxy-addr";
import uri from "fast-uri";

// Upstream advisories: GHSA-jqcg-44mw-7w3h, GHSA-58mr-gqgx-xq4g,
// GHSA-qw65-cvwx-89v3 and GHSA-hrr3-gc8f-f4qj. Pure local cases: no requests.
test("proxy trust cannot promote an unrelated IPv4 client through a short mapped prefix", () => {
  assert.equal(proxyaddr.compile("::ffff:10.0.0.0/8")("203.0.113.9"), false);
});

test("generic IPv6 subnet must not trust an IPv4 client", () => {
  assert.equal(proxyaddr.compile("::/1")("203.0.113.9"), false);
});

test("plain and correctly mapped private IPv4 trust still work", () => {
  for (const subnet of ["10.0.0.0/8", "::ffff:10.0.0.0/104"]) {
    const trust = proxyaddr.compile(subnet);
    assert.equal(trust("10.42.0.8"), true);
    assert.equal(trust("203.0.113.9"), false);
  }
});

test("URI serialization rejects ports that can inject authority or path components", () => {
  for (const port of ["@127.0.0.1:8124", "8080@evil.example", "8080/path", "8080?query", -1, 1.5]) {
    assert.throws(() => uri.serialize({ scheme: "http", host: "trusted.example", port, path: "/app" }),
      /URI port is malformed/);
  }
});

test("URI parser rejects unterminated bracket hosts", () => {
  for (const input of ["http://[fe80", "http://[", "http://[not-an-ip"]) {
    assert.ok(uri.parse(input).error, "malformed host must not pass as valid");
  }
});

test("encoded uppercase host octets normalize consistently without a scheme", () => {
  assert.equal(uri.parse("//%41.com").host, "a.com");
  assert.equal(uri.equal("//%41.com", "//a.com"), true);
});

test("valid HTTPS and IPv6 URI components retain their meaning", () => {
  assert.equal(uri.serialize({ scheme: "https", host: "example.com", port: 8443, path: "/app" }),
    "https://example.com:8443/app");
  assert.equal(uri.parse("https://[::1]:8443/app").error, undefined);
  assert.equal(uri.equal("https://EXAMPLE.com/app", "https://example.com/app"), true);
});
