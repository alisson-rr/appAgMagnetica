"""Detecta divergência entre o schema do banco e o que o backend espera.

Roda somente quando há `DATABASE_URL` no `.env` do monorepo e `psycopg2`
instalado; fora disso a suíte é ignorada, para não travar CI sem credencial.

O que ele pega, que nenhum outro teste pega:
  - campo de modelo Pydantic sem coluna correspondente (INSERT quebraria);
  - chave estrangeira ausente que o PostgREST usa em join embutido
    (`select('*, cliente(*)')` para de funcionar sem ela);
  - status que a API escreve e o CHECK do banco recusaria;
  - `fn_buscar_slots` ou `v_clinica_detalhes` sem os campos do contrato.
"""

import os
from pathlib import Path

import pytest

import server

RAIZ = Path(__file__).resolve().parents[3]

psycopg2 = pytest.importorskip("psycopg2", reason="driver de banco ausente")


def _dsn():
    valor = os.getenv("DATABASE_URL")
    if valor:
        return valor
    env = RAIZ / ".env"
    if not env.exists():
        return None
    for linha in env.read_text(encoding="utf-8").splitlines():
        if linha.startswith("DATABASE_URL=") and linha.split("=", 1)[1].strip():
            return linha.split("=", 1)[1].strip()
    return None


DSN = _dsn()
pytestmark = pytest.mark.skipif(not DSN, reason="DATABASE_URL não configurada")


@pytest.fixture(scope="module")
def cur():
    conexao = psycopg2.connect(DSN, connect_timeout=15)
    conexao.autocommit = False
    with conexao.cursor() as c:
        c.execute("SET TRANSACTION READ ONLY")
        yield c
    conexao.rollback()
    conexao.close()


def colunas(cur, tabela):
    cur.execute(
        "select column_name from information_schema.columns "
        "where table_schema = 'public' and table_name = %s",
        (tabela,),
    )
    return {linha[0] for linha in cur.fetchall()}


# modelo -> (tabela, campos que o backend transforma antes de gravar)
MODELOS = [
    ("ClienteCreate", "cliente", set()),
    ("ClienteUpdate", "cliente", set()),
    ("ProfissionalCreate", "profissional", set()),
    ("ProfissionalUpdate", "profissional", set()),
    ("ProcedimentoCreate", "procedimento", set()),
    ("ProcedimentoUpdate", "procedimento", set()),
    # data_inicio + duracao_minutos viram `intervalo` e são removidos do payload
    # (server.py:766-767). O mesmo vale para o par do bloqueio.
    ("ConsultaCreate", "consulta", {"data_inicio", "duracao_minutos"}),
    ("ConsultaUpdate", "consulta", {"data_inicio", "duracao_minutos"}),
    ("BloqueioCreate", "agenda_bloqueio", {"data_inicio", "data_fim"}),
    ("HorarioClinicaCreate", "horario_clinica", set()),
    ("DisponibilidadeItem", "disponibilidade_profissional", set()),
    ("AreaAtuacaoCreate", "area_atuacao", set()),
    ("InfoClinicaCreate", "info_clinica", set()),
    ("InfoClinicaUpdate", "info_clinica", set()),
    # `senha` é trocada por `senha_hash` antes do insert (server.py:302).
    ("UsuarioCreate", "usuarios", {"senha"}),
]


@pytest.mark.parametrize("modelo,tabela,transformados", MODELOS)
def test_campos_do_modelo_existem_na_tabela(cur, modelo, tabela, transformados):
    campos = set(getattr(server, modelo).model_fields) - transformados
    faltando = campos - colunas(cur, tabela)

    assert not faltando, f"{modelo} envia campos que {tabela} não tem: {sorted(faltando)}"


# Joins embutidos do PostgREST usados pelo backend. Sem a FK o join não existe.
JOINS = [
    ("consulta", "cliente", "select('*, cliente(*)')"),
    ("consulta", "profissional", "select('*, profissional(*)')"),
    ("consulta", "procedimento", "select('*, procedimento(*)')"),
    ("profissional", "area_atuacao", "select('*, area_atuacao(*)')"),
    ("agenda_bloqueio", "profissional", "select('*, profissional(*)')"),
]


