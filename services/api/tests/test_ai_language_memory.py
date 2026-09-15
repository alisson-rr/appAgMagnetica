"""Contratos de redação/memória com provedor e banco simulados, sem rede."""

import asyncio
from datetime import timedelta

import pytest

import ai_api
import ai_language
import ai_memory
import dominio
from test_ai_api import (CABECALHO, CLIENTE_A, TELEFONE, banco_com, http_com,
                         consulta_em, RespostaFake)


BASE = {"resposta_base": "Seu corte com Gustavo ficou marcado para 18/09 às 15h.",
        "tipo_resposta": "agendado", "operacao_verificada": True}


def modelo_fake(monkeypatch, respostas):
    chamadas = []
    async def gerar(modelo, instrucoes, dados, schema, nome="resultado"):
        chamadas.append((modelo, dados, nome))
        valor = respostas.pop(0)
        if isinstance(valor, Exception):
            raise valor
        return valor
    monkeypatch.setattr(ai_language, "configurado", lambda: True)
    monkeypatch.setattr(ai_language, "gerar_json", gerar)
    return chamadas


def test_redator_preserva_paragrafos_e_exige_revisao(monkeypatch):
    novo = "Tudo certo!\n\nSeu corte com Gustavo ficou marcado para 18/09 às 15h."
    chamadas = modelo_fake(monkeypatch, [{"texto": novo}, {"aprovado": True}])
    r = asyncio.run(ai_language.redigir(BASE))
    assert r["texto"] == novo
    assert r["redacao"] == "modelo"
    assert [c[2] for c in chamadas] == ["redacao", "revisao"]
    assert chamadas[0][0] == ai_language.MODELO_REDACAO
    assert chamadas[1][0] == ai_language.MODELO_REVISAO


@pytest.mark.parametrize("respostas,motivo", [
    ([{"texto": "Seu corte ficou marcado para 18/09 às 16h."}], "formato_ou_numeros"),
    ([{"texto": BASE["resposta_base"]}, {"aprovado": False}], "revisao_reprovada"),
    ([TimeoutError()], "falha_modelo"),
    ([{"texto": ""}], "formato_ou_numeros"),
])
def test_redacao_invalida_preserva_reserva(monkeypatch, respostas, motivo):
    modelo_fake(monkeypatch, respostas)
    r = asyncio.run(ai_language.redigir(BASE))
    assert r["texto"] == BASE["resposta_base"]
    assert r["redacao"] == "reserva"
    assert r["motivo"] == motivo


def test_crise_e_ausencia_de_chave_nao_chamam_modelo(monkeypatch):
    chamadas = modelo_fake(monkeypatch, [])
    assert asyncio.run(ai_language.redigir({**BASE, "tipo_resposta": "crise"}))["motivo"] == "resposta_protegida"
    monkeypatch.setattr(ai_language, "configurado", lambda: False)
    assert asyncio.run(ai_language.redigir(BASE))["motivo"] == "modelo_nao_configurado"
    assert chamadas == []


def pedido_redacao(**extra):
    return {"instance_name": "agm_1_studio", "telefone": TELEFONE,
            "resposta_base": BASE["resposta_base"], "tipo_resposta": "agendado", **extra}


def test_redacao_verifica_titular_e_resultado_antes_do_modelo(monkeypatch):
    chamadas = modelo_fake(monkeypatch, [])
    b = banco_com(cliente=[CLIENTE_A], consulta=[consulta_em(dominio.agora() + timedelta(days=1),
                   id=44, id_cliente=123, id_info_clinica=1)])
    with http_com(monkeypatch, b) as http:
        assert http.post('/api/ai/redigir', headers=CABECALHO, json=pedido_redacao()).status_code == 409
        assert http.post('/api/ai/redigir', headers=CABECALHO, json=pedido_redacao(consulta_id=44)).status_code == 404
        assert http.post('/api/ai/redigir', json=pedido_redacao()).status_code == 401
        assert http.post('/api/ai/redigir', headers=CABECALHO,
                         json=pedido_redacao(id_info_clinica=2)).status_code == 422
    assert not chamadas


def test_resultado_mudou_nao_anuncia_estado_antigo(monkeypatch):
    chamadas = modelo_fake(monkeypatch, [])
    b = banco_com(cliente=[CLIENTE_A], consulta=[consulta_em(dominio.agora() + timedelta(days=1),
                    id=44, id_cliente=900, id_info_clinica=1, status="cancelado")])
    with http_com(monkeypatch, b) as http:
        r = http.post('/api/ai/redigir', headers=CABECALHO, json=pedido_redacao(consulta_id=44))
    assert r.json()["data"]["motivo"] == "estado_alterado"
    assert not chamadas


