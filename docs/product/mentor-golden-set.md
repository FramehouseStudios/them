# Mentor golden set

Clementine's spoken mentor voice, measured the way pages already are.

## What it is

Forty scripted exchanges in `backend/evals/mentor_conversation/cases.mjs`, eight per skill:

| Skill | What the case checks | Dimension |
| --- | --- | --- |
| pitch | On a fresh session she pitches one concrete scene: place, time of day, two named characters, a want, one obstacle, then one question that hands the wheel back | `pitch_concreteness` |
| build | When the writer brings an idea she keeps its nouns as the spine and adds one playable beat instead of replacing it | `build_on_writer` |
| structure | Three-act answers connect beats with because/therefore; explicit 110-page examples retain their chosen target, while the default recommendation is a flexible 120 pages, never padding/truncation | `structure_accuracy` |
| dialogue | Given an on-the-nose line she names what it is doing and offers one rewritten line in quotes that works through behavior or tactic | `on_the_nose_detection` |
| register | No check-ins, no therapy phrasing, no markdown, no question stacks, no hedging about being a model; short holds are allowed when the writer is thinking aloud | `register` |

Every case carries a `golden` exemplar and a `weak` exemplar. The scorer in
`score_mentor_reply.js` is deterministic text heuristics, 1–5 per dimension.
Overall = 0.6 × skill + 0.4 × register (register alone for register cases).
PASS ≥ 3.5, FAIL ≤ 2.8, the same floors as `evals/page_craft`.

## Two modes

```sh
cd backend
npm run eval:mentor-golden          # offline, no model: every golden must PASS, every weak must FAIL,
                                    # and the mentor prompt path is asserted. Part of eval:canon,
                                    # so the quality gate runs it on every PR.
MENTOR_GOLDEN_LIVE_APPROVED=1 npm run eval:mentor-golden:live  # only after fresh human approval of this scope;
                                    # needs OPENAI_API_KEY: each case is answered by the rich model
                                    # through the real mentor prompt and scored. Gate: ≥ 80% PASS,
                                    # 0 FAIL, and register ≥ 3.5 on every reply.
```

Reports go to `/tmp/them-smoke/mentor-golden/report.json` (`MENTOR_GOLDEN_REPORT`
overrides). `--only=<id|category>` narrows a run.
An unknown selector exits2 before any provider call. Live mode also exits2
without invocation-local `MENTOR_GOLDEN_LIVE_APPROVED=1`; do not persist that
flag in `.env`, secrets or shared environments. Provider error/empty output
stops the remaining cases and writes a failed partial report, without an
automatic retry. These are offline heuristics, not proof of live quality.

The weekly workflow `.github/workflows/mentor-golden-live.yml` runs offline
only (Mondays14:17UTC), without provider credentials. A manual dispatch also
defaults offline; a fresh human-approved paid run requires `live_approved=true`
and an explicitly agreed `only` scope (blank means all40). Only that live
step receives `OPENAI_API_KEY`; dispatch input is passed as a quoted environment
value, not interpolated into shell source. Offline and live reports are
separate artifacts retained90days. No live workflow was dispatched during
this integration.

## The prompt it measures

`docs/persona/mentor-core.txt` is the one source of truth for her identity. The
Swift literal `HerVoiceSpec.mentorCoreBlock` must match it byte for byte
(`HerVoiceSpecMentorCoreParityTests`), and the live runner builds its system
prompt from that file plus the persona core and the `<mentor_output>` contract,
so identity and output contracts stay aligned. The runner's fresh-pitch block
mirrors the specific-request-first rule; it is still a representative prompt,
not the entire production handler/latency/memory assembly. The golden gate
does not prove that full runtime path. Edit the Swift literal and text fixture
together or the parity test fails. Keep the human's flexible120-page guidance
in both; explicit shorter/longer writer targets remain valid.

## Findings on the first runs (2026-09-06, gpt-4o as the rich model)

- Run 1: 34/40 PASS. She stacked questions, dropped into markdown and sluglines
  mid-conversation, and talked about flat lines instead of naming them and
  rewriting them.
- Added to her core and contract: name the line's problem then give one
  rewritten line in quotes; spoken prose only, no bold/headers/sluglines; one
  question mark per reply, add a beat before asking when the writer brings an
  idea.
- Run 2: 39/40 PASS, 0 FAIL, but five replies still carried three to six
  questions (the build cases).
- Run 3: 35/40 PASS, 1 FAIL; the build cases still answered ideas with questions.
  Core rewritten: first sentence keeps the writer's nouns, second adds a beat,
  a question only after that; structural questions only when asked about the
  whole story.
- Run 4: 38/40 PASS, 0 FAIL, build mean 4.3, dialogue mean 5.0; one reply at
  register 3.5. The floor was set at 3.5 (one slip) because a 3.0 is a question
  stack or a check-in and stays a failure.

The register floor is deliberately the strict part: question stacking and
check-ins are the exact companion habits the mentor work exists to remove.
