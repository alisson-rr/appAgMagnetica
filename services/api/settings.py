"""Configuração local do backend.

Credenciais nunca devem ter valor padrão no código. O servidor lê o arquivo
``.env`` (não versionado) ou as variáveis definidas no ambiente de produção.
"""

import os


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Variável obrigatória não configurada: {name}")
    return value


SUPABASE_URL = require_env("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = require_env("SUPABASE_SERVICE_ROLE_KEY")
JWT_SECRET = require_env("JWT_SECRET")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))
