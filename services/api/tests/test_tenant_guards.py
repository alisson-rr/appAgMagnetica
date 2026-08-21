import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import pytest
from fastapi import HTTPException


BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault("SUPABASE_URL", "http://localhost:54321")
os.environ.setdefault(
    "SUPABASE_SERVICE_ROLE_KEY",
    jwt.encode(
        {
            "role": "service_role",
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        },
        "test-only-supabase-secret",
        algorithm="HS256",
    ),
)
os.environ.setdefault("JWT_SECRET", "test-only-jwt-secret-that-is-long-enough")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("JWT_EXPIRATION_HOURS", "24")

import server  # noqa: E402


def test_operational_routes_require_a_company():
    with pytest.raises(HTTPException) as error:
        server.get_user_clinica_id({"user_id": 10, "id_info_clinica": None})

    assert error.value.status_code == 403


def test_company_id_is_taken_only_from_the_authenticated_session():
    assert server.get_user_clinica_id({"id_info_clinica": "42"}) == 42


def test_server_has_no_unfiltered_company_fallback():
    source = (BACKEND_DIR / "server.py").read_text(encoding="utf-8")

    assert "if clinica_id:" not in source
    assert "SUPABASE_ANON_KEY" not in source
