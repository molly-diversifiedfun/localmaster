"""In-process async job store. No Redis, no external services — local only."""
from __future__ import annotations

import asyncio
import traceback
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Job:
    id: str
    status: str = "queued"  # queued | running | done | error
    progress: float = 0.0
    stage: str | None = None
    result: Any = None
    error: dict | None = None

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "progress": round(self.progress, 3),
            "stage": self.stage,
            "result": self.result,
            "error": self.error,
        }


@dataclass
class JobStore:
    jobs: dict[str, Job] = field(default_factory=dict)

    def get(self, job_id: str) -> Job | None:
        return self.jobs.get(job_id)

    def submit(self, work: Callable[[Callable[[str, float], None]], Any]) -> str:
        """Run `work(progress_cb)` in a worker thread; returns the job id."""
        job = Job(id=uuid.uuid4().hex)
        self.jobs[job.id] = job

        def on_progress(stage: str, fraction: float) -> None:
            job.stage = stage
            job.progress = fraction

        async def runner() -> None:
            job.status = "running"
            try:
                job.result = await asyncio.to_thread(work, on_progress)
                job.status, job.progress = "done", 1.0
            except Exception as exc:  # surface every failure to the client
                job.status = "error"
                job.error = {"code": type(exc).__name__, "message": str(exc)}
                traceback.print_exc()

        asyncio.get_running_loop().create_task(runner())
        return job.id