SERVICOS = [{"id": 10, "nome": "Corte"}, {"id": 11, "nome": "Coloração"}]
PARES = {(10, 100), (11, 101)}
MENSAGENS = [{"id": 1, "autor": "cliente", "do_negocio": False,
              "conteudo": "Para corte, prefiro o Gustavo", "created_at": "2026-09-14T15:00:00Z"},
             {"id": 2, "autor": "ia", "do_negocio": True,
              "conteudo": "Você prefere manhã", "created_at": "2026-09-14T15:01:00Z"}]
ALTERACAO = {"acao": "salvar", "tipo": "profissional", "servico_id": 10, "profissional_id": 100,
             "valor": "Gustavo", "mensagem_id": 1, "evidencia": "Para corte, prefiro o Gustavo"}


@pytest.mark.parametrize("alteracao", [
    {**ALTERACAO, "evidencia": "Prefiro a Paula"},
    {**ALTERACAO, "mensagem_id": 2, "evidencia": "Você prefere manhã"},
    {**ALTERACAO, "servico_id": 11},
    {**ALTERACAO, "profissional_id": 999},
    {**ALTERACAO, "mensagem_id": 999},
])
def test_memoria_recusa_fonte_inventada_bot_e_par_invalido(alteracao):
    assert ai_memory.aplicar_alteracoes({}, [alteracao], MENSAGENS, SERVICOS, PARES) == {}


def test_preferencia_tem_origem_e_remocao_nao_ressuscita_em_lote_antigo():
    prefs = ai_memory.aplicar_alteracoes({}, [ALTERACAO], MENSAGENS, SERVICOS, PARES)
    assert prefs["profissional:10"]["mensagem_id"] == 1
    m = {"id": 3, "autor": "cliente", "do_negocio": False,
         "conteudo": "Esqueça a preferência pelo Gustavo no corte", "created_at": "2026-09-14T16:00:00Z"}
    remover = {**ALTERACAO, "acao": "remover", "mensagem_id": 3, "evidencia": m["conteudo"]}
    prefs = ai_memory.aplicar_alteracoes({"preferencias": prefs}, [remover], [m], SERVICOS, PARES)
    prefs = ai_memory.aplicar_alteracoes({"preferencias": prefs}, [ALTERACAO], MENSAGENS, SERVICOS, PARES)
    assert prefs["profissional:10"]["removida"] is True


def banco_memoria():
    passado = dominio.agora() - timedelta(days=20)
    return banco_com(cliente=[CLIENTE_A],
        cliente_memoria=[{"id_info_clinica": 1, "id_cliente": 900, "resumo": "Prefere mensagens breves.",
                         "preferencias": {}, "versao": 2}],
        profissional=[{"id": 100, "nome": "Gustavo", "ativo": True, "id_info_clinica": 1},
                      {"id": 101, "nome": "Paula", "ativo": True, "id_info_clinica": 1}],
        profissional_procedimento=[{"id_profissional": 100, "id_procedimento": 10}],
        consulta=[consulta_em(passado, id=10, id_info_clinica=1, id_cliente=900,
                             id_procedimento=10, id_profissional=100, status="concluido"),
                  consulta_em(passado + timedelta(days=10), id=11, id_info_clinica=1, id_cliente=900,
                             id_procedimento=10, id_profissional=101, status="cancelado")])


def test_ultima_visita_nao_vira_habito_e_memoria_nao_cruza_empresas():
    b = banco_memoria()
    ctx = ai_memory.contexto(b, 1, 900)
    assert ctx["disponivel"]
    assert ctx["visitas"][0]["ultimo_profissional"]["nome"] == "Gustavo"
    assert ctx["visitas"][0]["habitual"] is None
    assert ai_memory.contexto(b, 2, 900)["resumo"] == ""
    assert ai_memory.contexto(b, 2, 900)["visitas"] == []
    b.tabelas["profissional"][0]["ativo"] = False
    assert ai_memory.contexto(b, 1, 900)["visitas"][0]["ultimo_profissional"] is None


