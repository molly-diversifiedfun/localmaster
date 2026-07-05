# Spec — Reference-matching UI (LocalMaster Issue #1)

Date: 2026-07-05 · Status: SHIPPED (PR for Issue #1) · Scope: M · Engine/API DONE (431b9ba)

> Completion note: all 13 acceptance criteria verified — 1–9 live against the real
> engine (Playwright + vite dev + `__TAURI_INTERNALS__` dialog stub), 10–12 by vitest,
> 13 unreachable by construction. The rendered-screenshot check caught a real contract
> drift the 110-test suite missed: the engine emits `mid/side_band_deltas_db` as
> label→dB records, not arrays (fixed in c20b631; contract doc updated).

## User story

As a DJ mastering a track, I want to point LocalMaster at a reference WAV and dial
how strongly my master should be shaped toward it, so my track sits tonally and
stereo-width-wise like a record I already trust — without hiring an engineer.

Never call this "AI mastering". The feature is **reference match** / "Match a
reference…". Matching shapes spectrum + stereo width only; program loudness stays
owned by the loudness stage (ADR 002).

## Where it lives (mirror existing patterns — do not invent)

Reference state is a sibling of `overrides` in shared app-state. It flows through the
exact same master/export/dirty/re-master machinery that preset overrides already use.

- **`state/app-state.tsx`** — add two fields + setters, mirroring `overrides`/`setOverrides`:
  - `referencePath: string | null` (default `null`)
  - `matchStrength: number` (default `0.35`, the contract's conservative default)
- **`lib/tauri.ts`** — reuse the existing `pickWavFile()` (single-file WAV picker).
  No new Tauri wrapper needed.
- **`packages/shared/types.ts`** — add optional `reference_path?: string` and
  `match_strength?: number` to `MasterRequest` and `ExportRequest`. Add a
  `ReferenceMatchStageMeta` interface (`stage: "reference_match"`, `strength: number`,
  `mid_band_deltas_db: number[]`, `side_band_deltas_db: number[]`) for the
  `stage_meta` entry ResultView reads. **No change to `lib/api.ts`**: `master()` /
  `exportMaster()` already `JSON.stringify` the whole typed request, so the new
  optional fields forward automatically once the types carry them.
- **`components/ReferenceMatchControl.tsx`** (NEW, <40-line functions) — the picker +
  slider + clear affordance, rendered inside `AdjustDrawer` above `PresetControlsPanel`.
- **`components/ReferenceMatchStamp.tsx`** (NEW) — renders the `reference_match`
  stage-meta deltas in `ResultView`, using the `MatrixStamp` mono/stamped idiom.
- **`screens/InstrumentScreen.tsx`** — own the new state + a `referenceDirty` flag
  parallel to `overridesDirty`; pass `reference_path`/`match_strength` into
  `handleMaster` and `handleExport`; clear reference on new file / new track only.

## Acceptance criteria (each is a UI behavior to build + test)

### Picking & clearing a reference (in `AdjustDrawer` → `ReferenceMatchControl`)
1. A "Match a reference…" button calls `pickWavFile()`. A returned path is stored in
   `referencePath`; a `null` (cancelled dialog) is a no-op — state unchanged.
2. When a reference is set, show its `basename(referencePath)` (mono/`MatrixStamp`
   style) with a title tooltip of the full path, plus a clear control (× / "Clear")
   that resets `referencePath` to `null`.
3. When no reference is set, show only the "Match a reference…" button (no filename,
   no clear control).

### Strength slider
4. A `0–100%` range input (`min=0 max=100 step=1`), displayed value shown as a
   percentage. It maps to `matchStrength` as `value / 100`; initial position is 35%
   (from the `0.35` default).
5. **Strength change without a reference = no-op**: the slider is `disabled` while
   `referencePath` is `null`, and its change handler ignores calls when no reference
   is set (defense-in-depth). It never sets the dirty flag and never triggers a master.

### Re-master CTA (mirror the `overridesDirty` pattern exactly)
6. `AdjustDrawer` renders ONE Re-master CTA driven by `dirty = overridesDirty ||
   referenceDirty`. At `flow.stage === "result"`, picking a reference, clearing it, or
   moving the slider (only while a reference is set) sets `referenceDirty = true` →
   CTA appears. Before the result stage (track stage / first master), changes just
   store state and are consumed by the first `Master this track`, matching how
   `handleOverridesChange` only marks dirty at the result stage.
7. Clicking Re-master calls the existing `handleMaster`, which now sends
   `reference_path` (only when set) and `match_strength`. On master success, both
   `overridesDirty` and `referenceDirty` reset to `false`.

### Showing the match result (in `ResultView` → `ReferenceMatchStamp`)
8. After a master with a reference, find the `stage_meta` entry with
   `stage === "reference_match"` and render its `strength` (as a %) plus a compact
   read of `mid_band_deltas_db` and `side_band_deltas_db` (labelled Mid / Side, dB,
   mono-stamped). Render nothing when no such entry exists (no reference was used).

### Persistence & reset
9. `referencePath` and `matchStrength` **persist across re-masters** (they live in
   shared app-state; `handleMaster` never clears them — same as `overrides`).
10. Selecting a **new file** (`selectFiles`) and **New track** (`handleNewTrack`)
    reset `referencePath` to `null` and `matchStrength` to `0.35`, alongside the
    existing `setOverrides({})` / `setOverridesDirty(false)` reset.
11. Changing the **preset** does NOT clear the reference (reference is orthogonal to
    preset; only `overrides` reset on preset change).

### Edge cases
12. **Invalid reference file**: an unreadable/invalid reference produces a normal job
    `error` server-side (not a synchronous 4xx). `handleMaster`'s existing catch fires
    `MASTER_ERROR`; because `flowReducer` falls back to `"result"` when a prior master
    exists, the earlier valid master is preserved and the engine's error message is
    surfaced via `ResultView`'s `error` (errorSource `"master"`). Assert both.
13. **Out-of-range strength (`422 invalid_match_strength`)**: the slider is clamped to
    0–100 so the UI cannot produce this; if the engine ever returns it, the existing
    `ApiError` path surfaces the message like any other master error. No special UI.

## Test plan (build-green ≠ renders — screenshot per repo discipline)

**Vitest component/unit** (`*.test.tsx`, colocated; mirror `InstrumentScreen.test.tsx`
mocking of `../lib/api` + `../lib/tauri`):
- `ReferenceMatchControl.test.tsx`: renders button-only with no reference; shows
  basename + clear after a pick; slider disabled with no reference and enabled after;
  clear resets to null; strength change with no reference is a no-op.
- `ReferenceMatchStamp.test.tsx`: renders Mid/Side deltas + strength% for a
  `reference_match` stage-meta fixture; renders nothing when the entry is absent.
- `InstrumentScreen.test.tsx` (extend): mock `pickWavFile`; assert `masterAndWait` is
  called with `reference_path` + `match_strength` after picking a reference and
  mastering; assert reference persists across a re-master; assert a `reference_match`
  stage-meta fixture renders in the result; assert an errored re-master with a bad
  reference keeps the prior result and shows the error.

**Rendered-screenshot check** (Playwright, per the Tailwind lesson — a green build has
silently shipped broken layout here before): capture the Adjust drawer with a reference
selected + slider mid-travel, and the ResultView reference-match stamp, in dark mode.
Verify the mono stamp, slider, and clear affordance actually render (no zero-size /
collapsed elements, brand-green only on fresh values).

## Out of scope (do not build in this issue)

- Calling `POST /reference-analyze` / previewing the reference's own `ReferenceProfile`
  (its own LUFS/width) before mastering. Deltas come from the master job's
  `stage_meta`; a pre-master reference preview + its client + `ReferenceProfile` type
  wiring is a separate follow-up. Do not add unused API surface.
- Per-band visual EQ overlay of the deltas (curve rendering); a numeric/stamped read
  is enough for MVP.
- Multiple references / reference presets / saving a reference to reuse across tracks.
- Batch/album reference matching (`/batch` has no reference field in the contract).
- Reading Matchering or any GPL source to inform the UI or delta interpretation
  (ADR 002 clean-room discipline — spec-only).

## Constraints (enforced)
Never "AI mastering". Refmatch is spec-only, never read GPL source (ADR 002).
Max 40-line functions. kebab-case files. Immutable state (spread, never mutate).
