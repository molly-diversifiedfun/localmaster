from __future__ import annotations

import asyncio

import httpx
import pytest

from localmaster_engine.server import app as server_app


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(server_app, "PREVIEW_DIR", tmp_path / "previews")
    transport = httpx.ASGITransport(app=server_app.app)
    # base_url sets the Host header; the server's DNS-rebinding guard only
    # serves loopback Hosts, mirroring real deployment.
    return httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1")


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


@pytest.mark.asyncio
async def test_reference_analyze_job_returns_profile(client, fixtures_dir):
    async with client:
        resp = await client.post(
            "/reference-analyze", json={"path": str(fixtures_dir / "pink_-20LUFS.wav")}
        )
        assert resp.status_code == 202
        job = await _wait_for_job(client, resp.json()["job_id"])
        assert job["status"] == "done", job["error"]
        profile = job["result"]
        assert profile["sample_rate"] == 44100
        assert len(profile["mid_spectrum"]) == len(profile["freqs_hz"])
        assert profile["n_pieces_loudest"] >= 1


@pytest.mark.asyncio
async def test_master_with_reference_path_returns_matching_stage_meta(client, fixtures_dir):
    async with client:
        resp = await client.post(
            "/master",
            json={
                "path": str(fixtures_dir / "songlike_30s.wav"),
                "preset_id": "clean_dj",
                "reference_path": str(fixtures_dir / "pink_-20LUFS.wav"),
                "match_strength": 0.7,
            },
        )
        job = await _wait_for_job(client, resp.json()["job_id"])
        assert job["status"] == "done", job["error"]
        stage_meta = job["result"]["stage_meta"]
        ref_meta = next(m for m in stage_meta if m["stage"] == "reference_match")
        assert ref_meta["applied"] is True
        assert ref_meta["strength"] == 0.7
        assert "mid_band_deltas_db" in ref_meta


@pytest.mark.asyncio
async def test_master_with_bad_reference_path_is_clean_job_error(client, fixtures_dir):
    async with client:
        resp = await client.post(
            "/master",
            json={
                "path": str(fixtures_dir / "songlike_30s.wav"),
                "preset_id": "clean_dj",
                "reference_path": "/nope/missing_reference.wav",
            },
        )
        job = await _wait_for_job(client, resp.json()["job_id"])
        assert job["status"] == "error"
        assert job["error"]["code"] == "AudioLoadError"


@pytest.mark.asyncio
async def test_master_with_out_of_range_match_strength_is_immediate_422(client, fixtures_dir):
    async with client:
        resp = await client.post(
            "/master",
            json={
                "path": str(fixtures_dir / "sine_1khz_-20dBFS.wav"),
                "preset_id": "clean_dj",
                "match_strength": 1.5,
            },
        )
        assert resp.status_code == 422
        assert resp.json()["error"]["code"] == "invalid_match_strength"


@pytest.mark.asyncio
async def test_unknown_preset_is_immediate_404(client, fixtures_dir):
    async with client:
        resp = await client.post(
            "/master",
            json={"path": str(fixtures_dir / "sine_1khz_-20dBFS.wav"), "preset_id": "nope"},
        )
        assert resp.status_code == 404
        body = resp.json()
        assert body["error"]["code"] == "unknown_preset"


@pytest.mark.asyncio
async def test_host_guard_blocks_dns_rebinding(client):
    async with client:
        resp = await client.get("/health", headers={"host": "evil.example.com"})
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "forbidden_host"
        ok = await client.get("/health", headers={"host": "127.0.0.1:48750"})
        assert ok.status_code == 200


@pytest.mark.asyncio
async def test_error_body_shape_matches_contract(client):
    async with client:
        resp = await client.get("/jobs/doesnotexist")
        assert resp.status_code == 404
        body = resp.json()
        assert "error" in body and "detail" not in body
        assert set(body["error"]) == {"code", "message"}


@pytest.mark.asyncio
async def test_malformed_body_is_contract_shaped(client):
    async with client:
        resp = await client.post("/batch", json={"paths": []})
        assert resp.status_code == 422
        body = resp.json()
        assert body["error"]["code"] == "invalid_request"
        assert "detail" not in body


@pytest.mark.asyncio
async def test_non_json_post_body_rejected(client):
    """text/plain form CSRF vector: bodied POSTs must be application/json."""
    async with client:
        resp = await client.post(
            "/analyze",
            content=b'{"path": "/tmp/x.wav"}',
            headers={"content-type": "text/plain"},
        )
        assert resp.status_code == 415
        assert resp.json()["error"]["code"] == "json_required"


@pytest.mark.asyncio
async def test_ipv6_loopback_host_allowed(client):
    async with client:
        for host in ("[::1]", "[::1]:48750", "localhost", "127.0.0.1:48750"):
            resp = await client.get("/health", headers={"host": host})
            assert resp.status_code == 200, host


@pytest.mark.asyncio
async def test_chunked_body_without_content_length_rejected(client):
    """Transfer-Encoding without Content-Length must not bypass the JSON guard."""
    async with client:
        resp = await client.post(
            "/analyze",
            content=b'{"path": "/tmp/x.wav"}',
            headers={"content-type": "text/plain", "transfer-encoding": "chunked",
                     "content-length": "0"},
        )
        assert resp.status_code == 415
        assert resp.json()["error"]["code"] == "json_required"


@pytest.mark.asyncio
async def test_cors_allows_app_origins_only(client):
    """The webview's own origins get CORS headers; arbitrary sites get none."""
    async with client:
        ours = await client.get("/health", headers={"origin": "tauri://localhost"})
        assert ours.headers.get("access-control-allow-origin") == "tauri://localhost"
        dev = await client.options(
            "/master",
            headers={
                "origin": "http://localhost:1420",
                "access-control-request-method": "POST",
                "access-control-request-headers": "content-type",
            },
        )
        assert dev.status_code == 200
        assert dev.headers.get("access-control-allow-origin") == "http://localhost:1420"
        evil = await client.get("/health", headers={"origin": "https://evil.example.com"})
        assert "access-control-allow-origin" not in evil.headers
