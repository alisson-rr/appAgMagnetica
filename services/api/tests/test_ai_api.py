"""Regras e contrato das rotas `/api/ai/*`, sem rede.

O comportamento contra o banco real está em `test_ai_api_integracao.py`. Aqui
ficam as regras que precisam valer mesmo sem banco: autenticação, envelope,
validação de fronteira, normalização de telefone, dinheiro, fuso e a derivação
da empresa pela instância.
"""

import asyncio
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

import ai_api
import dominio
import server

TOKEN = "token-de-teste-com-tamanho-suficiente-1234"
CABECALHO = {ai_api.CABECALHO_TOKEN: TOKEN}


# ===== Banco falso, só o suficiente para as rotas exercitadas aqui =====
class RespostaFake:
    def __init__(self, data):
        self.data = data

    def execute(self):
        return self


class ConsultaFake:
    def __init__(self, banco, tabela):
        self.banco = banco
        self.tabela = tabela
        self.filtros = []
        self.limite = None
        self.escrita = None

    def select(self, *_args, **_kwargs):
        return self

    def insert(self, dados):
        self.escrita = ("insert", dados)
        return self

    def update(self, dados):
        self.escrita = ("update", dados)
        return self

    def delete(self):
        self.escrita = ("delete", None)
        return self

    def order(self, *_args, **_kwargs):
        return self

    def eq(self, coluna, valor):
        self.filtros.append(("eq", coluna, valor))
        return self

    def in_(self, coluna, valores):
        self.filtros.append(("in", coluna, list(valores)))
        return self

    def limit(self, quantidade):
        self.limite = quantidade
        return self

    def execute(self):
        if self.escrita and self.escrita[0] == "insert":
            return self.banco.inserir(self.tabela, self.escrita[1])
        linhas = self._filtradas()
        if self.escrita and self.escrita[0] == "update":
            return self.banco.atualizar(self.tabela, linhas, self.escrita[1])
        if self.escrita and self.escrita[0] == "delete":
            return self.banco.apagar(self.tabela, linhas)
        return RespostaFake(linhas[: self.limite] if self.limite else linhas)

    def _filtradas(self):
        linhas = self.banco.tabelas.get(self.tabela, [])
        for operador, coluna, valor in self.filtros:
            if operador == "eq":
                linhas = [linha for linha in linhas if str(linha.get(coluna)) == str(valor)]
            else:
                alvo = {str(item) for item in valor}
                linhas = [linha for linha in linhas if str(linha.get(coluna)) in alvo]
        return linhas


class ErroDeBanco(Exception):
    """Erro do PostgREST com SQLSTATE, na forma que `codigo_postgres` lê."""

    def __init__(self, code):
        super().__init__(f"erro simulado {code}")
        self.code = code


class BancoFake:
    def __init__(self, tabelas=None, slots=None, corridas=None, rpcs=None):
        """`corridas`: fila por tabela de `(sqlstate, linha_concorrente)`.

        Cada escrita consome a primeira entrada da fila da sua tabela: a linha,
        quando existe, é gravada como se OUTRA requisição tivesse vencido a
        corrida, e só então o erro do banco é levantado para esta. É o que o
        PostgreSQL faz quando duas escritas disputam a mesma constraint, e é a
        única forma de exercitar os ramos de 23P01 e 23505 sem banco real.
        """
        self.tabelas = tabelas or {}
        self.slots = slots or []
        self.corridas = corridas or {}
        # `slots` continua atendendo fn_buscar_slots, que e a RPC de quase
        # todo teste. `rpcs` e para as outras, por nome.
        self.rpcs = rpcs or {}

    def table(self, nome):
        return ConsultaFake(self, nome)

    def rpc(self, nome, _parametros):
        if nome in self.rpcs:
            return RespostaFake(self.rpcs[nome])
        return RespostaFake(self.slots)

    def inserir(self, tabela, dados):
        self._disputar(tabela)
        linhas = self.tabelas.setdefault(tabela, [])
        novo = dict(dados)
        novo.setdefault("id", 9000 + len(linhas))
        if tabela == "cliente":
            novo["whats_normalizado"] = "".join(c for c in str(novo.get("whats", "")) if c.isdigit())
        if tabela == "consulta":
            self._embutir_relacionados(novo)
        linhas.append(novo)
        return RespostaFake([novo])

    def apagar(self, tabela, linhas):
        restantes = [l for l in self.tabelas.get(tabela, []) if l not in linhas]
        self.tabelas[tabela] = restantes
        return RespostaFake(linhas)

    def atualizar(self, tabela, linhas, dados):
        self._disputar(tabela)
        for linha in linhas:
            linha.update(dados)
            if tabela == "consulta":
                self._embutir_relacionados(linha)
        return RespostaFake(linhas)

    def _disputar(self, tabela):
        fila = self.corridas.get(tabela) or []
        if not fila:
            return
        sqlstate, concorrente = fila.pop(0)
        if concorrente is not None:
            self.tabelas.setdefault(tabela, []).append(dict(concorrente))
        raise ErroDeBanco(sqlstate)

    def _embutir_relacionados(self, linha):
        """Os joins embutidos que o PostgREST devolve no select da consulta."""
        linha["procedimento"] = self._por_id("procedimento", linha.get("id_procedimento"))
        linha["profissional"] = self._por_id("profissional", linha.get("id_profissional"))

    def _por_id(self, tabela, identificador):
        for linha in self.tabelas.get(tabela, []):
            if str(linha.get("id")) == str(identificador):
                return dict(linha)
        return {}


EMPRESA_A = 1
EMPRESA_B = 2

BANCO_PADRAO = {
    "usuarios": [
        {"instance_name": "agm_1_studio", "id_info_clinica": EMPRESA_A},
        {"instance_name": "agm_2_barbearia", "id_info_clinica": EMPRESA_B},
        {"instance_name": "agm_3_sem_empresa", "id_info_clinica": None},
    ],
    "procedimento": [
        {"id": 10, "nome": "Limpeza de pele", "valor": "180.00",
         "duracao_minutos": 60, "id_info_clinica": EMPRESA_A},
        # Sem nenhum profissional habilitado: a view o marca agendavel=false.
        {"id": 11, "nome": "Massagem", "valor": "120.00",
         "duracao_minutos": 50, "id_info_clinica": EMPRESA_A},
        {"id": 20, "nome": "Corte", "valor": "50.00",
         "duracao_minutos": 30, "id_info_clinica": EMPRESA_B},
    ],
    "profissional": [
        {"id": 100, "nome": "Ana", "ativo": True, "id_info_clinica": EMPRESA_A},
        {"id": 101, "nome": "Bia", "ativo": True, "id_info_clinica": EMPRESA_A},
        {"id": 102, "nome": "Caio", "ativo": False, "id_info_clinica": EMPRESA_A},
        {"id": 200, "nome": "Bruno", "ativo": True, "id_info_clinica": EMPRESA_B},
    ],
    "v_clinica_detalhes": [
        {
            "id_info_clinica": EMPRESA_A,
            "clinica_nome": "Studio A",
            "clinica_telefone": "(51) 3333-0000",
            "clinica_email": "contato@studio.example",
            "clinica_endereco": "Rua A, 1",
            "clinica_descricao": "Aceitamos pix e cartão. Estacionamento na porta.",
            "assistente_nome": "Aurora",
            "assistente_tom": "acolhedor",
            "exige_profissional": False,
            "automacao_ativa": True,
            "horarios": [{"dia_semana": 5, "hora_inicio": "09:00", "hora_fim": "18:00"}],
            "procedimentos": [
                {"id": 10, "nome": "Limpeza de pele", "valor": "180.00",
                 "duracao_minutos": 60, "agendavel": True},
                {"id": 11, "nome": "Massagem", "valor": "120.00",
                 "duracao_minutos": 50, "agendavel": False},
            ],
            "profissionais": [{"id": 100, "nome": "Ana", "area": ""}],
        }
    ],
    "cliente": [],
    "consulta": [],
}

TELEFONE = "5551999990000"
CLIENTE_A = {
    "id": 900, "nome": "Marina", "whats": TELEFONE, "telefone": TELEFONE,
    "whats_normalizado": TELEFONE, "email": None, "data_nascimento": None,
    "interesses": None, "status": "ativo", "id_info_clinica": EMPRESA_A,
}


def banco_com(slots=None, corridas=None, rpcs=None, **tabelas):
    """`BANCO_PADRAO` com tabelas substituídas, sempre em cópia própria."""
    base = {chave: [dict(linha) for linha in linhas] for chave, linhas in BANCO_PADRAO.items()}
    base.update(tabelas)
    return BancoFake(base, slots=slots, corridas=corridas, rpcs=rpcs)


