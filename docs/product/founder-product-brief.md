# THEM Founder Product Brief

> Product-direction reference supplied by the product lead on 2026-08-30.
> This document explains intent and sequencing. It does not override
> [`AGENTS.md`](../../AGENTS.md), accepted entries in
> [`DECISIONS.md`](../../DECISIONS.md), or current release evidence. Statements
> about future pricing, policy, platforms, collaboration, and training remain
> proposals until the product lead accepts them through the decision process.

## Product in one sentence

THEM is a voice-first AI screenplay studio that helps writers move from
spoken or fragmented creative intent to production-ready pages while preserving
authorship, project context, and control.

Customer-facing shorthand:

> Stay inside the scene. Speak, think, shape, and leave with real pages.

The product is not a generic AI writing assistant, a cloud document editor, or
a replacement for the writer. The technology should disappear quickly enough
for the writer to remain inside the creative moment.

## Founder vision

THEM should make the highest-friction parts of screenwriting feel nearly
invisible:

- capture a spoken beat, performance note, or structural idea without losing
  its energy;
- convert rough intent into screenplay-native material;
- preserve character, relationship, tone, and story decisions across sessions;
- protect manual edits from streaming, generation, retry, and restore races;
- make interruptions understandable and recoverable;
- export work that can enter a professional production or submission workflow.

The writer remains the author and owner of the creative work. Generated output
is candidate material until the writer accepts it.

## Initial customer and promise

The recommended first customer is a professional or serious emerging
screenwriter who already captures ideas on mobile and works in fragmented
sessions. This gives THEM a focused individual-ownership model and a fast
feedback loop before adding writers-room complexity.

The initial promise is concrete: capture a spoken idea, shape it into real
pages, leave, return with the relevant context intact, and export something
useful without fighting the tool.

## Core writer journey

1. Open an existing project or start from a blank page or spoken beat.
2. Capture voice or text and receive useful feedback while the authoritative
   result is prepared.
3. Edit freely while concurrent voice, stream, local, acknowledgement, and
   restore inputs reconcile without silent data loss.
4. Ask Clementine for continuation, rewrite, structure exploration, or craft
   coaching.
5. Inspect or correct memory and provenance when context is wrong.
6. Export clean Fountain or another supported production-oriented format.
7. Return later with the authoritative page and useful creative context intact.

Failure follows a parallel journey: preserve local continuity, explain the
degraded state, avoid pretending partial work is final, and provide a real
restore or retry path.

## Product boundaries

THEM owns the screenplay-native experience, reconciliation rules,
authorization boundaries, memory model, exports, and recovery behavior.
Apple and AI/realtime providers supply platform capabilities behind owned
interfaces.

Early versions must never:

- claim to replace the writer or own their work;
- silently overwrite accepted writer edits;
- describe generated material as automatically final or production-legal;
- promise creative brilliance based only on a model;
- claim platform parity before the iPhone experience is proven;
- use unpublished writing for training without a transparent, explicit opt-in
  and the required legal/product decision.

## Phased strategy

| Phase | Product focus | Exit evidence |
| --- | --- | --- |
| 0 - V1 release candidate | Production configuration, signing, privacy approval, and device smoke | A production-configured voice-to-page session can be edited, restored, and exported with no unexplained loss. |
| 1 - Reliable daily driver | Long-session stability, offline/restore, reconciliation, and memory controls | Working writers complete multi-hour, multi-day use without unexplained edit or context loss. |
| 2 - Professional surface | Structure tools, version comparison, comments, richer export, and long-project performance | Professional writers accept exported pages as production input with minimal reformatting. |
| 3 - Room and collaboration | Presence, permissions, shared memory scopes, and review modes | Multiple writers can work together with explicit ownership and understandable conflicts. |
| 4 - Intelligence depth | Higher-signal craft and character support under writer authority | Measured usefulness improves without an increase in “fighting the tool” incidents. |

## Non-negotiable product invariants

1. The page is authoritative; suggestions never silently replace writer work.
2. Reconciliation is explicit, not accidental last-write-wins state.
3. Identity, ownership, and project isolation are enforced structurally.
4. Provider behavior stays behind product-owned adapters.
5. Paid-provider credentials and signing material never ship as secrets in the
   client.
6. Every visible control works, explains why it is unavailable, or is removed.
7. Failures preserve work and offer an understandable recovery path.
8. Creative memory is durable, inspectable, and correctable.
9. Screenplay rules live in focused domain code rather than scattered UI logic.
10. Creative behavior has deterministic evals in addition to conventional
    tests.

## Open product decisions

Keep these configurable until the product lead explicitly decides them:

- pricing and packaging for individuals and teams;
- free-tier generation and realtime limits;
- long-term retention and deletion guarantees for unpublished projects;
- timing of expansion beyond iPhone;
- depth of collaborative permissions;
- any improvement or training use of user content.

## Immediate company priorities

1. Complete human-owned production configuration, signing, privacy approval,
   and physical-device smoke testing.
2. Prove zero unexplained edit or context loss across real multi-session use.
3. Measure and fix the highest-frequency interruption, reconciliation, and
   restore failures.
4. Finalize accurate privacy, ownership, export, and deletion language.
5. Collect structured feedback from a small group of working screenwriters.
6. Keep the quality gate and release preflight green on every change.

## Definition of company proof

Tests and a device build are necessary but insufficient. The product is first
meaningfully proved when a working screenwriter captures a real idea, shapes it
into correctly formatted pages, returns later with the important context intact,
exports a useful document, and chooses THEM again for subsequent work.
