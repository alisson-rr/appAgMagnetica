"""Ciclo completo de `/api/ai/*` contra o banco real.

O que só este arquivo pega: a constraint de sobreposição recusando de verdade,
o CHECK de status recusando `cancelada`, `numeric(10,2)` recebendo texto sem
perder centavo, `timestamptz` guardando o offset, `fn_buscar_slots` respondendo
com a assinatura nova e o índice único de idempotência colidindo.

Roda somente quando o `.env` do monorepo tem as credenciais. Sem elas a suíte é
ignorada, para não travar CI.

Os dados criados aqui são de teste e são REMOVIDOS no fim do módulo, em ordem
inversa das chaves estrangeiras, mesmo quando um teste falha.
"""

import os
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import ai_api
import dominio
import server

RAIZ = Path(__file__).resolve().parents[3]

psycopg2 = pytest.importorskip("psycopg2", reason="driver de banco ausente")


def _do_env(nome):
    """Lê o `.env` do monorepo ANTES do ambiente do processo.

    `conftest.py` injeta valores de teste em `os.environ` para isolar a suíte
    do `.env` da máquina. Aqui a ordem é a inversa de propósito: este módulo
    existe justamente para falar com o projeto real.
    """
    arquivo = RAIZ / ".env"
    if arquivo.exists():
        for linha in arquivo.read_text(encoding="utf-8").splitlines():
            if linha.startswith(f"{nome}=") and linha.split("=", 1)[1].strip():
                return linha.split("=", 1)[1].strip()
    return os.getenv(nome)


DSN = _do_env("DATABASE_URL")
URL_SUPABASE = _do_env("SUPABASE_URL")
CHAVE_SUPABASE = _do_env("SUPABASE_SERVICE_ROLE_KEY")


def _motivo_para_ignorar():
    """Por que a suíte não roda. Vazio significa que ela roda.

    Este módulo ESCREVE no banco do `.env` em autocommit: empresa, usuário,
    cliente e consulta de teste passam por commit real antes de a limpeza
    acontecer. Só a existência da credencial não é autorização — quem clona o
    repositório com um `.env` de produção não pode ver a suíte escrever
    sozinha. `PERMITIR_TESTES_DE_BANCO` é lido do ambiente do processo, nunca
    do `.env`: é um gesto explícito de quem roda, não configuração de projeto.
    """
    if os.getenv("PERMITIR_TESTES_DE_BANCO") != "1":
        return (
            "escreve no banco do .env; exporte PERMITIR_TESTES_DE_BANCO=1 para autorizar "
            "(ver services/api/.env.example)"
        )
    if not (DSN and URL_SUPABASE and CHAVE_SUPABASE):
        return "credenciais do projeto não configuradas (DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)"
    return ""


MOTIVO_IGNORAR = _motivo_para_ignorar()
pytestmark = pytest.mark.skipif(bool(MOTIVO_IGNORAR), reason=MOTIVO_IGNORAR)

TOKEN = "token-de-teste-com-tamanho-suficiente-1234"
CABECALHO = {ai_api.CABECALHO_TOKEN: TOKEN}

MARCA = f"pytest-{uuid.uuid4().hex[:8]}"
TELEFONE = "5551988887777"
TELEFONE_FORMATADO = "(51) 98888-7777"


class Cenario:
    """Duas empresas, com o MESMO telefone de cliente, para exercitar isolamento."""

    def __init__(self):
        self.a = {}
        self.b = {}


def _executar(cur, sql, parametros=()):
    cur.execute(sql, parametros)
    linha = cur.fetchone()
    return linha[0] if linha else None


