"""API determinística da automação — rotas `/api/ai/*`.

Princípio: a automação e o modelo decidem **o que** pedir; nunca **de quem**.
Toda operação recebe `instance_name` e o servidor resolve a empresa por
`usuarios.instance_name`. `id_info_clinica` não é aceito em nenhum corpo, e
todo id de procedimento, profissional, cliente ou consulta é conferido contra a
empresa resolvida antes de qualquer leitura ou escrita.

Escrita nunca é declarada bem-sucedida por causa de um HTTP 200: cada operação
relê o registro persistido e só então responde `ok: true`.
"""

import hmac
import logging
import re
from datetime import date, datetime, timedelta
from typing import Any, Callable, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, Header, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from dominio import (
    FUSO_NEGOCIO,
    agora,
    com_fuso_de_negocio,
    dinheiro_para_banco,
    dinheiro_para_json,
    iso_no_fuso_de_negocio,
    ler_intervalo,
    montar_intervalo,
    normalizar_telefone,
    telefones_equivalentes,
    texto_seguro,
)
from settings import AUTOMATION_API_TOKEN, AUTOMATION_API_TOKEN_MIN_LEN
from supabase_client import supabase

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["automacao"])

CABECALHO_TOKEN = "X-Automation-Token"

# Status que ocupam agenda. Mesmo conjunto da constraint `consulta_sem_sobreposicao`
# e de `fn_buscar_slots`: se divergirem, a API oferta o que o banco recusa.
STATUS_VIVOS = ("pendente", "agendado", "confirmado")
STATUS_CONHECIDOS = ("pendente", "agendado", "confirmado", "cancelado", "concluido")
STATUS_CANCELADO = "cancelado"

JANELA_MAXIMA_DIAS = 30

MOTIVOS_CANCELAMENTO = {
    "cliente_solicitou": "Cancelado pelo cliente no WhatsApp",
    "remarcacao": "Cancelado para remarcação",
    "ausencia": "Cliente informou que não poderá comparecer",
    "outro": "Cancelado pelo atendimento automático",
}

CAMPOS_CLIENTE = "id,nome,whats,telefone,email,data_nascimento,interesses,status"
CAMPOS_CONSULTA = (
    "id,intervalo,status,confirmado_em,cancelado_em,motivo_cancelamento,"
    "valor_cobrado,chave_idempotencia,id_cliente,id_procedimento,id_profissional,"
    "id_info_clinica,procedimento(id,nome,valor,duracao_minutos),profissional(id,nome)"
)


