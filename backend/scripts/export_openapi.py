import json
from pathlib import Path

from app.main import create_app

target = Path(__file__).parents[2] / "frontend" / "openapi.json"
target.write_text(
    json.dumps(create_app().openapi(), ensure_ascii=False, indent=2) + "\n"
)
