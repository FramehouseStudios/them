#!/usr/bin/env node
//
// scripts/live_backend_health.mjs
//
// Secret-safe live backend gate for release and desktop sanity checks.
// It proves the configured URL is a real THEM backend, not a parked
// domain, Render "no-server" route, gateway HTML page, or localhost value.

const DEFAULT_BASE_URL = "https://api.them.io";
const DEFAULT_TIMEOUT_MS = 8000;

function parseArgs(argv) {
  const opts = {
    urls: [],
    json: false,
    allowLocalhost: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (const arg of argv) {
    if (arg === "--json") opts.json = true;
    else if (arg === "--allow-localhost") opts.allowLocalhost = true;
    else if (arg.startsWith("--timeout-ms=")) {
      const raw = Number.parseInt(arg.slice("--timeout-ms=".length), 10);
      if (!Number.isFinite(raw) || raw <= 0) throw new Error("--timeout-ms must be a positive integer");
      opts.timeoutMs = raw;
    } else if (arg.startsWith("--url=")) {
      opts.urls.push(arg.slice("--url=".length));
    } else if (arg.trim()) {
      opts.urls.push(arg);
    }
  }
  if (opts.urls.length === 0) {
    opts.urls.push(process.env.BACKEND_URL || process.env.BACKEND_BASE_URL || DEFAULT_BASE_URL);
  }
  opts.urls = [...new Set(opts.urls.map(normalizeBaseURL).filter(Boolean))];
  if (opts.urls.length === 0) throw new Error("No backend URL configured.");
  return opts;
}

function normalizeBaseURL(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const url = new URL(raw);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function endpointURL(baseURL, pathname) {
  const base = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
  return new URL(pathname.replace(/^\/+/, ""), base).toString();
}

function isLocalhostURL(baseURL) {
  const host = new URL(baseURL).hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function appTokenInfo(env = process.env) {
  const value = String(env.APP_TOKEN || env.APP_TOKEN_RELEASE || "").trim();
  return {
    value,
    source: env.APP_TOKEN ? "APP_TOKEN" : env.APP_TOKEN_RELEASE ? "APP_TOKEN_RELEASE" : "unset",
    present: Boolean(value),
  };
}

async function fetchWithTimeout(url, { timeoutMs, headers = {} }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers,
      redirect: "manual",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readBodySnippet(response) {
  const text = await response.text().catch(() => "");
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function classifyBadResponse(response, bodySnippet) {
  const location = response.headers.get("location") || "";
  const contentType = response.headers.get("content-type") || "";
  const renderRouting = response.headers.get("x-render-routing") || "";
  if (renderRouting.toLowerCase() === "no-server") {
    return "Render has no server routed for this hostname.";
  }
  if (response.status >= 300 && response.status < 400) {
    if (/introvert\.com|domain=them\.io/i.test(location)) {
      return "Backend URL redirects to a parked them.io domain page.";
    }
    return `Backend URL redirects unexpectedly to ${location || "another location"}.`;
  }
  if (/text\/html/i.test(contentType) || /^</.test(bodySnippet)) {
    return "Backend returned HTML instead of the THEM JSON API.";
  }
  return "";
}

async function parseJSONBody(response) {
  const text = await response.text();
  if (!text.trim()) return { ok: false, body: null, snippet: "" };
  try {
    return { ok: true, body: JSON.parse(text), snippet: text.replace(/\s+/g, " ").trim().slice(0, 240) };
  } catch {
    return { ok: false, body: null, snippet: text.replace(/\s+/g, " ").trim().slice(0, 240) };
  }
}

async function checkHealthz(baseURL, opts) {
  const url = endpointURL(baseURL, "/healthz");
  const response = await fetchWithTimeout(url, { timeoutMs: opts.timeoutMs });
  const cloned = response.clone();
  const bodySnippet = await readBodySnippet(cloned);
  const classified = classifyBadResponse(response, bodySnippet);
  if (classified) {
    return {
      id: "healthz",
      ok: false,
      status: response.status,
      message: classified,
      url,
    };
  }
  const parsed = await parseJSONBody(response);
  if (response.status !== 200) {
    return {
      id: "healthz",
      ok: false,
      status: response.status,
      message: `/healthz returned HTTP ${response.status}.`,
      url,
      bodySnippet: parsed.snippet,
    };
  }
  if (!parsed.ok || parsed.body?.ok !== true) {
    return {
      id: "healthz",
      ok: false,
      status: response.status,
      message: "/healthz did not return the expected JSON readiness envelope.",
      url,
      bodySnippet: parsed.snippet,
    };
  }
  return {
    id: "healthz",
    ok: true,
    status: response.status,
    message: "/healthz is live and ready.",
    url,
  };
}

async function checkApiVersion(baseURL, opts) {
  const token = appTokenInfo();
  const url = endpointURL(baseURL, "/api/version");
  const headers = token.present ? { "X-APP-TOKEN": token.value } : {};
  const response = await fetchWithTimeout(url, { timeoutMs: opts.timeoutMs, headers });
  const cloned = response.clone();
  const bodySnippet = await readBodySnippet(cloned);
  const classified = classifyBadResponse(response, bodySnippet);
  if (classified) {
    return {
      id: "api-version",
      ok: false,
      status: response.status,
      message: classified,
      url,
      tokenSource: token.source,
    };
  }
  const parsed = await parseJSONBody(response);
  if (!token.present && response.status === 401 && parsed.body?.stage === "auth") {
    return {
      id: "api-version",
      ok: true,
      status: response.status,
      message: "/api/version is served by THEM and is app-token protected.",
      url,
      tokenSource: token.source,
    };
  }
  if (response.status !== 200) {
    return {
      id: "api-version",
      ok: false,
      status: response.status,
      message: `/api/version returned HTTP ${response.status}.`,
      url,
      tokenSource: token.source,
      bodySnippet: parsed.snippet,
    };
  }
  if (!parsed.ok || parsed.body?.ok !== true || !Number.isFinite(Number(parsed.body?.schema_version))) {
    return {
      id: "api-version",
      ok: false,
      status: response.status,
      message: "/api/version did not return the expected backend version envelope.",
      url,
      tokenSource: token.source,
      bodySnippet: parsed.snippet,
    };
  }
  return {
    id: "api-version",
    ok: true,
    status: response.status,
    message: "/api/version is live.",
    url,
    tokenSource: token.source,
    schemaVersion: Number(parsed.body.schema_version),
  };
}

async function checkBaseURL(baseURL, opts) {
  const checks = [];
  if (!opts.allowLocalhost && isLocalhostURL(baseURL)) {
    checks.push({
      id: "backend-url",
      ok: false,
      status: 0,
      message: "Live backend URL must not point to localhost.",
      url: baseURL,
    });
    return { baseURL, ok: false, checks };
  }
  for (const fn of [checkHealthz, checkApiVersion]) {
    try {
      checks.push(await fn(baseURL, opts));
    } catch (error) {
      checks.push({
        id: fn === checkHealthz ? "healthz" : "api-version",
        ok: false,
        status: 0,
        message: error?.name === "AbortError"
          ? `Request timed out after ${opts.timeoutMs}ms.`
          : formatFetchError(error),
        url: endpointURL(baseURL, fn === checkHealthz ? "/healthz" : "/api/version"),
      });
    }
  }
  return { baseURL, ok: checks.every((check) => check.ok), checks };
}

function formatFetchError(error) {
  const message = String(error?.message || error || "request failed");
  const causeCode = String(error?.cause?.code || "").trim();
  const causeMessage = String(error?.cause?.message || "").trim();
  if (causeCode && causeMessage) return `${message} (${causeCode}: ${causeMessage})`;
  if (causeCode) return `${message} (${causeCode})`;
  if (causeMessage) return `${message} (${causeMessage})`;
  return message;
}

function renderText(results) {
  const lines = ["Live Backend Health"];
  for (const result of results) {
    lines.push(`Backend: ${result.baseURL}`);
    for (const check of result.checks) {
      lines.push(`${check.ok ? "[OK]" : "[FAIL]"} ${check.message}`);
    }
  }
  return lines.join("\n") + "\n";
}

async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const results = [];
  for (const baseURL of opts.urls) {
    results.push(await checkBaseURL(baseURL, opts));
  }
  const payload = {
    ok: results.every((result) => result.ok),
    generatedAt: new Date().toISOString(),
    results,
  };
  if (opts.json) {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else {
    process.stdout.write(renderText(results));
  }
  return payload.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(error?.message || error);
      process.exitCode = 1;
    },
  );
}

export {
  checkBaseURL,
  classifyBadResponse,
  endpointURL,
  formatFetchError,
  isLocalhostURL,
  main,
  normalizeBaseURL,
};
