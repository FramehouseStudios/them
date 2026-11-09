import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const proxyaddr = require("proxy-addr");

test("short IPv4-mapped IPv6 trust prefix does not trust unrelated IPv4 clients", () => {
  const shortMappedSubnet = proxyaddr.compile("::ffff:10.0.0.0/8");
  const correctlyPrefixedMappedSubnet = proxyaddr.compile("::ffff:10.0.0.0/104");
  const plainIPv4Subnet = proxyaddr.compile("10.0.0.0/8");

  // The short mapped prefix must not silently collapse its leading mapped
  // marker and trust every IPv4 address. /104 is the equivalent mapped form
  // of the intended IPv4 /8; the plain IPv4 form must continue to work too.
  assert.equal(shortMappedSubnet("192.0.2.1", 0), false);
  assert.equal(shortMappedSubnet("10.2.3.4", 0), false);
  assert.equal(correctlyPrefixedMappedSubnet("10.2.3.4", 0), true);
  assert.equal(correctlyPrefixedMappedSubnet("192.0.2.1", 0), false);
  assert.equal(plainIPv4Subnet("10.2.3.4", 0), true);
  assert.equal(plainIPv4Subnet("192.0.2.1", 0), false);
});