# ===== CONTRATO DE ERRO =====
class AiError(Exception):
    """Erro com código estável para a automação decidir sem ler texto.

    `message` é seguro para trafegar: descreve a situação sem revelar nome de
    tabela, SQLSTATE, id de outra empresa ou existência de registro alheio.
    """

    def __init__(self, code: str, message: str, status: int = 400, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status
        self.retryable = retryable


def sucesso(data: Any) -> Dict[str, Any]:
    return {"ok": True, "data": data, "error": None}


def falha(code: str, message: str, retryable: bool) -> Dict[str, Any]:
    return {
        "ok": False,
        "data": None,
        "error": {"code": code, "message": message, "retryable": retryable},
    }


def registrar_tratadores(app) -> None:
    """Garante o envelope também nos erros que o FastAPI levanta sozinho."""

    @app.exception_handler(AiError)
    async def _ai_error(_request: Request, erro: AiError):
        return JSONResponse(
            status_code=erro.status,
            content=falha(erro.code, erro.message, erro.retryable),
        )

    @app.exception_handler(RequestValidationError)
    async def _validacao(request: Request, erro: RequestValidationError):
        # Fora de /api/ai o painel continua recebendo o formato do FastAPI, que
        # é o que o dashboard já trata.
        if not request.url.path.startswith(router.prefix):
            return await request_validation_exception_handler(request, erro)
        # O detalhe do pydantic ecoa o corpo enviado; a automação só precisa
        # saber quais campos falharam.
        campos = sorted({".".join(str(p) for p in item.get("loc", ())[1:]) for item in erro.errors()})
        return JSONResponse(
            status_code=422,
            content=falha(
                "ENTRADA_INVALIDA",
                "Campos inválidos ou ausentes: " + (", ".join(c for c in campos if c) or "corpo"),
                False,
            ),
        )

    @app.exception_handler(Exception)
    async def _inesperado(request: Request, erro: Exception):
        # Sem este tratador, qualquer exceção não prevista dentro de /api/ai
        # vira "Internal Server Error" em texto puro: a automação não acha
        # `ok` nem `error.code`, e trata a falha como resposta desconhecida em
        # vez de retentativa. Fora do prefixo, o painel continua recebendo o
        # 500 do framework.
        if not request.url.path.startswith(router.prefix):
            return PlainTextResponse("Internal Server Error", status_code=500)
        # Só o tipo: a mensagem da exceção pode carregar corpo da requisição.
        logger.error("Erro inesperado em %s (%s)", request.url.path, type(erro).__name__)
        return JSONResponse(
            status_code=503,
            content=falha(
                "FALHA_TEMPORARIA",
                "Não foi possível concluir agora. Tente novamente.",
                True,
            ),
        )


# ===== AUTENTICAÇÃO DE MÁQUINA =====
def autenticar_automacao(token: str = Header(default="", alias=CABECALHO_TOKEN)) -> None:
    """Token de máquina próprio, comparado em tempo constante.

    Não reaproveita o JWT do painel de propósito: um token de sessão de usuário
    carrega empresa e papel, e vazá-lo para o n8n daria à automação a identidade
    de uma pessoa.
    """
    esperado = AUTOMATION_API_TOKEN
    if not esperado or len(esperado) < AUTOMATION_API_TOKEN_MIN_LEN:
        # Sem token configurado as rotas ficam fechadas, não abertas. O operador
        # precisa do sinal; o chamador não recebe nada além de "indisponível".
        logger.error(
            "AUTOMATION_API_TOKEN ausente ou curto demais: rotas /api/ai recusando chamadas"
        )
        raise AiError(
            "AUTOMACAO_INDISPONIVEL",
            "Automação indisponível no momento.",
            status=503,
            retryable=True,
        )

    if not hmac.compare_digest(str(token).encode("utf-8"), esperado.encode("utf-8")):
        raise AiError("AUTENTICACAO_INVALIDA", "Credencial inválida.", status=401)


PROTEGIDO = [Depends(autenticar_automacao)]


# ===== ACESSO AO BANCO =====
_SQLSTATE = re.compile(r"['\"]code['\"]\s*:\s*['\"](\w+)['\"]")


def codigo_postgres(erro: Exception) -> str:
    """SQLSTATE do erro do PostgREST, sem propagar a mensagem do banco."""
    codigo = getattr(erro, "code", None)
    if codigo:
        return str(codigo)
    encontrado = _SQLSTATE.search(str(erro))
    return encontrado.group(1) if encontrado else ""


def executar(operacao: str, chamada: Callable[[], Any]) -> Any:
    """Roda uma chamada ao banco traduzindo falha inesperada em erro estável."""
    try:
        return chamada()
    except AiError:
        raise
    except Exception as erro:  # noqa: BLE001 — a origem é sempre a camada de dados
        logger.error(
            "Falha de banco em %s (%s, sqlstate=%s)",
            operacao,
            type(erro).__name__,
            codigo_postgres(erro) or "-",
        )
        raise AiError(
            "FALHA_TEMPORARIA",
            "Não foi possível concluir agora. Tente novamente.",
            status=503,
            retryable=True,
        ) from erro


def _primeira(resultado: Any) -> Optional[dict]:
    linhas = getattr(resultado, "data", None) or []
    return linhas[0] if linhas else None


# ===== RESOLUÇÃO DE EMPRESA E RECURSOS =====
def resolver_empresa(instance_name: str) -> int:
    """Empresa da conversa, derivada só da instância do WhatsApp.

    Nenhum corpo de requisição pode informar a empresa: é o que impede a
    automação (ou o modelo) de ler ou escrever no tenant errado.
    """
    nome = (instance_name or "").strip()
    if not nome:
        raise AiError("ENTRADA_INVALIDA", "instance_name é obrigatório.", status=422)

    resultado = executar(
        "resolver_empresa",
        lambda: supabase.table("usuarios")
        .select("id_info_clinica")  # nunca `*`: a linha tem senha_hash e e-mail de login
        .eq("instance_name", nome)
        .limit(2)
        .execute(),
    )
    linhas = resultado.data or []
    if not linhas:
        raise AiError("INSTANCIA_DESCONHECIDA", "Instância não reconhecida.", status=404)
    if len(linhas) > 1:
        # `ux_usuarios_instance_name` impede, mas se a trava cair a empresa da
        # conversa vira não determinística — recusar é a única saída segura.
        logger.error("instance_name duplicado: recusando para não escolher empresa")
        raise AiError("INSTANCIA_AMBIGUA", "Instância com configuração ambígua.", status=409)

    clinica_id = linhas[0].get("id_info_clinica")
    if not clinica_id:
        raise AiError(
            "EMPRESA_NAO_CONFIGURADA",
            "Empresa ainda não concluiu a configuração.",
            status=409,
        )
    return int(clinica_id)


def obter_procedimento(clinica_id: int, procedimento_id: int) -> dict:
    resultado = executar(
        "obter_procedimento",
        lambda: supabase.table("procedimento")
        .select("id,nome,valor,duracao_minutos")
        .eq("id", procedimento_id)
        .eq("id_info_clinica", clinica_id)
        .limit(1)
        .execute(),
    )
    linha = _primeira(resultado)
    if not linha:
        # Mesma resposta para "não existe" e "é de outra empresa": distinguir
        # confirmaria a existência de cadastro alheio.
        raise AiError("PROCEDIMENTO_INVALIDO", "Serviço não encontrado.", status=404)
    return linha


def obter_profissional(clinica_id: int, profissional_id: int) -> dict:
    resultado = executar(
        "obter_profissional",
        lambda: supabase.table("profissional")
        .select("id,nome,ativo")
        .eq("id", profissional_id)
        .eq("id_info_clinica", clinica_id)
        .limit(1)
        .execute(),
    )
    linha = _primeira(resultado)
    if not linha:
        raise AiError("PROFISSIONAL_INVALIDO", "Profissional não encontrado.", status=404)
    return linha


def buscar_cliente(clinica_id: int, telefone: str) -> Optional[dict]:
    formas = telefones_equivalentes(telefone)
    if not formas:
        raise AiError("CLIENTE_INVALIDO", "Telefone inválido.", status=422)

    resultado = executar(
        "buscar_cliente",
        lambda: supabase.table("cliente")
        .select(CAMPOS_CLIENTE + ",whats_normalizado")
        .eq("id_info_clinica", clinica_id)
        .in_("whats_normalizado", formas)
        .limit(len(formas))
        .execute(),
    )
    linhas = resultado.data or []
    if not linhas:
        return None
    por_forma = {linha.get("whats_normalizado"): linha for linha in linhas}
    for forma in formas:
        if forma in por_forma:
            return por_forma[forma]
    return linhas[0]


def localizar_ou_criar_cliente(clinica_id: int, telefone: str, nome: Optional[str]) -> dict:
    existente = buscar_cliente(clinica_id, telefone)
    if existente:
        existente["novo"] = False
        return existente

    canonico = normalizar_telefone(telefone)
    if not canonico:
        raise AiError("CLIENTE_INVALIDO", "Telefone inválido.", status=422)

    dados = {
        "nome": texto_seguro(nome, 120) or "Contato do WhatsApp",
        "whats": canonico,
        "telefone": canonico,
        "status": "ativo",
        "id_info_clinica": clinica_id,
    }
    try:
        supabase.table("cliente").insert(dados).execute()
    except Exception as erro:  # noqa: BLE001
        # 23505: duas mensagens do mesmo contato chegaram juntas e a outra
        # ganhou a corrida. O cadastro certo já existe — reler resolve.
        if codigo_postgres(erro) != "23505":
            logger.error(
                "Falha ao criar cliente (%s, sqlstate=%s)",
                type(erro).__name__,
                codigo_postgres(erro) or "-",
            )
            raise AiError(
                "FALHA_TEMPORARIA",
                "Não foi possível concluir agora. Tente novamente.",
                status=503,
                retryable=True,
            ) from erro

    criado = buscar_cliente(clinica_id, telefone)
    if not criado:
        raise AiError(
            "FALHA_TEMPORARIA",
            "Não foi possível concluir agora. Tente novamente.",
            status=503,
            retryable=True,
        )
    criado["novo"] = True
    return criado


def exigir_cliente(clinica_id: int, telefone: str) -> dict:
    cliente = buscar_cliente(clinica_id, telefone)
    if not cliente:
        raise AiError("CLIENTE_INVALIDO", "Cliente não encontrado nesta empresa.", status=404)
    return cliente


# ===== SERIALIZAÇÃO =====
def serializar_cliente(linha: dict) -> dict:
    return {
        "nome": linha.get("nome"),
        "telefone": linha.get("telefone") or linha.get("whats"),
        "email": linha.get("email"),
        "data_nascimento": linha.get("data_nascimento"),
        "interesses": linha.get("interesses"),
        "novo": bool(linha.get("novo")),
    }


def serializar_consulta(linha: dict) -> dict:
    faixa = ler_intervalo(linha.get("intervalo") or "")
    if not faixa:
        logger.error("Consulta %s com intervalo ilegível", linha.get("id"))
        raise AiError(
            "FALHA_TEMPORARIA",
            "Não foi possível concluir agora. Tente novamente.",
            status=503,
            retryable=True,
        )
    inicio, fim = faixa
    procedimento = linha.get("procedimento") or {}
    profissional = linha.get("profissional") or {}
    # Preço do dia do agendamento; o do cadastro é o de hoje e pode ter mudado.
    valor = linha.get("valor_cobrado")
    if valor is None:
        valor = procedimento.get("valor")
    return {
        "id": linha.get("id"),
        "status": linha.get("status"),
        "inicio": iso_no_fuso_de_negocio(inicio),
        "fim": iso_no_fuso_de_negocio(fim),
        "valor_cobrado": dinheiro_para_json(valor),
        "confirmado_em": iso_no_fuso_de_negocio(linha.get("confirmado_em")),
        "cancelado_em": iso_no_fuso_de_negocio(linha.get("cancelado_em")),
        "procedimento": {
            "id": procedimento.get("id"),
            "nome": procedimento.get("nome"),
            "duracao_minutos": procedimento.get("duracao_minutos"),
        },
        "profissional": {"id": profissional.get("id"), "nome": profissional.get("nome")},
    }


def reler_consulta(clinica_id: int, consulta_id: int) -> Optional[dict]:
    resultado = executar(
        "reler_consulta",
        lambda: supabase.table("consulta")
        .select(CAMPOS_CONSULTA)
        .eq("id", consulta_id)
        .eq("id_info_clinica", clinica_id)
        .limit(1)
        .execute(),
    )
    return _primeira(resultado)


def confirmar_efeito(clinica_id: int, consulta_id: Optional[int], esperado: Callable[[dict], bool]) -> dict:
    """Relê o registro e só devolve o resultado se o efeito estiver no banco.

    Uma requisição HTTP aceita não é prova de gravação: sem esta releitura a
    automação avisaria o cliente que o horário foi marcado com base apenas no
    fato de ter enviado um POST.
    """
    if not consulta_id:
        logger.error("Escrita sem id de retorno: tratando como falha")
        raise AiError(
            "FALHA_TEMPORARIA",
            "Não foi possível confirmar a operação. Tente novamente.",
            status=503,
            retryable=True,
        )
    linha = reler_consulta(clinica_id, consulta_id)
    if not linha or not linha.get("id") or not esperado(linha):
        logger.error("Releitura da consulta %s não confirmou o efeito esperado", consulta_id)
        raise AiError(
            "FALHA_TEMPORARIA",
            "Não foi possível confirmar a operação. Tente novamente.",
            status=503,
            retryable=True,
        )
    return linha


# ===== DISPONIBILIDADE =====
def buscar_slots(
    clinica_id: int,
    procedimento_id: int,
    inicio: datetime,
    fim: datetime,
    profissional_id: Optional[int] = None,
    passo_minutos: int = 30,
    duracao_minutos: Optional[int] = None,
    ignorar_consulta_id: Optional[int] = None,
) -> List[dict]:
    parametros = {
        "p_id_info_clinica": clinica_id,
        "p_procedimento_id": procedimento_id,
        "p_inicio": inicio.isoformat(),
        "p_fim": fim.isoformat(),
        "p_profissional_id": profissional_id,
        "p_step_minutos": passo_minutos,
        "p_duracao_minutos": duracao_minutos,
        "p_ignorar_consulta_id": ignorar_consulta_id,
    }
    resultado = executar(
        "fn_buscar_slots",
        lambda: supabase.rpc("fn_buscar_slots", parametros).execute(),
    )
    linhas = resultado.data or []
    # Duas checagens defensivas: a função já garante as duas, mas um slot sem
    # profissional ou de outra empresa nunca pode virar agendamento.
    return [
        linha
        for linha in linhas
        if linha.get("id_profissional") and int(linha.get("id_info_clinica") or 0) == clinica_id
    ]


def horario_esta_livre(
    clinica_id: int,
    procedimento_id: int,
    profissional_id: int,
    inicio: datetime,
    duracao_minutos: int,
    ignorar_consulta_id: Optional[int] = None,
) -> bool:
    """Revalida o horário exato imediatamente antes da escrita.

    Passo de 1 minuto porque aqui não se procura grade de ofertas: a pergunta é
    se ESTE instante cabe no expediente, na agenda do profissional e fora de
    bloqueio e de consulta viva.
    """
    fim = inicio + timedelta(minutes=duracao_minutos)
    slots = buscar_slots(
        clinica_id,
        procedimento_id,
        inicio,
        fim,
        profissional_id=profissional_id,
        passo_minutos=1,
        duracao_minutos=duracao_minutos,
        ignorar_consulta_id=ignorar_consulta_id,
    )
    for slot in slots:
        quando = slot.get("inicio")
        try:
            candidato = com_fuso_de_negocio(datetime.fromisoformat(str(quando)))
        except ValueError:
            continue
        if candidato == inicio and int(slot["id_profissional"]) == profissional_id:
            return True
    return False


# ===== MODELOS DE ENTRADA =====
class BaseAutomacao(BaseModel):
    # `extra=forbid`: campo desconhecido é erro, não silêncio. É o que impede o
    # fluxo de tentar mandar `id_info_clinica` ou um filtro qualquer.
    model_config = ConfigDict(extra="forbid")

    instance_name: str = Field(min_length=1, max_length=120)


class ContextoRequest(BaseAutomacao):
    telefone: str = Field(min_length=8, max_length=40)
    nome: Optional[str] = Field(default=None, max_length=120)


class DisponibilidadeRequest(BaseAutomacao):
    id_procedimento: int = Field(gt=0)
    id_profissional: Optional[int] = Field(default=None, gt=0)
    inicio: datetime
    fim: datetime
    passo_minutos: int = Field(default=30, ge=5, le=240)
    limite: int = Field(default=20, ge=1, le=50)


class BuscarAgendamentosRequest(BaseAutomacao):
    telefone: str = Field(min_length=8, max_length=40)
    status: Optional[
        List[Literal["pendente", "agendado", "confirmado", "cancelado", "concluido"]]
    ] = None
    limite: int = Field(default=10, ge=1, le=50)


class CriarAgendamentoRequest(BaseAutomacao):
    telefone: str = Field(min_length=8, max_length=40)
    nome: Optional[str] = Field(default=None, max_length=120)
    id_procedimento: int = Field(gt=0)
    id_profissional: int = Field(gt=0)
    inicio: datetime
    chave_idempotencia: str = Field(min_length=8, max_length=120)


class ReagendarRequest(BaseAutomacao):
    telefone: str = Field(min_length=8, max_length=40)
    id_consulta: int = Field(gt=0)
    novo_inicio: datetime
    id_profissional: Optional[int] = Field(default=None, gt=0)


class CancelarRequest(BaseAutomacao):
    telefone: str = Field(min_length=8, max_length=40)
    id_consulta: int = Field(gt=0)
    motivo: Literal["cliente_solicitou", "remarcacao", "ausencia", "outro"] = "cliente_solicitou"


class AtualizarClienteRequest(BaseAutomacao):
    telefone: str = Field(min_length=8, max_length=40)
    nome: Optional[str] = Field(default=None, min_length=1, max_length=120)
    email: Optional[EmailStr] = None
    # `date`, não texto com regex: `1994-13-45` casa com o padrão mas não é uma
    # data, e o banco recusaria depois — a automação receberia
    # `FALHA_TEMPORARIA retryable` e repetiria para sempre um pedido inválido.
    data_nascimento: Optional[date] = None
    interesses: Optional[str] = Field(default=None, max_length=280)


def exigir_inicio_valido(valor: datetime) -> datetime:
    """Instante de início aceito para escrita: com fuso resolvido e no minuto.

    Segundo quebrado não existe em grade de agenda e faria a revalidação recusar
    um horário que a própria API acabou de ofertar.
    """
    momento = com_fuso_de_negocio(valor)
    if momento.second or momento.microsecond:
        raise AiError(
            "ENTRADA_INVALIDA",
            "O horário precisa começar em minuto exato.",
            status=422,
        )
    if momento <= agora():
        raise AiError("HORARIO_INDISPONIVEL", "Esse horário já passou.", status=409)
    return momento


# ===== ROTAS =====
@router.post("/contexto", dependencies=PROTEGIDO)
async def contexto(requisicao: ContextoRequest):
    """Empresa, cliente e catálogo agendável de um atendimento."""
    clinica_id = resolver_empresa(requisicao.instance_name)
    cliente = localizar_ou_criar_cliente(clinica_id, requisicao.telefone, requisicao.nome)

    resultado = executar(
        "v_clinica_detalhes",
        lambda: supabase.table("v_clinica_detalhes")
        .select("*")
        .eq("id_info_clinica", clinica_id)
        .limit(1)
        .execute(),
    )
    detalhes = _primeira(resultado)
    if not detalhes:
        raise AiError(
            "EMPRESA_NAO_CONFIGURADA",
            "Empresa ainda não concluiu a configuração.",
            status=409,
        )

    procedimentos = [
        {
            "id": item.get("id"),
            "nome": item.get("nome"),
            "valor": dinheiro_para_json(item.get("valor")),
            "duracao_minutos": item.get("duracao_minutos"),
            "agendavel": bool(item.get("agendavel")),
        }
        for item in (detalhes.get("procedimentos") or [])
        if item.get("id")
    ]
    profissionais = [
        {"id": item.get("id"), "nome": item.get("nome"), "area": item.get("area")}
        for item in (detalhes.get("profissionais") or [])
        if item.get("id")
    ]

    return sucesso(
        {
            # `id_info_clinica` fica de fora de propósito: nenhuma rota aceita
            # empresa por parâmetro, então a automação não tem o que fazer com ele.
            "empresa": {
                "nome": detalhes.get("clinica_nome"),
                "telefone": detalhes.get("clinica_telefone"),
                "email": detalhes.get("clinica_email"),
                "endereco": detalhes.get("clinica_endereco"),
                "assistente_nome": detalhes.get("assistente_nome"),
                "assistente_tom": detalhes.get("assistente_tom"),
                "exige_profissional": bool(detalhes.get("exige_profissional")),
                "fuso": FUSO_NEGOCIO,
                "horarios": detalhes.get("horarios") or [],
            },
            "cliente": serializar_cliente(cliente),
            "procedimentos": procedimentos,
            "profissionais": profissionais,
        }
    )


@router.post("/disponibilidade", dependencies=PROTEGIDO)
async def disponibilidade(requisicao: DisponibilidadeRequest):
    """Horários livres de um serviço na empresa da instância."""
    clinica_id = resolver_empresa(requisicao.instance_name)
    procedimento = obter_procedimento(clinica_id, requisicao.id_procedimento)
    if requisicao.id_profissional is not None:
        profissional = obter_profissional(clinica_id, requisicao.id_profissional)
        if not profissional.get("ativo"):
            raise AiError("PROFISSIONAL_INVALIDO", "Profissional não está atendendo.", status=409)

    inicio = com_fuso_de_negocio(requisicao.inicio)
    fim = com_fuso_de_negocio(requisicao.fim)
    if fim <= inicio:
        raise AiError("ENTRADA_INVALIDA", "O fim da janela precisa ser depois do início.", status=422)
    if fim - inicio > timedelta(days=JANELA_MAXIMA_DIAS):
        raise AiError(
            "ENTRADA_INVALIDA",
            f"A janela de busca não pode passar de {JANELA_MAXIMA_DIAS} dias.",
            status=422,
        )

    duracao = int(procedimento["duracao_minutos"])
    slots = buscar_slots(
        clinica_id,
        requisicao.id_procedimento,
        inicio,
        fim,
        profissional_id=requisicao.id_profissional,
        passo_minutos=requisicao.passo_minutos,
    )
    valor = dinheiro_para_json(procedimento.get("valor"))

    return sucesso(
        {
            "procedimento": {
                "id": procedimento["id"],
                "nome": procedimento["nome"],
                "duracao_minutos": duracao,
                "valor": valor,
            },
            # Lista vazia é resposta legítima: "não há horário" não é falha.
            "slots": [
                {
                    "inicio": iso_no_fuso_de_negocio(slot.get("inicio")),
                    "fim": iso_no_fuso_de_negocio(slot.get("fim")),
                    "id_profissional": slot.get("id_profissional"),
                    "profissional_nome": slot.get("profissional_nome"),
                }
                for slot in slots[: requisicao.limite]
            ],
            "total": len(slots),
            "truncado": len(slots) > requisicao.limite,
            "fuso": FUSO_NEGOCIO,
        }
    )


@router.post("/agendamentos/buscar", dependencies=PROTEGIDO)
async def buscar_agendamentos(requisicao: BuscarAgendamentosRequest):
    """Agendamentos do telefone informado, dentro da empresa da instância.

    O filtro de status é escolhido de uma lista fechada no servidor; nenhum
    filtro do PostgREST atravessa daqui.
    """
    clinica_id = resolver_empresa(requisicao.instance_name)
    cliente = exigir_cliente(clinica_id, requisicao.telefone)
    status = list(requisicao.status) if requisicao.status else list(STATUS_VIVOS)

    resultado = executar(
        "buscar_agendamentos",
        lambda: supabase.table("consulta")
        .select(CAMPOS_CONSULTA)
        .eq("id_info_clinica", clinica_id)
        .eq("id_cliente", cliente["id"])
        .in_("status", status)
        .order("intervalo")
        .limit(requisicao.limite)
        .execute(),
    )
    linhas = resultado.data or []
    return sucesso(
        {
            "agendamentos": [serializar_consulta(linha) for linha in linhas],
            "total": len(linhas),
            "status_consultados": status,
        }
    )


@router.post("/agendamentos", dependencies=PROTEGIDO)
async def criar_agendamento(requisicao: CriarAgendamentoRequest):
    """Cria o agendamento com revalidação, idempotência e releitura."""
    clinica_id = resolver_empresa(requisicao.instance_name)
    procedimento = obter_procedimento(clinica_id, requisicao.id_procedimento)
    profissional = obter_profissional(clinica_id, requisicao.id_profissional)

    # Repetição vence qualquer outra validação de escrita. Uma retentativa da
    # MESMA chave precisa devolver o MESMO resultado mesmo que o horário já
    # tenha começado ou que o profissional tenha sido desativado desde a
    # primeira chamada: o efeito já está no banco, e recusar agora faria o
    # fluxo tratar como falha algo que deu certo.
    # `buscar_cliente` não cria: cadastro novo continua acontecendo só depois
    # de o pedido passar por todas as validações.
    inicio = com_fuso_de_negocio(requisicao.inicio)
    chave = chave_do_tenant(clinica_id, requisicao.chave_idempotencia)
    ja_cadastrado = buscar_cliente(clinica_id, requisicao.telefone)
    pedido = {
        "id_cliente": ja_cadastrado["id"] if ja_cadastrado else None,
        "id_procedimento": requisicao.id_procedimento,
        "id_profissional": requisicao.id_profissional,
    }

    repetida = consulta_por_chave(clinica_id, chave)
    if repetida:
        return resposta_de_repeticao(repetida, pedido, inicio)

    if not profissional.get("ativo"):
        raise AiError("PROFISSIONAL_INVALIDO", "Profissional não está atendendo.", status=409)

    # O horário é validado antes do cadastro: pedido inválido não deve deixar
    # cliente novo para trás.
    inicio = exigir_inicio_valido(inicio)
    cliente = ja_cadastrado or localizar_ou_criar_cliente(
        clinica_id, requisicao.telefone, requisicao.nome
    )
    pedido["id_cliente"] = cliente["id"]
    duracao = int(procedimento["duracao_minutos"])
    intervalo = montar_intervalo(inicio, duracao)

    if not horario_esta_livre(
        clinica_id, requisicao.id_procedimento, requisicao.id_profissional, inicio, duracao
    ):
        raise AiError("HORARIO_INDISPONIVEL", "Esse horário não está mais livre.", status=409)

    dados = {
        "intervalo": intervalo,
        "status": "pendente",
        "id_cliente": cliente["id"],
        "id_procedimento": requisicao.id_procedimento,
        "id_profissional": requisicao.id_profissional,
        "id_info_clinica": clinica_id,
        # Preço congelado no ato: reajustar o serviço depois não reescreve o
        # histórico financeiro deste atendimento.
        "valor_cobrado": dinheiro_para_banco(procedimento.get("valor")),
        "chave_idempotencia": chave,
    }

    try:
        inserido = supabase.table("consulta").insert(dados).execute()
    except Exception as erro:  # noqa: BLE001
        sqlstate = codigo_postgres(erro)
        if sqlstate == "23P01":
            # `consulta_sem_sobreposicao`: alguma escrita ocupou o horário entre
            # a revalidação e o INSERT. Pode ter sido a repetição desta mesma
            # chave: a constraint de exclusão tem OID menor que
            # `ux_consulta_chave_idempotencia` e é avaliada primeiro, então na
            # corrida é ela quem dispara, não a violação de unicidade. Conferir
            # a chave antes evita devolver conflito para um pedido que já foi
            # gravado com sucesso.
            gravada = consulta_por_chave(clinica_id, chave)
            if gravada:
                return resposta_de_repeticao(gravada, pedido, inicio)
            raise AiError(
                "CONFLITO_HORARIO",
                "Esse horário acabou de ser ocupado.",
                status=409,
            ) from erro
        if sqlstate == "23505":
            # Mesma chave gravada por uma repetição concorrente. Passa pela
            # MESMA conferência do caminho não concorrente: a corrida não pode
            # ser a brecha por onde um pedido diferente entra como repetição.
            existente = consulta_por_chave(clinica_id, chave)
            if existente:
                return resposta_de_repeticao(existente, pedido, inicio)
        logger.error(
            "Falha ao criar agendamento (%s, sqlstate=%s)", type(erro).__name__, sqlstate or "-"
        )
        raise AiError(
            "FALHA_TEMPORARIA",
            "Não foi possível concluir agora. Tente novamente.",
            status=503,
            retryable=True,
        ) from erro

    criada = _primeira(inserido) or {}
    linha = confirmar_efeito(
        clinica_id,
        criada.get("id"),
        lambda registro: registro.get("status") in STATUS_VIVOS
        and registro.get("chave_idempotencia") == chave,
    )
    return sucesso({"agendamento": serializar_consulta(linha), "repetida": False})


@router.post("/agendamentos/reagendar", dependencies=PROTEGIDO)
async def reagendar_agendamento(requisicao: ReagendarRequest):
    """Move um agendamento do próprio cliente para outro horário.

    Idempotente por estado: repetir o mesmo pedido depois de o horário já ter
    sido movido devolve sucesso, sem segunda escrita. Não usa chave de
    idempotência porque o estado desejado é observável no próprio registro —
    e chave gravada por cima apagaria a chave da criação.
    """
    clinica_id = resolver_empresa(requisicao.instance_name)
    cliente = exigir_cliente(clinica_id, requisicao.telefone)
    consulta = consulta_do_cliente(clinica_id, cliente["id"], requisicao.id_consulta)

    procedimento_id = consulta.get("id_procedimento")
    procedimento = consulta.get("procedimento") or {}
    # Duração ATUAL do cadastro do serviço, não a que valia quando o
    # agendamento foi criado: o fim do atendimento é recalculado na remarcação.
    duracao = int(procedimento.get("duracao_minutos") or 0)
    if not procedimento_id or duracao <= 0:
        raise AiError("PROCEDIMENTO_INVALIDO", "Serviço do agendamento indisponível.", status=409)

    if requisicao.id_profissional is not None:
        alvo = obter_profissional(clinica_id, requisicao.id_profissional)
        profissional_id = requisicao.id_profissional
    else:
        alvo = None
        profissional_id = int(consulta["id_profissional"])

    if consulta.get("status") not in STATUS_VIVOS:
        raise AiError(
            "CONSULTA_NAO_REAGENDAVEL",
            "Esse agendamento não pode mais ser remarcado.",
            status=409,
        )

    # Estado e repetição antes de validar o horário, pela mesma razão da
    # criação: repetir a remarcação que já aconteceu ainda é a mesma remarcação,
    # mesmo que o novo horário já tenha começado enquanto o fluxo repetia.
    novo_inicio = com_fuso_de_negocio(requisicao.novo_inicio)
    faixa_atual = ler_intervalo(consulta.get("intervalo") or "")
    if (
        faixa_atual
        and faixa_atual[0] == novo_inicio
        and int(consulta["id_profissional"]) == profissional_id
    ):
        return sucesso({"agendamento": serializar_consulta(consulta), "repetida": True})

    if alvo is not None and not alvo.get("ativo"):
        raise AiError("PROFISSIONAL_INVALIDO", "Profissional não está atendendo.", status=409)

    novo_inicio = exigir_inicio_valido(novo_inicio)

    if not horario_esta_livre(
        clinica_id,
        int(procedimento_id),
        profissional_id,
        novo_inicio,
        duracao,
        # Sem isto o próprio agendamento bloquearia a remarcação para um horário
        # encostado no atual.
        ignorar_consulta_id=requisicao.id_consulta,
    ):
        raise AiError("HORARIO_INDISPONIVEL", "Esse horário não está livre.", status=409)

    atualizacao = {
        "intervalo": montar_intervalo(novo_inicio, duracao),
        "id_profissional": profissional_id,
    }
    try:
        # `valor_cobrado`, `id_cliente` e `id_procedimento` ficam de fora: remarcar
        # muda o horário, não o preço acertado nem o vínculo.
        supabase.table("consulta").update(atualizacao).eq("id", requisicao.id_consulta).eq(
            "id_info_clinica", clinica_id
        ).eq("id_cliente", cliente["id"]).execute()
    except Exception as erro:  # noqa: BLE001
        sqlstate = codigo_postgres(erro)
        if sqlstate == "23P01":
            raise AiError(
                "CONFLITO_HORARIO", "Esse horário acabou de ser ocupado.", status=409
            ) from erro
        logger.error("Falha ao reagendar (%s, sqlstate=%s)", type(erro).__name__, sqlstate or "-")
        raise AiError(
            "FALHA_TEMPORARIA",
            "Não foi possível concluir agora. Tente novamente.",
            status=503,
            retryable=True,
        ) from erro

    linha = confirmar_efeito(
        clinica_id,
        requisicao.id_consulta,
        lambda registro: _comeca_em(registro, novo_inicio)
        and int(registro.get("id_profissional") or 0) == profissional_id
        and registro.get("status") in STATUS_VIVOS,
    )
    return sucesso({"agendamento": serializar_consulta(linha), "repetida": False})


@router.post("/agendamentos/cancelar", dependencies=PROTEGIDO)
async def cancelar_agendamento(requisicao: CancelarRequest):
    """Cancela um agendamento do próprio cliente.

    Idempotente por estado: cancelar algo já cancelado devolve sucesso.
    """
    clinica_id = resolver_empresa(requisicao.instance_name)
    cliente = exigir_cliente(clinica_id, requisicao.telefone)
    consulta = consulta_do_cliente(clinica_id, cliente["id"], requisicao.id_consulta)

    if consulta.get("status") == STATUS_CANCELADO:
        return sucesso({"agendamento": serializar_consulta(consulta), "repetida": True})
    if consulta.get("status") not in STATUS_VIVOS:
        raise AiError(
            "CONSULTA_NAO_CANCELAVEL",
            "Esse agendamento não pode mais ser cancelado.",
            status=409,
        )

    atualizacao = {
        # `cancelado`, no masculino: é o único valor que o CHECK do banco aceita.
        "status": STATUS_CANCELADO,
        "cancelado_em": agora().isoformat(),
        "motivo_cancelamento": MOTIVOS_CANCELAMENTO[requisicao.motivo],
    }
    executar(
        "cancelar_agendamento",
        lambda: supabase.table("consulta")
        .update(atualizacao)
        .eq("id", requisicao.id_consulta)
        .eq("id_info_clinica", clinica_id)
        .eq("id_cliente", cliente["id"])
        .execute(),
    )

    linha = confirmar_efeito(
        clinica_id,
        requisicao.id_consulta,
        lambda registro: registro.get("status") == STATUS_CANCELADO
        and bool(registro.get("cancelado_em")),
    )
    return sucesso({"agendamento": serializar_consulta(linha), "repetida": False})


@router.post("/cliente", dependencies=PROTEGIDO)
async def atualizar_cliente(requisicao: AtualizarClienteRequest):
    """Atualiza apenas campos de cadastro que o atendimento pode mudar.

    A lista é fixa no servidor. `whats`, `status` e `id_info_clinica` não entram:
    mudariam a identidade ou a empresa do cadastro.
    """
    clinica_id = resolver_empresa(requisicao.instance_name)
    cliente = exigir_cliente(clinica_id, requisicao.telefone)

    atualizacao: Dict[str, Any] = {}
    if requisicao.nome is not None:
        nome = texto_seguro(requisicao.nome, 120)
        if not nome:
            raise AiError("ENTRADA_INVALIDA", "Nome inválido.", status=422)
        atualizacao["nome"] = nome
    if requisicao.email is not None:
        atualizacao["email"] = str(requisicao.email)
    if requisicao.data_nascimento is not None:
        atualizacao["data_nascimento"] = requisicao.data_nascimento.isoformat()
    if requisicao.interesses is not None:
        atualizacao["interesses"] = texto_seguro(requisicao.interesses, 280)

    if not atualizacao:
        raise AiError("ENTRADA_INVALIDA", "Nenhum campo permitido foi enviado.", status=422)

    executar(
        "atualizar_cliente",
        lambda: supabase.table("cliente")
        .update(atualizacao)
        .eq("id", cliente["id"])
        .eq("id_info_clinica", clinica_id)
        .execute(),
    )

    resultado = executar(
        "reler_cliente",
        lambda: supabase.table("cliente")
        .select(CAMPOS_CLIENTE)
        .eq("id", cliente["id"])
        .eq("id_info_clinica", clinica_id)
        .limit(1)
        .execute(),
    )
    linha = _primeira(resultado)
    if not linha:
        raise AiError(
            "FALHA_TEMPORARIA",
            "Não foi possível confirmar a operação. Tente novamente.",
            status=503,
            retryable=True,
        )
    return sucesso({"cliente": serializar_cliente(linha), "campos_atualizados": sorted(atualizacao)})


# ===== APOIO =====
def chave_do_tenant(clinica_id: int, chave: str) -> str:
    """Prefixa a chave com a empresa.

    `ux_consulta_chave_idempotencia` é global. Sem o prefixo, duas empresas que
    usam o mesmo identificador de ação colidiriam entre si.
    """
    return f"emp{clinica_id}:{chave.strip()}"


def resposta_de_repeticao(registro: dict, pedido: Dict[str, Any], inicio: datetime) -> Dict[str, Any]:
    """Confere se o registro achado pela chave é mesmo a repetição deste pedido.

    Idempotência só vale quando o pedido é o mesmo. Chave reaproveitada com
    outro conteúdo é erro de fluxo, não repetição — e um agendamento que já foi
    cancelado não pode voltar como sucesso.
    """
    divergente = any(registro.get(campo) != valor for campo, valor in pedido.items())
    faixa = ler_intervalo(registro.get("intervalo") or "")
    if divergente or not faixa or faixa[0] != inicio:
        raise AiError(
            "CHAVE_IDEMPOTENCIA_CONFLITANTE",
            "Essa chave de idempotência já foi usada com outro pedido.",
            status=409,
        )
    if registro.get("status") not in STATUS_VIVOS:
        raise AiError(
            "AGENDAMENTO_NAO_ESTA_ATIVO",
            "Esse pedido já foi processado e o agendamento não está mais ativo.",
            status=409,
        )
    return sucesso({"agendamento": serializar_consulta(registro), "repetida": True})


def consulta_por_chave(clinica_id: int, chave: str) -> Optional[dict]:
    resultado = executar(
        "consulta_por_chave",
        lambda: supabase.table("consulta")
        .select(CAMPOS_CONSULTA)
        .eq("id_info_clinica", clinica_id)
        .eq("chave_idempotencia", chave)
        .limit(1)
        .execute(),
    )
    return _primeira(resultado)


def consulta_do_cliente(clinica_id: int, cliente_id: int, consulta_id: int) -> dict:
    resultado = executar(
        "consulta_do_cliente",
        lambda: supabase.table("consulta")
        .select(CAMPOS_CONSULTA)
        .eq("id", consulta_id)
        .eq("id_info_clinica", clinica_id)
        .eq("id_cliente", cliente_id)
        .limit(1)
        .execute(),
    )
    linha = _primeira(resultado)
    if not linha:
        raise AiError("CONSULTA_NAO_ENCONTRADA", "Agendamento não encontrado.", status=404)
    return linha


def _comeca_em(registro: dict, momento: datetime) -> bool:
    faixa = ler_intervalo(registro.get("intervalo") or "")
    return bool(faixa) and faixa[0] == momento
