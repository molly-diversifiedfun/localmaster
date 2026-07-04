"""Acceptance test 5: zero outbound network connections during
analyze + render + export. Any socket connect attempt fails the test."""
from __future__ import annotations

import socket

import pytest

from localmaster_engine.analysis import analyze
from localmaster_engine.audio_io import load_audio
from localmaster_engine.export import export_master
from localmaster_engine.pipeline import master
from localmaster_engine.presets import get_preset


@pytest.fixture()
def forbid_network(monkeypatch):
    calls: list = []

    def blocked_connect(self, address):  # noqa: ANN001
        calls.append(address)
        raise AssertionError(f"Outbound connection attempted: {address}")

    monkeypatch.setattr(socket.socket, "connect", blocked_connect)
    monkeypatch.setattr(socket.socket, "connect_ex", blocked_connect)
    monkeypatch.setattr(socket, "create_connection", blocked_connect)
    return calls


def test_full_run_makes_zero_connections(fixtures_dir, tmp_path, forbid_network):
    src = fixtures_dir / "songlike_30s.wav"
    loaded = load_audio(str(src))
    input_analysis = analyze(loaded.samples, loaded.sample_rate, loaded.bit_depth)
    preset = get_preset("clean_dj")
    result = master(loaded.samples, loaded.sample_rate, preset)
    export = export_master(result, input_analysis, preset, str(src), str(tmp_path))
    assert forbid_network == []
    assert export.checklist["export_succeeded"]
