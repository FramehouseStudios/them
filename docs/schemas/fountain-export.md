# fountain-export envelope schema

Canonical request + response shape for `POST /screenplay/export/fountain` —
the screenplay-to-Fountain serializer endpoint.

## Endpoint

| Method | Path | Returns |
| --- | --- | --- |
| POST | `/screenplay/export/fountain` | JSON envelope OR raw text (see below) |

Two response modes:
- **Default** (no `Accept` magic): JSON envelope
  `{ schemaVersion: 1, fountain: "<text>" }`.
- **`Accept: text/plain` OR `?format=text`**: raw Fountain body
  with `Content-Disposition: attachment; filename="<base>.fountain"`.

## Schema version

`1`. JSON envelope carries an explicit `schemaVersion` field.

## Owner

- **Backend**: support agent. Route in
  `backend/lib/fountain_export_route.js`; serializer in
  `backend/lib/fountain_export.js` (`exportToFountain`).
- **iOS**: Codex. Consumes the Fountain text for share / save
  UI.

## Access-control posture

**PER-USER**. Screenplay body is user-authored content. The
posture matches the rest of the screenplay surface
(`screenplay-project.md`, `screenplay-version.md`); the route
operates on the body passed in the request, not on a stored
project, so authentication scope is whatever the mount caller
applies.

## Request shape

```json
{
  "title": {
    "title": "My Screenplay",
    "author": "Ada Lovelace"
  },
  "scenes": [
    {
      "heading": "INT. ROOM - DAY",
      "lines": [
        { "kind": "action", "text": "Alice enters." },
        { "kind": "character", "name": "ALICE", "dialogue": "Hello." }
      ]
    }
  ]
}
```

Full input shape (the same shape `exportToFountain` consumes) is
documented in the module header of
`backend/lib/fountain_export.js`. `scenes` may be omitted (the
output is then a title-only Fountain document).

### Supported line elements

The canonical `lines` array accepts these additive shapes:

| `kind` | Required fields | Optional semantics |
| --- | --- | --- |
| `action` | `text` | All-caps action is forced with `!` when needed |
| `character` | `name`, `dialogue` | `parenthetical`, `forced`, `dualDialogue` |
| `transition` | `text` | `forced` preserves transitions that do not end in `TO:` |
| `centered` | `text` | Renders as `> text <` |
| `lyrics` | `text` | Renders with the `~` lyric marker |
| `section` | `text` | `level` is clamped to 1–3 |
| `synopsis` | `text` | Renders with the `=` marker |
| `blank` | none | Accepted as an explicit no-content element |

`dialogue` may be a string or an array of strings. Ambiguous character
cues—for example a character named `CUT TO:`—are automatically forced with
`@` so a subsequent import retains the character element. Import also
normalizes CRLF, CR, Unicode line/paragraph separators, next-line characters,
and an initial byte-order mark before classifying elements.

## Validation

| HTTP | `error` | When |
| --- | --- | --- |
| 400 | `craft_invalid_screenplay` (`message: "body required"`) | request body missing / not an object |
| 400 | `craft_invalid_screenplay` (`message: "scenes must be an array"`) | `body.scenes` is present but not an array |
| 500 | `fountain_export_failed` (with `message`) | `exportToFountain` throws |

Empty `scenes` is **valid** — title-only Fountain documents are
allowed.

## Default (JSON) response shape

```json
{
  "schemaVersion": 1,
  "fountain": "Title: My Screenplay\nAuthor: Ada Lovelace\n\nINT. ROOM - DAY\n\nAlice enters.\n\nALICE\nHello.\n"
}
```

| Key | Type | Required | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | int | yes | constant `1` |
| `fountain` | string | yes | full Fountain-formatted screenplay text |

HTTP 200. `Cache-Control: no-store`.

## Text response (Accept-driven)

When the request carries `Accept: text/plain` OR the query string
includes `?format=text`, the response is the raw Fountain string
(no JSON wrapper) with:

- `Content-Type: text/plain; charset=utf-8`
- `Content-Disposition: attachment; filename="<base>.fountain"`
  where `<base>` is `body.title.title` sanitized via
  `sanitizeFilenameBase()` (alnum / space / `._-` only,
  truncated to 80 chars, falls back to `screenplay` when empty).

The Fountain body itself is identical between the two response
modes — only the wrapper differs.

## Ordering invariants (pinned by v1_screenplay_smoke #231)

These are not enforced by this route but by the serializer in
`fountain_export.js`. They must not regress:

- Scenes render in document order.
- Within a scene: scene heading → lines (in order) → blanks.
- Character cues with empty dialogue are dropped.
- Two consecutive calls on the same input produce byte-identical
  output.

See `docs/runbook-v1-smoke.md` § 2 for the smoke that pins
these.

## Compatibility rules

- iOS keys on `fountain` (string) as the primary payload.
- Adding optional metadata fields to the JSON envelope is
  tolerated.
- Changing the Fountain text-generation rules requires:
  1. A note on the agent-event lane.
  2. A bump of the relevant invariant in the
     `v1_screenplay_smoke` fixture if behavior changes.
- Removing `fountain` or `schemaVersion` from the JSON envelope
  requires a schema bump.

## Changelog

- v1 (compatible extension, 2026-08-30) — preserve centered text, lyrics,
  forced/ambiguous character cues, forced transitions, and Fountain dual-dialogue
  markers; normalize cross-platform clipboard line separators.
- v1 — initial documented shape, matched line-by-line against
  `mountFountainExportRoute` in
  `backend/lib/fountain_export_route.js`. Earlier draft invented
  a GET endpoint with a different path and invented response
  fields (`project_id`, `version_id`, `title`, `fountain_text`,
  `scene_count`, `character_count`, `line_count`, `exported_at`)
  that the live route does not emit; this version corrects to
  the actual `POST /screenplay/export/fountain` route and its
  `{ schemaVersion, fountain }` envelope.