def http_com(monkeypatch, banco, erros_do_servidor=True):
    monkeypatch.setattr(ai_api, "supabase", banco)
    return TestClient(server.app, raise_server_exceptions=erros_do_servidor)


@pytest.fixture
def cliente_http(monkeypatch):
    with http_com(monkeypatch, banco_com()) as cliente:
        yield cliente


def amanha_as(hora):
    base = dominio.agora() + timedelta(days=1)
    return base.replace(hour=hora, minute=0, second=0, microsecond=0)


def slot_em(momento, profissional=100, duracao=60, empresa=EMPRESA_A):
    """Linha de `fn_buscar_slots` como a RPC a devolve."""
    return {
        "id_info_clinica": empresa,
        "id_profissional": profissional,
        "id_procedimento": 10,
        "inicio": momento.isoformat(),
        "fim": (momento + timedelta(minutes=duracao)).isoformat(),
        "profissional_nome": "Ana",
    }


def consulta_em(momento, duracao=60, **extras):
    """Linha de `consulta` como o PostgREST devolve, com os joins embutidos."""
    linha = {
        "id": 555,
        "intervalo": dominio.montar_intervalo(momento, duracao),
        "status": "pendente",
        "confirmado_em": None,
        "cancelado_em": None,
        "motivo_cancelamento": None,
        "valor_cobrado": "180.00",
        "chave_idempotencia": None,
        "id_cliente": CLIENTE_A["id"],
        "id_procedimento": 10,
        "id_profissional": 100,
        "id_info_clinica": EMPRESA_A,
        "procedimento": {"id": 10, "nome": "Limpeza de pele",
                         "valor": "180.00", "duracao_minutos": duracao},
        "profissional": {"id": 100, "nome": "Ana"},
    }
    linha.update(extras)
    return linha


# ===== Autenticação =====
def test_token_ausente_e_recusado(cliente_http):
    resposta = cliente_http.post("/api/ai/contexto", json={
        "instance_name": "agm_1_studio", "telefone": "5551999990000"})

    assert resposta.status_code == 401
    corpo = resposta.json()
    assert corpo["ok"] is False
    assert corpo["data"] is None
    assert corpo["error"]["code"] == "AUTENTICACAO_INVALIDA"


def test_token_incorreto_e_recusado_sem_revelar_detalhe(cliente_http):
    resposta = cliente_http.post(
        "/api/ai/contexto",
        headers={ai_api.CABECALHO_TOKEN: "token-errado-mas-do-mesmo-tamanho-1234"},
        json={"instance_name": "agm_1_studio", "telefone": "5551999990000"},
    )

    assert resposta.status_code == 401
    mensagem = resposta.json()["error"]["message"]
    # A resposta não pode dizer se o token existe, é curto ou expirou.
    assert TOKEN not in mensagem and "AUTOMATION_API_TOKEN" not in mensagem


def test_token_correto_passa_da_autenticacao(cliente_http):
    resposta = cliente_http.post(
        "/api/ai/contexto",
        headers=CABECALHO,
        json={"instance_name": "agm_1_studio", "telefone": "5551999990000"},
    )

    assert resposta.status_code != 401


def test_token_do_painel_nao_serve_para_a_automacao(cliente_http):
    """O JWT do dashboard não pode virar credencial de máquina."""
    jwt_painel = server.create_access_token({"user_id": 1, "id_info_clinica": EMPRESA_A})

    resposta = cliente_http.post(
        "/api/ai/contexto",
        headers={ai_api.CABECALHO_TOKEN: jwt_painel},
        json={"instance_name": "agm_1_studio", "telefone": "5551999990000"},
    )

    assert resposta.status_code == 401


def test_sem_token_configurado_as_rotas_ficam_fechadas(cliente_http, monkeypatch):
    monkeypatch.setattr(ai_api, "AUTOMATION_API_TOKEN", "")

    resposta = cliente_http.post(
        "/api/ai/contexto",
        headers=CABECALHO,
        json={"instance_name": "agm_1_studio", "telefone": "5551999990000"},
    )

    assert resposta.status_code == 503
    assert resposta.json()["error"]["code"] == "AUTOMACAO_INDISPONIVEL"


def test_token_curto_demais_e_tratado_como_nao_configurado(cliente_http, monkeypatch):
    monkeypatch.setattr(ai_api, "AUTOMATION_API_TOKEN", "curto")

    resposta = cliente_http.post(
        "/api/ai/contexto",
        headers={ai_api.CABECALHO_TOKEN: "curto"},
        json={"instance_name": "agm_1_studio", "telefone": "5551999990000"},
    )

    assert resposta.json()["error"]["code"] == "AUTOMACAO_INDISPONIVEL"


# ===== Resolução de empresa =====
def test_instancia_inexistente(cliente_http):
    resposta = cliente_http.post("/api/ai/contexto", headers=CABECALHO, json={
        "instance_name": "instancia-que-nao-existe", "telefone": "5551999990000"})

    assert resposta.status_code == 404
    assert resposta.json()["error"]["code"] == "INSTANCIA_DESCONHECIDA"


def test_instancia_sem_empresa_configurada(cliente_http):
    resposta = cliente_http.post("/api/ai/contexto", headers=CABECALHO, json={
        "instance_name": "agm_3_sem_empresa", "telefone": "5551999990000"})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "EMPRESA_NAO_CONFIGURADA"


def test_empresa_vem_da_instancia_e_nao_do_corpo(cliente_http, monkeypatch):
    vistos = []
    original = ai_api.resolver_empresa
    monkeypatch.setattr(ai_api, "resolver_empresa",
                        lambda nome: vistos.append(nome) or original(nome))

    cliente_http.post("/api/ai/disponibilidade", headers=CABECALHO, json={
        "instance_name": "agm_2_barbearia", "id_procedimento": 20,
        "inicio": amanha_as(9).isoformat(), "fim": amanha_as(18).isoformat()})

    assert vistos == ["agm_2_barbearia"]


def test_corpo_com_id_info_clinica_e_recusado(cliente_http):
    """`extra=forbid` impede a automação de tentar escolher a empresa."""
    resposta = cliente_http.post("/api/ai/disponibilidade", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "id_procedimento": 10,
        "id_info_clinica": EMPRESA_B,
        "inicio": amanha_as(9).isoformat(), "fim": amanha_as(18).isoformat()})

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["error"]["code"] == "ENTRADA_INVALIDA"
    assert "id_info_clinica" in corpo["error"]["message"]


# ===== Isolamento entre empresas =====
def test_procedimento_de_outra_empresa_e_recusado(cliente_http):
    resposta = cliente_http.post("/api/ai/disponibilidade", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "id_procedimento": 20,
        "inicio": amanha_as(9).isoformat(), "fim": amanha_as(18).isoformat()})

    assert resposta.status_code == 404
    assert resposta.json()["error"]["code"] == "PROCEDIMENTO_INVALIDO"


def test_profissional_de_outra_empresa_e_recusado(cliente_http):
    resposta = cliente_http.post("/api/ai/disponibilidade", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "id_procedimento": 10, "id_profissional": 200,
        "inicio": amanha_as(9).isoformat(), "fim": amanha_as(18).isoformat()})

    assert resposta.status_code == 404
    assert resposta.json()["error"]["code"] == "PROFISSIONAL_INVALIDO"


def test_consulta_de_outra_empresa_nao_e_encontrada(monkeypatch):
    banco = BancoFake({
        **{k: [dict(x) for x in v] for k, v in BANCO_PADRAO.items()},
        "cliente": [{"id": 900, "nome": "Marina", "whats": "5551999990000",
                     "whats_normalizado": "5551999990000", "id_info_clinica": EMPRESA_A}],
        "consulta": [{"id": 555, "id_info_clinica": EMPRESA_B, "id_cliente": 901,
                      "status": "pendente"}],
    })
    monkeypatch.setattr(ai_api, "supabase", banco)

    with TestClient(server.app) as cliente:
        resposta = cliente.post("/api/ai/agendamentos/cancelar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": "5551999990000", "id_consulta": 555})

    assert resposta.status_code == 404
    assert resposta.json()["error"]["code"] == "CONSULTA_NAO_ENCONTRADA"


def test_mesmo_telefone_em_duas_empresas_nao_cruza(monkeypatch):
    banco = BancoFake({
        **{k: [dict(x) for x in v] for k, v in BANCO_PADRAO.items()},
        "cliente": [
            {"id": 900, "nome": "Marina A", "whats": "5551999990000",
             "whats_normalizado": "5551999990000", "id_info_clinica": EMPRESA_A},
            {"id": 901, "nome": "Marina B", "whats": "5551999990000",
             "whats_normalizado": "5551999990000", "id_info_clinica": EMPRESA_B},
        ],
    })
    monkeypatch.setattr(ai_api, "supabase", banco)

    encontrado_a = ai_api.buscar_cliente(EMPRESA_A, "5551999990000")
    encontrado_b = ai_api.buscar_cliente(EMPRESA_B, "5551999990000")

    assert encontrado_a["id"] == 900
    assert encontrado_b["id"] == 901


