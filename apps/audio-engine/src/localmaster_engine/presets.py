"""The 7 mastering presets. These are EDITABLE DEFAULTS, not "correct" values —
every field can be overridden per render. Loudness targets are goals, not
guarantees: the transient guard (gr_budget_db) may land a master quieter than
target on very dynamic material, and the report says so.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, replace

from localmaster_engine.chain.eq import EqBand


@dataclass(frozen=True)
class Preset:
    id: str
    name: str
    description: str
    target_lufs: float
    ceiling_dbtp: float
    gr_budget_db: float  # transient guard: max limiter GR the preset will request
    highpass_hz: float
    eq_bands: tuple[EqBand, ...]
    comp_threshold_db: float
    comp_ratio: float
    comp_attack_ms: float
    comp_release_ms: float
    comp_knee_db: float
    saturation_drive: float
    saturation_mix: float
    stereo_width: float
    mono_bass_hz: float
    limiter_lookahead_ms: float
    limiter_release_ms: float
    bit_depth: int  # export default
    remove_dc: bool = True

    def to_dict(self) -> dict:
        return asdict(self)

    def with_overrides(self, overrides: dict) -> "Preset":
        known = {k: v for k, v in overrides.items() if k in self.__dataclass_fields__}
        if "eq_bands" in known:
            known["eq_bands"] = tuple(EqBand(**band) for band in known["eq_bands"])
        return replace(self, **known)


PRESETS: dict[str, Preset] = {
    p.id: p
    for p in (
        Preset(
            id="clean_dj",
            name="Clean DJ Master",
            description="DJ-ready loudness with transient priority. May land below "
            "target on very dynamic tracks (transient guard).",
            target_lufs=-9.0, ceiling_dbtp=-1.0, gr_budget_db=4.0,
            highpass_hz=30.0,
            eq_bands=(EqBand(60.0, 0.5, 0.8, "low_shelf"), EqBand(3500.0, -0.5, 1.2, "peaking")),
            comp_threshold_db=-18.0, comp_ratio=1.8, comp_attack_ms=15.0,
            comp_release_ms=150.0, comp_knee_db=6.0,
            saturation_drive=1.2, saturation_mix=0.15,
            stereo_width=1.0, mono_bass_hz=100.0,
            limiter_lookahead_ms=5.0, limiter_release_ms=80.0, bit_depth=24,
        ),
        Preset(
            id="loud_club",
            name="Loud Club Master",
            description="Hot club level; accepts audible limiting for density.",
            target_lufs=-7.0, ceiling_dbtp=-0.8, gr_budget_db=8.0,
            highpass_hz=32.0,
            eq_bands=(EqBand(70.0, 1.0, 0.8, "low_shelf"),),
            comp_threshold_db=-20.0, comp_ratio=2.5, comp_attack_ms=10.0,
            comp_release_ms=120.0, comp_knee_db=6.0,
            saturation_drive=1.8, saturation_mix=0.25,
            stereo_width=1.05, mono_bass_hz=110.0,
            limiter_lookahead_ms=4.0, limiter_release_ms=60.0, bit_depth=24,
        ),
        Preset(
            id="streaming_balanced",
            name="Streaming Balanced",
            description="Streaming-platform loudness; dynamics preserved.",
            target_lufs=-14.0, ceiling_dbtp=-1.0, gr_budget_db=3.0,
            highpass_hz=25.0,
            eq_bands=(),
            comp_threshold_db=-16.0, comp_ratio=1.5, comp_attack_ms=20.0,
            comp_release_ms=200.0, comp_knee_db=8.0,
            saturation_drive=1.0, saturation_mix=0.1,
            stereo_width=1.0, mono_bass_hz=90.0,
            limiter_lookahead_ms=5.0, limiter_release_ms=100.0, bit_depth=24,
        ),
        Preset(
            id="warm_analog",
            name="Warm Analog-ish",
            description="Rounded top, saturated mids, relaxed loudness.",
            target_lufs=-12.0, ceiling_dbtp=-1.0, gr_budget_db=4.0,
            highpass_hz=28.0,
            eq_bands=(EqBand(120.0, 1.0, 0.7, "low_shelf"), EqBand(9000.0, -0.8, 0.7, "high_shelf")),
            comp_threshold_db=-17.0, comp_ratio=1.7, comp_attack_ms=25.0,
            comp_release_ms=250.0, comp_knee_db=8.0,
            saturation_drive=2.5, saturation_mix=0.35,
            stereo_width=0.98, mono_bass_hz=100.0,
            limiter_lookahead_ms=6.0, limiter_release_ms=120.0, bit_depth=24,
        ),
        Preset(
            id="bright_pop",
            name="Bright Pop",
            description="Lifted top end and presence, modern pop sheen.",
            target_lufs=-10.0, ceiling_dbtp=-1.0, gr_budget_db=5.0,
            highpass_hz=30.0,
            eq_bands=(EqBand(8000.0, 1.5, 0.7, "high_shelf"), EqBand(200.0, -0.5, 1.0, "peaking")),
            comp_threshold_db=-18.0, comp_ratio=2.0, comp_attack_ms=12.0,
            comp_release_ms=140.0, comp_knee_db=6.0,
            saturation_drive=1.4, saturation_mix=0.18,
            stereo_width=1.08, mono_bass_hz=100.0,
            limiter_lookahead_ms=5.0, limiter_release_ms=70.0, bit_depth=24,
        ),
        Preset(
            id="bass_tightener",
            name="Bass Tightener",
            description="Controls boom and mud; firm mono low end.",
            target_lufs=-11.0, ceiling_dbtp=-1.0, gr_budget_db=4.0,
            highpass_hz=35.0,
            eq_bands=(EqBand(50.0, -1.5, 0.8, "low_shelf"), EqBand(250.0, -1.0, 1.4, "peaking")),
            comp_threshold_db=-19.0, comp_ratio=2.2, comp_attack_ms=8.0,
            comp_release_ms=110.0, comp_knee_db=4.0,
            saturation_drive=1.3, saturation_mix=0.15,
            stereo_width=1.0, mono_bass_hz=140.0,
            limiter_lookahead_ms=5.0, limiter_release_ms=80.0, bit_depth=24,
        ),
        Preset(
            id="gentle",
            name="Gentle Master",
            description="Minimal touch: polish and safety ceiling only.",
            target_lufs=-16.0, ceiling_dbtp=-1.5, gr_budget_db=2.0,
            highpass_hz=25.0,
            eq_bands=(),
            comp_threshold_db=-14.0, comp_ratio=1.3, comp_attack_ms=30.0,
            comp_release_ms=300.0, comp_knee_db=10.0,
            saturation_drive=1.0, saturation_mix=0.0,
            stereo_width=1.0, mono_bass_hz=80.0,
            limiter_lookahead_ms=6.0, limiter_release_ms=150.0, bit_depth=24,
        ),
    )
}


def get_preset(preset_id: str) -> Preset:
    if preset_id not in PRESETS:
        raise KeyError(f"Unknown preset '{preset_id}'. Available: {sorted(PRESETS)}")
    return PRESETS[preset_id]
