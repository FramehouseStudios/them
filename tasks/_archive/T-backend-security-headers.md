---
id: T-backend-security-headers
title: Set HSTS / nosniff / Referrer-Policy / frame-ancestors headers
owner: support
status: merged
branch: -
pillar: infra (enables all)
v1_pillar: infra
v1_effect: closes a security-baseline gap an external review will flag; today the backend sets no security headers beyond disabling x-powered-by.
---

## Scope

Spec: `docs/specs/T-backend-security-headers.md`.

`lib/security_headers.js` middleware wired early in
`applyAppMiddleware`. HSTS, X-Content-Type-Options, Referrer-Policy,
Permissions-Policy, COOP, X-Frame-Options + CSP frame-ancestors.
`SECURITY_HEADERS_DISABLED=1` opt-out for local debug.

## Done when

- `curl -I` against any route returns every header.
- securityheaders.com grades A/A+ once deployed.
- Unit test asserts all headers present; opt-out strips them.
