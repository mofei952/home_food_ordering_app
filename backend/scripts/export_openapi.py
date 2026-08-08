import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from app.main import create_app

target = Path(__file__).parents[2] / "frontend" / "openapi.json"
target.write_text(
    json.dumps(create_app().openapi(), ensure_ascii=False, indent=2) + "\n"
)
