from pathlib import Path

import yaml


def test_postgres_volume_persists_versioned_data_directory() -> None:
    compose_path = Path(__file__).parents[2] / "compose.yaml"
    compose = yaml.safe_load(compose_path.read_text())

    assert compose["services"]["db"]["volumes"] == [
        "postgres_data:/var/lib/postgresql"
    ]
