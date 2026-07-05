# Session Handoff: LocalMaster — greenfield to packaged app + reference matching

**Date:** 2026-07-05
**Project:** ~/github/localmaster (no git remote yet)
**Session Duration:** ~2 days of sessions (2026-07-04 → 07-05)

## Current State

**Task:** Build LocalMaster (local-first mastering app for Suno WAVs → DJ-ready masters)
**Phase:** MVP shipped + first post-MVP features; awaiting Molly's listening verdict
**Progress:** Engine, UI, packaging, batch, reference matching all done & reviewed. Refmatch has NO UI yet.

## What We Did

Cleared the three pre-build gates (Tauri+PyInstaller sidecar spike; permissive-license audit; loudness/transient resolution), built the full engine (BS.1770 analysis, 8-stage chain, transient-guard loudness, 7 presets, batch, exports+reports), the single-flow Tauri UI (design manifest, matrix-stamp identity, layered volume-matched A/B), packaged a double-clickable .app with the engine bundled, mastered Molly's 12-track LOCK-IN album as the real-world smoke, ran verified research on automatic-mastering algorithms, and implemented clean-room reference matching from that research's spec.

## Decisions Made

- **Tauri 2 + PyInstaller ONEDIR sidecar** — proven by spike; onedir keeps LGPL libsndfile a replaceable dylib (ADR 001)
- **MIT license, permissive-only deps** — pedalboard/ffmpeg/librosa excluded or external (ADR 001, THIRD_PARTY_NOTICES)
- **Transient guard** — normalization capped by sustained-GR budget; honest under-target reporting (ADR 001)
- **Clean-room reference matching** — spec-writer ≠ implementer ≠ auditor; audit vs real GPL source passed (ADR 002)
- **DistroKid integration ruled out** (no public API); chose "release-ready export profile" path instead
- **Loudness ownership** — reference matching shapes spectrum/width only; chain/loudness.py owns level

## Code Changes

24 commits, all reviewed (wbreview 24-agent + 6 single-pass rounds). Key areas:
- `apps/audio-engine/src/localmaster_engine/` — analysis, chain/ (incl. reference.py), pipeline, server (CORS allowlist, host guard, /batch, /reference-analyze)
- `apps/desktop/src/` — single-flow InstrumentScreen + flow-state reducer, A/B hero, batch, export bar
- `apps/desktop/src-tauri/` — resource-bundled engine spawn (std::process), icons, bundle config
- `.design/localmaster-desktop.md|.theme.css` — validated design manifest (UI law)
- `Makefile` — setup/dev/test/app targets

## Open Questions

- [ ] **Molly's listening verdict on Clean DJ Master** (gates preset tuning) — Masters at `~/Desktop/Locked In/Masters/` + compare.html
- [ ] Does she want the release-ready export promoted above refmatch UI?
- [ ] Ever distribute publicly? (signing/notarization work waits on this)

## Blockers / Issues

None blocking. Non-blocking review notes: engine.rs child unreaped until quit; FIR Hann half-sample asymmetry (sub-audible). Both in HANDOFF.md.

## Context to Remember

- NEVER say "AI mastering" — deterministic analysis-driven DSP (in NOTICE, UI, docs)
- Refmatch extensions: spec-only, never read Matchering/GPL source (ADR 002)
- UI/theme changes REQUIRE rendered-screenshot verification (Tailwind v4 --spacing-* collision burned us; memory saved)
- Engine is loopback-only + CORS allowlisted to app origins only; that posture is reviewed — don't loosen
- Suno WAVs land ~−14.5 LUFS / −4 dBTP; Clean DJ target −9/−1.0 with 4 dB guard

## Next Steps

1. [ ] Reference-matching UI: picker + strength slider in Adjust drawer (contract fields already exist)
2. [ ] Release-ready export profile (−14 LUFS streaming variant + DistroKid-spec checklist + metadata sidecar)
3. [ ] Style presets (DnB/phonk/house) + heuristic recommend (research doc §2 Ozone rules)
4. [ ] Multiband compression (research doc §3 papers)
5. [ ] engine.rs try_wait reap + git remote/GitHub repo creation if distributing

## Files to Review on Resume

- `HANDOFF.md` — lean pointer (this doc's summary)
- `docs/research/2026-07-04-automatic-mastering-landscape.md` — algorithm specs + license verdicts
- `docs/decisions/001,002` — the two ADRs
- `packages/shared/api-contract.md` — frozen API incl. reference fields
- `.design/localmaster-desktop.md` — design law for any UI work
