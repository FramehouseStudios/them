# io.them V1 Launch Doctor

The V1 Launch Doctor is the in-app smoke recorder for the last manual checks
before TestFlight or external review.

## App Path

Open Data Controls, then choose V1 Launch Doctor.

The panel covers four flows:

- Talk Pipeline
- Screenplay Studio
- Creative Memory
- Realtime

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

## Report Schema

```json
{
  "schemaVersion": 1,
  "source": "io.them.v1_launch_doctor",
  "generatedAt": "2026-05-15T00:00:00Z",
  "overallStatus": "passed",
  "summary": {
    "total": 4,
    "passed": 4,
    "failed": 0,
    "inProgress": 0,
    "notStarted": 0
  },
  "results": []
}
```

V1 signoff still requires a real human smoke. This artifact makes that smoke
auditable; it does not replace the human actually driving the app.
