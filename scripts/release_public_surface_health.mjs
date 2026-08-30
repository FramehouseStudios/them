#!/usr/bin/env node

function parseArgs(argv) {
  const opts = { url: "", allowLocalhost: false };
  for (const arg of argv) {
    if (arg === "--allow-localhost") opts.allowLocalhost = true;
    else if (arg.startsWith("--url=")) opts.url = arg.slice("--url=".length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function isLocalHostname(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(String(hostname || "").toLowerCase());
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.url) throw new Error("--url is required");
  const url = new URL(opts.url);
  if (url.protocol !== "https:" && !(opts.allowLocalhost && isLocalHostname(url.hostname))) {
    throw new Error("release public URL must use HTTPS");
  }
  if (isLocalHostname(url.hostname) && !opts.allowLocalhost) {
    throw new Error("release public URL must not use localhost");
  }

  const response = await fetch(url, {
    redirect: "manual",
    headers: { Accept: "text/html,text/plain;q=0.9" },
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`public surface redirected (${response.status}); publish the canonical URL directly`);
  }
  if (response.status !== 200) {
    throw new Error(`public surface returned HTTP ${response.status}`);
  }
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new Error(`public surface returned unsupported content type: ${contentType || "missing"}`);
  }
  const body = await response.text();
  if (body.length < 200) throw new Error("public surface content is too short to be a real policy page");
  if (!/privacy/i.test(body) || !/\bio\.them\b/i.test(body)) {
    throw new Error("public surface does not identify io.them and its privacy policy");
  }
  if (/(domain\s+(?:is\s+)?parked|domain\s+for\s+sale|introvert\.com)/i.test(body)) {
    throw new Error("public surface is a parked-domain page");
  }
  console.log(`[OK] Public release surface is live: ${url.origin}${url.pathname}`);
}

main().catch((error) => {
  console.error(`[FAIL] ${String(error?.message || error)}`);
  process.exit(1);
});
