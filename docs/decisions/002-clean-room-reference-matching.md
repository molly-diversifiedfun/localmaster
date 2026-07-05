# ADR 002 — Clean-room reference matching (process + deviations)

Date: 2026-07-05 · Status: accepted, implemented (431b9ba)

## Context
Reference-based mastering ("make my track sit like this one") is the highest-value
adaptive feature. The canonical open implementation, Matchering, is GPL-3.0 —
adopting any of its code would force LocalMaster off MIT.

## Decision
Reimplement from a **written algorithm spec only**
(`docs/research/2026-07-04-automatic-mastering-landscape.md` §1), with role
separation: the spec author and the implementer were different agents, and the
implementer was instructed never to open Matchering's source. A post-hoc audit
by a third agent compared the result against Matchering's actual code and found
independent expression throughout (different smoothing, interpolation, naming,
structure, and pipeline shape). Legal basis: algorithms are not copyrightable
expression (CJEU SAS v WPL); the hazard is non-literal copying, which the role
separation addresses.

## Deviations from the spec (deliberate, documented in chain/reference.py)
1. **BS.1770 piece loudness** replaces plain RMS for loudest-piece selection.
2. **No broadband level-match stage**: program loudness stays owned by
   chain/loudness.py; matching shapes spectrum (mid, de-meaned curve) and
   width (side, capped ±12 dB) only. Avoids two stages fighting over level.

## Consequences
- LocalMaster stays MIT; the audit trail (spec → implementation → comparison
  review) is on record in this repo + session reviews.
- Anyone extending `chain/reference.py` must keep the same discipline: change
  via the spec, never by consulting GPL implementations.
