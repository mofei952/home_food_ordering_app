import subprocess
import sys
from pathlib import Path


def test_openapi_export_runs_from_backend_directory() -> None:
    backend = Path(__file__).parents[1]
    result = subprocess.run(
        [sys.executable, "scripts/export_openapi.py"],
        cwd=backend,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
