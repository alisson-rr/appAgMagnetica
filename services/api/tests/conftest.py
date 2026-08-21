"""Ambiente mínimo para importar `server` nos testes.

Valores de teste, nunca reais. `load_dotenv` não sobrescreve variável já
definida, então definir aqui antes de qualquer import protege a suíte de
depender do `.env` da máquina.
"""

import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
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