def _montar_empresa(cur, rotulo, dia_semana, duracao, valor):
    empresa = {}
    empresa["clinica"] = _executar(
        cur,
        # `automacao_ativa` ligado: o cenário representa empresa em operação.
        # Desligada, /api/ai/contexto recusaria tudo com AUTOMACAO_DESATIVADA.
        "insert into info_clinica (nome, telefone, endereco, exige_profissional, automacao_ativa) "
        "values (%s, %s, %s, false, true) returning id",
        (f"{MARCA} {rotulo}", "(51) 3333-0000", "Rua de Teste, 100"),
    )
    empresa["instance"] = f"{MARCA}-{rotulo}"
    empresa["usuario"] = _executar(
        cur,
        "insert into usuarios (email, senha_hash, nome, id_info_clinica, instance_name) "
        "values (%s, %s, %s, %s, %s) returning id",
        (
            f"{MARCA}.{rotulo}@teste.invalid",
            "hash-de-teste-nao-e-senha",
            f"{MARCA} {rotulo}",
            empresa["clinica"],
            empresa["instance"],
        ),
    )
    empresa["procedimento"] = _executar(
        cur,
        "insert into procedimento (nome, duracao_minutos, valor, id_info_clinica) "
        "values (%s, %s, %s, %s) returning id",
        (f"Serviço {rotulo}", duracao, valor, empresa["clinica"]),
    )
    empresa["profissional"] = _executar(
        cur,
        "insert into profissional (nome, ativo, id_info_clinica) values (%s, true, %s) returning id",
        (f"Profissional {rotulo}", empresa["clinica"]),
    )
    cur.execute(
        "insert into profissional_procedimento (id_profissional, id_procedimento) values (%s, %s)",
        (empresa["profissional"], empresa["procedimento"]),
    )
    cur.execute(
        "insert into horario_clinica (dia_semana, hora_inicio, hora_fim, id_info_clinica) "
        "values (%s, '08:00', '20:00', %s)",
        (dia_semana, empresa["clinica"]),
    )
    cur.execute(
        "insert into disponibilidade_profissional (dia_semana, hora_inicio, hora_fim, id_profissional) "
        "values (%s, '08:00', '20:00', %s)",
        (dia_semana, empresa["profissional"]),
    )
    return empresa


@pytest.fixture(scope="module")
def conexao():
    conn = psycopg2.connect(DSN, connect_timeout=20)
    conn.autocommit = True
    yield conn
    conn.close()


@pytest.fixture(scope="module")
def dia_alvo():
    """Data futura fixa dentro do expediente montado pelo cenário."""
    return (dominio.agora() + timedelta(days=7)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )


@pytest.fixture(scope="module")
def cenario(conexao, dia_alvo):
    dados = Cenario()
    dia_semana = dia_alvo.isoweekday()
    try:
        with conexao.cursor() as cur:
            dados.a = _montar_empresa(cur, "empresaA", dia_semana, 60, Decimal("180.00"))
            dados.b = _montar_empresa(cur, "empresaB", dia_semana, 30, Decimal("50.00"))
        yield dados
    finally:
        with conexao.cursor() as cur:
            clinicas = [e.get("clinica") for e in (dados.a, dados.b) if e.get("clinica")]
            if clinicas:
                # Ordem inversa das FKs; as tabelas de ligação caem por CASCADE.
                cur.execute("delete from consulta where id_info_clinica = any(%s)", (clinicas,))
                cur.execute("delete from cliente where id_info_clinica = any(%s)", (clinicas,))
                cur.execute(
                    "delete from horario_clinica where id_info_clinica = any(%s)", (clinicas,)
                )
                cur.execute("delete from profissional where id_info_clinica = any(%s)", (clinicas,))
                cur.execute("delete from procedimento where id_info_clinica = any(%s)", (clinicas,))
                cur.execute("delete from usuarios where id_info_clinica = any(%s)", (clinicas,))
                cur.execute("delete from info_clinica where id = any(%s)", (clinicas,))


@pytest.fixture(scope="module")
def http(cenario):
    """TestClient falando com o Supabase real, só neste módulo."""
    from supabase import create_client

    real = create_client(URL_SUPABASE, CHAVE_SUPABASE)
    anterior_ai, anterior_server = ai_api.supabase, server.supabase
    ai_api.supabase = real
    server.supabase = real
    try:
        with TestClient(server.app) as cliente:
            yield cliente
    finally:
        ai_api.supabase = anterior_ai
        server.supabase = anterior_server


def as_horas(dia, hora, minuto=0):
    return dia.replace(hour=hora, minute=minuto)


def chamar(http, rota, corpo, cabecalho=CABECALHO):
    return http.post(f"/api/ai/{rota}", headers=cabecalho, json=corpo)


def linha_da_consulta(conexao, consulta_id):
    with conexao.cursor() as cur:
        cur.execute(
            "select status, valor_cobrado, confirmado_em, cancelado_em, intervalo, "
            "chave_idempotencia, id_info_clinica from consulta where id = %s",
            (consulta_id,),
        )
        return cur.fetchone()


