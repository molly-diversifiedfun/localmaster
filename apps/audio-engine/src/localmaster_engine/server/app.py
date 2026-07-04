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


def _http_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _resolve_preset(preset_id: str, overrides: dict | None):
    try:
        preset = get_preset(preset_id)
    except KeyError as exc:
        raise _http_error(404, "unknown_preset", str(exc)) from exc
    return preset.with_overrides(overrides or {})


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


def _run_master(body: MasterBody, progress) -> tuple:
    loaded = load_audio(body.path)
    preset = _resolve_preset(body.preset_id, body.overrides)
    input_analysis = analyze(loaded.samples, loaded.sample_rate, loaded.bit_depth)
    scaled = lambda stage, frac: progress(stage, 0.2 + frac * 0.7)  # noqa: E731
    result = master(loaded.samples, loaded.sample_rate, preset, progress=scaled)
    return loaded, preset, input_analysis, result


@app.post("/master", status_code=202)
async def master_endpoint(body: MasterBody) -> dict:
    def work(progress) -> dict:
        progress("loading", 0.05)
        _, preset, input_analysis, result = _run_master(body, progress)
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
    def work(progress) -> dict:
        started = time.monotonic()
        progress("loading", 0.05)
        _, preset, input_analysis, result = _run_master(body, progress)
        progress("exporting", 0.95)
        export = export_master(
            result, input_analysis, preset, body.path, body.out_dir,
            bit_depth=body.bit_depth, processing_seconds=time.monotonic() - started,
        )
        return {
            "out_path": export.out_path,
            "json_report_path": export.json_report_path,
            "txt_report_path": export.txt_report_path,
            "checklist": export.checklist,
            "output_analysis": export.output_analysis.to_dict(),
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


def main() -> None:
    import uvicorn

    port = int(os.environ.get("LOCALMASTER_PORT", "48750"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")


if __name__ == "__main__":
    main()
