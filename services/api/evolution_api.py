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


async def set_webhook(instance_name: str) -> dict:
    _, _, webhook_url = _config()
    try:
        return await _request(
            "POST",
            f"/webhook/set/{instance_name}",
            json={
                "url": webhook_url,
                "byEvents": False,
                "base64": True,
                "events": ["SEND_MESSAGE", "MESSAGES_UPSERT"],
            },
        )
    except Exception:
        logger.exception("Não foi possível configurar o webhook da instância %s", instance_name)
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
    params = {"instanceName": instance_name} if instance_name else None
    data = await _request("GET", "/instance/fetchInstances", params=params)
    return data if isinstance(data, list) else []
