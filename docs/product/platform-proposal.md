# THEM Platform Proposal

> Engineering/product proposal derived from product-lead material supplied on
> 2026-08-30. It describes a recommended path, not a replacement for accepted
> decisions or current repository evidence. See
> [`founder-product-brief.md`](founder-product-brief.md) for product intent and
> [`../architecture/technical-blueprint.md`](../architecture/technical-blueprint.md)
> for implementation boundaries.

## Executive north star

THEM is the native writing environment between “I have an idea” and “I have
usable pages.” The writer owns the work, the page is authoritative, generated
material is reviewable, creative context survives, and failures remain
understandable and recoverable.

The V1 test is simple: work belongs in the current release only when it helps a
writer stay inside the scene, protects accepted edits, or lets them leave and
return with useful context intact.

## Engineering doctrine

- **The page is sacred.** Manual edits win; generation produces candidates.
- **State reconciliation is explicit.** Voice, stream, local edit,
  acknowledgement, and restore behavior follow defined rules.
- **Ownership is built in.** Client-supplied identity alone never authorizes a
  project or memory operation.
- **Providers are isolated.** Model and realtime behavior live behind adapters
  and remain testable without live calls.
- **Memory is inspectable.** Important creative context has explicit schemas,
  persistence, and correction paths.
- **Controls are useful.** A visible control works, explains its unavailable
  state, or does not ship.
- **Failures preserve trust.** Network, provider, auth, and restore problems
  leave the writer with clear status and recovery.
- **Release readiness is a system.** Tests, evals, migration checks, and
  preflight scripts are product infrastructure.

## Current platform shape

| Layer | Current choice |
| --- | --- |
| Client | Swift, SwiftUI, Swift Concurrency, AVFoundation, Speech, and AuthenticationServices; iPhone is the V1 product surface. |
| Domain | Swift Package Manager modules for screenplay formatting and draft/page state. |
| Backend | Node.js 20 and Express in a modular monolith. |
| Data | PostgreSQL 16 in CI/production, ordered migrations, and explicit JSON development adapters. |
| Coordination | Redis only where distributed coordination is required; it is not a prerequisite for single-instance local development. |
| AI and realtime | Server-side product-owned provider adapters with bounded health/fallback behavior. |
| Authentication | Email/password plus Sign in with Apple, rotating sessions, revocation, verification, and reset contracts. |
| Delivery | GitHub Actions, Docker verification, deterministic evals, and scripted release gates. |

Current V1 production remains intentionally single-instance until durable auth
snapshot/cost coordination is safe across replicas. Horizontal scale is a
measured future trigger, not a current marketing claim.

## Continuous verification bar

For code:

- tests cover success and relevant failure behavior;
- ownership is enforced at the data boundary;
- accepted writer content has no silent overwrite path;
- provider calls remain behind adapters;
- logs exclude secrets and unnecessary personal data;
- the behavior runs on its claimed device path.

For creative behavior:

- deterministic evals cover prompt, formatting, memory, failover, and
  voice-to-page contracts;
- streaming/reconciliation and interrupted restore paths are explicit;
- a live-model result is never the sole proof of product correctness.

For writer-facing behavior:

- copy does not promise behavior the production network/device path cannot
  support;
- candidate/generated material is distinguishable from accepted page content;
- privacy and ownership language matches the implementation.

## V1 scope

The release candidate includes the voice-to-page pipeline, screenplay-native
formatting, authentication and session controls, project isolation, creative
memory, realtime foundations, supported import/export paths, and automated
quality/release gates.

V1 does not claim full writers-room permissions, additional primary document
types, client-side model execution, advanced marketplace/analytics features, or
multi-platform parity.

## Phase gates

| Stage | Gate before expansion |
| --- | --- |
| V1 release candidate | Human-owned production configuration, signing, privacy approval, and final physical-device smoke. |
| Reliable daily driver | Real multi-day writing with no unexplained edit or context loss. |
| Professional surface | Professional acceptance of exported pages with minimal reformatting. |
| Collaboration | Proven individual reliability plus an explicit permission and conflict model. |
| Intelligence depth | Measured usefulness without a regression in writer control or trust. |

## Observability as product capability

The platform should measure content-safe signals that directly support the
promise: capture success/latency, reconciliation conflict outcomes, restore
success, provider health/fallback, auth and ownership rejection rates, and
export fidelity. Avoid collecting screenplay content merely to make a metric
easier.

## Honest constraint

The highest remaining V1 risk is not the absence of more features. It is whether
the core loop remains trustworthy during real mobile interruptions, network
changes, voice inaccuracies, and long sessions. Expansion should follow
measured reliability and writer retention—not precede them.
