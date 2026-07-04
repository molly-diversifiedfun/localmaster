"""Audio file loading with strict validation. Read-only — never writes to inputs."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf

SUPPORTED_EXTENSIONS = {".wav", ".flac", ".aiff", ".aif", ".mp3", ".ogg"}
MAX_DURATION_SECONDS = 60 * 30
MAX_CHANNELS = 2


class AudioLoadError(Exception):
    """User-facing load failure with a clear message."""


@dataclass(frozen=True)
class LoadedAudio:
    """Decoded audio: float samples shaped (n_samples, n_channels)."""

    samples: np.ndarray
    sample_rate: int
    source_path: str
    source_format: str
    source_subtype: str
    bit_depth: int | None
    duration_seconds: float

    @property
    def n_channels(self) -> int:
        return self.samples.shape[1]


_SUBTYPE_BITS = {"PCM_16": 16, "PCM_24": 24, "PCM_32": 32, "FLOAT": 32, "DOUBLE": 64, "PCM_U8": 8}


def _validate_path(path: Path) -> None:
    if not path.exists():
        raise AudioLoadError(f"File not found: {path}")
    if not path.is_file():
        raise AudioLoadError(f"Not a file: {path}")
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise AudioLoadError(
            f"Unsupported format '{path.suffix}'. Supported: {sorted(SUPPORTED_EXTENSIONS)}"
        )


def _validate_info(info: sf._SoundFileInfo, path: Path) -> None:
    if info.channels > MAX_CHANNELS:
        raise AudioLoadError(f"{info.channels} channels unsupported (max {MAX_CHANNELS}): {path.name}")
    if info.frames == 0:
        raise AudioLoadError(f"File contains no audio: {path.name}")
    duration = info.frames / info.samplerate
    if duration > MAX_DURATION_SECONDS:
        raise AudioLoadError(f"File too long ({duration:.0f}s, max {MAX_DURATION_SECONDS}s): {path.name}")


def load_audio(path_str: str) -> LoadedAudio:
    """Decode an audio file to float32 (n_samples, n_channels). Mono becomes (n, 1)."""
    path = Path(path_str)
    _validate_path(path)
    try:
        info = sf.info(str(path))
    except sf.LibsndfileError as exc:
        raise AudioLoadError(f"Cannot decode {path.name}: {exc.error_string}") from exc
    _validate_info(info, path)
    samples, sample_rate = sf.read(str(path), dtype="float32", always_2d=True)
    return LoadedAudio(
        samples=samples,
        sample_rate=sample_rate,
        source_path=str(path.resolve()),
        source_format=info.format,
        source_subtype=info.subtype,
        bit_depth=_SUBTYPE_BITS.get(info.subtype),
        duration_seconds=info.frames / info.samplerate,
    )