@pytest.mark.parametrize("origem,destino,uso", JOINS)
def test_chave_estrangeira_do_join_existe(cur, origem, destino, uso):
    cur.execute(
        """
        select 1 from pg_constraint
        where contype = 'f'
          and conrelid = %s::regclass
          and confrelid = %s::regclass
        """,
        (f"public.{origem}", f"public.{destino}"),
    )

    assert cur.fetchone(), f"falta FK {origem} -> {destino}; {uso} deixa de funcionar"


def test_status_escritos_pela_api_passam_no_check(cur):
    """Os literais que a API e o dashboard gravam têm de caber no CHECK."""
    escritos = ["pendente", "agendado", "confirmado", "cancelado", "concluido"]
    cur.execute(
        "select pg_get_constraintdef(oid) from pg_constraint "
        "where conname = 'consulta_status_valido'"
    )
    linha = cur.fetchone()

    assert linha, "consulta_status_valido não existe: rodar travas_corte_vertical.sql"
    for status in escritos:
        assert f"'{status}'" in linha[0], f"CHECK recusaria o status {status!r}"


def test_status_assinatura_aceita_o_que_o_produto_usa(cur):
    cur.execute(
        "select pg_get_constraintdef(oid) from pg_constraint "
        "where conname = 'usuarios_status_assinatura_valido'"
    )
    linha = cur.fetchone()

    assert linha, "falta o CHECK de usuarios.status_assinatura"
    # 'trial' e 'expirado' são escritos pela API; 'ativo' é lido pelo dashboard.
    for status in ("trial", "expirado", "ativo"):
        assert f"'{status}'" in linha[0]


CONTRATO_VIEW = {
    "id_info_clinica",
    "clinica_nome",
    "clinica_telefone",
    "clinica_email",
    "clinica_endereco",
    "assistente_nome",
    "assistente_tom",
    "exige_profissional",
    "procedimentos",
    "profissionais",
    "horarios",
}


def test_view_de_atendimento_cumpre_o_contrato(cur):
    faltando = CONTRATO_VIEW - colunas(cur, "v_clinica_detalhes")

    assert not faltando, f"v_clinica_detalhes sem os campos: {sorted(faltando)}"


CONTRATO_RPC_PARAMS = [
    "p_id_info_clinica",
    "p_procedimento_id",
    "p_inicio",
    "p_fim",
    "p_profissional_id",
    "p_step_minutos",
    "p_duracao_minutos",
]
CONTRATO_RPC_RETORNO = [
    "id_info_clinica",
    "id_profissional",
    "id_procedimento",
    "inicio",
    "fim",
]


def test_rpc_de_disponibilidade_cumpre_o_contrato(cur):
    cur.execute(
        """
        select pg_get_function_identity_arguments(p.oid),
               pg_get_function_result(p.oid),
               p.prosecdef,
               p.proconfig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'fn_buscar_slots'
        """
    )
    linha = cur.fetchone()

    assert linha, "fn_buscar_slots não existe"
    argumentos, retorno, security_definer, config = linha
    for parametro in CONTRATO_RPC_PARAMS:
        assert parametro in argumentos, f"RPC sem o parâmetro {parametro}"
    for campo in CONTRATO_RPC_RETORNO:
        assert campo in retorno, f"RPC não devolve {campo}"
    # Slot sem profissional não é slot válido.
    assert "id_profissional bigint" in retorno
    if security_definer:
        assert config and any(
            c.startswith("search_path=") for c in config
        ), "SECURITY DEFINER exige search_path fixo"


def test_rls_ligado_nas_tabelas_de_negocio(cur):
    cur.execute(
        """
        select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        """
    )
    sem_rls = [linha[0] for linha in cur.fetchall()]

    assert not sem_rls, f"tabelas de negócio sem RLS: {sem_rls}"
