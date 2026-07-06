# Plan — Release-ready export + distribute plugin seam (Issue #2)

Implements ADR 003. Public repo only; the DistroKid plugin is private.

## Bundle format (frozen contract)
Release export writes a **bundle directory** (the export `out_dir`) containing:
- `master.wav` — release master (streaming variant)
- `metadata.json` — `TrackMetadata` (below)
- the artwork file, **copied into the bundle** (so it's self-contained)
- existing `.report.json` / `.report.txt`

`TrackMetadata` (add to `packages/shared/types.ts` + mirror in
`packages/shared/api-contract.md`, frozen-lockstep):
```
TrackMetadata {
  title: string; artist: string; isrc?: string;
  primaryGenre: string; secondaryGenre?: string;
  explicit: boolean; artworkPath: string;   // absolute on input; bundle-relative on write
  recordLabel?: string; releaseDate?: string; // YYYY-MM-DD
}
```

## Engine (Python) — `apps/audio-engine`
1. Streaming variant: reuse existing `streaming_balanced` preset (presets.py:77-89,
   −14 LUFS / −1.0 dBTP). No new DSP.
2. `ExportBody` (server/app.py:105-110): add optional `metadata: dict | None` and
   `profile: "dj" | "release"` (default "dj"). `profile="release"` selects the
   release checklist + writes the metadata sidecar.
3. `export.py`: when `metadata` given, write `metadata.json` next to the reports
   (export.py:186-189) and copy the artwork into the bundle; rewrite
   `metadata.artworkPath` to the bundle-relative filename.
4. Release checklist (export.py:_checklist 110-120): for `profile="release"` add
   `accepted_streaming_specs` (sample_rate ∈ {44100,48000}, bit_depth ∈ {16,24}),
   keep TP≤ceiling, no-clipping, loudness-within-tolerance(−14). reports.py
   (38,66-69): label switches "DJ readiness"→"Release readiness" by profile.
5. Reflect new fields in `types.ts` + `api-contract.md`.

## Desktop (React/Tauri) — `apps/desktop`
1. `TrackMetadataForm` component (title/artist/ISRC/genre×2/explicit/artwork
   picker/label/date) + app-state slice. Artwork picker via existing file dialog.
2. Release vs DJ: when the release profile/preset is active, show the metadata
   form + release checklist labels (branch DjChecklist.tsx labels by profile).
3. "Distribute…" button in ExportBar (after a release export): invokes a new Rust
   command `run_distribute_plugin(bundle_dir)` that reads `~/.localmaster/plugins.json`
   `{ "<id>": "<command>" }`, spawns `<command> <bundle_dir>`; if none, opens
   `https://distrokid.com/new/` via existing shell-open. Add the minimal Tauri
   capability (execute the configured command) — scope tightly; document it.
4. `.gitignore`: ensure `~/.localmaster/` isn't relevant (it's outside repo), but
   ship a `plugins.example.json` doc, not a real config.

## Tests
- pytest (tests/test_export_and_reports.py, test_server.py): metadata.json written
  + valid + artwork copied + bundle-relative path; release checklist keys +
  accepted_streaming_specs pass/fail; `/export` with profile=release + metadata.
- vitest: TrackMetadataForm (renders, edits, validation), release checklist labels,
  Distribute button (plugin-configured invoke path + no-plugin fallback path).

## Out of scope (this pass)
- The DistroKid plugin itself (private repo `distrokid-uploader` gets a
  `distribute <bundle-dir>` CLI separately).
- Aggregator APIs / multi-user distribution (ADR 003 "Consequences").