# ===== Disponibilidade =====
def test_slot_sem_profissional_nunca_e_ofertado(monkeypatch):
    banco = BancoFake({k: [dict(x) for x in v] for k, v in BANCO_PADRAO.items()}, slots=[
        {"id_info_clinica": EMPRESA_A, "id_profissional": None,
         "inicio": "2030-01-01T10:00:00-03:00", "fim": "2030-01-01T11:00:00-03:00"},
        {"id_info_clinica": EMPRESA_A, "id_profissional": 100,
         "inicio": "2030-01-01T11:00:00-03:00", "fim": "2030-01-01T12:00:00-03:00",
         "profissional_nome": "Ana"},
    ])
    monkeypatch.setattr(ai_api, "supabase", banco)

    with TestClient(server.app) as cliente:
        resposta = cliente.post("/api/ai/disponibilidade", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "id_procedimento": 10,
            "inicio": amanha_as(9).isoformat(), "fim": amanha_as(18).isoformat()})

    slots = resposta.json()["data"]["slots"]
    assert len(slots) == 1
    assert all(slot["id_profissional"] for slot in slots)


def test_slot_de_outra_empresa_e_descartado(monkeypatch):
    banco = BancoFake({k: [dict(x) for x in v] for k, v in BANCO_PADRAO.items()}, slots=[
        {"id_info_clinica": EMPRESA_B, "id_profissional": 200,
         "inicio": "2030-01-01T10:00:00-03:00", "fim": "2030-01-01T11:00:00-03:00"},
    ])
    monkeypatch.setattr(ai_api, "supabase", banco)

    with TestClient(server.app) as cliente:
        resposta = cliente.post("/api/ai/disponibilidade", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "id_procedimento": 10,
            "inicio": amanha_as(9).isoformat(), "fim": amanha_as(18).isoformat()})

    assert resposta.json()["data"]["slots"] == []


def test_ausencia_de_horario_nao_e_erro(cliente_http):
    resposta = cliente_http.post("/api/ai/disponibilidade", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "id_procedimento": 10,
        "inicio": amanha_as(9).isoformat(), "fim": amanha_as(18).isoformat()})

    corpo = resposta.json()
    assert resposta.status_code == 200
    assert corpo["ok"] is True
    assert corpo["data"]["slots"] == []
    assert corpo["data"]["total"] == 0
    assert corpo["error"] is None


def test_janela_invertida_e_entrada_invalida(cliente_http):
    resposta = cliente_http.post("/api/ai/disponibilidade", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "id_procedimento": 10,
        "inicio": amanha_as(18).isoformat(), "fim": amanha_as(9).isoformat()})

    assert resposta.status_code == 422
    assert resposta.json()["error"]["code"] == "ENTRADA_INVALIDA"


def test_janela_longa_demais_e_recusada(cliente_http):
    inicio = amanha_as(9)
    resposta = cliente_http.post("/api/ai/disponibilidade", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "id_procedimento": 10,
        "inicio": inicio.isoformat(),
        "fim": (inicio + timedelta(days=ai_api.JANELA_MAXIMA_DIAS + 1)).isoformat()})

    assert resposta.json()["error"]["code"] == "ENTRADA_INVALIDA"


# ===== Idempotência e escrita =====
def test_criar_agendamento_exige_chave_de_idempotencia(cliente_http):
    resposta = cliente_http.post("/api/ai/agendamentos", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "telefone": "5551999990000",
        "id_procedimento": 10, "id_profissional": 100,
        "inicio": amanha_as(10).isoformat()})

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["error"]["code"] == "ENTRADA_INVALIDA"
    assert "chave_idempotencia" in corpo["error"]["message"]


def test_chave_de_idempotencia_e_isolada_por_empresa():
    """O índice único é global: sem prefixo, duas empresas colidiriam."""
    assert ai_api.chave_do_tenant(1, "acao-abc") != ai_api.chave_do_tenant(2, "acao-abc")


def test_horario_no_passado_e_recusado(cliente_http):
    passado = (dominio.agora() - timedelta(days=1)).replace(second=0, microsecond=0)

    resposta = cliente_http.post("/api/ai/agendamentos", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "telefone": "5551999990000",
        "id_procedimento": 10, "id_profissional": 100,
        "inicio": passado.isoformat(), "chave_idempotencia": "acao-passado-1"})

    assert resposta.json()["error"]["code"] == "HORARIO_INDISPONIVEL"


def test_segundo_quebrado_e_recusado(cliente_http):
    quebrado = amanha_as(10).replace(second=17)

    resposta = cliente_http.post("/api/ai/agendamentos", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "telefone": "5551999990000",
        "id_procedimento": 10, "id_profissional": 100,
        "inicio": quebrado.isoformat(), "chave_idempotencia": "acao-segundo-1"})

    assert resposta.json()["error"]["code"] == "ENTRADA_INVALIDA"


def test_escrita_sem_id_nunca_vira_sucesso():
    """Uma requisição aceita não é prova de gravação."""
    with pytest.raises(ai_api.AiError) as erro:
        ai_api.confirmar_efeito(EMPRESA_A, None, lambda _linha: True)

    assert erro.value.code == "FALHA_TEMPORARIA"


def test_releitura_que_nao_confirma_o_efeito_vira_falha(monkeypatch):
    monkeypatch.setattr(ai_api, "supabase", BancoFake({
        "consulta": [{"id": 7, "id_info_clinica": EMPRESA_A, "status": "pendente"}]}))

    with pytest.raises(ai_api.AiError) as erro:
        ai_api.confirmar_efeito(EMPRESA_A, 7, lambda linha: linha["status"] == "cancelado")

    assert erro.value.code == "FALHA_TEMPORARIA"


# ===== Cancelamento =====
def test_status_de_cancelamento_e_o_aceito_pelo_banco():
    """O feminino `cancelada` é recusado pelo CHECK `consulta_status_valido`."""
    assert ai_api.STATUS_CANCELADO == "cancelado"


def test_motivo_de_cancelamento_e_lista_fechada(cliente_http):
    resposta = cliente_http.post("/api/ai/agendamentos/cancelar", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "telefone": "5551999990000",
        "id_consulta": 1, "motivo": "motivo-inventado-pela-ia"})

    assert resposta.status_code == 422
    assert resposta.json()["error"]["code"] == "ENTRADA_INVALIDA"


# ===== Atualização de cadastro =====
def test_atualizacao_de_cliente_recusa_campo_fora_da_lista(cliente_http):
    resposta = cliente_http.post("/api/ai/cliente", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "telefone": "5551999990000",
        "id_info_clinica": EMPRESA_B, "status": "inativo"})

    assert resposta.status_code == 422
    assert resposta.json()["error"]["code"] == "ENTRADA_INVALIDA"


def test_atualizacao_de_cliente_recusa_nome_de_coluna_arbitrario(cliente_http):
    resposta = cliente_http.post("/api/ai/cliente", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "telefone": "5551999990000",
        "whats": "5551000000000"})

    assert resposta.status_code == 422


# ===== Telefone =====
@pytest.mark.parametrize("bruto,esperado", [
    ("5551999990000@s.whatsapp.net", "5551999990000"),
    ("+55 (51) 99999-0000", "5551999990000"),
    ("51999990000", "5551999990000"),
    ("(51) 3333-0000", "555133330000"),
    ("005551999990000", "5551999990000"),
])
def test_telefone_tem_uma_unica_forma_canonica(bruto, esperado):
    assert dominio.normalizar_telefone(bruto) == esperado


@pytest.mark.parametrize("bruto", ["", None, "123", "abc", "0000000000000000000"])
def test_telefone_irreconhecivel_e_recusado(bruto):
    assert dominio.normalizar_telefone(bruto) is None


def test_busca_de_cliente_cobre_a_forma_com_e_sem_o_nono_digito():
    formas = dominio.telefones_equivalentes("+55 51 99999-0000")

    assert formas[0] == "5551999990000"
    # mesma pessoa sem o nono dígito, com e sem código do país
    assert "555199990000" in formas
    assert "5199990000" in formas


def test_telefone_invalido_vira_cliente_invalido(cliente_http):
    resposta = cliente_http.post("/api/ai/contexto", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "telefone": "12345678"})

    assert resposta.json()["error"]["code"] == "CLIENTE_INVALIDO"


# ===== Dinheiro =====
def test_dinheiro_usa_decimal_e_nao_float():
    assert dominio.dinheiro("0.1") + dominio.dinheiro("0.2") == Decimal("0.30")
    assert dominio.dinheiro(180.5) == Decimal("180.50")


