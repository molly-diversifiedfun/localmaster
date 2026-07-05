"""LocalMaster engine API. Binds 127.0.0.1 ONLY — never network-exposed.

Run (dev):  uv run uvicorn localmaster_engine.server.app:app \
                --host 127.0.0.1 --port 48750
"""
from __future__ import annotations

import os
import signal
import tempfile
import threading
import time
from pathlib import Path

import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from localmaster_engine import __version__
from localmaster_engine.analysis import analyze
from localmaster_engine.audio_io import AudioLoadError, load_audio
from localmaster_engine.export import ExportError, export_master
from localmaster_engine.pipeline import master
from localmaster_engine.presets import PRESETS, get_preset
from localmaster_engine.server.jobs import JobStore

app = FastAPI(title="LocalMaster engine", version=__version__, docs_url=None, redoc_url=None)
store = JobStore()

# Browser-attack guards, both required for a loopback engine that writes files:
# 1. Host allowlist (DNS rebinding: attacker's hostname resolving to 127.0.0.1
#    arrives with the attacker's Host header).
# 2. JSON Content-Type required on bodied requests (a cross-origin
#    <form enctype="text/plain"> POST is CORS-"simple" and would otherwise
#    reach the handlers; requiring application/json forces a CORS preflight,
#    which fails closed since we serve no CORS headers).
ALLOWED_HOSTS = {"127.0.0.1", "localhost", "[::1]", "::1"}

# The desktop webview is a CROSS-ORIGIN client of this loopback server (its
# origin is tauri://localhost in prod, http://localhost:1420 in dev), so the
# browser blocks its fetches without CORS headers. The allowlist is exactly
# the app's own origins — never a wildcard: arbitrary websites still get no
# Access-Control-Allow-Origin, keeping the CSRF posture intact.
APP_ORIGINS = [
    "tauri://localhost",       # Tauri prod (macOS/Linux)
    "http://tauri.localhost",  # Tauri prod (Windows)
    "https://tauri.localhost",
    "http://localhost:1420",   # tauri dev / vite
    "http://127.0.0.1:1420",
]


def _host_of(header: str) -> str:
    if header.startswith("["):  # [::1] or [::1]:port
        return header.split("]", 1)[0] + "]"
    if header.count(":") > 1:  # bare IPv6 literal — nothing to strip
        return header
    return header.rsplit(":", 1)[0] if ":" in header else header


@app.middleware("http")
async def browser_attack_guard(request, call_next):  # noqa: ANN001
    from fastapi.responses import JSONResponse

    def refuse(status: int, code: str, message: str):
        return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})

    if _host_of(request.headers.get("host", "")) not in ALLOWED_HOSTS:
        return refuse(403, "forbidden_host", "Loopback only.")
    has_body = (
        request.headers.get("content-length", "0") != "0"
        or "transfer-encoding" in request.headers
    )
    if request.method == "POST" and has_body:
        content_type = request.headers.get("content-type", "").split(";")[0].strip()
        if content_type != "application/json":
            return refuse(415, "json_required", "Content-Type must be application/json.")
    return await call_next(request)

PREVIEW_DIR = Path(
    os.environ.get("LOCALMASTER_PREVIEW_DIR")
    or Path.home() / "Library" / "Caches" / "LocalMaster" / "previews"
)


class AnalyzeBody(BaseModel):
    path: str


class MasterBody(BaseModel):
    path: str
    preset_id: str
    overrides: dict | None = None


class ExportBody(MasterBody):
    out_dir: str
    bit_depth: int | None = None
    trim_silence: bool = False
    fade_in_ms: float = 0.0
    fade_out_ms: float = 0.0


def _http_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _resolve_preset(preset_id: str, overrides: dict | None):
    """MUST be called from the HTTP handler (not the job worker) so that
    unknown_preset / invalid_overrides surface as real 4xx responses."""
    try:
        preset = get_preset(preset_id)
    except KeyError as exc:
        raise _http_error(404, "unknown_preset", str(exc)) from exc
    try:
        return preset.with_overrides(overrides or {})
    except (TypeError, ValueError) as exc:
        raise _http_error(422, "invalid_overrides", str(exc)) from exc


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__, "engine": "localmaster"}


@app.post("/shutdown")
def shutdown() -> dict:
    threading.Timer(0.2, lambda: os.kill(os.getpid(), signal.SIGTERM)).start()
    return {"status": "shutting_down"}


@app.get("/presets")
def presets() -> dict:
    return {"presets": [p.to_dict() for p in PRESETS.values()]}


@app.post("/analyze", status_code=202)
async def analyze_endpoint(body: AnalyzeBody) -> dict:
    def work(progress) -> dict:
        progress("loading", 0.1)
        loaded = load_audio(body.path)
        progress("analyzing", 0.4)
        return analyze(loaded.samples, loaded.sample_rate, loaded.bit_depth).to_dict()

    return {"job_id": store.submit(work)}


def _run_master(body: MasterBody, preset, progress) -> tuple:
    loaded = load_audio(body.path)
    input_analysis = analyze(loaded.samples, loaded.sample_rate, loaded.bit_depth)
    scaled = lambda stage, frac: progress(stage, 0.2 + frac * 0.7)  # noqa: E731
    result = master(loaded.samples, loaded.sample_rate, preset, progress=scaled)
    return loaded, preset, input_analysis, result


