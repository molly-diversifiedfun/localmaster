from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

ENGINE_DIR = Path(__file__).resolve().parents[1]
GENERATED = ENGINE_DIR.parents[1] / "examples" / "generated"


@pytest.fixture(scope="session")
def fixtures_dir() -> Path:
    """Generate synthetic fixtures once per session if missing."""
    if not (GENERATED / "pink_-20LUFS.wav").exists():
        subprocess.run(
            [sys.executable, str(ENGINE_DIR / "tools" / "gen_synthetic.py"), str(GENERATED)],
            check=True,
        )
    return GENERATED