def test_dinheiro_para_o_banco_vai_como_texto_exato():
    """`Decimal` não é serializável em JSON e `float` traz erro de binário."""
    assert dominio.dinheiro_para_banco(Decimal("180.00")) == "180.00"
    assert dominio.dinheiro_para_banco("1.005") == "1.00"
    assert dominio.dinheiro_para_banco(None) is None


def test_dinheiro_na_resposta_json_continua_numerico():
    assert dominio.dinheiro_para_json("180.00") == 180.0
    assert dominio.dinheiro_para_json(None) is None


def test_modelo_de_procedimento_recebe_decimal():
    procedimento = server.ProcedimentoCreate(
        nome="Limpeza", duracao_minutos=60, valor=180.5)

    assert isinstance(procedimento.valor, Decimal)
    assert procedimento.valor == Decimal("180.5")


def test_procedimento_com_valor_negativo_e_recusado():
    with pytest.raises(Exception):
        server.ProcedimentoCreate(nome="X", duracao_minutos=30, valor=-1)


# ===== Fuso =====
def test_horario_sem_offset_e_lido_como_sao_paulo_e_nao_utc():
    """Ler como UTC deslocava o agendamento em três horas, em silêncio."""
    ingenuo = datetime(2026, 8, 22, 14, 0, 0)

    resolvido = dominio.com_fuso_de_negocio(ingenuo)

    assert resolvido.utcoffset() == timedelta(hours=-3)
    assert resolvido.astimezone(timezone.utc).hour == 17


def test_horario_com_offset_e_preservado():
    com_offset = datetime(2026, 8, 22, 17, 0, 0, tzinfo=timezone.utc)

    assert dominio.com_fuso_de_negocio(com_offset) == com_offset


def test_intervalo_gravado_carrega_o_offset():
    intervalo = dominio.montar_intervalo(datetime(2026, 8, 22, 14, 0), 60)

    assert intervalo == '["2026-08-22T14:00:00-03:00","2026-08-22T15:00:00-03:00")'


@pytest.mark.parametrize("literal", [
    '["2026-08-22 14:00:00-03","2026-08-22 15:00:00-03")',
    '["2026-08-22T17:00:00+00:00","2026-08-22T18:00:00+00:00")',
    "[2026-08-22 14:00:00-03,2026-08-22 15:00:00-03)",
])
def test_intervalo_do_banco_e_lido_de_volta(literal):
    faixa = dominio.ler_intervalo(literal)

    assert faixa is not None
    assert faixa[0].astimezone(dominio.SAO_PAULO_TZ).hour == 14


def test_intervalo_ilegivel_nao_vira_data_inventada():
    assert dominio.ler_intervalo("empty") is None
    assert dominio.ler_intervalo("") is None


# ===== Catálogo global de áreas =====
def test_usuario_comum_nao_cria_area_de_atuacao(cliente_http):
    """A rota de escrita foi removida: a lista é compartilhada por todos."""
    token = server.create_access_token({"user_id": 1, "id_info_clinica": EMPRESA_A})

    resposta = cliente_http.post(
        "/api/areas-atuacao",
        headers={"Authorization": f"Bearer {token}"},
        json={"nome": "Area inventada"},
    )

    assert resposta.status_code == 405


def test_leitura_do_catalogo_de_areas_continua_disponivel():
    rotas = {rota.path for rota in server.app.routes if hasattr(rota, "path")}

    assert "/api/areas-atuacao" in rotas


def test_o_backend_nao_expoe_mais_o_modelo_de_criacao_de_area():
    assert not hasattr(server, "AreaAtuacaoCreate")


# ===== Envelope =====
def test_envelope_de_sucesso():
    assert ai_api.sucesso({"x": 1}) == {"ok": True, "data": {"x": 1}, "error": None}


def test_envelope_de_erro():
    corpo = ai_api.falha("HORARIO_INDISPONIVEL", "Esse horário não está livre.", False)

    assert corpo["ok"] is False
    assert corpo["data"] is None
    assert corpo["error"] == {
        "code": "HORARIO_INDISPONIVEL",
        "message": "Esse horário não está livre.",
        "retryable": False,
    }


def test_falha_de_infraestrutura_e_marcada_como_repetivel():
    def explode():
        raise RuntimeError("conexão caiu")

    with pytest.raises(ai_api.AiError) as erro:
        ai_api.executar("teste", explode)

    assert erro.value.code == "FALHA_TEMPORARIA"
    assert erro.value.retryable is True
    assert erro.value.status == 503


def test_erro_do_banco_nao_vaza_para_a_resposta():
    def explode():
        raise RuntimeError('{"code":"42P01","message":"relation \\"consulta\\" does not exist"}')

    with pytest.raises(ai_api.AiError) as erro:
        ai_api.executar("teste", explode)

    assert "consulta" not in erro.value.message
    assert "42P01" not in erro.value.message


def test_sqlstate_e_extraido_para_decisao_interna():
    assert ai_api.codigo_postgres(RuntimeError('{"code":"23P01"}')) == "23P01"
    assert ai_api.codigo_postgres(RuntimeError("timeout")) == ""


def test_rotas_do_painel_mantem_o_formato_de_erro_antigo(cliente_http):
    """O envelope novo vale só em /api/ai; o dashboard não pode ser quebrado."""
    resposta = cliente_http.post("/api/auth/login", json={"email": "nao-e-email"})

    assert resposta.status_code == 422
    assert "detail" in resposta.json()


# ===== Repetição idempotente vence qualquer outra validação (D1) =====
def test_retentativa_tardia_com_a_mesma_chave_ainda_e_repeticao(monkeypatch):
    """O horário já começou, mas o agendamento existe: repetir não é recusar.

    Ordem antiga: `exigir_inicio_valido` rodava antes da consulta pela chave e
    devolvia HORARIO_INDISPONIVEL. O fluxo então anunciava falha para uma
    operação que tinha dado certo.
    """
    passado = (dominio.agora() - timedelta(hours=2)).replace(second=0, microsecond=0)
    chave = ai_api.chave_do_tenant(EMPRESA_A, "acao-tardia-1")
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        consulta=[consulta_em(passado, chave_idempotencia=chave)],
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_procedimento": 10, "id_profissional": 100,
            "inicio": passado.isoformat(), "chave_idempotencia": "acao-tardia-1"})

    corpo = resposta.json()
    assert resposta.status_code == 200, resposta.text
    assert corpo["data"]["repetida"] is True
    assert corpo["data"]["agendamento"]["id"] == 555


def test_retentativa_com_profissional_ja_desativado_ainda_e_repeticao(monkeypatch):
    """Desativar o profissional depois não apaga o agendamento já gravado."""
    quando = amanha_as(10)
    chave = ai_api.chave_do_tenant(EMPRESA_A, "acao-inativo-1")
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        consulta=[consulta_em(quando, id_profissional=102, chave_idempotencia=chave,
                              profissional={"id": 102, "nome": "Caio"})],
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_procedimento": 10, "id_profissional": 102,
            "inicio": quando.isoformat(), "chave_idempotencia": "acao-inativo-1"})

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["data"]["repetida"] is True


def test_corrida_de_sobreposicao_com_a_chave_ja_gravada_vira_repeticao(monkeypatch):
    """23P01 pode ser a própria repetição, não um terceiro ocupando o horário.

    `consulta_sem_sobreposicao` tem OID menor que
    `ux_consulta_chave_idempotencia` e é avaliada primeiro: numa retentativa
    concorrente é ela quem dispara. Sem conferir a chave, a API devolveria
    CONFLITO_HORARIO para um agendamento que acabou de ser criado com sucesso.
    """
    quando = amanha_as(11)
    chave = ai_api.chave_do_tenant(EMPRESA_A, "acao-corrida-1")
    concorrente = consulta_em(quando, id=777, chave_idempotencia=chave)
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        slots=[slot_em(quando)],
        corridas={"consulta": [("23P01", concorrente)]},
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_procedimento": 10, "id_profissional": 100,
            "inicio": quando.isoformat(), "chave_idempotencia": "acao-corrida-1"})

    corpo = resposta.json()
    assert resposta.status_code == 200, resposta.text
    assert corpo["data"]["repetida"] is True
    assert corpo["data"]["agendamento"]["id"] == 777


def test_corrida_de_sobreposicao_sem_chave_gravada_continua_conflito(monkeypatch):
    """Quando não é repetição, 23P01 continua sendo CONFLITO_HORARIO."""
    quando = amanha_as(11)
    de_outro = consulta_em(quando, id=778, id_cliente=901, chave_idempotencia="emp1:outra")
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        slots=[slot_em(quando)],
        corridas={"consulta": [("23P01", de_outro)]},
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_procedimento": 10, "id_profissional": 100,
            "inicio": quando.isoformat(), "chave_idempotencia": "acao-corrida-2"})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "CONFLITO_HORARIO"


