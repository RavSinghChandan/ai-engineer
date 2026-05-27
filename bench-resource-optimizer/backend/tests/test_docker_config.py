"""
Phase 3 — Docker infrastructure tests.

Validates that docker-compose.yml and Dockerfile exist and are structurally
correct without requiring Docker to be installed.
"""
from __future__ import annotations

from pathlib import Path

import pytest
import yaml


PROJECT_ROOT = Path(__file__).parent.parent.parent


class TestDockerCompose:

    def test_positive_compose_file_exists(self):
        assert (PROJECT_ROOT / "docker-compose.yml").exists()

    def test_positive_compose_is_valid_yaml(self):
        content = (PROJECT_ROOT / "docker-compose.yml").read_text()
        data = yaml.safe_load(content)
        assert isinstance(data, dict)

    def test_positive_compose_has_required_services(self):
        data = yaml.safe_load((PROJECT_ROOT / "docker-compose.yml").read_text())
        services = set(data["services"].keys())
        assert "backend" in services
        assert "redis" in services
        assert "kafka" in services
        assert "zookeeper" in services

    def test_positive_backend_has_health_check(self):
        data = yaml.safe_load((PROJECT_ROOT / "docker-compose.yml").read_text())
        backend = data["services"]["backend"]
        assert "healthcheck" in backend

    def test_positive_redis_has_health_check(self):
        data = yaml.safe_load((PROJECT_ROOT / "docker-compose.yml").read_text())
        assert "healthcheck" in data["services"]["redis"]

    def test_positive_kafka_has_health_check(self):
        data = yaml.safe_load((PROJECT_ROOT / "docker-compose.yml").read_text())
        assert "healthcheck" in data["services"]["kafka"]

    def test_positive_backend_depends_on_redis_and_kafka(self):
        data = yaml.safe_load((PROJECT_ROOT / "docker-compose.yml").read_text())
        depends = data["services"]["backend"].get("depends_on", {})
        assert "redis" in depends
        assert "kafka" in depends

    def test_positive_backend_env_has_redis_url(self):
        data = yaml.safe_load((PROJECT_ROOT / "docker-compose.yml").read_text())
        env = data["services"]["backend"].get("environment", {})
        assert "REDIS_URL" in env

    def test_positive_backend_env_has_kafka_servers(self):
        data = yaml.safe_load((PROJECT_ROOT / "docker-compose.yml").read_text())
        env = data["services"]["backend"].get("environment", {})
        assert "KAFKA_BOOTSTRAP_SERVERS" in env

    def test_positive_volumes_declared(self):
        data = yaml.safe_load((PROJECT_ROOT / "docker-compose.yml").read_text())
        volumes = set(data.get("volumes", {}).keys())
        assert "redis-data" in volumes
        assert "backend-storage" in volumes


class TestDockerfile:

    def test_positive_dockerfile_exists(self):
        assert (PROJECT_ROOT / "backend" / "Dockerfile").exists()

    def test_positive_dockerfile_uses_multistage_build(self):
        content = (PROJECT_ROOT / "backend" / "Dockerfile").read_text()
        assert content.count("FROM") >= 2, "Multi-stage build requires at least 2 FROM statements"

    def test_positive_dockerfile_runs_as_non_root(self):
        content = (PROJECT_ROOT / "backend" / "Dockerfile").read_text()
        assert "USER" in content, "Dockerfile must switch to non-root user"
        assert "root" not in content.split("USER")[-1].lower()

    def test_positive_dockerfile_exposes_port_8000(self):
        content = (PROJECT_ROOT / "backend" / "Dockerfile").read_text()
        assert "EXPOSE 8000" in content

    def test_positive_env_example_exists(self):
        assert (PROJECT_ROOT / ".env.example").exists()

    def test_positive_env_example_has_required_keys(self):
        content = (PROJECT_ROOT / ".env.example").read_text()
        for key in ("DEEPSEEK_API_KEY", "JWT_SECRET", "REDIS_URL", "KAFKA_BOOTSTRAP_SERVERS"):
            assert key in content, f"Missing key in .env.example: {key}"
