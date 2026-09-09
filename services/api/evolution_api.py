"""Integração do backend com a Evolution API."""

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


def _config() -> tuple[str, str, str]:
    required = ("EVOLUTION_BASE_URL", "EVOLUTION_API_KEY", "EVOLUTION_WEBHOOK_URL")
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Configuração da Evolution ausente: {', '.join(missing)}")
    return (
        os.environ["EVOLUTION_BASE_URL"].rstrip("/"),
        os.environ["EVOLUTION_API_KEY"],
        os.environ["EVOLUTION_WEBHOOK_URL"],
    )


async def _request(method: str, path: str, **kwargs) -> dict | list:
    base_url, api_key, _ = _config()
    headers = {"apikey": api_key, **kwargs.pop("headers", {})}
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(method, f"{base_url}{path}", headers=headers, **kwargs)
        response.raise_for_status()
        return response.json()


async def create_instance(instance_name: str) -> dict:
    data = await _request(
        "POST",
        "/instance/create",
        json={
            "instanceName": instance_name,
            "qrcode": True,
            "integration": "WHATSAPP-BAILEYS",
        },
    )
    if data:
        await set_webhook(instance_name)
    return data


async def send_text(instance_name: str, remote_jid: str, texto: str) -> dict:
    """Manda uma mensagem de texto pela instancia da empresa.

    Ate agora toda mensagem saia de dentro do n8n; esta funcao existe para o
    chat do painel, onde quem escreve e uma pessoa.

    NAO grava `am:enviada`: mensagem do painel E intervencao humana, e o eco
    dela voltando pelo webhook e justamente o que faz a recepcao automatica se
    calar por 30 minutos. Quem evita a duplicata na tela e a chave unica de
    `mensagem`, pelo id que a Evolution devolve aqui.
    """
    return await _request(
        "POST",
        f"/message/sendText/{instance_name}",
        json={"number": remote_jid, "text": texto},
    )


DEFAULT_WEBHOOK_HEADER_NAME = "x-agenda-magnetica-token"


def _webhook_auth() -> tuple[str, str]:
    """Header compartilhado que prova a autenticidade da entrega da Evolution.

    Sem ele o webhook do n8n aceita qualquer POST forjado, então a ausência do
    segredo é erro de configuração e precisa aparecer, não ser engolida.
    """
    secret = os.getenv("EVOLUTION_WEBHOOK_SECRET")
    if not secret:
        raise RuntimeError(
            "Configuração da Evolution ausente: EVOLUTION_WEBHOOK_SECRET"
        )
    header_name = os.getenv("EVOLUTION_WEBHOOK_HEADER_NAME") or DEFAULT_WEBHOOK_HEADER_NAME
    return header_name, secret


def build_webhook_payload() -> dict:
    """Corpo no formato da Evolution v2.3: tudo dentro do invólucro ``webhook``."""
    _, _, webhook_url = _config()
    header_name, secret = _webhook_auth()
    return {
        "webhook": {
            "enabled": True,
            "url": webhook_url,
            "headers": {
                header_name: secret,
                "Content-Type": "application/json",
            },
            "byEvents": False,
            # Este corte é só texto: sem base64 o payload retido encolhe muito.
            "base64": False,
            "events": ["SEND_MESSAGE", "MESSAGES_UPSERT"],
        }
    }


async def set_webhook(instance_name: str) -> dict:
    # Fora do try: configuração faltando é erro de operação, não falha de rede.
    payload = build_webhook_payload()
    try:
        return await _request("POST", f"/webhook/set/{instance_name}", json=payload)
    except Exception as error:
        # Sem logger.exception: o corpo enviado carrega o segredo do header.
        logger.error(
            "Não foi possível configurar o webhook da instância %s (%s)",
            instance_name,
            type(error).__name__,
        )
        return {"error": "webhook_not_configured"}


async def connect_instance(instance_name: str) -> dict:
    return await _request("GET", f"/instance/connect/{instance_name}")


async def get_connection_state(instance_name: str) -> dict:
    return await _request("GET", f"/instance/connectionState/{instance_name}")


async def restart_instance(instance_name: str) -> dict:
    return await _request("POST", f"/instance/restart/{instance_name}")


async def logout_instance(instance_name: str) -> dict:
    return await _request("DELETE", f"/instance/logout/{instance_name}")


async def fetch_instances(instance_name: Optional[str] = None) -> list:
    """Instâncias conhecidas pela Evolution. Instância inexistente é lista vazia.

    A v2.3 responde `404` quando o filtro `instanceName` não casa com nada, em
    vez da lista vazia que o nome da rota sugere. Para uma *consulta*, "não
    existe" é resultado, não falha — e sem esta distinção `garantir_instancia`
    nunca chegava a criar: o primeiro acesso de todo usuário novo virava `503`.
    Qualquer outro status continua subindo como erro de verdade.
    """
    params = {"instanceName": instance_name} if instance_name else None
    try:
        data = await _request("GET", "/instance/fetchInstances", params=params)
    except httpx.HTTPStatusError as erro:
        if erro.response.status_code == 404:
            return []
        raise
    return data if isinstance(data, list) else []