# ===== Contexto e isolamento =====
def test_contexto_resolve_empresa_pela_instancia_e_cria_o_cliente(http, cenario):
    resposta = chamar(http, "contexto", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE, "nome": "Marina Teste"})

    assert resposta.status_code == 200, resposta.text
    dados = resposta.json()["data"]
    assert dados["empresa"]["nome"].endswith("empresaA")
    assert dados["cliente"]["novo"] is True
    assert dados["cliente"]["nome"] == "Marina Teste"
    # A empresa nunca volta como id: nenhuma rota a aceita por parâmetro.
    assert "id" not in dados["empresa"]
    assert [p["id"] for p in dados["procedimentos"]] == [cenario.a["procedimento"]]


def test_contexto_repetido_nao_duplica_o_cadastro(http, cenario, conexao):
    chamar(http, "contexto", {"instance_name": cenario.a["instance"], "telefone": TELEFONE})
    # A mesma pessoa, agora com o número formatado como o painel gravaria.
    resposta = chamar(http, "contexto", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE_FORMATADO})

    assert resposta.json()["data"]["cliente"]["novo"] is False
    with conexao.cursor() as cur:
        cur.execute(
            "select count(*) from cliente where id_info_clinica = %s", (cenario.a["clinica"],)
        )
        assert cur.fetchone()[0] == 1


def test_mesmo_telefone_em_duas_empresas_gera_cadastros_separados(http, cenario, conexao):
    resposta = chamar(http, "contexto", {
        "instance_name": cenario.b["instance"], "telefone": TELEFONE, "nome": "Marina na B"})

    assert resposta.json()["data"]["cliente"]["novo"] is True
    with conexao.cursor() as cur:
        cur.execute(
            "select id_info_clinica, count(*) from cliente "
            "where id_info_clinica in (%s, %s) group by 1",
            (cenario.a["clinica"], cenario.b["clinica"]),
        )
        assert sorted(cur.fetchall()) == sorted(
            [(cenario.a["clinica"], 1), (cenario.b["clinica"], 1)]
        )


def test_atendimento_desligado_recusa_e_nao_cadastra_ninguem(http, cenario, conexao):
    """A trava por empresa precisa valer com a view real, não só no fake.

    Prova junto que `v_clinica_detalhes` está expondo `automacao_ativa`: sem a
    coluna, o contexto trataria toda empresa como desligada.
    """
    outro_telefone = "5551977776666"
    with conexao.cursor() as cur:
        cur.execute(
            "update info_clinica set automacao_ativa = false where id = %s",
            (cenario.a["clinica"],),
        )
    try:
        resposta = chamar(http, "contexto", {
            "instance_name": cenario.a["instance"], "telefone": outro_telefone})

        assert resposta.status_code == 409, resposta.text
        assert resposta.json()["error"]["code"] == "AUTOMACAO_DESATIVADA"
        assert resposta.json()["error"]["retryable"] is False
        with conexao.cursor() as cur:
            cur.execute(
                "select count(*) from cliente where id_info_clinica = %s and whats = %s",
                (cenario.a["clinica"], outro_telefone),
            )
            assert cur.fetchone()[0] == 0
    finally:
        with conexao.cursor() as cur:
            cur.execute(
                "update info_clinica set automacao_ativa = true where id = %s",
                (cenario.a["clinica"],),
            )


def test_procedimento_de_outra_empresa_nao_atravessa(http, cenario, dia_alvo):
    resposta = chamar(http, "disponibilidade", {
        "instance_name": cenario.a["instance"],
        "id_procedimento": cenario.b["procedimento"],
        "inicio": as_horas(dia_alvo, 8).isoformat(),
        "fim": as_horas(dia_alvo, 20).isoformat()})

    assert resposta.status_code == 404
    assert resposta.json()["error"]["code"] == "PROCEDIMENTO_INVALIDO"


def test_profissional_de_outra_empresa_nao_atravessa(http, cenario, dia_alvo):
    resposta = chamar(http, "disponibilidade", {
        "instance_name": cenario.a["instance"],
        "id_procedimento": cenario.a["procedimento"],
        "id_profissional": cenario.b["profissional"],
        "inicio": as_horas(dia_alvo, 8).isoformat(),
        "fim": as_horas(dia_alvo, 20).isoformat()})

    assert resposta.json()["error"]["code"] == "PROFISSIONAL_INVALIDO"


# ===== Disponibilidade =====
def test_disponibilidade_usa_o_contrato_novo_da_rpc(http, cenario, dia_alvo):
    resposta = chamar(http, "disponibilidade", {
        "instance_name": cenario.a["instance"],
        "id_procedimento": cenario.a["procedimento"],
        "inicio": as_horas(dia_alvo, 8).isoformat(),
        "fim": as_horas(dia_alvo, 20).isoformat(),
        "limite": 50})

    assert resposta.status_code == 200, resposta.text
    dados = resposta.json()["data"]
    assert dados["total"] > 0
    # Toda linha traz profissional; slot sem profissional não é slot.
    assert all(slot["id_profissional"] == cenario.a["profissional"] for slot in dados["slots"])
    assert dados["procedimento"]["valor"] == 180.0


