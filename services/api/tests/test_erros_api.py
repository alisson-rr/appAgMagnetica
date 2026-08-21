"""Tradução de erro do banco em resposta HTTP útil."""

import pytest
from fastapi import HTTPException

import server


def test_violacao_de_fk_vira_409_explicativo():
    erro = Exception(
        '{"code":"23503","details":"Key (id)=(7) is still referenced from table \\"consulta\\"."}'
    )

    with pytest.raises(HTTPException) as capturado:
        server.raise_if_in_use(erro, "Profissional")

    assert capturado.value.status_code == 409
    assert "Profissional" in capturado.value.detail
    assert "agendamentos" in capturado.value.detail


def test_reconhece_a_mensagem_textual_da_fk():
    erro = Exception('update or delete on table "cliente" violates foreign key constraint')

    with pytest.raises(HTTPException) as capturado:
        server.raise_if_in_use(erro, "Cliente")

    assert capturado.value.status_code == 409


def test_erro_alheio_passa_direto():
    """Só a FK vira 409. O resto continua caindo no tratamento genérico."""
    assert server.raise_if_in_use(Exception("timeout na rede"), "Cliente") is None


def test_nao_vaza_detalhe_interno_do_banco():
    erro = Exception('23503: constraint "consulta_id_profissional_fkey" on table "consulta"')

    with pytest.raises(HTTPException) as capturado:
        server.raise_if_in_use(erro, "Profissional")

    assert "fkey" not in capturado.value.detail
    assert "23503" not in capturado.value.detail
