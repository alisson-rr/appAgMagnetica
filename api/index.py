"""Ponte entre as funções serverless do Vercel e o backend em `services/api`.

O Vercel só executa Python que esteja em `api/`, mas o backend continua morando
em `services/api` — o dono daquele diretório é outro agente e nada lá é
alterado por este arquivo. Aqui só se coloca o diretório no `sys.path` e se
reexporta o `app` do FastAPI; o Vercel cuida do resto (ASGI nativo).

Se `services/api` não subir junto no bundle, o import falha alto no cold start
em vez de responder 500 sem explicação — é o que se quer descobrir no deploy,
não em produção.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1] / "services" / "api"

if not BACKEND_DIR.is_dir():
    raise RuntimeError(
        f"services/api não foi incluído no bundle da função (procurei em {BACKEND_DIR})."
    )

# `insert(0)` e não `append`: os módulos do backend se importam de forma plana
# (`from settings import ...`), então este diretório precisa vir antes de
# qualquer pacote de mesmo nome instalado.
sys.path.insert(0, str(BACKEND_DIR))

from server import app  # noqa: E402  (o sys.path precisa existir antes do import)

__all__ = ["app"]
