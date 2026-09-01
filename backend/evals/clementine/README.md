# Clementine voice eval set (D008)

Golden companion scenes for **voice match before effort-knob tuning**. Spec: `docs/product/clementine-voice-spec.md`.

## Layout

| Path | Role |
| --- | --- |
| `scenes.jsonl` | One JSON object per line — golden scenes |
| `score_scene.js` | Stub harness: schema validate + dry-run `pass_criteria` presence (no model calls) |
| `../` sibling evals | Existing studio/canon runners; this folder is Clementine-specific |

## Scene schema

Required:

- `id` (string, unique)
- `intent` (string — aligns with `backend/lib/clementine/intents.js` when applicable)
- `lane` (`Reflex` \| `Companion` \| `Page` \| `Deep`)
- `input` (string — user utterance or harness cue)
- `pass_criteria` (string[] — human/LLM judge checklist)

Optional:

- `category` (grouping for reports)
- `forbidden_patterns` (string[] — regex sources; fail if matched in model output)
- `notes`

## How to score (full harness later)

| Dimension | What “pass” means |
| --- | --- |
| **Voice match** | Rhythm short; banned phrases absent; disagree = one pushback; interruption yields |
| **Memory fidelity** | At most one relevant recall; no bluff; no biography dump; tools not narrated |
| **Tool hygiene** | No chain-of-thought / tool names in user channel; spoken ≠ page mutation |
| **Tokens** | Within lane budget / `max_output_tokens`; Page ≠ Companion meter |
| **TTFT** | Reflex/Companion stay snappy; Deep may be slower when asked; cancel drops in-flight Page |

Until a model scorer exists, run the stub:

```bash
node backend/evals/clementine/score_scene.js
# or from backend/
node evals/clementine/score_scene.js
```

CI gate for fixture health:

```bash
node --test tests/clementine_voice_eval_scenes.test.mjs
```

## Categories (target mix)

comfort, tease, boundary, memory_recall, silence, page_propose, barge_in_cancel, plan_deep, greeting_reflex, wallet_empty (+ disagree / interruption / advise_ok fillers).

## Change log

- 2026-09-01 — v0 eval set + stub scorer (T-clementine-voice-eval).