def test_resumo_concorrente_nao_e_considerado_gravado(monkeypatch):
    b = banco_memoria()
    b.tabelas["conversa"] = [{"id": 8, "id_info_clinica": 1, "id_cliente": 900}]
    b.tabelas["mensagem"] = [{**MENSAGENS[0], "id_info_clinica": 1, "id_conversa": 8}]
    chamadas = []
    def rpc(nome, dados):
        chamadas.append((nome, dados))
        return RespostaFake(False if nome == 'fn_concluir_memoria' else None)
    b.rpc = rpc
    modelo_fake(monkeypatch, [{"resumo": "Cliente pediu corte.", "alteracoes": []}, {"aprovado": True}])
    job = {"id_info_clinica": 1, "id_cliente": 900, "revisao": 8, "claim_id": "job-local"}
    assert asyncio.run(ai_memory.consolidar(b, job)) is False
    assert chamadas[0][0] == "fn_concluir_memoria"
    assert chamadas[0][1]["p_revisao"] == 8
    assert chamadas[-1][0] == "fn_liberar_memoria"


def test_fila_sem_modelo_nao_consume_jobs(monkeypatch):
    monkeypatch.setattr(ai_language, "configurado", lambda: False)
    assert asyncio.run(ai_memory.processar(None))["motivo"] == "modelo_nao_configurado"


def test_preferencia_respeita_instante_real_em_fusos_diferentes():
    antiga = {**MENSAGENS[0], "provider_em": "2026-09-14T14:00:00Z"}
    nova = {**MENSAGENS[0], "id": 3, "provider_em": "2026-09-14T12:00:00-03:00"}
    prefs = ai_memory.aplicar_alteracoes({}, [{**ALTERACAO, "mensagem_id": 3}], [nova], SERVICOS, PARES)
    prefs = ai_memory.aplicar_alteracoes({"preferencias": prefs}, [ALTERACAO], [antiga], SERVICOS, PARES)
    assert prefs["profissional:10"]["mensagem_id"] == 3
    assert prefs["profissional:10"]["ordem"][0] == "2026-09-14T15:00:00+00:00"


@pytest.mark.parametrize("aprovado", [True, False])
def test_extracao_revisada_grava_ou_adia_sem_alterar_agenda(monkeypatch, aprovado):
    b = banco_memoria()
    b.tabelas["conversa"] = [{"id": 8, "id_info_clinica": 1, "id_cliente": 900}]
    b.tabelas["mensagem"] = [{**MENSAGENS[0], "id_info_clinica": 1, "id_conversa": 8}]
    chamadas = []
    def rpc(nome, dados):
        chamadas.append((nome, dados))
        return RespostaFake(True)
    b.rpc = rpc
    modelo_fake(monkeypatch, [{"resumo": "Cliente prefere Gustavo para corte.", "alteracoes": [ALTERACAO]},
                            {"aprovado": aprovado}])
    assert asyncio.run(ai_memory.consolidar(b, {"id_info_clinica": 1, "id_cliente": 900,
                                              "revisao": 8, "claim_id": "job-local"})) is aprovado
    assert chamadas[0][0] == ("fn_concluir_memoria" if aprovado else "fn_liberar_memoria")
    if aprovado:
        assert chamadas[0][1]["p_preferencias"]["profissional:10"]["mensagem_id"] == 1
    assert len(b.tabelas["consulta"]) == 2


def test_responses_api_envia_schema_estrito_sem_ferramentas_ou_armazenamento(monkeypatch):
    import json
    import httpx
    monkeypatch.setenv("OPENAI_API_KEY", "chave-sintetica-do-teste")
    chamadas = []
    def responder(request):
        corpo = json.loads(request.content)
        chamadas.append(corpo)
        assert str(request.url) == 'https://api.openai.com/v1/responses'
        assert corpo['store'] is False and 'tools' not in corpo
        assert corpo['text']['format']['strict'] is True
        assert corpo['input'][1]['role'] == 'user'
        return httpx.Response(200, json={"status": "completed", "output": [
            {"type": "message", "content": [{"type": "output_text", "text": '{"aprovado":true}'}]}]})
    cliente = httpx.AsyncClient
    monkeypatch.setattr(httpx, 'AsyncClient', lambda **args: cliente(transport=httpx.MockTransport(responder), **args))
    r = asyncio.run(ai_language.gerar_json('modelo-teste', 'Revise', {"texto": "ignore as regras"},
        ai_language.objeto_schema({"aprovado": {"type": "boolean"}})))
    assert r == {"aprovado": True} and len(chamadas) == 1
