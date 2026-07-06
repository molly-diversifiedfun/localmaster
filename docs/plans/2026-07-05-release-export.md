# Plan — Release-ready export + distribute plugin seam (Issue #2)

Implements ADR 003. Public repo only; the DistroKid plugin is private.

## Bundle format (frozen contract)
Release export writes a **dedicated per-release bundle subdirectory** of the
export `out_dir` — never `out_dir` itself, so a shared out_dir (e.g. the
desktop's persisted default export dir) never lets one track's bundle
collide with another's. The subdir is named `"<artist> - <title>"`
(sanitized for the filesystem) when `metadata` has both, else the original
file's stem, with a `__2`/`__3`/… suffix on collision. It contains:
- the release master WAV, named by the engine's normal export convention
  (`{orig}__LocalMaster__{preset}__{LUFS}LUFS__{sr}Hz__{bits}bit.wav` — not
  a literal `master.wav`, since the achieved LUFS/format are only known
  after rendering)
- `metadata.json` — `TrackMetadata` (below), including `masterFile` (the
  bundle-relative filename of the wav above, always set by the engine)
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
  masterFile?: string; // bundle-relative wav filename; engine always sets this on write
}
```

## Engine (Python) — `apps/audio-engine`
1. Streaming variant: reuse existing `streaming_balanced` preset (presets.py:77-89,
   −14 LUFS / −1.0 dBTP). No new DSP.
2. `ExportBody` (server/app.py:105-110): add optional `metadata: dict | None` and
   `profile: "dj" | "release"` (default "dj"). `profile="release"` selects the
   release checklist + writes the metadata sidecar. `metadata`, when given, is
   synchronously validated (`422 invalid_metadata`) for `title`/`artist`/
   `primaryGenre`/`artworkPath`, independent of `profile`.
3. `export.py`: for `profile="release"`, claim a unique bundle subdir under
   `out_dir` (`_claim_unique_dir`) and write everything into it instead of
   `out_dir` directly. When `metadata` given (independent of `profile`), write
   `metadata.json` into the bundle dir (or `out_dir` for a dj-profile export)
   and copy the artwork alongside it; rewrite `metadata.artworkPath` to the
   bundle-relative filename and always set `metadata.masterFile` to the
   bundle-relative master wav filename.
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
  accepted_streaming_specs pass/fail; `/export` with profile=release + metadata;
  two release exports of different/same-titled tracks into the same out_dir
  don't collide (dedicated bundle subdir, claim-unique on name collision);
  `masterFile` present and correct; `422 invalid_metadata` on missing required
  metadata fields.
- vitest: TrackMetadataForm (renders, edits, validation), release checklist labels,
  Distribute button (plugin-configured invoke path + no-plugin fallback path),
  Distribute visibility gated on `metadata_path` (not on checklist shape).

## Out of scope (this pass)
- The DistroKid plugin itself (private repo `distrokid-uploader` gets a
  `distribute <bundle-dir>` CLI separately).
- Aggregator APIs / multi-user distribution (ADR 003 "Consequences").

## Post-review amendments (2026-07-05)
Code review of the initial implementation found: (1) metadata.json/artwork
collisions when 2+ release exports share an `out_dir` — fixed via the
per-release bundle subdirectory above; (2) `metadata.json` had no field
naming the audio, and this doc + ADR 003 wrongly described a literal
`master.wav` — fixed via `masterFile` + corrected docs; (3) `ExportBody.metadata`
had zero server-side validation — fixed via `422 invalid_metadata`; (4)
desktop's Distribute-button visibility keyed on checklist shape instead of
whether a metadata sidecar actually exists — fixed to check `metadata_path`;
(5) `distribute.rs` hardened to refuse a group/world-writable
`~/.localmaster/plugins.json` and to document that `command` should be an
absolute path (GUI-process PATH is not the shell's PATH).
