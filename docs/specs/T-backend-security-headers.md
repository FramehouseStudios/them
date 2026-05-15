# Spec: T-backend-security-headers

**Status**: ready (Claude can implement).
**Owner**: claude.
**V1 pillar**: infra (enables all)
**V1 effect**: closes a security-baseline gap that an external
security review will flag. Today the backend sets no security
headers — no HSTS, no X-Content-Type-Options, no Referrer-Policy,
no Permissions-Policy.

## Problem

`backend/app.js` does `app.disable("x-powered-by")` and that's it.
A request from a browser receives:

- No HSTS → MITM downgrade possible.
- No X-Content-Type-Options: nosniff → MIME-sniff attacks possible.
- No Referrer-Policy → user URLs leak via Referer header on outbound
  links.
- No X-Frame-Options / CSP frame-ancestors → clickjacking possible.

The backend isn't a web-facing UI today, but `/auth/verify_email`
and password-reset confirmation flow open in a browser, so these
headers do matter.

## Scope

In:
- A `lib/security_headers.js` middleware that sets:
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=()` (with carve-outs
    if any future web client needs them)
  - `Cross-Origin-Opener-Policy: same-origin`
  - `X-Frame-Options: DENY` plus
    `Content-Security-Policy: frame-ancestors 'none'`
- Wired from `middleware/auth.js` `applyAppMiddleware` early in the
  chain.
- Env opt-out: `SECURITY_HEADERS_DISABLED=1` for local debugging.

Out:
- Full CSP for browser surfaces. This needs route-by-route tuning
  for the email-verification HTML and is a follow-up
  (`T-backend-csp-tuning`).
- helmet npm dep. We do it ourselves; ~20 lines.

## Approach

```js
// lib/security_headers.js
const HEADERS = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
};
function securityHeadersMiddleware(req, res, next) {
  if (process.env.SECURITY_HEADERS_DISABLED === "1") return next();
  for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
  next();
}
```

## Acceptance

- `curl -I https://backend/realtime/health` returns every header
  listed above.
- `securityheaders.com` grades the backend A or A+ once deployed.
- Local dev: `SECURITY_HEADERS_DISABLED=1` strips them (useful for
  certain debug proxies).
- Unit test asserts all headers are present.

## Risks

- HSTS preload is sticky: once a domain is on the preload list,
  removal takes months. Mitigation: ship `max-age=63072000` first
  without `preload`; add `preload` only after 30 days of stable
  HTTPS-only traffic.
- Permissions-Policy denying camera/microphone could break a future
  web realtime client. Mitigation: that client adds its own
  carve-out at deployment time.

## Out-of-scope follow-ups

- `T-backend-csp-tuning` — full Content-Security-Policy with
  script-src / style-src / connect-src.
- TLS termination config (Render/Fly handle this).
