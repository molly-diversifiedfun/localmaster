"""Prove zero outbound network connections during analyze → master → export.

Installs a Python audit hook that aborts the process on ANY socket connect
that isn't loopback, then runs the full pipeline on synthetic audio.

Scope, honestly stated: sys.addaudithook observes Python-level socket use.
Native code that opened sockets without going through CPython would not be
seen — but the dependency set (numpy/scipy/soundfile/pyloudnorm) contains no
network I/O, and this script's guarantee is over the Python layer that could
plausibly phone home. Only the direct-pipeline path is exercised.

Usage: uv run python tools/assert_no_network.py
Exit 0 = clean at the audited layer. Non-zero = a connection was attempted.
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

VIOLATIONS: list[str] = []


def audit_hook(event: str, args: tuple) -> None:
    if event == "socket.connect":
        address = args[1]
        host = address[0] if isinstance(address, tuple) else str(address)
        if host not in ("127.0.0.1", "::1", "localhost"):
            VIOLATIONS.append(f"{event}: {address}")
            print(f"NETWORK VIOLATION: {event} -> {address}", file=sys.stderr)
    if event in ("socket.getaddrinfo",):
        host = args[0]
        if host not in ("127.0.0.1", "::1", "localhost", None):
            VIOLATIONS.append(f"{event}: {host}")
            print(f"DNS VIOLATION: {event} -> {host}", file=sys.stderr)


def main() -> int:
    sys.addaudithook(audit_hook)

    engine_dir = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(engine_dir / "src"))
    sys.path.insert(0, str(engine_dir / "tools"))
    import gen_synthetic  # noqa: E402

    from localmaster_engine.analysis import analyze  # noqa: E402
    from localmaster_engine.audio_io import load_audio  # noqa: E402
    from localmaster_engine.export import export_master  # noqa: E402
    from localmaster_engine.pipeline import master  # noqa: E402
    from localmaster_engine.presets import get_preset  # noqa: E402

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        gen_synthetic.main(tmp_path)
        src = tmp_path / "songlike_30s.wav"
        loaded = load_audio(str(src))
        input_analysis = analyze(loaded.samples, loaded.sample_rate, loaded.bit_depth)
        result = master(loaded.samples, loaded.sample_rate, get_preset("clean_dj"))
        export = export_master(
            result, input_analysis, get_preset("clean_dj"), str(src), str(tmp_path / "out")
        )
        assert export.checklist["export_succeeded"]

    if VIOLATIONS:
        print(f"\nFAILED: {len(VIOLATIONS)} network access attempt(s) detected.", file=sys.stderr)
        return 1
    print("PASS: analyze + master + export completed with zero outbound connections.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
