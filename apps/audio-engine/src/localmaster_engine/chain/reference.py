"""Reference-based mastering (clean-room reimplementation, spec-only — see
docs/research/2026-07-04-automatic-mastering-landscape.md Section 1).

analyze_reference() measures a reference track's loudest-pieces averaged M/S
magnitude spectra + a few level/width stats into a JSON-serializable
ReferenceProfile. apply_matching() re-derives the same measurements for the
piece being mastered, builds a linear-phase FIR EQ curve from the ref/target
ratio (smoothed on a log-frequency grid), and applies it to mid and side
separately.

Two deliberate deviations from the written spec, both documented at the call
site below:
  1. BS.1770-gated (pyloudnorm) piece loudness replaces the spec's plain RMS
     for loudest-piece selection and the reported piece-gated LUFS — an
     upgrade this codebase's other stages already assume (see analysis.py).
  2. The spec's separate broadband level-match stage (+ its iterative
     level-correction stage) is dropped entirely. Program loudness is owned
     exclusively by chain/loudness.py downstream; apply_matching() only ever
     reshapes tone (mid, zero-mean curve) and width (side, un-de-meaned
     curve — its broadband component IS the level-matching substitute,
     scoped to the side channel only). This avoids two stages fighting over
     overall level.

No RNG anywhere — fully deterministic given the same inputs.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pyloudnorm
from scipy import signal

from localmaster_engine.analysis import true_peak_dbtp

PIECE_SECONDS = 15.0
MIN_PIECE_SECONDS = 1.0  # judgment call: a trailing remainder shorter than this
# is too short for stable BS.1770 gating and would skew the loudest-piece mean.
NPERSEG = 4096  # STFT frame size for spectrum analysis AND FIR tap count (per spec)
FIR_TAPS = NPERSEG
LOG_GRID_OVERSAMPLE = 4  # "4x oversampling" of the log-frequency grid, per spec
SMOOTH_FRAC = 0.0375  # spec's LOWESS frac, reused as the Savitzky-Golay window fraction
SIDE_CAP_DB = 12.0  # safety cap on the side (width) curve's broadband component
EPS = 1e-12
EPS_SPECTRUM = 1e-6  # per spec: "ref_avg_fft / max(target_avg_fft, 1e-6)"
SUMMARY_FREQS_HZ = np.geomspace(31.5, 16000.0, 10)


@dataclass(frozen=True)
class ReferenceProfile:
    """Pure function of a reference file's (samples, sample_rate) — every
    field is JSON-native so this round-trips through the HTTP job result."""

    sample_rate: int
    freqs_hz: list[float]
    mid_spectrum: list[float]
    side_spectrum: list[float]
    piece_gated_lufs: float
    mid_side_ratio_db: float
    true_peak_dbtp: float
    n_pieces_total: int
    n_pieces_loudest: int
    piece_seconds: float

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict) -> "ReferenceProfile":
        return ReferenceProfile(**d)


def _mid_side(samples: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if samples.shape[1] < 2:
        mid = np.array(samples[:, 0], copy=True)
        return mid, np.zeros_like(mid)
    mid = (samples[:, 0] + samples[:, 1]) / 2.0
    side = (samples[:, 0] - samples[:, 1]) / 2.0
    return mid, side


def _piece_bounds(n_samples: int, sample_rate: int) -> list[tuple[int, int]]:
    piece_len = max(int(PIECE_SECONDS * sample_rate), 1)
    min_len = int(MIN_PIECE_SECONDS * sample_rate)
    bounds = [(s, min(s + piece_len, n_samples)) for s in range(0, n_samples, piece_len)]
    kept = [(s, e) for s, e in bounds if e - s >= min_len]
    return kept or bounds


def _piece_loudness_db(
    samples: np.ndarray, sample_rate: int, bounds: list[tuple[int, int]]
) -> list[float]:
    meter = pyloudnorm.Meter(sample_rate)
    values = []
    for s, e in bounds:
        try:
            loudness = meter.integrated_loudness(samples[s:e])
        except ValueError:
            loudness = float("-inf")
        values.append(loudness if np.isfinite(loudness) else -120.0)
    return values


def _loudest_bounds(samples: np.ndarray, sample_rate: int) -> list[tuple[int, int]]:
    """Loudest-pieces selection: BS.1770-gated loudness (our upgrade over the
    spec's plain RMS) >= the energy-domain mean across all pieces — same
    gating convention as analysis.loudness_range_lu."""
    bounds = _piece_bounds(samples.shape[0], sample_rate)
    if len(bounds) == 1:
        return bounds
    loudness_db = _piece_loudness_db(samples, sample_rate, bounds)
    mean_power = float(np.mean(10 ** (np.array(loudness_db) / 10.0)))
    mean_db = 10 * np.log10(max(mean_power, EPS))
    loudest = [b for b, lufs in zip(bounds, loudness_db) if lufs >= mean_db]
    return loudest or bounds


def _avg_magnitude_spectrum(
    x_1d: np.ndarray, sample_rate: int, bounds: list[tuple[int, int]]
) -> tuple[np.ndarray, np.ndarray]:
    """Averaged boxcar-window STFT magnitude over the loudest pieces —
    averaged across frames within a piece, then across pieces."""
    per_piece = []
    freqs = None
    for s, e in bounds:
        piece = x_1d[s:e]
        if piece.shape[0] < NPERSEG:
            continue
        f, _, spec = signal.stft(piece, fs=sample_rate, window="boxcar", nperseg=NPERSEG, noverlap=0)
        freqs = f
        per_piece.append(np.mean(np.abs(spec), axis=1))
    if not per_piece:
        # Piece(s) shorter than NPERSEG (very short reference clip): fall back
        # to a single lower-resolution frame over the whole signal so short
        # references still produce a usable profile.
        n = max(min(NPERSEG, x_1d.shape[0]), 2)
        f, _, spec = signal.stft(x_1d, fs=sample_rate, window="boxcar", nperseg=n, noverlap=0)
        freqs = f
        per_piece = [np.mean(np.abs(spec), axis=1)]
    return np.asarray(freqs), np.mean(per_piece, axis=0)


def analyze_reference(samples: np.ndarray, sample_rate: int) -> ReferenceProfile:
    """Build a ReferenceProfile. Pure function of (samples, sample_rate) —
    cache-friendly, per the server contract."""
    mid, side = _mid_side(samples)
    all_bounds = _piece_bounds(samples.shape[0], sample_rate)
    loudest = _loudest_bounds(samples, sample_rate)
    freqs, mid_spec = _avg_magnitude_spectrum(mid, sample_rate, loudest)
    _, side_spec = _avg_magnitude_spectrum(side, sample_rate, loudest)

    loudest_stereo = np.concatenate([samples[s:e] for s, e in loudest], axis=0)
    piece_gated_lufs = float(pyloudnorm.Meter(sample_rate).integrated_loudness(loudest_stereo))
    loudest_mid = np.concatenate([mid[s:e] for s, e in loudest])
    loudest_side = np.concatenate([side[s:e] for s, e in loudest])
    mid_rms = float(np.sqrt(np.mean(loudest_mid**2)))
    side_rms = float(np.sqrt(np.mean(loudest_side**2)))
    mid_side_ratio_db = 20 * np.log10(max(side_rms, EPS) / max(mid_rms, EPS))

    return ReferenceProfile(
        sample_rate=sample_rate,
        freqs_hz=[float(v) for v in freqs],
        mid_spectrum=[float(v) for v in mid_spec],
        side_spectrum=[float(v) for v in side_spec],
        piece_gated_lufs=round(piece_gated_lufs, 2) if np.isfinite(piece_gated_lufs) else -70.0,
        mid_side_ratio_db=round(mid_side_ratio_db, 2),
        true_peak_dbtp=round(true_peak_dbtp(samples, sample_rate), 2),
        n_pieces_total=len(all_bounds),
        n_pieces_loudest=len(loudest),
        piece_seconds=PIECE_SECONDS,
    )


def _interp_log(freqs_hz: np.ndarray, values: np.ndarray, query_hz: np.ndarray) -> np.ndarray:
    freqs_hz = np.asarray(freqs_hz, dtype=float)
    values = np.asarray(values, dtype=float)
    mask = freqs_hz > 0
    return np.interp(np.log(np.maximum(query_hz, EPS_SPECTRUM)), np.log(freqs_hz[mask]), values[mask])


def _smooth(curve_db: np.ndarray) -> np.ndarray:
    """Savitzky-Golay (local quadratic regression) on the evenly log-spaced
    grid, standing in for the spec's LOWESS(frac=0.0375). This repo has no
    statsmodels dependency, and SG on an evenly spaced grid is the scipy-only
    equivalent of a local-regression smoother — same window fraction."""
    n = curve_db.shape[0]
    window = max(int(round(SMOOTH_FRAC * n)) | 1, 5)
    if window >= n:
        window = n - 1 if (n - 1) % 2 == 1 else n - 2
    if window < 5:
        return curve_db.copy()
    return np.asarray(signal.savgol_filter(curve_db, window_length=window, polyorder=2, mode="interp"))


def _curve_db(
    ref_freqs_hz: list[float] | np.ndarray,
    ref_mag: list[float] | np.ndarray,
    tgt_freqs_hz: np.ndarray,
    tgt_mag: np.ndarray,
    canonical_freqs_hz: np.ndarray,
) -> np.ndarray:
    ref_freqs_hz = np.asarray(ref_freqs_hz, dtype=float)
    ref_mag = np.asarray(ref_mag, dtype=float)
    tgt_freqs_hz = np.asarray(tgt_freqs_hz, dtype=float)
    tgt_mag = np.asarray(tgt_mag, dtype=float)

    ref_pos, tgt_pos = ref_freqs_hz[ref_freqs_hz > 0], tgt_freqs_hz[tgt_freqs_hz > 0]
    lo = max(20.0, float(ref_pos.min()), float(tgt_pos.min()))
    hi = min(float(ref_freqs_hz.max()), float(tgt_freqs_hz.max()))
    if hi <= lo:
        return np.zeros_like(canonical_freqs_hz)

    n_grid = LOG_GRID_OVERSAMPLE * max(ref_freqs_hz.size, tgt_freqs_hz.size)
    grid = np.geomspace(lo, hi, n_grid)
    ref_grid = _interp_log(ref_freqs_hz, ref_mag, grid)
    tgt_grid = _interp_log(tgt_freqs_hz, tgt_mag, grid)
    ratio_db = 20 * np.log10(np.maximum(ref_grid, EPS_SPECTRUM) / np.maximum(tgt_grid, EPS_SPECTRUM))
    smoothed = _smooth(ratio_db)

    curve = np.empty_like(canonical_freqs_hz)
    audible = canonical_freqs_hz > 0
    curve[audible] = _interp_log(grid, smoothed, canonical_freqs_hz[audible])
    curve[~audible] = float(smoothed[0])  # DC bin: clamp to the lowest-grid value
    return curve


def _linear_phase_fir(curve_db: np.ndarray, n_taps: int = FIR_TAPS) -> np.ndarray:
    """Frequency-sampling FIR design: treat curve_db as a zero-phase target
    magnitude response, take the inverse real FFT, center it (fftshift) to
    get a symmetric linear-phase impulse response, then window it (Hann)."""
    linear = 10 ** (curve_db / 20.0)
    impulse = np.fft.irfft(linear, n=n_taps)
    centered = np.fft.fftshift(impulse)
    return centered * np.hanning(n_taps)


def _convolve_delay_compensated(x_1d: np.ndarray, fir: np.ndarray) -> np.ndarray:
    """Full convolution, then trim the linear-phase FIR's constant group
    delay (taps/2) so the output stays time-aligned and the same length."""
    taps = fir.shape[0]
    full = np.asarray(signal.fftconvolve(x_1d, fir, mode="full"))
    start = taps // 2
    return full[start : start + x_1d.shape[0]]


def _band_summary(freqs_hz: np.ndarray, curve_db: np.ndarray) -> dict[str, float]:
    vals = _interp_log(freqs_hz, curve_db, SUMMARY_FREQS_HZ)
    return {f"{int(round(f))}hz": round(float(v), 2) for f, v in zip(SUMMARY_FREQS_HZ, vals)}


def apply_matching(
    samples: np.ndarray, sample_rate: int, profile: ReferenceProfile, strength: float = 0.35
) -> tuple[np.ndarray, dict]:
    """Reshape `samples` toward `profile`'s spectral tilt (mid) and width
    (side), scaled by `strength` (0=passthrough, 1=full curve)."""
    strength = float(np.clip(strength, 0.0, 1.0))
    if strength <= 0.0:
        return samples.copy(), {"stage": "reference_match", "strength": 0.0, "applied": False}

    is_stereo = samples.shape[1] >= 2
    mid, side = _mid_side(samples)
    bounds = _loudest_bounds(samples, sample_rate)
    canonical_freqs = np.fft.rfftfreq(FIR_TAPS, d=1.0 / sample_rate)

    tgt_freqs, tgt_mid_mag = _avg_magnitude_spectrum(mid, sample_rate, bounds)
    mid_curve_db = _curve_db(
        profile.freqs_hz, profile.mid_spectrum, tgt_freqs, tgt_mid_mag, canonical_freqs
    )
    # Deviation (see module docstring #2): zero the mid curve's broadband
    # component. A raw ref/target magnitude ratio also carries an overall
    # level term; applying that on mid would re-level the mix and fight
    # chain/loudness.py's own convergence loop downstream.
    mid_curve_db = mid_curve_db - float(np.mean(mid_curve_db))
    mid_curve_db *= strength
    mid_out = _convolve_delay_compensated(mid, _linear_phase_fir(mid_curve_db))

    side_curve_db = np.zeros_like(canonical_freqs)
    if is_stereo:
        _, tgt_side_mag = _avg_magnitude_spectrum(side, sample_rate, bounds)
        side_curve_db = _curve_db(
            profile.freqs_hz, profile.side_spectrum, tgt_freqs, tgt_side_mag, canonical_freqs
        )
        # Deviation: the side curve is NOT de-meaned. Its broadband component
        # is the reference's mid/side (width) balance — our substitute for
        # the spec's separate broadband level-match stage, scoped to width
        # only so it never touches overall program loudness.
        side_curve_db = np.clip(side_curve_db, -SIDE_CAP_DB, SIDE_CAP_DB) * strength
        side_out = _convolve_delay_compensated(side, _linear_phase_fir(side_curve_db))
        out = np.column_stack([mid_out + side_out, mid_out - side_out])
    else:
        out = mid_out[:, None]

    meta = {
        "stage": "reference_match",
        "strength": strength,
        "applied": True,
        "n_pieces_loudest": len(bounds),
        "reference_piece_gated_lufs": profile.piece_gated_lufs,
        "reference_mid_side_ratio_db": profile.mid_side_ratio_db,
        "mid_band_deltas_db": _band_summary(canonical_freqs, mid_curve_db),
        "side_band_deltas_db": _band_summary(canonical_freqs, side_curve_db),
    }
    return out, meta
