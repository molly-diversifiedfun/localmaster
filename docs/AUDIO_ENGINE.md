# LocalMaster Audio Engine

Deterministic, analysis-driven mastering DSP. **Not AI mastering** — every stage
is conventional signal processing whose parameters come from presets (editable
defaults) plus measured input analysis. Identical input + identical parameters
produce **bit-identical** output (asserted by test).

## Input analysis (`analysis.py`)

| Measurement | Method |
|---|---|
| Integrated LUFS | BS.1770 via pyloudnorm |
| Short-term loudness | 3 s window / 1 s hop, window-local BS.1770 |
| Loudness range (LU) | EBU Tech 3342-style gating on the short-term series (p95 − p10) |
| True peak (dBTP) | 4× polyphase oversampling, max |sample| |
| Sample peak, DC offset | direct |
| Spectral balance | Welch PSD → energy share in low <100 / low-mid 100–400 / mid 400–2k / high-mid 2–8k / high 8–20k |
| Clipping | runs of ≥3 consecutive samples at ≥ 0.9995 FS |
| Sub-bass excess / harshness / stereo imbalance | band-energy ratios and L/R RMS delta with thresholds |

Tempo/key estimation is **deferred** (would be approximate, best-effort,
never pipeline-blocking; excluded from MVP because librosa pulls an LGPL dep).

## Processing chain (`pipeline.py`, fixed order)

1. **DC removal** — per-channel mean subtraction (optional, on by default).
2. **High-pass** — 2nd-order Butterworth, preset default 25–35 Hz.
3. **EQ** — cascade of RBJ-cookbook biquads (peaking, low/high shelf) from the preset.
4. *(deferred)* dynamic low-mid control.
5. **Compressor** — broadband, stereo-linked peak detection per 64-sample block,
   soft-knee gain computer, attack/release one-pole smoothing, linear gain
   interpolation between blocks.
6. *(deferred)* multiband compression.
7. **Saturation** — normalized `tanh` soft-clip with dry/wet mix.
8. **Stereo** — M/S width above a Linkwitz-Riley (LR4) crossover; bass below the
   crossover is summed to mono.
9. + 10. **Loudness stage** (`chain/loudness.py`) — normalization and limiting are
   deliberately one iterative stage; see below.
11. **TPDF dither** — 16-bit export only; RNG seeded from a hash of
    (audio content + parameters) so exports stay deterministic.

## The loudness stage and the transient guard

Reaching e.g. −9 LUFS under a −1.0 dBTP ceiling **requires** limiting; "never
over-limit" and "always hit target" cannot both be guaranteed. LocalMaster's
resolution (ADR 001):

- Up to 8 normalize→limit passes walk the loudness toward target, because a
  limiter eats some integrated loudness each pass and one pass undershoots.
- Each pass may only *spend budget*: predicted gain reduction on the
  **sustained level** (99.5th-percentile envelope) is charged against the
  preset's `gr_budget_db` (Clean DJ Master: 4 dB). Dense material (noise-like)
  charges almost nothing and converges to target; transient material (kicks)
  charges immediately and the loop stops early.
- Rare single peaks may receive more reduction than the budget — that is what
  limiters are for. The budget protects the *body* of the music from sustained
  crushing (i.e., it preserves peak-to-body contrast — punch).
- When the guard binds, the report says exactly what was reached and why.
  Targets are editable defaults, never guarantees.

**Limiter** — lookahead limiter: per-sample required gain from a 4×-oversampled
peak envelope, sliding-window minimum over the lookahead, Hann smoothing (each
smoothed value is an average of window minima that all cover the current
sample, so the smoothed curve never demands less reduction than required),
block-rate one-pole release, 0.1 dB safety margin, final sample clip at the
ceiling. **Labeled limitation:** detection is 4×-oversampled peak, not a full
true-peak reconstruction limiter; the safety margin plus the ceiling acceptance
test keep output under the preset ceiling in practice.

## Determinism

- No wall-clock, no unseeded RNG anywhere in the audio path.
- Dither seed = SHA-256(audio bytes + preset JSON).
- `/export` re-renders rather than caching the preview in memory — the
  determinism guarantee makes the export bit-identical to the preview while
  avoiding a second in-memory copy of the track.

## DJ-reality caveat

DJ software applies its own gain management. Masters hotter than about
−9 LUFS mostly spend headroom rather than sounding louder in the booth. The
default recommendation stays 24-bit WAV at the source sample rate.
