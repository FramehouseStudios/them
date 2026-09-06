# THEM V1 Launch Doctor

The V1 Launch Doctor is the in-app smoke recorder for the last manual checks
before TestFlight or external review.

## App Path

Open Data Controls, then choose V1 Launch Doctor.

The panel covers five gates:

- Talk Pipeline
- Screenplay Studio
- Creative Memory
- Realtime
- iOS Release Readiness

Each flow has pass, fail, in-progress, notes, and evidence fields. Exporting
the report writes these files on macOS:

- `~/Downloads/io_them_v1_launch_doctor.latest.json`
- `~/Downloads/io_them_v1_launch_doctor.latest.md`

On iOS, the same filenames are written to the app's Documents directory for
TestFlight evidence.

## Launch Room

`node scripts/v1_launch_room.mjs --role=human` reports whether the latest JSON
proof is missing, invalid, failed, in progress, or passed. It checks
`docs/v1-launch-doctor.latest.json` first for repo-attached proof, then the
macOS Downloads export path. Tests can override the path with:

```sh
V1_LAUNCH_DOCTOR_REPORT=/path/to/report.json node scripts/v1_launch_room.mjs --json
```

## CLI Fallback

The app export is canonical when a person can run it. If the human has already
run the manual smoke and pasted the result block from
`scripts/v1_manual_qa_checklist.mjs --prompt`, Codex can record that proof
without retyping JSON:

```sh
node scripts/v1_launch_doctor_report.mjs --from-result-block=/tmp/v1-smoke.txt --write-docs
```

For direct entry, every flow must be explicit. Missing flows remain
`not_started`:

```sh
node scripts/v1_launch_doctor_report.mjs \
  --talk=pass \
  --studio=fail \
  --studio-notes="Export failed after save." \
  --memory=in-progress \
  --realtime=not-started \
  --release=not-started \
  --write-docs
```

`--write-docs` writes:

- `docs/v1-launch-doctor.latest.json`
- `docs/v1-launch-doctor.latest.md`

## Report Schema

```json
{
  "schemaVersion": 1,
  "source": "io.them.v1_launch_doctor",
  "generatedAt": "2026-05-15T00:00:00Z",
  "overallStatus": "passed",
  "summary": {
    "total": 5,
    "passed": 5,
    "failed": 0,
    "inProgress": 0,
    "notStarted": 0
  },
  "results": []
}
```

V1 signoff still requires a real human smoke. This artifact makes that smoke
auditable; it does not replace the human actually driving the app.