def test_corrida_de_chave_unica_na_criacao_vira_repeticao(monkeypatch):
    """23505 no índice da chave: a repetição concorrente já gravou."""
    quando = amanha_as(12)
    chave = ai_api.chave_do_tenant(EMPRESA_A, "acao-corrida-3")
    concorrente = consulta_em(quando, id=779, chave_idempotencia=chave)
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        slots=[slot_em(quando)],
        corridas={"consulta": [("23505", concorrente)]},
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_procedimento": 10, "id_profissional": 100,
            "inicio": quando.isoformat(), "chave_idempotencia": "acao-corrida-3"})

    corpo = resposta.json()
    assert resposta.status_code == 200, resposta.text
    assert corpo["data"]["repetida"] is True
    assert corpo["data"]["agendamento"]["id"] == 779


def test_chave_reaproveitada_com_outro_pedido_e_conflito(monkeypatch):
    """Idempotência só vale para o MESMO pedido."""
    quando = amanha_as(13)
    chave = ai_api.chave_do_tenant(EMPRESA_A, "acao-reuso-1")
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        consulta=[consulta_em(quando, id_profissional=101, chave_idempotencia=chave)],
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_procedimento": 10, "id_profissional": 100,
            "inicio": quando.isoformat(), "chave_idempotencia": "acao-reuso-1"})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "CHAVE_IDEMPOTENCIA_CONFLITANTE"


def test_chave_de_agendamento_cancelado_nao_volta_como_sucesso(monkeypatch):
    quando = amanha_as(13)
    chave = ai_api.chave_do_tenant(EMPRESA_A, "acao-morta-1")
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        consulta=[consulta_em(quando, status="cancelado", chave_idempotencia=chave)],
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_procedimento": 10, "id_profissional": 100,
            "inicio": quando.isoformat(), "chave_idempotencia": "acao-morta-1"})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "AGENDAMENTO_NAO_ESTA_ATIVO"


def test_corrida_na_criacao_de_cliente_rele_o_cadastro_existente(monkeypatch):
    """Duas mensagens do mesmo contato: 23505 não pode virar FALHA_TEMPORARIA."""
    ja_gravado = dict(CLIENTE_A, nome="Marina (concorrente)")
    banco = banco_com(cliente=[], corridas={"cliente": [("23505", ja_gravado)]})

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "nome": "Marina"})

    corpo = resposta.json()
    assert resposta.status_code == 200, resposta.text
    assert corpo["data"]["cliente"]["nome"] == "Marina (concorrente)"
    assert corpo["data"]["cliente"]["novo"] is True


# ===== Criação: caminho feliz =====
def test_criacao_congela_o_preco_e_rele_o_registro(monkeypatch):
    quando = amanha_as(14)
    banco = banco_com(cliente=[dict(CLIENTE_A)], slots=[slot_em(quando)])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_procedimento": 10, "id_profissional": 100,
            "inicio": quando.isoformat(), "chave_idempotencia": "acao-feliz-1"})

    corpo = resposta.json()
    assert resposta.status_code == 200, resposta.text
    assert corpo["data"]["repetida"] is False
    agendamento = corpo["data"]["agendamento"]
    assert agendamento["status"] == "pendente"
    assert agendamento["valor_cobrado"] == 180.0
    assert agendamento["procedimento"]["id"] == 10
    assert agendamento["profissional"]["id"] == 100

    gravada = banco.tabelas["consulta"][0]
    assert gravada["chave_idempotencia"] == ai_api.chave_do_tenant(EMPRESA_A, "acao-feliz-1")
    # Preço do dia do agendamento, gravado como texto exato.
    assert gravada["valor_cobrado"] == "180.00"


def test_criacao_sem_horario_livre_nao_grava(monkeypatch):
    quando = amanha_as(14)
    banco = banco_com(cliente=[dict(CLIENTE_A)], slots=[])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_procedimento": 10, "id_profissional": 100,
            "inicio": quando.isoformat(), "chave_idempotencia": "acao-sem-vaga-1"})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "HORARIO_INDISPONIVEL"
    assert banco.tabelas["consulta"] == []


# ===== Empresa e profissional =====
def test_instancia_ambigua_e_recusada(monkeypatch):
    """Duas empresas para a mesma instância: escolher uma seria escolher errado."""
    banco = banco_com(usuarios=[
        {"instance_name": "agm_1_studio", "id_info_clinica": EMPRESA_A},
        {"instance_name": "agm_1_studio", "id_info_clinica": EMPRESA_B},
    ])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "INSTANCIA_AMBIGUA"


def test_profissional_inativo_nao_recebe_disponibilidade(cliente_http):
    resposta = cliente_http.post("/api/ai/disponibilidade", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "id_procedimento": 10, "id_profissional": 102,
        "inicio": amanha_as(9).isoformat(), "fim": amanha_as(18).isoformat()})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "PROFISSIONAL_INVALIDO"


def test_profissional_inativo_nao_recebe_agendamento_novo(monkeypatch):
    quando = amanha_as(15)
    banco = banco_com(cliente=[dict(CLIENTE_A)], slots=[slot_em(quando, profissional=102)])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_procedimento": 10, "id_profissional": 102,
            "inicio": quando.isoformat(), "chave_idempotencia": "acao-inativo-2"})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "PROFISSIONAL_INVALIDO"
    assert banco.tabelas["consulta"] == []


# ===== Reagendamento =====
def test_reagendar_troca_o_profissional(monkeypatch):
    atual, novo = amanha_as(10), amanha_as(16)
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        consulta=[consulta_em(atual)],
        slots=[slot_em(novo, profissional=101)],
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos/reagendar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "id_consulta": 555,
            "novo_inicio": novo.isoformat(), "id_profissional": 101})

    corpo = resposta.json()
    assert resposta.status_code == 200, resposta.text
    assert corpo["data"]["repetida"] is False
    assert corpo["data"]["agendamento"]["profissional"]["id"] == 101
    # Remarcar muda horário e profissional; preço e cliente ficam.
    assert corpo["data"]["agendamento"]["valor_cobrado"] == 180.0
    assert banco.tabelas["consulta"][0]["id_cliente"] == CLIENTE_A["id"]


def test_reagendar_repetido_depois_do_horario_ainda_e_repeticao(monkeypatch):
    """Estado desejado já no banco: repetir não pode virar HORARIO_INDISPONIVEL."""
    passado = (dominio.agora() - timedelta(hours=3)).replace(second=0, microsecond=0)
    banco = banco_com(cliente=[dict(CLIENTE_A)], consulta=[consulta_em(passado)], slots=[])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos/reagendar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "id_consulta": 555,
            "novo_inicio": passado.isoformat()})

    corpo = resposta.json()
    assert resposta.status_code == 200, resposta.text
    assert corpo["data"]["repetida"] is True


def test_reagendar_recusa_chave_de_idempotencia_no_corpo(cliente_http):
    """A chave da criação não pode ser sobrescrita pela remarcação."""
    resposta = cliente_http.post("/api/ai/agendamentos/reagendar", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "telefone": TELEFONE, "id_consulta": 555,
        "novo_inicio": amanha_as(16).isoformat(), "chave_idempotencia": "acao-abc-123"})

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["error"]["code"] == "ENTRADA_INVALIDA"
    assert "chave_idempotencia" in corpo["error"]["message"]


def test_reagendar_para_horario_ocupado_e_recusado(monkeypatch):
    banco = banco_com(cliente=[dict(CLIENTE_A)], consulta=[consulta_em(amanha_as(10))], slots=[])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos/reagendar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "id_consulta": 555,
            "novo_inicio": amanha_as(16).isoformat()})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "HORARIO_INDISPONIVEL"


def test_reagendar_com_corrida_no_banco_vira_conflito(monkeypatch):
    novo = amanha_as(16)
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        consulta=[consulta_em(amanha_as(10))],
        slots=[slot_em(novo)],
        corridas={"consulta": [("23P01", None)]},
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos/reagendar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "id_consulta": 555,
            "novo_inicio": novo.isoformat()})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "CONFLITO_HORARIO"


def test_consulta_concluida_nao_e_reagendavel(monkeypatch):
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        consulta=[consulta_em(amanha_as(10), status="concluido")],
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos/reagendar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "id_consulta": 555,
            "novo_inicio": amanha_as(16).isoformat()})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "CONSULTA_NAO_REAGENDAVEL"


