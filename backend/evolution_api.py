"""
Evolution API Service
Integração com Evolution API para WhatsApp
"""
import httpx
import logging
from typing import Optional

# Configurações da Evolution API
EVOLUTION_BASE_URL = "https://evo.devnoflow.com.br"
EVOLUTION_API_KEY = "gJRYf6JN8RsL2jrPolWZaI7LNOe6XDMC"
WEBHOOK_URL = "https://webhook.devnoflow.com.br/webhook/sync-magnetic"

logger = logging.getLogger(__name__)


async def create_instance(instance_name: str) -> dict:
    """
    Cria uma nova instância no Evolution API
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{EVOLUTION_BASE_URL}/instance/create",
                headers={
                    "apikey": EVOLUTION_API_KEY,
                    "Content-Type": "application/json"
                },
                json={
                    "instanceName": instance_name,
                    "qrcode": True,
                    "integration": "WHATSAPP-BAILEYS"
                },
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            
            # Se criou com sucesso, configura o webhook
            if data:
                await set_webhook(instance_name)
            
            return data
        except Exception as e:
            logger.error(f"Erro ao criar instância: {str(e)}")
            raise


async def set_webhook(instance_name: str) -> dict:
    """
    Configura o webhook para a instância
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{EVOLUTION_BASE_URL}/webhook/set/{instance_name}",
                headers={
                    "apikey": EVOLUTION_API_KEY,
                    "Content-Type": "application/json"
                },
                json={
                    "url": WEBHOOK_URL,
                    "byEvents": False,
                    "base64": True,
                    "events": [
                        "SEND_MESSAGE",
                        "MESSAGES_UPSERT"
                    ]
                },
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Erro ao configurar webhook: {str(e)}")
            # Não lança exceção pois o webhook pode ser configurado depois
            return {"error": str(e)}


async def connect_instance(instance_name: str) -> dict:
    """
    Conecta a instância e retorna o QR Code
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{EVOLUTION_BASE_URL}/instance/connect/{instance_name}",
                headers={
                    "apikey": EVOLUTION_API_KEY
                },
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Erro ao conectar instância: {str(e)}")
            raise


async def get_connection_state(instance_name: str) -> dict:
    """
    Retorna o estado da conexão da instância
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{EVOLUTION_BASE_URL}/instance/connectionState/{instance_name}",
                headers={
                    "apikey": EVOLUTION_API_KEY
                },
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Erro ao buscar estado da conexão: {str(e)}")
            raise


async def restart_instance(instance_name: str) -> dict:
    """
    Reinicia a instância
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{EVOLUTION_BASE_URL}/instance/restart/{instance_name}",
                headers={
                    "apikey": EVOLUTION_API_KEY
                },
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Erro ao reiniciar instância: {str(e)}")
            raise


async def logout_instance(instance_name: str) -> dict:
    """
    Desconecta a instância (logout)
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.delete(
                f"{EVOLUTION_BASE_URL}/instance/logout/{instance_name}",
                headers={
                    "apikey": EVOLUTION_API_KEY
                },
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Erro ao desconectar instância: {str(e)}")
            raise


async def fetch_instances(instance_name: Optional[str] = None) -> list:
    """
    Lista instâncias existentes
    """
    async with httpx.AsyncClient() as client:
        try:
            params = {}
            if instance_name:
                params["instanceName"] = instance_name
            
            response = await client.get(
                f"{EVOLUTION_BASE_URL}/instance/fetchInstances",
                headers={
                    "apikey": EVOLUTION_API_KEY
                },
                params=params,
                timeout=30.0
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Erro ao buscar instâncias: {str(e)}")
            raise
