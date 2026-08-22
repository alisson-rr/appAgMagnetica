"""Configuração local do backend.

Credenciais nunca devem ter valor padrão no código. O servidor lê o arquivo
``.env`` (não versionado) ou as variáveis definidas no ambiente de produção.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent

# O .env pode ficar em services/api/ ou na raiz do monorepo, que é onde as
# credenciais do projeto estão configuradas. O local do backend tem precedência.
# Carregar aqui, e não no server, faz qualquer ponto de entrada (server, rotas
# da automação, script avulso) enxergar a mesma configuração.
# `load_dotenv` não sobrescreve variável já definida: os testes continuam
# isolados do .env da máquina.
for _env_path in (BACKEND_DIR / ".env", BACKEND_DIR.parents[1] / ".env"):
    if _env_path.exists():
        load_dotenv(_env_path)
        break


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

# Token de máquina das rotas /api/ai/*. Não usa `require_env` de propósito: o
# painel e o webhook precisam subir mesmo antes de a automação ser configurada.
# Vazio faz as rotas da automação recusarem tudo (ver ai_api.AUTOMACAO_INDISPONIVEL),
# em vez de ficarem abertas.
AUTOMATION_API_TOKEN = os.getenv("AUTOMATION_API_TOKEN", "")

# Piso de entropia. Um token curto é adivinhável e daria acesso de escrita à
# agenda de todas as empresas; recusar na largada é melhor que descobrir depois.
AUTOMATION_API_TOKEN_MIN_LEN = 32