def test_reagendar_para_profissional_de_outra_empresa_e_recusado(monkeypatch):
    banco = banco_com(cliente=[dict(CLIENTE_A)], consulta=[consulta_em(amanha_as(10))])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos/reagendar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "id_consulta": 555,
            "novo_inicio": amanha_as(16).isoformat(), "id_profissional": 200})

    assert resposta.status_code == 404
    assert resposta.json()["error"]["code"] == "PROFISSIONAL_INVALIDO"


# ===== Cancelamento =====
def test_cancelamento_grava_o_motivo_do_enum_e_o_instante(monkeypatch):
    banco = banco_com(cliente=[dict(CLIENTE_A)], consulta=[consulta_em(amanha_as(10))])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos/cancelar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_consulta": 555, "motivo": "remarcacao"})

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["data"]["repetida"] is False
    gravada = banco.tabelas["consulta"][0]
    assert gravada["status"] == "cancelado"
    assert gravada["motivo_cancelamento"] == ai_api.MOTIVOS_CANCELAMENTO["remarcacao"]
    # Instante com fuso, não a data: `cancelado_em` é timestamptz desde A2.
    assert "T" in gravada["cancelado_em"] and gravada["cancelado_em"].endswith("-03:00")


def test_cancelamento_repetido_e_idempotente(monkeypatch):
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        consulta=[consulta_em(amanha_as(10), status="cancelado",
                              cancelado_em="2026-08-21T10:00:00-03:00")],
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos/cancelar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "id_consulta": 555})

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["data"]["repetida"] is True


def test_consulta_concluida_nao_e_cancelavel(monkeypatch):
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        consulta=[consulta_em(amanha_as(10), status="concluido")],
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos/cancelar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "id_consulta": 555})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "CONSULTA_NAO_CANCELAVEL"


# ===== Busca de agendamentos =====
def test_busca_recusa_filtro_do_postgrest_no_status(cliente_http):
    """`status=neq.cancelada` é filtro de URL, não valor do vocabulário."""
    resposta = cliente_http.post("/api/ai/agendamentos/buscar", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "telefone": TELEFONE, "status": ["neq.cancelada"]})

    assert resposta.status_code == 422
    assert resposta.json()["error"]["code"] == "ENTRADA_INVALIDA"


# ===== Cadastro do cliente =====
def test_data_de_nascimento_impossivel_e_entrada_invalida(monkeypatch):
    """`1994-13-45` casa com o padrão AAAA-MM-DD mas não é uma data.

    Como texto, chegava ao banco e voltava como FALHA_TEMPORARIA `retryable`:
    a automação repetiria para sempre um pedido que nunca vai funcionar.
    """
    banco = banco_com(cliente=[dict(CLIENTE_A)])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/cliente", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "data_nascimento": "1994-13-45"})

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["error"]["code"] == "ENTRADA_INVALIDA"
    assert "data_nascimento" in corpo["error"]["message"]


def test_data_de_nascimento_no_futuro_e_recusada(monkeypatch):
    """A data vem de uma conversa interpretada por um modelo.

    "faço aniversário em maio" já virou uma data do ano que vem. Gravada, ela
    some do radar: ninguém revisa aniversário de cliente.
    """
    banco = banco_com(cliente=[dict(CLIENTE_A)])
    futuro = (date.today() + timedelta(days=1)).isoformat()

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/cliente", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "data_nascimento": futuro})

    assert resposta.status_code == 422
    assert resposta.json()["error"]["code"] == "ENTRADA_INVALIDA"
    assert banco.tabelas["cliente"][0]["data_nascimento"] is None


def test_data_de_nascimento_antiga_demais_e_recusada(monkeypatch):
    banco = banco_com(cliente=[dict(CLIENTE_A)])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/cliente", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "data_nascimento": "1850-03-12"})

    assert resposta.status_code == 422
    assert resposta.json()["error"]["code"] == "ENTRADA_INVALIDA"
    assert banco.tabelas["cliente"][0]["data_nascimento"] is None


def test_data_de_nascimento_valida_e_gravada(monkeypatch):
    banco = banco_com(cliente=[dict(CLIENTE_A)])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/cliente", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "data_nascimento": "1994-03-12"})

    corpo = resposta.json()
    assert resposta.status_code == 200, resposta.text
    assert corpo["data"]["campos_atualizados"] == ["data_nascimento"]
    assert banco.tabelas["cliente"][0]["data_nascimento"] == "1994-03-12"


def test_email_invalido_e_recusado(monkeypatch):
    banco = banco_com(cliente=[dict(CLIENTE_A)])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/cliente", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "email": "nao-e-email"})

    assert resposta.status_code == 422
    assert resposta.json()["error"]["code"] == "ENTRADA_INVALIDA"


def test_atualizacao_sem_nenhum_campo_e_recusada(monkeypatch):
    """Pelo menos um dos quatro campos permitidos é obrigatório."""
    banco = banco_com(cliente=[dict(CLIENTE_A)])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/cliente", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE})

    assert resposta.status_code == 422
    assert resposta.json()["error"]["code"] == "ENTRADA_INVALIDA"


# ===== Contexto =====
def test_busca_filtra_por_empresa_e_por_cliente(monkeypatch):
    """A rota que abre todo cancelamento e reagendamento isola nas duas pontas.

    `decidir sobre consultas` tem 12 testes, todos do lado de quem LÊ o que esta
    rota devolveu. Nenhum provava que ela filtra — e é a única rota de
    `/api/ai/*` nessa situação. Um filtro a menos aqui mostra a agenda de outra
    pessoa, ou de outra empresa, dentro da tela de "qual desses você quer
    cancelar?".
    """
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        consulta=[
            {"id": 1, "id_info_clinica": EMPRESA_A, "id_cliente": CLIENTE_A["id"],
             "status": "agendado", "intervalo": "[2026-08-21 14:00,2026-08-21 15:00)"},
            # Mesma empresa, OUTRO cliente.
            {"id": 2, "id_info_clinica": EMPRESA_A, "id_cliente": CLIENTE_A["id"] + 1,
             "status": "agendado", "intervalo": "[2026-08-21 16:00,2026-08-21 17:00)"},
            # Mesmo cliente, OUTRA empresa.
            {"id": 3, "id_info_clinica": EMPRESA_A + 1, "id_cliente": CLIENTE_A["id"],
             "status": "agendado", "intervalo": "[2026-08-21 18:00,2026-08-21 19:00)"},
        ],
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos/buscar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE})

    corpo = resposta.json()
    assert corpo["ok"] is True
    ids = [a["id"] for a in corpo["data"]["agendamentos"]]
    assert ids == [1], f"a busca vazou agenda de outro cliente ou de outra empresa: {ids}"


LINHA_DE_LEMBRETE = {
    "id_consulta": 4242,
    "instance_name": "agm_1_studio",
    "telefone": TELEFONE,
    "cliente_nome": "Marina",
    "inicio": "2026-08-21T14:00:00-03:00",
    "servico_nome": "Limpeza de pele",
    "profissional_nome": "Ana",
    "mensagem_lembrete": "Oi! Confirma seu horario de amanha?",
}


def _handoff(monkeypatch, liberada_em, pausada_em):
    banco = banco_com(conversa=[{
        "id": 70, "id_info_clinica": EMPRESA_A, "instance_name": "agm_1_studio",
        "remote_jid": "5551999990000@s.whatsapp.net", "ia_liberada_em": liberada_em,
    }])
    with http_com(monkeypatch, banco) as http:
        return http.post("/api/ai/handoff/valido", headers=CABECALHO, json={
            "instance_name": "agm_1_studio",
            "remote_jid": "5551999990000@s.whatsapp.net",
            "pausada_em": pausada_em,
        }).json()["data"]


def test_devolucao_depois_da_pausa_devolve_a_conversa(monkeypatch):
    """O dono respondeu, depois clicou em devolver: a IA volta a responder."""
    dados = _handoff(monkeypatch,
                     liberada_em="2026-09-09T12:10:00+00:00",
                     pausada_em="2026-09-09T12:00:00+00:00")
    assert dados["pausado"] is False


def test_devolucao_antiga_nao_libera_pausa_nova(monkeypatch):
    """Devolveu de manha, respondeu de novo a tarde: continua com a pessoa.

    Sem a comparacao de instantes, um clique em "devolver" valeria para sempre
    e a IA passaria por cima do dono em toda pausa seguinte.
    """
    dados = _handoff(monkeypatch,
                     liberada_em="2026-09-09T09:00:00+00:00",
                     pausada_em="2026-09-09T12:00:00+00:00")
    assert dados["pausado"] is True


def test_conversa_nunca_devolvida_continua_pausada(monkeypatch):
    dados = _handoff(monkeypatch, liberada_em=None, pausada_em="2026-09-09T12:00:00+00:00")
    assert dados["pausado"] is True


