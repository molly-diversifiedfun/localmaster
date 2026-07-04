from __future__ import annotations

import asyncio

import httpx
import pytest

from localmaster_engine.server import app as server_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(server_app, "PREVIEW_DIR", tmp_path / "previews")
    transport = httpx.ASGITransport(app=server_app.app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


async def _wait_for_job(client: httpx.AsyncClient, job_id: str, timeout_s: float = 120) -> dict:
    deadline = asyncio.get_event_loop().time() + timeout_s
    while asyncio.get_event_loop().time() < deadline:
        resp = await client.get(f"/jobs/{job_id}")
        body = resp.json()
        if body["status"] in ("done", "error"):
            return body
        await asyncio.sleep(0.1)
    raise TimeoutError(f"job {job_id} did not finish")


@pytest.mark.asyncio
async def test_health_and_presets(client):
    async with client:
        health = (await client.get("/health")).json()
        assert health["status"] == "ok"
        presets = (await client.get("/presets")).json()["presets"]
        assert {p["id"] for p in presets} >= {"clean_dj", "loud_club", "gentle"}


@pytest.mark.asyncio
async def test_analyze_job_flow(client, fixtures_dir):
    async with client:
        resp = await client.post("/analyze", json={"path": str(fixtures_dir / "pink_-20LUFS.wav")})
        assert resp.status_code == 202
        job = await _wait_for_job(client, resp.json()["job_id"])
        assert job["status"] == "done"
        assert abs(job["result"]["integrated_lufs"] - (-20.0)) < 0.5


@pytest.mark.asyncio
async def test_master_job_returns_preview_and_ab_gain(client, fixtures_dir):
    async with client:
        resp = await client.post(
            "/master",
            json={"path": str(fixtures_dir / "songlike_30s.wav"), "preset_id": "clean_dj"},
        )
        job = await _wait_for_job(client, resp.json()["job_id"])
        assert job["status"] == "done", job["error"]
        result = job["result"]
        assert result["ab_gain_db"] <= 0.0
        assert result["output_analysis"]["true_peak_dbtp"] <= -0.95
        from pathlib import Path

        assert Path(result["preview_path"]).exists()


@pytest.mark.asyncio
async def test_export_job_with_overrides(client, fixtures_dir, tmp_path):
    async with client:
        resp = await client.post(
            "/export",
            json={
                "path": str(fixtures_dir / "sine_1khz_-20dBFS.wav"),
                "preset_id": "gentle",
                "overrides": {"target_lufs": -18.0},
                "out_dir": str(tmp_path / "out"),
                "bit_depth": 24,
            },
        )
        job = await _wait_for_job(client, resp.json()["job_id"])
        assert job["status"] == "done", job["error"]
        assert job["result"]["checklist"]["export_succeeded"]
        assert "__LocalMaster__gentle__" in job["result"]["out_path"]


@pytest.mark.asyncio
async def test_error_paths(client):
    async with client:
        resp = await client.post("/analyze", json={"path": "/nope/missing.wav"})
        job = await _wait_for_job(client, resp.json()["job_id"])
        assert job["status"] == "error"
        assert job["error"]["code"] == "AudioLoadError"
        assert (await client.get("/jobs/doesnotexist")).status_code == 404


@pytest.mark.asyncio
async def test_batch_endpoint_shared_target(client, fixtures_dir, tmp_path):
    async with client:
        resp = await client.post(
            "/batch",
            json={
                "paths": [
                    str(fixtures_dir / "album_track4_-16LUFS.wav"),
                    str(fixtures_dir / "album_track5_-12LUFS.wav"),
                ],
                "preset_id": "gentle",
                "out_dir": str(tmp_path / "album"),
            },
        )
        assert resp.status_code == 202
        job = await _wait_for_job(client, resp.json()["job_id"], timeout_s=300)
        assert job["status"] == "done", job["error"]
        result = job["result"]
        assert len(result["exports"]) == 2
        lufs = [e["output_analysis"]["integrated_lufs"] for e in result["exports"]]
        assert abs(lufs[0] - lufs[1]) <= 1.0
        assert all(e["checklist"]["export_succeeded"] for e in result["exports"])
