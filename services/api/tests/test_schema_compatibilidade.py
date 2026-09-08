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
    # v3: texto livre do assinante sobre o negócio. Some daqui e a recepção
    # volta a não ter fonte para pagamento, convênio ou estacionamento.
    "clinica_descricao",
}


def test_view_de_atendimento_cumpre_o_contrato(cur):
    faltando = CONTRATO_VIEW - colunas(cur, "v_clinica_detalhes")

    assert not faltando, f"v_clinica_detalhes sem os campos: {sorted(faltando)}"


CONTRATO_RPC_PARAMS = [
    # A empresa entra como parâmetro obrigatório: sem ele o isolamento cairia.
    "p_id_info_clinica",
    "p_procedimento_id",
    "p_inicio",
    "p_fim",
    "p_profissional_id",
    "p_step_minutos",
    "p_duracao_minutos",
    # v2: revalidação de reagendamento precisa ignorar a própria consulta.
    "p_ignorar_consulta_id",
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


# ===== Ajustes de `scripts/ajustes_ai_api.sql` =====
def tipo_da_coluna(cur, tabela, coluna):
    cur.execute(
        "select data_type from information_schema.columns "
        "where table_schema = 'public' and table_name = %s and column_name = %s",
        (tabela, coluna),
    )
    linha = cur.fetchone()
    return linha[0] if linha else None


@pytest.mark.parametrize("coluna", ["confirmado_em", "cancelado_em"])
def test_marcos_da_consulta_sao_instantes(cur, coluna):
    """`date` descartaria a hora e duas ações do mesmo dia ficariam iguais."""
    assert tipo_da_coluna(cur, "consulta", coluna) == "timestamp with time zone"


def test_consulta_guarda_o_preco_cobrado(cur):
    """Sem preço congelado, reajustar o serviço reescreve o histórico emitido."""
    assert tipo_da_coluna(cur, "consulta", "valor_cobrado") == "numeric"

    cur.execute(
        "select pg_get_constraintdef(oid) from pg_constraint "
        "where conname = 'consulta_valor_cobrado_nao_negativo'"
    )
    linha = cur.fetchone()

    assert linha, "falta o CHECK de valor_cobrado"


def test_telefone_do_cliente_tem_forma_normalizada_e_unica_por_empresa(cur):
    """A API filtra por esta coluna: expressão indexada não é consultável."""
    cur.execute(
        "select is_generated from information_schema.columns "
        "where table_schema = 'public' and table_name = 'cliente' "
        "and column_name = 'whats_normalizado'"
    )
    linha = cur.fetchone()

    assert linha and linha[0] == "ALWAYS", "whats_normalizado precisa ser coluna gerada"

    cur.execute(
        "select indisunique, pg_get_indexdef(indexrelid) from pg_index "
        "where indexrelid = 'public.ux_cliente_empresa_whats_norm'::regclass"
    )
    indice = cur.fetchone()

    assert indice and indice[0], "falta o índice único (empresa, telefone normalizado)"
    # A empresa entra no índice: o mesmo telefone em duas empresas é legítimo.
    assert "id_info_clinica" in indice[1]


def test_catalogo_de_areas_esta_preenchido_e_sem_duplicata(cur):
    cur.execute("select count(*), count(distinct lower(btrim(nome))) from public.area_atuacao")
    total, distintos = cur.fetchone()

    assert total > 0, "catálogo de áreas vazio: rodar scripts/ajustes_ai_api.sql"
    assert total == distintos, "há rótulos duplicados em area_atuacao"

    cur.execute(
        "select 1 from pg_index where indexrelid = 'public.ux_area_atuacao_nome'::regclass"
    )
    assert cur.fetchone(), "falta a unicidade de nome em area_atuacao"


def test_existe_uma_unica_assinatura_de_fn_buscar_slots(cur):
    """Duas sobrecargas deixariam a chamada nomeada do PostgREST ambígua."""
    cur.execute(
        "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
        "where n.nspname = 'public' and p.proname = 'fn_buscar_slots'"
    )

    assert cur.fetchone()[0] == 1