# ===== Criação =====
def test_criar_agendamento_congela_o_preco_e_o_fuso(http, cenario, conexao, dia_alvo):
    inicio = as_horas(dia_alvo, 10)
    resposta = chamar(http, "agendamentos", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_procedimento": cenario.a["procedimento"],
        "id_profissional": cenario.a["profissional"],
        "inicio": inicio.isoformat(), "chave_idempotencia": f"{MARCA}-criar-1"})

    assert resposta.status_code == 200, resposta.text
    agendamento = resposta.json()["data"]["agendamento"]
    assert agendamento["id"]
    assert agendamento["valor_cobrado"] == 180.0
    assert agendamento["status"] in ai_api.STATUS_VIVOS

    status, valor, _conf, _canc, intervalo, chave, clinica = linha_da_consulta(
        conexao, agendamento["id"])
    assert valor == Decimal("180.00")
    assert clinica == cenario.a["clinica"]
    assert chave.startswith(f"emp{cenario.a['clinica']}:")
    # O horário gravado é o mesmo instante enviado, sem deslocamento de fuso.
    assert dominio.ler_intervalo(str(intervalo))[0] == inicio


def test_repeticao_com_a_mesma_chave_devolve_o_mesmo_agendamento(http, cenario, conexao, dia_alvo):
    corpo = {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_procedimento": cenario.a["procedimento"],
        "id_profissional": cenario.a["profissional"],
        "inicio": as_horas(dia_alvo, 10).isoformat(),
        "chave_idempotencia": f"{MARCA}-criar-1"}

    resposta = chamar(http, "agendamentos", corpo)

    assert resposta.status_code == 200, resposta.text
    corpo_resposta = resposta.json()["data"]
    assert corpo_resposta["repetida"] is True
    with conexao.cursor() as cur:
        cur.execute(
            "select count(*) from consulta where chave_idempotencia = %s",
            (f"emp{cenario.a['clinica']}:{MARCA}-criar-1",),
        )
        assert cur.fetchone()[0] == 1


def test_mesma_chave_com_pedido_diferente_e_conflito(http, cenario, dia_alvo):
    resposta = chamar(http, "agendamentos", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_procedimento": cenario.a["procedimento"],
        "id_profissional": cenario.a["profissional"],
        "inicio": as_horas(dia_alvo, 15).isoformat(),
        "chave_idempotencia": f"{MARCA}-criar-1"})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "CHAVE_IDEMPOTENCIA_CONFLITANTE"


def test_horario_ja_ocupado_e_recusado_na_revalidacao(http, cenario, dia_alvo):
    resposta = chamar(http, "agendamentos", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_procedimento": cenario.a["procedimento"],
        "id_profissional": cenario.a["profissional"],
        "inicio": as_horas(dia_alvo, 10).isoformat(),
        "chave_idempotencia": f"{MARCA}-outra-chave"})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "HORARIO_INDISPONIVEL"


def test_corrida_no_mesmo_horario_e_barrada_pelo_banco(http, cenario, dia_alvo, monkeypatch):
    """Simula a janela entre revalidar e gravar: quem decide é a constraint."""
    monkeypatch.setattr(ai_api, "horario_esta_livre", lambda *_a, **_k: True)

    resposta = chamar(http, "agendamentos", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_procedimento": cenario.a["procedimento"],
        "id_profissional": cenario.a["profissional"],
        "inicio": as_horas(dia_alvo, 10, 30).isoformat(),
        "chave_idempotencia": f"{MARCA}-corrida"})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "CONFLITO_HORARIO"


def test_horario_sem_offset_e_gravado_como_sao_paulo(http, cenario, conexao, dia_alvo):
    ingenuo = as_horas(dia_alvo, 14).replace(tzinfo=None)

    resposta = chamar(http, "agendamentos", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_procedimento": cenario.a["procedimento"],
        "id_profissional": cenario.a["profissional"],
        "inicio": ingenuo.isoformat(), "chave_idempotencia": f"{MARCA}-sem-offset"})

    assert resposta.status_code == 200, resposta.text
    consulta_id = resposta.json()["data"]["agendamento"]["id"]
    intervalo = linha_da_consulta(conexao, consulta_id)[4]
    gravado = dominio.ler_intervalo(str(intervalo))[0].astimezone(dominio.SAO_PAULO_TZ)

    assert (gravado.hour, gravado.minute) == (14, 0)