@app.post("/master", status_code=202)
async def master_endpoint(body: MasterBody) -> dict:
    resolved = _resolve_preset(body.preset_id, body.overrides)

    def work(progress) -> dict:
        progress("loading", 0.05)
        _, preset, input_analysis, result = _run_master(body, resolved, progress)
        progress("writing_preview", 0.92)
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        fd, preview_path = tempfile.mkstemp(
            suffix=".wav", prefix=f"{Path(body.path).stem}__{preset.id}__", dir=PREVIEW_DIR
        )
        os.close(fd)
        sf.write(preview_path, result.samples.astype("float32"), result.sample_rate, subtype="FLOAT")
        output_analysis = analyze(result.samples, result.sample_rate)
        return {
            "preview_path": preview_path,
            "input_analysis": input_analysis.to_dict(),
            "output_analysis": output_analysis.to_dict(),
            "stage_meta": result.stage_meta,
            "warnings": result.warnings,
            "ab_gain_db": round(
                min(0.0, input_analysis.integrated_lufs - output_analysis.integrated_lufs), 2
            ),
        }

    return {"job_id": store.submit(work)}


@app.post("/export", status_code=202)
async def export_endpoint(body: ExportBody) -> dict:
    resolved = _resolve_preset(body.preset_id, body.overrides)

    def work(progress) -> dict:
        started = time.monotonic()
        progress("loading", 0.05)
        _, preset, input_analysis, result = _run_master(body, resolved, progress)
        progress("exporting", 0.95)
        export = export_master(
            result, input_analysis, preset, body.path, body.out_dir,
            bit_depth=body.bit_depth, processing_seconds=time.monotonic() - started,
            trim_silence=body.trim_silence,
            fade_in_ms=body.fade_in_ms, fade_out_ms=body.fade_out_ms,
        )
        return {
            "out_path": export.out_path,
            "json_report_path": export.json_report_path,
            "txt_report_path": export.txt_report_path,
            "checklist": export.checklist,
            "output_analysis": export.output_analysis.to_dict(),
        }

    return {"job_id": store.submit(work)}


class BatchBody(BaseModel):
    paths: list[str]
    preset_id: str
    overrides: dict | None = None
    out_dir: str
    bit_depth: int | None = None


@app.post("/batch", status_code=202)
async def batch_endpoint(body: BatchBody) -> dict:
    from localmaster_engine.batch import master_album

    preset = _resolve_preset(body.preset_id, body.overrides)

    def work(progress) -> dict:
        result = master_album(
            body.paths, preset, body.out_dir, bit_depth=body.bit_depth, progress=progress
        )
        return {
            "shared_target_lufs": result.shared_target_lufs,
            "warnings": result.warnings,
            "exports": [
                {
                    "out_path": e.out_path,
                    "json_report_path": e.json_report_path,
                    "txt_report_path": e.txt_report_path,
                    "checklist": e.checklist,
                    "output_analysis": e.output_analysis.to_dict(),
                }
                for e in result.exports
            ],
        }

    return {"job_id": store.submit(work)}


@app.get("/jobs/{job_id}")
def job_status(job_id: str) -> dict:
    job = store.get(job_id)
    if job is None:
        raise _http_error(404, "unknown_job", f"No job {job_id}")
    return job.to_dict()


@app.exception_handler(AudioLoadError)
@app.exception_handler(ExportError)
def domain_error_handler(_, exc):  # noqa: ANN001
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=422, content={"error": {"code": type(exc).__name__, "message": str(exc)}})


@app.exception_handler(RequestValidationError)
def validation_error_handler(_, exc: RequestValidationError):  # noqa: ANN001
    """Malformed bodies must also use the contract shape, not FastAPI's
    {"detail": [...]} list."""
    from fastapi.responses import JSONResponse

    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(p) for p in first.get("loc", []) if p != "body")
    message = f"{loc}: {first.get('msg', 'invalid request body')}" if loc else "Invalid request body."
    return JSONResponse(
        status_code=422, content={"error": {"code": "invalid_request", "message": message}}
    )


@app.exception_handler(HTTPException)
def http_error_handler(_, exc: HTTPException):  # noqa: ANN001
    """Contract shape is {"error": {code, message}} — not FastAPI's {"detail"}."""
    from fastapi.responses import JSONResponse

    detail = (
        exc.detail
        if isinstance(exc.detail, dict) and {"code", "message"} <= set(exc.detail)
        else {"code": "http_error", "message": str(exc.detail)}
    )
    return JSONResponse(status_code=exc.status_code, content={"error": detail})


app.add_middleware(
    CORSMiddleware,
    allow_origins=APP_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
    max_age=3600,
)


def sweep_preview_cache(max_age_days: float = 7.0) -> int:
    """Delete preview WAVs older than max_age_days. Returns count removed."""
    if not PREVIEW_DIR.exists():
        return 0
    cutoff = time.time() - max_age_days * 86400
    removed = 0
    for f in PREVIEW_DIR.glob("*.wav"):
        try:
            if f.stat().st_mtime < cutoff:
                f.unlink()
                removed += 1
        except OSError:
            continue
    return removed


def main() -> None:
    import argparse

    import uvicorn

    sweep_preview_cache()
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--port", type=int, default=int(os.environ.get("LOCALMASTER_PORT", "48750"))
    )
    args = parser.parse_args()
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