def test_sem_inicio_da_pausa_o_seguro_e_continuar_calado(monkeypatch):
    """Nao da para saber se a devolucao veio antes ou depois.

    Continuar calado no maximo atrasa a IA ate a pausa expirar sozinha; o
    contrario faria a recepcao responder por cima de uma pessoa atendendo.
    """
    dados = _handoff(monkeypatch, liberada_em="2026-09-09T12:10:00+00:00", pausada_em=None)
    assert dados["pausado"] is True


def test_devolucao_de_outra_empresa_nao_libera_esta(monkeypatch):
    """O mesmo telefone em duas empresas tem duas conversas.

    Sem o filtro de empresa, o dono de um assinante clicando em "devolver"
    faria a IA do OUTRO assinante voltar a responder por cima de quem estava
    atendendo.
    """
    banco = banco_com(conversa=[{
        "id": 71, "id_info_clinica": EMPRESA_B, "instance_name": "agm_2_barbearia",
        "remote_jid": "5551999990000@s.whatsapp.net",
        "ia_liberada_em": "2026-09-09T12:10:00+00:00",
    }])

    with http_com(monkeypatch, banco) as http:
        dados = http.post("/api/ai/handoff/valido", headers=CABECALHO, json={
            "instance_name": "agm_1_studio",
            "remote_jid": "5551999990000@s.whatsapp.net",
            "pausada_em": "2026-09-09T12:00:00+00:00",
        }).json()["data"]

    assert dados["pausado"] is True, "a devolucao de outra empresa liberou esta conversa"


def test_lembretes_entrega_o_que_a_funcao_ja_marcou(monkeypatch):
    """A rota nao decide quem recebe: quem decide e marca e a funcao do banco.

    O corpo nao tem `instance_name` — quem chama e um relogio, e cada linha sai
    com a instancia da propria empresa.
    """
    banco = banco_com(rpcs={"fn_claim_lembretes": [dict(LINHA_DE_LEMBRETE)]})

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/lembretes/pendentes", headers=CABECALHO, json={})

    corpo = resposta.json()
    assert corpo["ok"] is True
    assert corpo["data"]["quantidade"] == 1
    lembrete = corpo["data"]["lembretes"][0]
    assert lembrete["id_consulta"] == 4242
    assert lembrete["instance_name"] == "agm_1_studio"
    assert lembrete["mensagem"] == "Oi! Confirma seu horario de amanha?"


def test_lembrete_sem_telefone_ou_instancia_nao_e_entregue(monkeypatch):
    """Sem telefone ou sem instancia nao ha para onde enviar.

    A consulta ja foi marcada pela funcao do banco e assim fica: reenviar em
    outra rodada seria pior que nao enviar, porque o motivo (cadastro sem
    telefone, empresa sem WhatsApp) nao se resolve sozinho entre uma passada e
    outra do relogio.
    """
    sem_telefone = dict(LINHA_DE_LEMBRETE, id_consulta=1, telefone=None)
    sem_instancia = dict(LINHA_DE_LEMBRETE, id_consulta=2, instance_name=None)
    banco = banco_com(rpcs={"fn_claim_lembretes": [sem_telefone, sem_instancia,
                                                   dict(LINHA_DE_LEMBRETE)]})

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/lembretes/pendentes", headers=CABECALHO, json={})

    entregues = [l["id_consulta"] for l in resposta.json()["data"]["lembretes"]]
    assert entregues == [4242], f"entregou lembrete sem para onde enviar: {entregues}"


def test_lembretes_exige_o_token_da_automacao(monkeypatch):
    """A rota atravessa empresas: sem o token ela nao pode nem ser alcancada."""
    banco = banco_com(rpcs={"fn_claim_lembretes": [dict(LINHA_DE_LEMBRETE)]})

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/lembretes/pendentes", json={})

    assert resposta.status_code in (401, 403), resposta.status_code


def test_confirmar_presenca_e_idempotente(monkeypatch):
    """Responder "confirmo" duas vezes ao lembrete nao pode dar erro."""
    consulta = consulta_em(amanha_as(14), status="agendado")
    banco = banco_com(cliente=[dict(CLIENTE_A)], consulta=[consulta])

    with http_com(monkeypatch, banco) as http:
        primeira = http.post("/api/ai/agendamentos/confirmar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_consulta": consulta["id"]})
        segunda = http.post("/api/ai/agendamentos/confirmar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_consulta": consulta["id"]})

    assert primeira.json()["data"]["repetida"] is False
    assert primeira.json()["data"]["agendamento"]["status"] == "confirmado"
    assert segunda.json()["data"]["repetida"] is True


def test_confirmar_nao_anuncia_sem_o_banco_ter_gravado(monkeypatch):
    """Requisicao aceita nao e prova de gravacao.

    Injeta a falha real: o banco aceita o UPDATE e a linha continua como estava.
    Sem a releitura, a recepcao diria "confirmado" para um horario que continua
    sem confirmacao — e o dono acharia que a pessoa vem.
    """
    consulta = consulta_em(amanha_as(14), status="agendado")
    banco = banco_com(cliente=[dict(CLIENTE_A)], consulta=[consulta])

    with http_com(monkeypatch, banco, erros_do_servidor=False) as http:
        # A releitura devolve a linha ANTES da escrita: e o que se ve quando o
        # UPDATE nao casou nenhuma linha.
        monkeypatch.setattr(ai_api, "reler_consulta",
                            lambda *_a, **_k: dict(consulta, status="agendado", confirmado_em=None))
        resposta = http.post("/api/ai/agendamentos/confirmar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_consulta": consulta["id"]})

    assert resposta.status_code == 503, resposta.status_code
    assert resposta.json()["error"]["code"] == "FALHA_TEMPORARIA"


def test_confirmar_recusa_consulta_cancelada(monkeypatch):
    """Dizer "confirmado" para quem nao tem mais horario e pior que recusar."""
    consulta = consulta_em(amanha_as(14), status="cancelado")
    banco = banco_com(cliente=[dict(CLIENTE_A)], consulta=[consulta])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos/confirmar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_consulta": consulta["id"]})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "CONSULTA_NAO_CONFIRMAVEL"


def test_confirmar_nao_atravessa_empresa(monkeypatch):
    """Consulta de outra empresa nao pode ser confirmada por esta instancia."""
    # `consulta_em` nao tem parametro `empresa`: a chave da linha e
    # `id_info_clinica`, e e ela que a rota filtra.
    consulta = consulta_em(amanha_as(14), status="agendado", id_info_clinica=EMPRESA_B)
    banco = banco_com(cliente=[dict(CLIENTE_A)], consulta=[consulta])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/agendamentos/confirmar", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE,
            "id_consulta": consulta["id"]})

    assert resposta.status_code >= 400, "confirmou consulta de outra empresa"


def test_contexto_entrega_o_profissional_de_sempre(monkeypatch):
    """Quem marca sempre com a mesma pessoa e reconhecido.

    A view ja aplicou os cortes (2 consultas, 60%, 12 meses, profissional
    ativo); a rota so precisa entregar. Sem isso a recepcao pergunta "com quem
    voce quer marcar?" para quem nunca marcou com outra pessoa.
    """
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        v_cliente_preferencias=[{
            "id_info_clinica": EMPRESA_A,
            "id_cliente": CLIENTE_A["id"],
            "profissional_habitual_id": 100,
            "profissional_habitual_nome": "Ana",
        }],
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE})

    habitual = resposta.json()["data"]["cliente"]["profissional_habitual"]
    assert habitual == {"id": 100, "nome": "Ana"}


def test_contexto_sem_habito_nao_inventa_profissional(monkeypatch):
    """Cliente que alterna nao tem "de sempre" — e perguntar e o certo.

    A view simplesmente nao devolve linha; a rota tem de mandar None, nao um
    palpite. Se mandasse o ultimo profissional, a recepcao empurraria alguem
    que a pessoa escolheu uma vez so.
    """
    banco = banco_com(cliente=[dict(CLIENTE_A)], v_cliente_preferencias=[])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE})

    assert resposta.json()["data"]["cliente"]["profissional_habitual"] is None


def test_habito_nao_atravessa_cliente(monkeypatch):
    """Dentro da MESMA empresa, o habito de um cliente nao vale para outro.

    Este caso existe porque o teste da empresa nao alcanca: com a view vazia,
    tirar o filtro de cliente continua devolvendo nada e a reversao passa
    despercebida. Com o habito de OUTRA pessoa na mesma empresa, a falta do
    filtro faz a recepcao oferecer a profissional de sempre de um terceiro —
    e junto com ela o nome de quem o cliente nunca escolheu.
    """
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        v_cliente_preferencias=[{
            "id_info_clinica": EMPRESA_A,
            "id_cliente": CLIENTE_A["id"] + 1,
            "profissional_habitual_id": 101,
            "profissional_habitual_nome": "Outra pessoa",
        }],
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE})

    habitual = resposta.json()["data"]["cliente"]["profissional_habitual"]
    assert habitual is None, f"vazou o habito de outro cliente: {habitual}"