def test_mudar_o_preco_do_servico_nao_reescreve_o_historico(http, cenario, conexao, dia_alvo):
    consulta_id = chamar(http, "agendamentos", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_procedimento": cenario.a["procedimento"],
        "id_profissional": cenario.a["profissional"],
        "inicio": as_horas(dia_alvo, 16).isoformat(),
        "chave_idempotencia": f"{MARCA}-historico"}).json()["data"]["agendamento"]["id"]

    with conexao.cursor() as cur:
        cur.execute(
            "update procedimento set valor = %s where id = %s",
            (Decimal("999.00"), cenario.a["procedimento"]),
        )

    assert linha_da_consulta(conexao, consulta_id)[1] == Decimal("180.00")

    with conexao.cursor() as cur:
        cur.execute(
            "update procedimento set valor = %s where id = %s",
            (Decimal("180.00"), cenario.a["procedimento"]),
        )


# ===== Busca =====
def test_busca_traz_so_os_agendamentos_do_telefone_na_empresa(http, cenario):
    resposta = chamar(http, "agendamentos/buscar", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE, "limite": 50})

    assert resposta.status_code == 200, resposta.text
    dados = resposta.json()["data"]
    assert dados["total"] >= 3
    assert dados["status_consultados"] == list(ai_api.STATUS_VIVOS)

    # A mesma pessoa na empresa B não tem nenhum agendamento.
    na_outra = chamar(http, "agendamentos/buscar", {
        "instance_name": cenario.b["instance"], "telefone": TELEFONE})
    assert na_outra.json()["data"]["total"] == 0


def test_filtro_de_status_e_restrito_a_lista_do_servidor(http, cenario):
    resposta = chamar(http, "agendamentos/buscar", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "status": ["status=neq.cancelada"]})

    assert resposta.status_code == 422
    assert resposta.json()["error"]["code"] == "ENTRADA_INVALIDA"


# ===== Reagendamento =====
def test_reagendar_preserva_preco_e_vinculo(http, cenario, conexao, dia_alvo):
    criado = chamar(http, "agendamentos", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_procedimento": cenario.a["procedimento"],
        "id_profissional": cenario.a["profissional"],
        "inicio": as_horas(dia_alvo, 8).isoformat(),
        "chave_idempotencia": f"{MARCA}-reagendar"}).json()["data"]["agendamento"]

    novo = as_horas(dia_alvo, 8, 30)
    resposta = chamar(http, "agendamentos/reagendar", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_consulta": criado["id"], "novo_inicio": novo.isoformat()})

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["data"]["repetida"] is False
    # 08:30 encosta em 08:00-09:00: é justamente o caso que exige ignorar a
    # própria consulta na revalidação.
    assert dominio.ler_intervalo(str(linha_da_consulta(conexao, criado["id"])[4]))[0] == novo
    assert linha_da_consulta(conexao, criado["id"])[1] == Decimal("180.00")


def test_reagendar_de_novo_para_o_mesmo_horario_e_idempotente(http, cenario, dia_alvo):
    lista = chamar(http, "agendamentos/buscar", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE, "limite": 50})
    esperado = as_horas(dia_alvo, 8, 30)
    alvo = [a for a in lista.json()["data"]["agendamentos"]
            if datetime.fromisoformat(a["inicio"]) == esperado]
    assert alvo, "o agendamento reagendado deveria estar na lista"

    resposta = chamar(http, "agendamentos/reagendar", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_consulta": alvo[0]["id"],
        "novo_inicio": as_horas(dia_alvo, 8, 30).isoformat()})

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["data"]["repetida"] is True


def test_reagendar_consulta_de_outra_empresa_nao_encontra(http, cenario, dia_alvo, conexao):
    with conexao.cursor() as cur:
        cur.execute("select id from consulta where id_info_clinica = %s limit 1",
                    (cenario.a["clinica"],))
        consulta_a = cur.fetchone()[0]

    resposta = chamar(http, "agendamentos/reagendar", {
        "instance_name": cenario.b["instance"], "telefone": TELEFONE,
        "id_consulta": consulta_a, "novo_inicio": as_horas(dia_alvo, 11).isoformat()})

    assert resposta.status_code == 404
    assert resposta.json()["error"]["code"] == "CONSULTA_NAO_ENCONTRADA"


