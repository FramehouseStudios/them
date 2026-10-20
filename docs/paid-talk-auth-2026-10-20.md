# T-1046 — Paid talk requires a verified writer

## Reproduced boundary failure

VERIFIED on original #966 `1e86467c`, which preserves #965: `/talk`
was missing from the unconditional paid-provider guard. With general auth
off, an anonymous caller reached HTTP200 and a real Page reservation using
multipart owner aliases. Separately, Express accepted mixed-case `/TaLk/`
while both canonical auth matchers were case-sensitive; an anonymous caller
also reached HTTP200/Page reservation with general auth on. These were local
disposable accounts/wallets and prepared offline audio, not production users,
real model output, or proof of a successful production charge/exploit.

Failing-first Node20.20.2 result:6 pass / 4 fail / 0 skip, exit1.
Log `/tmp/them-1046-before.log`. Two failures are real full-backend HTTP
checks; two are canonical middleware checks. External network was disabled.

## Smallest root correction

- Add only root `/talk` (including trailing slash) to the existing paid-route
  pattern owner. Do not introduce a second auth implementation or a broad
  `/talk/*` restriction that changes public probe classification.
- Lowercase the local comparison string in both canonical auth matchers,
  matching Express's case-insensitive routing. Do not mutate `req.path`,
  request bodies, project IDs, owner IDs or actual downstream resource lookup.
- Set no-store on matched paid routes before configuration/identity checks.
  Keep the existing auth error envelope and token/revocation verification.
- The ordinary talk integration fixture signs in a disposable account and
  uses its verified token with auth on. External talk proof now explicitly
  requires `TALK_TEST_USER_TOKEN`; never echo it or supply a human credential.
- The shutdown fixture signs in two separate disposable writers, preserving
  its two-active-stream, socket-refusal, response-body and clean-exit checks.

Signed-in client fields and successful response schemas remain unchanged.
Anonymous client/app tokens are not account authentication: those callers
now get the existing401 sign-in path. This deliberately closes an insecure
development configuration, not a new anonymous production offering. Debug
local sign-in remains available. No release-policy bypass, production
configuration, accepted decision, provider routing or dependency change.

## Proof and failures retained

VERIFIED Node20.20.2 focused30/0/0, external network off:
`/tmp/them-1046-focused.log`. Includes real signup/JWT verification, no/invalid
credentials, case/trailing-slash variants, denial before Page reservation
or client-session bootstrap, both global auth settings, two-wallet isolation,
logout/revocation after backend restart, authenticated offline Page audio,
and existing wallet/cancellation/paid-route exposure checks.

The first full run failed2624/10/2, exit1:
`/tmp/them-1046-backend.log`. Nine failures came from default persistence
imports trying to create data under the read-only disposable source archive.
The tenth was the shutdown fixture's anonymous requests no longer becoming
active streams. These are not omitted or reclassified as a passing run.

After making only the disposable archive writable and signing in both
shutdown fixture writers, full `npm test` passed2747/0/2, exit0, pinned
Node20.20.2 and external network disabled:
`/tmp/them-1046-backend-corrected.log`.
Frozen source: `/tmp/them-1046-corrected.o5eE1h`. No host secrets forwarded;
tracked-source archive excludes `.env`; persistence contains fixture data.
The skips remain the real-Postgres test without DATABASE_URL and the
conditional live talk-page test; neither is claimed as proven.

Syntax/whitespace and D009 pass: all five protected files delta0. No Swift,
package, scheme, UI-runner or client runtime change. No new Xcode/device or
paid provider run is claimed from this backend-only correction.

## Adversarial review and integration hold

- Answered: anonymous, invalid and revoked credentials cannot reach the Page
  adapter or select a wallet through body/header aliases; verified writer
  requests still reach the actual offline response pipeline.
- Answered: case-insensitive guard classification covers the paths accepted
  by Express; protected comparison does not alter resource identities.
- Answered: logout remains rejected after restart; unverified calls do not
  reserve either persisted wallet; the other writer's wallet is untouched.
- Partial: canonical middleware covers paid craft/realtime/visual case
  variants in unit checks, not a new live-provider call on every endpoint.
- Not covered: multi-process generation billing, physical microphone,
  production proxies/cache, a live model, shipping host or complete phone flow.

Parent #966's hosted run39330023996 is red in the V1 UI step. Its624 signed
units passed; the UI runner then failed to initialize with an AX-loaded
notification timeout before test execution. That is not a passing UI suite
or proof of the app's cause. Preserve its original head/history, investigate
its retained artifacts and existing #964 runner repair, and fix that first
before integrating this chain. No main merge or protection bypass here.