def test_habito_nao_atravessa_empresa(monkeypatch):
    """O mesmo telefone em duas empresas nao carrega o profissional da outra.

    A view expoe todas as empresas: quem isola e o filtro da rota. Sem ele, a
    barbearia ofereceria o profissional do studio — nome de gente que o cliente
    nunca viu ali, e vazamento entre assinantes.
    """
    banco = banco_com(
        cliente=[dict(CLIENTE_A)],
        v_cliente_preferencias=[{
            "id_info_clinica": EMPRESA_B,
            "id_cliente": CLIENTE_A["id"],
            "profissional_habitual_id": 200,
            "profissional_habitual_nome": "Bruno",
        }],
    )

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE})

    habitual = resposta.json()["data"]["cliente"]["profissional_habitual"]
    assert habitual is None, f"vazou o profissional de outra empresa: {habitual}"


def test_contexto_entrega_o_texto_do_negocio(monkeypatch):
    """O que o assinante escreveu sobre o negócio é o que a IA tem para responder.

    A view excluía `descricao` de propósito enquanto ninguém a lia. Com o prompt
    lendo, ela é a única fonte para forma de pagamento, convênio, estacionamento
    e o que levar na primeira sessão — sem ela a recepção só sabe dizer que não
    sabe. Sai crua: quem delimita e higieniza é `montar contexto`.
    """
    banco = banco_com(cliente=[])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "nome": "Ana"})

    empresa = resposta.json()["data"]["empresa"]
    assert empresa["descricao"] == "Aceitamos pix e cartão. Estacionamento na porta."


def test_contexto_nao_sobrescreve_o_nome_de_quem_ja_e_cliente(monkeypatch):
    """`push_name` do WhatsApp não vale mais que o cadastro do painel."""
    banco = banco_com(cliente=[dict(CLIENTE_A)])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "nome": "Apelido do Zap"})

    corpo = resposta.json()
    assert corpo["data"]["cliente"]["nome"] == "Marina"
    assert corpo["data"]["cliente"]["novo"] is False
    assert banco.tabelas["cliente"][0]["nome"] == "Marina"


def test_contexto_remove_caracteres_de_controle_do_nome(monkeypatch):
    banco = banco_com(cliente=[])
    sujo = "  Ma ri\nna\tSouza  "

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "nome": sujo})

    nome = resposta.json()["data"]["cliente"]["nome"]
    assert nome == "Ma ri na Souza"
    assert not any(caractere < " " for caractere in nome)


def test_catalogo_marca_servico_sem_profissional_como_nao_agendavel(cliente_http):
    """`agendavel: false` é transferência para pessoa, não 'sem vaga hoje'."""
    resposta = cliente_http.post("/api/ai/contexto", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "telefone": TELEFONE})

    procedimentos = {p["id"]: p for p in resposta.json()["data"]["procedimentos"]}
    assert procedimentos[10]["agendavel"] is True
    assert procedimentos[11]["agendavel"] is False


def test_atendimento_desligado_recusa_antes_de_cadastrar_o_cliente(monkeypatch):
    """Trava por empresa: o `active` do n8n é um só para todos os clientes.

    A recusa vem ANTES de localizar ou criar o cliente — empresa desligada não
    cadastra ninguém — e o fluxo encerra sem responder ao contato.
    """
    desligada = dict(BANCO_PADRAO["v_clinica_detalhes"][0], automacao_ativa=False)
    banco = banco_com(cliente=[], v_clinica_detalhes=[desligada])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "nome": "Marina"})

    corpo = resposta.json()
    assert resposta.status_code == 409
    assert corpo["ok"] is False
    assert corpo["data"] is None
    assert corpo["error"]["code"] == "AUTOMACAO_DESATIVADA"
    # Não é retentativa: só o dono religa o atendimento.
    assert corpo["error"]["retryable"] is False
    assert banco.tabelas["cliente"] == []


def test_atendimento_ligado_segue_o_fluxo_normal(monkeypatch):
    banco = banco_com(cliente=[])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE, "nome": "Marina"})

    assert resposta.status_code == 200, resposta.text
    assert len(banco.tabelas["cliente"]) == 1


def test_contexto_nao_devolve_a_empresa_como_id(cliente_http):
    resposta = cliente_http.post("/api/ai/contexto", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "telefone": TELEFONE})

    empresa = resposta.json()["data"]["empresa"]
    assert "id" not in empresa and "id_info_clinica" not in empresa
    assert empresa["fuso"] == dominio.FUSO_NEGOCIO


# ===== Disponibilidade: limites =====
def test_disponibilidade_trunca_e_avisa(monkeypatch):
    quando = amanha_as(9)
    slots = [slot_em(quando + timedelta(hours=h)) for h in range(3)]
    banco = banco_com(slots=slots)

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/disponibilidade", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "id_procedimento": 10,
            "inicio": quando.isoformat(), "fim": amanha_as(18).isoformat(), "limite": 2})

    dados = resposta.json()["data"]
    assert len(dados["slots"]) == 2
    assert dados["total"] == 3
    assert dados["truncado"] is True


def test_disponibilidade_sem_truncamento_avisa_o_contrario(monkeypatch):
    quando = amanha_as(9)
    banco = banco_com(slots=[slot_em(quando)])

    with http_com(monkeypatch, banco) as http:
        resposta = http.post("/api/ai/disponibilidade", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "id_procedimento": 10,
            "inicio": quando.isoformat(), "fim": amanha_as(18).isoformat(), "limite": 5})

    dados = resposta.json()["data"]
    assert dados["truncado"] is False
    assert dados["total"] == 1
    assert dados["slots"][0]["id_profissional"] == 100


@pytest.mark.parametrize("campo,valor", [
    ("passo_minutos", 4), ("passo_minutos", 241),
    ("limite", 0), ("limite", 51),
])
def test_limites_de_passo_e_de_quantidade(cliente_http, campo, valor):
    resposta = cliente_http.post("/api/ai/disponibilidade", headers=CABECALHO, json={
        "instance_name": "agm_1_studio", "id_procedimento": 10,
        "inicio": amanha_as(9).isoformat(), "fim": amanha_as(18).isoformat(),
        campo: valor})

    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["error"]["code"] == "ENTRADA_INVALIDA"
    assert campo in corpo["error"]["message"]


# ===== Falha de infraestrutura ponta a ponta =====
class BancoIndisponivel:
    def table(self, _nome):
        raise RuntimeError("conexão recusada")

    def rpc(self, _nome, _parametros):
        raise RuntimeError("conexão recusada")


def test_banco_indisponivel_atravessa_a_rota_como_falha_temporaria(monkeypatch):
    with http_com(monkeypatch, BancoIndisponivel()) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE})

    corpo = resposta.json()
    assert resposta.status_code == 503
    assert corpo["ok"] is False
    assert corpo["data"] is None
    assert corpo["error"]["code"] == "FALHA_TEMPORARIA"
    # É o único código em que repetir faz sentido.
    assert corpo["error"]["retryable"] is True


def test_erro_inesperado_em_api_ai_vira_envelope_e_nao_texto_puro(monkeypatch):
    """Sem o tratador genérico, a automação recebia 500 sem `ok` nem `error`."""
    def explode(_nome):
        raise RuntimeError("falha nao prevista")

    monkeypatch.setattr(ai_api, "resolver_empresa", explode)

    with http_com(monkeypatch, banco_com(), erros_do_servidor=False) as http:
        resposta = http.post("/api/ai/contexto", headers=CABECALHO, json={
            "instance_name": "agm_1_studio", "telefone": TELEFONE})

    corpo = resposta.json()
    assert resposta.status_code == 503
    assert corpo["ok"] is False
    assert corpo["error"]["code"] == "FALHA_TEMPORARIA"
    assert corpo["error"]["retryable"] is True
    # A mensagem da exceção não atravessa: pode carregar o corpo enviado.
    assert "nao prevista" not in corpo["error"]["message"]


def test_erro_inesperado_fora_de_api_ai_mantem_o_500_do_framework():
    """O painel não pode passar a receber o envelope da automação."""
    tratador = server.app.exception_handlers[Exception]
    requisicao = Request({
        "type": "http", "method": "GET", "path": "/api/consultas",
        "headers": [], "query_string": b"", "scheme": "http",
        "server": ("localhost", 8000),
    })

    resposta = asyncio.run(tratador(requisicao, RuntimeError("falha nao prevista")))

    assert resposta.status_code == 500
    assert b"Internal Server Error" in resposta.body