# ===== Cancelamento =====
def test_cancelar_usa_o_status_aceito_pelo_banco_e_marca_o_instante(http, cenario, conexao, dia_alvo):
    criado = chamar(http, "agendamentos", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_procedimento": cenario.a["procedimento"],
        "id_profissional": cenario.a["profissional"],
        "inicio": as_horas(dia_alvo, 18).isoformat(),
        "chave_idempotencia": f"{MARCA}-cancelar"}).json()["data"]["agendamento"]

    resposta = chamar(http, "agendamentos/cancelar", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_consulta": criado["id"], "motivo": "cliente_solicitou"})

    assert resposta.status_code == 200, resposta.text
    status, _valor, _conf, cancelado_em, _intervalo, _chave, _clinica = linha_da_consulta(
        conexao, criado["id"])
    assert status == "cancelado"
    assert isinstance(cancelado_em, datetime)
    # `timestamptz`, não `date`: a hora do cancelamento é preservada.
    assert cancelado_em.tzinfo is not None


def test_cancelar_de_novo_e_idempotente(http, cenario, conexao, dia_alvo):
    with conexao.cursor() as cur:
        cur.execute(
            "select id from consulta where id_info_clinica = %s and status = 'cancelado' limit 1",
            (cenario.a["clinica"],),
        )
        cancelada = cur.fetchone()[0]

    resposta = chamar(http, "agendamentos/cancelar", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE, "id_consulta": cancelada})

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["data"]["repetida"] is True
    assert resposta.json()["data"]["agendamento"]["status"] == "cancelado"


def test_banco_recusa_o_status_no_feminino(conexao, cenario):
    """A automação v2 grava `cancelada`; o CHECK do banco não aceita."""
    with conexao.cursor() as cur:
        cur.execute("select id from consulta where id_info_clinica = %s limit 1",
                    (cenario.a["clinica"],))
        consulta_id = cur.fetchone()[0]

        with pytest.raises(psycopg2.errors.CheckViolation):
            cur.execute("update consulta set status = 'cancelada' where id = %s", (consulta_id,))


# ===== Cadastro do cliente =====
def test_atualizar_cliente_grava_so_o_permitido(http, cenario, conexao):
    resposta = chamar(http, "cliente", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "nome": "Marina Souza", "email": "marina.teste@example.com", "interesses": "estética"})

    assert resposta.status_code == 200, resposta.text
    assert resposta.json()["data"]["campos_atualizados"] == ["email", "interesses", "nome"]

    with conexao.cursor() as cur:
        cur.execute(
            "select nome, email, whats, status from cliente where id_info_clinica = %s",
            (cenario.a["clinica"],),
        )
        nome, email, whats, status = cur.fetchone()

    assert (nome, email) == ("Marina Souza", "marina.teste@example.com")
    # Identidade e situação do cadastro ficam fora do alcance da automação.
    assert whats == TELEFONE
    assert status == "ativo"


def test_atualizar_cliente_de_outra_empresa_nao_atravessa(http, cenario, conexao):
    chamar(http, "cliente", {
        "instance_name": cenario.b["instance"], "telefone": TELEFONE, "nome": "Só na B"})

    with conexao.cursor() as cur:
        cur.execute(
            "select nome from cliente where id_info_clinica = %s", (cenario.a["clinica"],)
        )
        assert cur.fetchone()[0] == "Marina Souza"


def test_repetir_a_chave_de_um_agendamento_cancelado_nao_e_sucesso(http, cenario, conexao, dia_alvo):
    """Repetição não pode anunciar como ativo um agendamento já cancelado."""
    with conexao.cursor() as cur:
        cur.execute(
            "select chave_idempotencia, intervalo from consulta "
            "where id_info_clinica = %s and status = 'cancelado' "
            "and chave_idempotencia is not null limit 1",
            (cenario.a["clinica"],),
        )
        chave, intervalo = cur.fetchone()

    original = chave.split(":", 1)[1]
    inicio = dominio.ler_intervalo(str(intervalo))[0]

    resposta = chamar(http, "agendamentos", {
        "instance_name": cenario.a["instance"], "telefone": TELEFONE,
        "id_procedimento": cenario.a["procedimento"],
        "id_profissional": cenario.a["profissional"],
        "inicio": inicio.isoformat(), "chave_idempotencia": original})

    assert resposta.status_code == 409
    assert resposta.json()["error"]["code"] == "AGENDAMENTO_NAO_ESTA_ATIVO"
