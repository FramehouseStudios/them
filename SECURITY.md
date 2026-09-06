# Security policy

io.them handles voice recordings, screenplay drafts, creative memory, Apple
Sign in, and App Store in-app purchases. Reports about any of those surfaces
are welcome and taken seriously.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository
(**Security → Report a vulnerability**). That route keeps the report
private until a fix ships and gives both sides a threaded record. Do not
open a public issue for a suspected vulnerability.

Include what you can: the affected surface (backend route, iOS screen,
export format), steps to reproduce, and the impact you observed. Proof of
concept against your own account and data is fine; please do not access,
modify, or retain other users' data.

## What to expect

- Acknowledgement within 3 business days.
- An initial assessment (accepted, needs more information, or not a
  vulnerability) within 10 business days.
- Fixes for accepted reports ship through the normal quality gate; the
  reporter is told when the fix is on `main` and, for backend issues, when
  it is deployed.

## Scope

In scope: the backend under `backend/`, the iOS app under `them/` and
`Packages/`, the export formats, and the CI/CD configuration in
`.github/`. Third-party providers (OpenAI, ElevenLabs, Apple) are out of
scope here; report those to the provider.

## Supported versions

Only the current `main` branch and the latest TestFlight / App Store build
receive security fixes.
