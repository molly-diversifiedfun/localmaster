"""Input analysis: loudness, peaks, spectral balance, issue detection.

All measurements are deterministic DSP (BS.1770 loudness via pyloudnorm).
Tempo/key estimation is deliberately absent from MVP (deferred, best-effort only).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np
import pyloudnorm
from scipy import signal

TRUE_PEAK_OVERSAMPLE = 4
CLIP_THRESHOLD = 0.9995
CLIP_RUN_SAMPLES = 3
DC_FLAG_THRESHOLD = 1e-3
SUB_BASS_HZ = 40.0
SUB_BASS_EXCESS_RATIO = 0.30
HARSH_BAND = (2500.0, 6000.0)
HARSH_EXCESS_RATIO = 0.35
IMBALANCE_FLAG_DB = 1.5
BAND_EDGES_HZ = (20.0, 100.0, 400.0, 2000.0, 8000.0, 20000.0)
BAND_NAMES = ("low", "low_mid", "mid", "high_mid", "high")


@dataclass(frozen=True)
class AnalysisReport:
    sample_rate: int
    n_channels: int
    duration_seconds: float
    bit_depth: int | None
    integrated_lufs: float
    short_term_lufs: list[float]
    loudness_range_lu: float
    true_peak_dbtp: float
    sample_peak_dbfs: float
    spectral_balance: dict[str, float]
    dc_offset: list[float]
    has_dc_offset: bool
    clipped_regions: int
    has_clipping: bool
    has_excessive_sub_bass: bool
    has_harshness: bool
    stereo_imbalance_db: float
    has_stereo_imbalance: bool
    leading_silence_seconds: float
    trailing_silence_seconds: float
    waveform_overview: list[list[float]]

    def to_dict(self) -> dict:
        return asdict(self)


def _db(x: float, floor: float = -160.0) -> float:
    return float(20 * np.log10(x)) if x > 0 else floor


def sample_peak_dbfs(samples: np.ndarray) -> float:
    return _db(float(np.max(np.abs(samples))))


def true_peak_dbtp(samples: np.ndarray, sample_rate: int) -> float:
    """Inter-sample peak via polyphase oversampling (BS.1770 Annex 2 approach)."""
    up = signal.resample_poly(samples, TRUE_PEAK_OVERSAMPLE, 1, axis=0)
    return _db(float(np.max(np.abs(up))))


def short_term_loudness(samples: np.ndarray, sample_rate: int) -> list[float]:
    """3 s window / 1 s hop loudness series (window-local BS.1770 measurement)."""
    meter = pyloudnorm.Meter(sample_rate)
    window, hop = 3 * sample_rate, sample_rate
    values = []
    for start in range(0, max(samples.shape[0] - window, 0) + 1, hop):
        block = samples[start : start + window]
        if block.shape[0] < window:
            break
        loudness = meter.integrated_loudness(block)
        if np.isfinite(loudness):
            values.append(round(float(loudness), 2))
    return values


def loudness_range_lu(short_term: list[float]) -> float:
    """EBU Tech 3342-style LRA from the short-term series (abs + relative gate)."""
    st = np.array([v for v in short_term if v > -70.0])
    if st.size < 2:
        return 0.0
    gated_mean = 10 * np.log10(np.mean(10 ** (st / 10)))
    st = st[st > gated_mean - 20.0]
    if st.size < 2:
        return 0.0
    p10, p95 = np.percentile(st, [10, 95])
    return round(float(p95 - p10), 2)


def spectral_balance(samples: np.ndarray, sample_rate: int) -> dict[str, float]:
    """Share of total energy per band (fractions summing to ~1)."""
    mono = np.mean(samples, axis=1)
    freqs, psd = signal.welch(mono, fs=sample_rate, nperseg=8192)
    bands = {}
    for name, lo, hi in zip(BAND_NAMES, BAND_EDGES_HZ[:-1], BAND_EDGES_HZ[1:]):
        mask = (freqs >= lo) & (freqs < min(hi, sample_rate / 2))
        bands[name] = float(np.trapezoid(psd[mask], freqs[mask])) if mask.any() else 0.0
    in_range_total = sum(bands.values()) or 1e-30
    return {name: round(energy / in_range_total, 4) for name, energy in bands.items()}


def count_clipped_regions(samples: np.ndarray) -> int:
    clipped = np.any(np.abs(samples) >= CLIP_THRESHOLD, axis=1).astype(int)
    edges = np.diff(np.concatenate(([0], clipped, [0])))
    starts, ends = np.where(edges == 1)[0], np.where(edges == -1)[0]
    return int(np.sum((ends - starts) >= CLIP_RUN_SAMPLES))


def _band_energy_ratio(samples: np.ndarray, sample_rate: int, lo: float, hi: float) -> float:
    mono = np.mean(samples, axis=1)
    freqs, psd = signal.welch(mono, fs=sample_rate, nperseg=8192)
    total = float(np.trapezoid(psd, freqs)) or 1e-30
    mask = (freqs >= lo) & (freqs < hi)
    return (float(np.trapezoid(psd[mask], freqs[mask])) if mask.any() else 0.0) / total


def stereo_imbalance_db(samples: np.ndarray) -> float:
    if samples.shape[1] < 2:
        return 0.0
    rms = np.sqrt(np.mean(samples**2, axis=0))
    if min(rms) <= 0:
        return 0.0 if max(rms) <= 0 else 99.0
    return round(float(20 * np.log10(rms[0] / rms[1])), 2)


SILENCE_THRESHOLD_DBFS = -60.0
SILENCE_BLOCK_SECONDS = 0.01


def silence_bounds_seconds(samples: np.ndarray, sample_rate: int) -> tuple[float, float]:
    """(leading, trailing) silence duration below -60 dBFS, 10 ms resolution."""
    block = max(int(sample_rate * SILENCE_BLOCK_SECONDS), 1)
    n_blocks = int(np.ceil(samples.shape[0] / block))
    padded = np.zeros((n_blocks * block, samples.shape[1]))
    padded[: samples.shape[0]] = samples
    peaks = np.abs(padded).max(axis=1).reshape(n_blocks, block).max(axis=1)
    loud = peaks >= 10 ** (SILENCE_THRESHOLD_DBFS / 20)
    if not loud.any():
        duration = samples.shape[0] / sample_rate
        return round(duration, 3), round(duration, 3)
    first, last = int(np.argmax(loud)), int(n_blocks - 1 - np.argmax(loud[::-1]))
    trailing_blocks = n_blocks - 1 - last
    return (
        round(first * block / sample_rate, 3),
        round(max(trailing_blocks * block - (n_blocks * block - samples.shape[0]), 0) / sample_rate, 3),
    )


def waveform_overview(samples: np.ndarray, bins: int = 1000) -> list[list[float]]:
    """Per-bin [min, max] envelope of the mono mix, for UI rendering."""
    mono = np.mean(samples, axis=1)
    n = mono.shape[0]
    idx = np.linspace(0, n, bins + 1, dtype=int)
    return [
        [round(float(mono[a:b].min()), 4), round(float(mono[a:b].max()), 4)]
        for a, b in zip(idx[:-1], idx[1:])
        if b > a
    ]


def analyze(samples: np.ndarray, sample_rate: int, bit_depth: int | None = None) -> AnalysisReport:
    meter = pyloudnorm.Meter(sample_rate)
    integrated = float(meter.integrated_loudness(samples))
    st = short_term_loudness(samples, sample_rate)
    dc = [round(float(m), 6) for m in np.mean(samples, axis=0)]
    clipped = count_clipped_regions(samples)
    imbalance = stereo_imbalance_db(samples)
    silence = silence_bounds_seconds(samples, sample_rate)
    return AnalysisReport(
        sample_rate=sample_rate,
        n_channels=samples.shape[1],
        duration_seconds=round(samples.shape[0] / sample_rate, 3),
        bit_depth=bit_depth,
        integrated_lufs=round(integrated, 2),
        short_term_lufs=st,
        loudness_range_lu=loudness_range_lu(st),
        true_peak_dbtp=round(true_peak_dbtp(samples, sample_rate), 2),
        sample_peak_dbfs=round(sample_peak_dbfs(samples), 2),
        spectral_balance=spectral_balance(samples, sample_rate),
        dc_offset=dc,
        has_dc_offset=any(abs(m) > DC_FLAG_THRESHOLD for m in dc),
        clipped_regions=clipped,
        has_clipping=clipped > 0,
        has_excessive_sub_bass=_band_energy_ratio(samples, sample_rate, 5.0, SUB_BASS_HZ)
        > SUB_BASS_EXCESS_RATIO,
        has_harshness=_band_energy_ratio(samples, sample_rate, *HARSH_BAND) > HARSH_EXCESS_RATIO,
        stereo_imbalance_db=imbalance,
        has_stereo_imbalance=abs(imbalance) > IMBALANCE_FLAG_DB,
        leading_silence_seconds=silence[0],
        trailing_silence_seconds=silence[1],
        waveform_overview=waveform_overview(samples),
    )
