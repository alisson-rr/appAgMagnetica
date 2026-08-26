"""Registro do webhook da Evolution: formato v2.3, autenticidade e sigilo."""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path

import httpx
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import evolution_api  # noqa: E402

SEGREDO = "segredo-de-teste-nunca-real"


@pytest.fixture
def evolution_configurada(monkeypatch):
    monkeypatch.setenv("EVOLUTION_BASE_URL", "https://evolution.example.com")
    monkeypatch.setenv("EVOLUTION_API_KEY", "apikey-de-teste")
    monkeypatch.setenv("EVOLUTION_WEBHOOK_URL", "https://n8n.example.com/webhook/agenda-magnetica-v2")
    monkeypatch.setenv("EVOLUTION_WEBHOOK_SECRET", SEGREDO)
    monkeypatch.delenv("EVOLUTION_WEBHOOK_HEADER_NAME", raising=False)


def test_payload_usa_o_involucro_webhook_da_v2_3(evolution_configurada):
    payload = evolution_api.build_webhook_payload()

    assert set(payload) == {"webhook"}, "a v2.3 exige tudo dentro de 'webhook'"
    webhook = payload["webhook"]
    assert webhook["enabled"] is True
    assert webhook["url"] == "https://n8n.example.com/webhook/agenda-magnetica-v2"
    assert webhook["byEvents"] is False


def test_payload_envia_o_header_de_autenticidade(evolution_configurada):
    webhook = evolution_api.build_webhook_payload()["webhook"]

    assert webhook["headers"][evolution_api.DEFAULT_WEBHOOK_HEADER_NAME] == SEGREDO


def test_nome_do_header_e_configuravel(evolution_configurada, monkeypatch):
    monkeypatch.setenv("EVOLUTION_WEBHOOK_HEADER_NAME", "x-outro-nome")

    webhook = evolution_api.build_webhook_payload()["webhook"]

    assert webhook["headers"]["x-outro-nome"] == SEGREDO
    assert evolution_api.DEFAULT_WEBHOOK_HEADER_NAME not in webhook["headers"]


def test_base64_desligado_para_nao_reter_midia(evolution_configurada):
    assert evolution_api.build_webhook_payload()["webhook"]["base64"] is False


def test_preserva_os_eventos_necessarios(evolution_configurada):
    eventos = evolution_api.build_webhook_payload()["webhook"]["events"]

    assert set(eventos) == {"MESSAGES_UPSERT", "SEND_MESSAGE"}


def test_segredo_ausente_falha_de_forma_clara(evolution_configurada, monkeypatch):
    monkeypatch.delenv("EVOLUTION_WEBHOOK_SECRET")

    with pytest.raises(RuntimeError) as erro:
        evolution_api.build_webhook_payload()

    assert "EVOLUTION_WEBHOOK_SECRET" in str(erro.value)
    assert SEGREDO not in str(erro.value)


def test_segredo_ausente_nao_e_engolido_por_set_webhook(evolution_configurada, monkeypatch):
    """A falha de configuração precisa aparecer, não virar 'webhook_not_configured'."""
    monkeypatch.delenv("EVOLUTION_WEBHOOK_SECRET")

    with pytest.raises(RuntimeError):
        import asyncio

        asyncio.run(evolution_api.set_webhook("instancia-de-teste"))


def test_falha_de_rede_nao_registra_o_segredo(evolution_configurada, monkeypatch, caplog):
    async def explode(*_args, **_kwargs):
        raise RuntimeError(f"falha simulada carregando {SEGREDO}")

    monkeypatch.setattr(evolution_api, "_request", explode)

    import asyncio

    with caplog.at_level(logging.ERROR):
        resultado = asyncio.run(evolution_api.set_webhook("instancia-de-teste"))

    assert resultado == {"error": "webhook_not_configured"}
    assert SEGREDO not in caplog.text


def test_segredo_nunca_aparece_no_env_example():
    exemplo = (BACKEND_DIR / ".env.example").read_text(encoding="utf-8")

    assert "EVOLUTION_WEBHOOK_SECRET" in exemplo, "o nome da variável precisa estar documentado"
    assert "EVOLUTION_WEBHOOK_HEADER_NAME" in exemplo
    for linha in exemplo.splitlines():
        if linha.startswith("EVOLUTION_WEBHOOK_SECRET="):
            assert "substitua" in linha or "gere-um" in linha, "valor real vazou no exemplo"


# --- fetchInstances: "não existe" é resultado, não falha ---------------------
# A Evolution v2.3 responde 404 quando o filtro `instanceName` não casa com
# nada. Como `garantir_instancia` decide criar a partir de lista vazia, tratar
# esse 404 como erro fazia o primeiro acesso de todo usuário novo virar 503.

class _RespostaFalsa:
    def __init__(self, status, corpo):
        self.status_code = status
        self._corpo = corpo

    def json(self):
        return self._corpo

    def raise_for_status(self):
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                f"status {self.status_code}", request=None, response=self
            )


def _cliente_que_responde(status, corpo):
    class _Cliente:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def request(self, *_args, **_kwargs):
            return _RespostaFalsa(status, corpo)

    return lambda **_kwargs: _Cliente()


def test_instancia_inexistente_vira_lista_vazia(evolution_configurada, monkeypatch):
    monkeypatch.setattr(
        httpx, "AsyncClient", _cliente_que_responde(404, {"status": 404, "error": "Not Found"})
    )
    assert asyncio.run(evolution_api.fetch_instances("agm_1_nao_existe")) == []


def test_instancia_existente_volta_na_lista(evolution_configurada, monkeypatch):
    monkeypatch.setattr(
        httpx, "AsyncClient", _cliente_que_responde(200, [{"name": "agm_1_marina"}])
    )
    assert asyncio.run(evolution_api.fetch_instances("agm_1_marina")) == [{"name": "agm_1_marina"}]


def test_outro_erro_da_evolution_continua_subindo(evolution_configurada, monkeypatch):
    """500 é indisponibilidade do provedor: não pode virar "instância não existe",
    senão o painel tentaria criar uma instância que talvez já exista."""
    monkeypatch.setattr(httpx, "AsyncClient", _cliente_que_responde(500, {"erro": "interno"}))
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(evolution_api.fetch_instances("agm_1_marina"))
