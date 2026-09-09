from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from decimal import Decimal
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, field_validator
from typing import List, Literal, Optional
from datetime import datetime, date, time, timedelta, timezone
import jwt
from passlib.context import CryptContext
import re as regex_module

ROOT_DIR = Path(__file__).parent

# O `.env` é carregado por `settings`, que é importado abaixo.
from settings import (
    JWT_ALGORITHM,
    JWT_EXPIRATION_HOURS,
    JWT_SECRET,
)
import ai_api
from dominio import (
    SAO_PAULO_TZ,
    com_fuso_de_negocio,
    dinheiro,
    dinheiro_para_banco,
    dinheiro_para_json,
    montar_intervalo,
)
from supabase_client import supabase

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ===== MODELS =====
class LoginRequest(BaseModel):
    email: EmailStr
    senha: str

class LoginResponse(BaseModel):
    access_token: str
    usuario: dict

class UsuarioCreate(BaseModel):
    email: EmailStr
    senha: str
    nome: str

# Cliente
class ClienteCreate(BaseModel):
    nome: str
    whats: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    data_nascimento: Optional[date] = None
    interesses: Optional[str] = None
    id_plano_saude: Optional[int] = None
    status: Optional[str] = "ativo"

class ClienteUpdate(BaseModel):
    nome: Optional[str] = None
    whats: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    data_nascimento: Optional[date] = None
    interesses: Optional[str] = None
    id_plano_saude: Optional[int] = None
    status: Optional[str] = None

# Profissional
class ProfissionalCreate(BaseModel):
    nome: str
    ativo: bool = True
    observacoes: Optional[str] = None
    id_area_atuacao: Optional[int] = None
    whats: Optional[str] = None
    email: Optional[str] = None

class ProfissionalUpdate(BaseModel):
    nome: Optional[str] = None
    ativo: Optional[bool] = None
    observacoes: Optional[str] = None
    id_area_atuacao: Optional[int] = None
    whats: Optional[str] = None
    email: Optional[str] = None

# Procedimento
class ProcedimentoCreate(BaseModel):
    nome: str
    descricao: Optional[str] = None
    duracao_minutos: int
    # Dinheiro em Decimal: a coluna é numeric(10,2) e somar float acumula erro
    # de arredondamento em relatório e cobrança.
    valor: Decimal = Field(ge=0, decimal_places=2, max_digits=10)
    orientacoes: Optional[str] = None

class ProcedimentoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    duracao_minutos: Optional[int] = None
    valor: Optional[Decimal] = Field(default=None, ge=0, decimal_places=2, max_digits=10)
    orientacoes: Optional[str] = None

# Consulta
class ConsultaCreate(BaseModel):
    id_profissional: int
    id_cliente: int
    id_procedimento: int
    data_inicio: datetime
    duracao_minutos: int
    status: str = "pendente"

class ConsultaUpdate(BaseModel):
    id_profissional: Optional[int] = None
    id_cliente: Optional[int] = None
    id_procedimento: Optional[int] = None
    data_inicio: Optional[datetime] = None
    duracao_minutos: Optional[int] = None
    status: Optional[str] = None
    # Instantes, não dias: a coluna é timestamptz desde `ajustes_ai_api.sql`.
    confirmado_em: Optional[datetime] = None
    cancelado_em: Optional[datetime] = None
    motivo_cancelamento: Optional[str] = None

# Bloqueio
class BloqueioCreate(BaseModel):
    id_profissional: int
    data_inicio: datetime
    data_fim: datetime
    motivo: Optional[str] = None

# Disponibilidade
class DisponibilidadeCreate(BaseModel):
    dia_semana: int  # 1-7 (1=Segunda, 7=Domingo)
    hora_inicio: str  # "HH:MM"
    hora_fim: str  # "HH:MM"

class DisponibilidadeItem(BaseModel):
    dia_semana: int
    hora_inicio: str
    hora_fim: str

# Horário Clínica
class HorarioClinicaCreate(BaseModel):
    dia_semana: int
    hora_inicio: str
    hora_fim: str

# Info Clínica
# Tom da assistente: vocabulário fechado, igual ao CHECK
# `info_clinica_assistente_tom_valido` (scripts/ajustes_onboarding.sql). Os dois
# precisam concordar; divergir faria a API aceitar o que o banco recusa.
TONS_ASSISTENTE = ("acolhedor", "objetivo", "descontraido")

LIMITE_NOME_ASSISTENTE = (2, 40)

# `descricao` é o texto que o assinante escreve sobre o negócio e que entra no
# prompt de sistema da recepção (view v_clinica_detalhes v3 -> /api/ai/contexto).
# Antes não tinha teto nenhum no servidor: só o zod do painel, que qualquer
# cliente HTTP ignora. Um texto sem limite empurraria o prompt inteiro para fora
# da janela do modelo — e a fronteira é aqui, não no navegador.
LIMITE_DESCRICAO = 2000


def validar_nome_assistente(valor: Optional[str]) -> Optional[str]:
    """Nome da assistente: só letras e espaços, 2 a 40 caracteres.

    O valor entra no prompt de sistema da IA. Texto livre do dono é vetor de
    injeção, então a fronteira recusa em vez de sanear pela metade.
    """
    if valor is None:
        return None
    nome = valor.strip()
    minimo, maximo = LIMITE_NOME_ASSISTENTE
    if not minimo <= len(nome) <= maximo:
        raise ValueError(f"O nome da assistente precisa ter de {minimo} a {maximo} caracteres")
    if not all(caractere.isalpha() or caractere == ' ' for caractere in nome):
        raise ValueError("O nome da assistente aceita apenas letras e espaços")
    return nome


class InfoClinicaUpdate(BaseModel):
    nome: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    descricao: Optional[str] = Field(default=None, max_length=LIMITE_DESCRICAO)
    endereco: Optional[str] = None
    onboarding_completo: Optional[bool] = None
    mensagem_lembrete: Optional[str] = None
    # Horas de antecedencia do lembrete. `None` desliga — e o mesmo CHECK do
    # banco (1 a 168) vale aqui, para a recusa vir com mensagem de formulario e
    # nao como erro de banco.
    lembrete_horas: Optional[int] = Field(default=None, ge=1, le=168)
    assistente_nome: Optional[str] = None
    assistente_tom: Optional[Literal[TONS_ASSISTENTE]] = None
    exige_profissional: Optional[bool] = None

    _validar_assistente_nome = field_validator('assistente_nome')(validar_nome_assistente)


class AutomacaoUpdate(BaseModel):
    ativa: bool

class InfoClinicaCreate(BaseModel):
    nome: str
    telefone: Optional[str] = None
    email: Optional[str] = None
    descricao: Optional[str] = Field(default=None, max_length=LIMITE_DESCRICAO)
    endereco: Optional[str] = None

# ===== AUTH HELPERS =====
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

# Colunas do login e da sessão. Nunca `*`: a linha de `usuarios` tem
# `senha_hash`, e o objeto devolvido ao painel é montado a partir dela.
CAMPOS_SESSAO = 'id, email, nome, id_info_clinica, role, status_assinatura, trial_fim'


def estado_do_trial(user: dict) -> dict:
    """Situação da assinatura recalculada no servidor.

    Única fonte de verdade de `/auth/login` e `/auth/me`. O painel não pode
    decidir trial pelo objeto guardado no `localStorage`: ele não expira
    sozinho e é editável pelo próprio usuário.

    Efeito colateral proposital: trial vencido é gravado como `expirado`, para
    o estado não depender de alguém chamar a rota certa.
    """
    status_assinatura = user.get('status_assinatura', 'trial')
    trial_fim = user.get('trial_fim')
    trial_expirado = False
    dias_restantes = 0

    if status_assinatura == 'trial' and trial_fim:
        try:
            trial_fim_dt = datetime.fromisoformat(str(trial_fim).replace('Z', '+00:00'))
            agora = (
                datetime.utcnow().replace(tzinfo=trial_fim_dt.tzinfo)
                if trial_fim_dt.tzinfo
                else datetime.utcnow()
            )
            if agora > trial_fim_dt:
                trial_expirado = True
                status_assinatura = 'expirado'
                supabase.table('usuarios').update(
                    {"status_assinatura": "expirado"}
                ).eq('id', user['id']).execute()
            else:
                dias_restantes = (trial_fim_dt - agora).days
        except Exception:
            # Data ilegível não pode derrubar o login: o usuário segue no
            # estado gravado, que é o conservador.
            logging.warning("trial_fim ilegível para o usuário %s", user.get('id'))

    return {
        "status_assinatura": status_assinatura,
        "trial_expirado": trial_expirado,
        "dias_restantes": dias_restantes,
        "trial_fim": trial_fim,
    }


def onboarding_da_empresa(clinica_id: Optional[int]) -> Optional[bool]:
    """Onboarding concluído, ou `None` enquanto o usuário não tem empresa.

    `None` não é "não concluiu": é o estado de quem parou antes do passo 1, e o
    painel usa a diferença para escolher entre onboarding e dashboard.
    """
    if not clinica_id:
        return None
    result = (
        supabase.table('info_clinica')
        .select('onboarding_completo')
        .eq('id', clinica_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return bool(result.data[0].get('onboarding_completo'))


def get_user_clinica_id(current_user: dict) -> int:
    """Exige uma empresa vinculada antes de acessar dados operacionais."""
    clinica_id = current_user.get('id_info_clinica')
    if not clinica_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Conclua a configuração da empresa antes de continuar",
        )
    return int(clinica_id)


def assert_owned_record(table: str, record_id: int, clinica_id: int, label: str) -> None:
    result = (
        supabase.table(table)
        .select('id')
        .eq('id', record_id)
        .eq('id_info_clinica', clinica_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail=f"{label} não encontrado")


def get_procedimento_da_empresa(procedimento_id: int, clinica_id: int) -> dict:
    """Serviço da empresa, com o preço vigente para congelar na consulta."""
    result = (
        supabase.table('procedimento')
        .select('id, valor, duracao_minutos')
        .eq('id', procedimento_id)
        .eq('id_info_clinica', clinica_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Serviço não encontrado")
    return result.data[0]


def raise_if_in_use(erro: Exception, label: str) -> None:
    """Traduz violação de chave estrangeira em 409 explicativo.

    As FKs de `consulta` são RESTRICT: excluir profissional, cliente ou serviço
    com agendamento no histórico é recusado pelo banco. Sem esta tradução o
    painel recebia 500 "Erro interno" e o usuário não descobria o motivo.
    """
    texto = str(erro)
    if '23503' in texto or 'foreign key' in texto.lower():
        raise HTTPException(
            status_code=409,
            detail=(
                f"{label} não pode ser excluído porque tem agendamentos no histórico. "
                "Desative o registro em vez de excluir."
            ),
        )

# ===== AUTH ROUTES =====
@api_router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    try:
        # `senha_hash` só aqui: é a única rota que precisa conferir a senha.
        result = (
            supabase.table('usuarios')
            .select(f'{CAMPOS_SESSAO}, senha_hash')
            .eq('email', request.email)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=401, detail="Credenciais inválidas")

        user = result.data[0]

        if not verify_password(request.senha, user['senha_hash']):
            raise HTTPException(status_code=401, detail="Credenciais inválidas")

        trial = estado_do_trial(user)

        # Criar token JWT com id_info_clinica
        token = create_access_token({
            "user_id": user['id'],
            "email": user['email'],
            "id_info_clinica": user.get('id_info_clinica'),
            "role": user.get('role', 'owner')
        })

        return LoginResponse(
            access_token=token,
            usuario={
                "id": user['id'],
                "email": user['email'],
                "nome": user['nome'],
                "id_info_clinica": user.get('id_info_clinica'),
                "role": user.get('role', 'owner'),
                **trial,
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro no login: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")


@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(verify_token)):
    """Sessão recalculada no servidor, com trial e onboarding do banco.

    O painel usava o objeto gravado no `localStorage` no login para decidir
    trial e onboarding: ele não expira sozinho e o próprio usuário pode
    editá-lo. Aqui o token só diz QUEM é; o resto vem do banco.
    """
    try:
        user_id = current_user.get('user_id')
        if not user_id:
            raise HTTPException(status_code=401, detail="Sessão inválida")

        result = (
            supabase.table('usuarios')
            .select(CAMPOS_SESSAO)
            .eq('id', user_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=401, detail="Sessão inválida")

        user = result.data[0]
        clinica_id = user.get('id_info_clinica')

        return {
            "id": user['id'],
            "nome": user['nome'],
            "email": user['email'],
            "role": user.get('role', 'owner'),
            "id_info_clinica": clinica_id,
            "onboarding_completo": onboarding_da_empresa(clinica_id),
            **estado_do_trial(user),
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao carregar a sessão: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/auth/register")
async def register(request: UsuarioCreate):
    try:
        # Verificar se usuário já existe
        result = supabase.table('usuarios').select('id').eq('email', request.email).execute()
        if result.data:
            raise HTTPException(status_code=400, detail="Email já cadastrado")
        
        # Hash da senha
        senha_hash = get_password_hash(request.senha)
        
        # Calcular período de trial (7 dias)
        trial_inicio = datetime.utcnow()
        trial_fim = trial_inicio + timedelta(days=7)
        
        # Inserir usuário primeiro para obter o ID
        user_data = {
            "email": request.email,
            "senha_hash": senha_hash,
            "nome": request.nome,
            "created_at": trial_inicio.isoformat(),
            "trial_inicio": trial_inicio.isoformat(),
            "trial_fim": trial_fim.isoformat(),
            "status_assinatura": "trial"
        }
        
        result = supabase.table('usuarios').insert(user_data).execute()
        user_id = result.data[0]['id']

        # A instância da Evolution NÃO nasce aqui: ela é criada no passo
        # WhatsApp do onboarding (POST /whatsapp/instancia). Criar no cadastro
        # gastava instância com quem nunca faz onboarding e, quando falhava,
        # deixava `instance_name` nulo sem nenhuma rota para recriar.
        return {"message": "Usuário criado com sucesso", "id": user_id}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro no registro: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

# ===== CONTAS A PAGAR E A RECEBER =====
# O dinheiro dos atendimentos sai de `consulta`. Isto aqui e o resto: aluguel,
# material, fornecedor, a parcela que alguem ficou de pagar.
LIMITE_LANCAMENTOS = 300


class LancamentoCreate(BaseModel):
    tipo: Literal['pagar', 'receber']
    descricao: str = Field(min_length=1, max_length=200)
    valor: Decimal = Field(gt=0)
    vencimento: date
    observacoes: Optional[str] = Field(default=None, max_length=500)


@api_router.get("/lancamentos")
async def listar_lancamentos(current_user: dict = Depends(verify_token)):
    """Contas da empresa, o que vence primeiro no topo."""
    try:
        clinica_id = get_user_clinica_id(current_user)
        resultado = (
            supabase.table('lancamento')
            .select('id, tipo, descricao, valor, vencimento, quitado_em, observacoes')
            .eq('id_info_clinica', clinica_id)
            .order('vencimento')
            .limit(LIMITE_LANCAMENTOS)
            .execute()
        )
        return resultado.data or []
    except HTTPException:
        raise
    except Exception:
        logging.exception("Erro ao listar lançamentos")
        raise HTTPException(status_code=500, detail="Erro interno")


@api_router.post("/lancamentos")
async def criar_lancamento(dados: LancamentoCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        linha = {
            'id_info_clinica': clinica_id,
            'tipo': dados.tipo,
            'descricao': dados.descricao.strip(),
            # O banco guarda numeric; o JSON nao tem Decimal.
            'valor': str(dinheiro_para_banco(dados.valor)),
            'vencimento': dados.vencimento.isoformat(),
            'observacoes': dados.observacoes,
        }
        resultado = supabase.table('lancamento').insert(linha).execute()
        if not resultado.data:
            raise HTTPException(status_code=500, detail="Erro interno")
        return resultado.data[0]
    except HTTPException:
        raise
    except Exception:
        logging.exception("Erro ao criar lançamento")
        raise HTTPException(status_code=500, detail="Erro interno")


@api_router.post("/lancamentos/{lancamento_id}/quitar")
async def quitar_lancamento(lancamento_id: int, current_user: dict = Depends(verify_token)):
    """Marca como pago/recebido hoje. Clicar de novo desfaz."""
    try:
        clinica_id = get_user_clinica_id(current_user)
        atual = (
            supabase.table('lancamento')
            .select('id, quitado_em')
            .eq('id', lancamento_id)
            .eq('id_info_clinica', clinica_id)
            .limit(1)
            .execute()
        )
        linha = (atual.data or [None])[0]
        if not linha:
            raise HTTPException(status_code=404, detail="Lançamento não encontrado")

        quitado = None if linha.get('quitado_em') else date.today().isoformat()
        atualizada = (
            supabase.table('lancamento')
            .update({'quitado_em': quitado})
            .eq('id', lancamento_id)
            .eq('id_info_clinica', clinica_id)
            .execute()
        )
        return (atualizada.data or [{}])[0]
    except HTTPException:
        raise
    except Exception:
        logging.exception("Erro ao quitar lançamento")
        raise HTTPException(status_code=500, detail="Erro interno")


@api_router.delete("/lancamentos/{lancamento_id}")
async def apagar_lancamento(lancamento_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        assert_owned_record('lancamento', lancamento_id, clinica_id, 'Lançamento')
        (
            supabase.table('lancamento')
            .delete()
            .eq('id', lancamento_id)
            .eq('id_info_clinica', clinica_id)
            .execute()
        )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        logging.exception("Erro ao apagar lançamento")
        raise HTTPException(status_code=500, detail="Erro interno")


# ===== CHAT DE ATENDIMENTO =====
# O historico de conversa e gravado pelo fluxo n8n (`/api/ai/conversas/registrar`).
# Aqui o painel so LE e ENVIA. Toda consulta filtra `id_info_clinica`.
LIMITE_CONVERSAS = 50
LIMITE_MENSAGENS = 40
LIMITE_TEXTO_ENVIO = 4000


class EnvioDoPainel(BaseModel):
    texto: str = Field(min_length=1, max_length=LIMITE_TEXTO_ENVIO)


@api_router.get("/conversas")
async def listar_conversas(current_user: dict = Depends(verify_token)):
    """Conversas da empresa, mais recentes primeiro."""
    try:
        clinica_id = get_user_clinica_id(current_user)
        resultado = (
            supabase.table('conversa')
            .select('id, remote_jid, contato_nome, ultima_mensagem, ultima_em, nao_lidas')
            .eq('id_info_clinica', clinica_id)
            .order('ultima_em', desc=True)
            .limit(LIMITE_CONVERSAS)
            .execute()
        )
        return resultado.data or []
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Erro ao listar conversas")
        raise HTTPException(status_code=500, detail="Erro interno")


@api_router.get("/conversas/{conversa_id}/mensagens")
async def listar_mensagens(conversa_id: int, current_user: dict = Depends(verify_token)):
    """Mensagens de uma conversa, da mais antiga para a mais nova.

    A busca no banco vem invertida (indice por mais recente) e a lista e virada
    aqui: a tela le de cima para baixo, mas quem pagina quer o fim.
    """
    try:
        clinica_id = get_user_clinica_id(current_user)
        assert_owned_record('conversa', conversa_id, clinica_id, 'Conversa')
        resultado = (
            supabase.table('mensagem')
            .select('id, do_negocio, autor, tipo, conteudo, created_at')
            .eq('id_conversa', conversa_id)
            # `id_conversa` ja limita, mas a empresa entra de novo: uma unica
            # consulta sem esta linha basta para vazar conversa de outro
            # assinante se o id vazar.
            .eq('id_info_clinica', clinica_id)
            .order('created_at', desc=True)
            .limit(LIMITE_MENSAGENS)
            .execute()
        )
        return list(reversed(resultado.data or []))
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Erro ao listar mensagens")
        raise HTTPException(status_code=500, detail="Erro interno")


@api_router.post("/conversas/{conversa_id}/lida")
async def marcar_conversa_lida(conversa_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        assert_owned_record('conversa', conversa_id, clinica_id, 'Conversa')
        (
            supabase.table('conversa')
            .update({'nao_lidas': 0})
            .eq('id', conversa_id)
            .eq('id_info_clinica', clinica_id)
            .execute()
        )
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Erro ao marcar conversa como lida")
        raise HTTPException(status_code=500, detail="Erro interno")


@api_router.post("/conversas/{conversa_id}/devolver-ia")
async def devolver_para_ia(conversa_id: int, current_user: dict = Depends(verify_token)):
    """Devolve a conversa para a recepção automática antes dos 30 minutos.

    Não apaga a pausa no Redis — o backend não alcança aquele Redis, que fica
    na rede interna da VPS. Grava o instante da devolução, e é o fluxo que
    compara: pausa começada ANTES desta devolução não vale mais.
    """
    try:
        clinica_id = get_user_clinica_id(current_user)
        atualizada = (
            supabase.table('conversa')
            .update({'ia_liberada_em': datetime.now(timezone.utc).isoformat()})
            .eq('id', conversa_id)
            .eq('id_info_clinica', clinica_id)
            .execute()
        )
        if not atualizada.data:
            raise HTTPException(status_code=404, detail="Conversa não encontrada")
        return {"ok": True, "devolvida": True}
    except HTTPException:
        raise
    except Exception:
        logging.exception("Erro ao devolver conversa para a IA")
        raise HTTPException(status_code=500, detail="Erro interno")


@api_router.post("/conversas/{conversa_id}/enviar")
async def enviar_pelo_painel(
    conversa_id: int,
    envio: EnvioDoPainel,
    current_user: dict = Depends(verify_token),
):
    """Manda uma mensagem escrita por uma pessoa, pela instancia da empresa.

    A recepcao automatica se cala sozinha depois disto: o eco desta mensagem
    volta pelo webhook como `fromMe` e, por NAO existir a chave `am:enviada`
    dela, o fluxo a le como "o negocio respondeu" e pausa a IA por 30 minutos.
    E o comportamento desejado, e e por isso que este envio nao passa pelo n8n.

    A gravacao no historico usa o id devolvido pela Evolution: e ele que impede
    a mensagem de aparecer duas vezes quando o eco chegar.
    """
    # Import local, como nas outras rotas que falam com a Evolution.
    import evolution_api

    try:
        clinica_id = get_user_clinica_id(current_user)

        atual = (
            supabase.table('conversa')
            .select('id, instance_name, remote_jid, id_cliente, contato_nome')
            .eq('id', conversa_id)
            .eq('id_info_clinica', clinica_id)
            .limit(1)
            .execute()
        )
        conversa = (atual.data or [None])[0]
        if not conversa:
            raise HTTPException(status_code=404, detail="Conversa não encontrada")

        texto = envio.texto.strip()
        if not texto:
            raise HTTPException(status_code=422, detail="A mensagem não pode ser vazia")

        try:
            resposta = await evolution_api.send_text(
                conversa['instance_name'], conversa['remote_jid'], texto
            )
        except Exception:
            logging.exception("Evolution recusou o envio do painel")
            raise HTTPException(
                status_code=502,
                detail="Não foi possível enviar agora. A mensagem não foi entregue.",
            )

        # Sem id do provedor a mensagem entra assim mesmo: ela FOI enviada, e
        # esconder do historico seria pior. O custo e poder duplicar quando o
        # eco chegar — a chave unica nao pega nulo.
        chave = ((resposta or {}).get('key') or {}).get('id')

        supabase.rpc('fn_registrar_mensagem', {
            'p_id_info_clinica': clinica_id,
            'p_instance_name': conversa['instance_name'],
            'p_remote_jid': conversa['remote_jid'],
            'p_id_cliente': conversa.get('id_cliente'),
            'p_contato_nome': conversa.get('contato_nome'),
            'p_do_negocio': True,
            'p_autor': 'painel',
            'p_tipo': 'texto',
            'p_conteudo': texto,
            'p_provider_message_id': chave,
            'p_provider_em': None,
        }).execute()

        return {"ok": True, "enviada": True}
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Erro ao enviar pelo painel")
        raise HTTPException(status_code=500, detail="Erro interno")


# ===== DASHBOARD =====
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(verify_token)):
    try:
        import re
        from datetime import date, datetime
        
        clinica_id = get_user_clinica_id(current_user)
        
        hoje = datetime.now(SAO_PAULO_TZ).date()
        hoje_str = hoje.isoformat()
        mes_atual = hoje.strftime('%Y-%m')
        
        # Buscar consultas filtradas por clínica
        query = supabase.table('consulta').select('*, cliente(*), profissional(*), procedimento(*)')
        query = query.eq('id_info_clinica', clinica_id)
        result = query.execute()
        
        consultas = result.data or []
        
        # Filtrar consultas de hoje e do mês
        consultas_hoje = []
        consultas_mes = []
        
        for consulta in consultas:
            intervalo_str = consulta.get('intervalo', '')
            if intervalo_str:
                match = re.search(r'(\d{4}-\d{2}-\d{2})', intervalo_str)
                if match:
                    data_consulta = match.group(1)
                    if data_consulta == hoje_str:
                        consultas_hoje.append(consulta)
                    if data_consulta.startswith(mes_atual):
                        consultas_mes.append(consulta)
        
        consultas_ativas = [
            item for item in consultas_hoje
            if item.get('status') not in {'cancelado', 'cancelada'}
        ]
        confirmados = [
            item for item in consultas_ativas
            if item.get('status') in {'confirmado', 'confirmada'} or item.get('confirmado_em')
        ]
        aguardando_confirmacao = [item for item in consultas_ativas if item not in confirmados]
        cancelados_hoje = len(consultas_hoje) - len(consultas_ativas)
        total_atendimentos = len(consultas_ativas)
        
        # Calcular valores do mês. Decimal, não float: somar dinheiro em
        # binário acumula centavo perdido no fechamento do mês.
        total_recebido = Decimal('0.00')
        total_pendente = Decimal('0.00')

        for consulta in consultas_mes:
            # `valor_cobrado` é o preço acertado no dia do agendamento. O valor
            # do cadastro é o de hoje: preferi-lo reescreveria o histórico
            # sempre que o serviço mudasse de preço.
            valor = consulta.get('valor_cobrado')
            if valor is None:
                valor = (consulta.get('procedimento') or {}).get('valor')
            valor = dinheiro(valor) or Decimal('0.00')
            if consulta.get('status') == 'concluido':
                total_recebido += valor
            elif consulta.get('status') == 'pendente':
                total_pendente += valor
        
        # Próximos agendamentos (ordenar por horário)
        proximos = sorted(consultas_ativas, key=lambda x: x.get('intervalo', ''))[:5]
        
        return {
            "total_atendimentos": total_atendimentos,
            "confirmados": len(confirmados),
            "aguardando_confirmacao": len(aguardando_confirmacao),
            "cancelados_hoje": cancelados_hoje,
            "total_recebido": dinheiro_para_json(total_recebido),
            "total_pendente": dinheiro_para_json(total_pendente),
            "proximos_agendamentos": proximos
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar estatísticas: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

# ===== CLIENTES =====
@api_router.get("/clientes")
async def get_clientes(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('cliente').select('*')
        query = query.eq('id_info_clinica', clinica_id)
        result = query.order('nome').execute()
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar clientes: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.get("/clientes/{cliente_id}")
async def get_cliente(cliente_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('cliente').select('*')
        query = query.eq('id_info_clinica', clinica_id)
        result = query.eq('id', cliente_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar cliente: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/clientes")
async def create_cliente(cliente: ClienteCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = cliente.model_dump()
        if data.get('data_nascimento'):
            data['data_nascimento'] = data['data_nascimento'].isoformat()
        data['created_at'] = datetime.utcnow().isoformat()
        data['id_info_clinica'] = clinica_id
        
        result = supabase.table('cliente').insert(data).execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar cliente: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.put("/clientes/{cliente_id}")
async def update_cliente(cliente_id: int, cliente: ClienteUpdate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = cliente.model_dump(exclude_none=True)
        if data.get('data_nascimento'):
            data['data_nascimento'] = data['data_nascimento'].isoformat()
        
        query = supabase.table('cliente').update(data).eq('id', cliente_id).eq('id_info_clinica', clinica_id)
        result = query.execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar cliente: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.delete("/clientes/{cliente_id}")
async def delete_cliente(cliente_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        supabase.table('cliente').delete().eq('id', cliente_id).eq('id_info_clinica', clinica_id).execute()
        return {"message": "Cliente deletado com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        raise_if_in_use(e, "Cliente")
        logging.error(f"Erro ao deletar cliente: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

# ===== PROFISSIONAIS =====
@api_router.get("/profissionais")
async def get_profissionais(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('profissional').select('*, area_atuacao(*)')
        query = query.eq('id_info_clinica', clinica_id)
        result = query.order('nome').execute()
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar profissionais: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.get("/profissionais/{prof_id}")
async def get_profissional(prof_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('profissional').select('*, area_atuacao(*)')
        query = query.eq('id_info_clinica', clinica_id)
        result = query.eq('id', prof_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Profissional não encontrado")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar profissional: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/profissionais")
async def create_profissional(prof: ProfissionalCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = prof.model_dump()
        data['id_info_clinica'] = clinica_id
        result = supabase.table('profissional').insert(data).execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar profissional: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/profissionais/{prof_id}/procedimentos")
async def add_procedimentos_profissional(prof_id: int, procedimentos: List[int], current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        assert_owned_record('profissional', prof_id, clinica_id, 'Profissional')
        for proc_id in procedimentos:
            assert_owned_record('procedimento', proc_id, clinica_id, 'Serviço')

        # Nota: profissional_procedimento é tabela de relação N:N, não tem id_info_clinica
        # Deletar relações antigas
        supabase.table('profissional_procedimento').delete().eq('id_profissional', prof_id).execute()
        
        # Inserir novas relações
        if procedimentos:
            relations = [{"id_profissional": prof_id, "id_procedimento": proc_id, "especialista": False} for proc_id in procedimentos]
            supabase.table('profissional_procedimento').insert(relations).execute()
        
        return {"message": "Procedimentos atualizados"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar procedimentos: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.get("/profissionais/{prof_id}/procedimentos")
async def get_procedimentos_profissional(prof_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        assert_owned_record('profissional', prof_id, clinica_id, 'Profissional')

        # Nota: profissional_procedimento não tem id_info_clinica
        result = supabase.table('profissional_procedimento').select('id_procedimento').eq('id_profissional', prof_id).execute()
        return [r['id_procedimento'] for r in result.data]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar procedimentos: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.put("/profissionais/{prof_id}")
async def update_profissional(prof_id: int, prof: ProfissionalUpdate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = prof.model_dump(exclude_none=True)
        query = supabase.table('profissional').update(data).eq('id', prof_id).eq('id_info_clinica', clinica_id)
        result = query.execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar profissional: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.delete("/profissionais/{prof_id}")
async def delete_profissional(prof_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        supabase.table('profissional').delete().eq('id', prof_id).eq('id_info_clinica', clinica_id).execute()
        return {"message": "Profissional deletado com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        raise_if_in_use(e, "Profissional")
        logging.error(f"Erro ao deletar profissional: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

# ===== DISPONIBILIDADE PROFISSIONAL =====
@api_router.get("/profissionais/{prof_id}/disponibilidade")
async def get_disponibilidade_profissional(prof_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        assert_owned_record('profissional', prof_id, clinica_id, 'Profissional')
        result = supabase.table('disponibilidade_profissional').select('*').eq('id_profissional', prof_id).order('dia_semana').execute()
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar disponibilidade: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/profissionais/{prof_id}/disponibilidade")
async def save_disponibilidade_profissional(prof_id: int, disponibilidades: List[DisponibilidadeItem], current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        assert_owned_record('profissional', prof_id, clinica_id, 'Profissional')

        # Montar e VALIDAR tudo antes de apagar. Este endpoint é um delete
        # seguido de insert, sem transação: se a validação acontecesse depois,
        # um horário invertido apagaria a agenda do profissional e não gravaria
        # nada no lugar.
        records = []
        for d in disponibilidades:
            hora_inicio = d.hora_inicio if len(d.hora_inicio) == 8 else d.hora_inicio + ':00'
            hora_fim = d.hora_fim if len(d.hora_fim) == 8 else d.hora_fim + ':00'
            if hora_fim <= hora_inicio:
                raise HTTPException(
                    status_code=400,
                    detail=f"Horário inválido: o fim ({d.hora_fim}) precisa ser depois do início ({d.hora_inicio})",
                )
            if not 1 <= d.dia_semana <= 7:
                raise HTTPException(status_code=400, detail="Dia da semana inválido")
            records.append({
                "id_profissional": prof_id,
                "dia_semana": d.dia_semana,
                "hora_inicio": hora_inicio,
                "hora_fim": hora_fim
            })

        # Deletar disponibilidades antigas
        supabase.table('disponibilidade_profissional').delete().eq('id_profissional', prof_id).execute()

        if records:
            supabase.table('disponibilidade_profissional').insert(records).execute()
        
        return {"message": "Disponibilidade atualizada com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao salvar disponibilidade: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.delete("/profissionais/{prof_id}/disponibilidade/{disp_id}")
async def delete_disponibilidade(prof_id: int, disp_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        assert_owned_record('profissional', prof_id, clinica_id, 'Profissional')
        supabase.table('disponibilidade_profissional').delete().eq('id', disp_id).eq('id_profissional', prof_id).execute()
        return {"message": "Disponibilidade deletada com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao deletar disponibilidade: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

# ===== PROCEDIMENTOS =====
@api_router.get("/procedimentos")
async def get_procedimentos(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('procedimento').select('*')
        query = query.eq('id_info_clinica', clinica_id)
        result = query.order('nome').execute()
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar procedimentos: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/procedimentos")
async def create_procedimento(proc: ProcedimentoCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = proc.model_dump()
        # Decimal não é serializável em JSON e float reintroduz arredondamento:
        # o texto é convertido para numeric pelo PostgreSQL sem perda.
        data['valor'] = dinheiro_para_banco(data['valor'])
        data['id_info_clinica'] = clinica_id
        result = supabase.table('procedimento').insert(data).execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar procedimento: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.put("/procedimentos/{proc_id}")
async def update_procedimento(proc_id: int, proc: ProcedimentoUpdate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = proc.model_dump(exclude_none=True)
        if 'valor' in data:
            data['valor'] = dinheiro_para_banco(data['valor'])
        query = supabase.table('procedimento').update(data).eq('id', proc_id).eq('id_info_clinica', clinica_id)
        result = query.execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar procedimento: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.delete("/procedimentos/{proc_id}")
async def delete_procedimento(proc_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        supabase.table('procedimento').delete().eq('id', proc_id).eq('id_info_clinica', clinica_id).execute()
        return {"message": "Procedimento deletado com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        raise_if_in_use(e, "Procedimento")
        logging.error(f"Erro ao deletar procedimento: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.get("/consultas")
async def get_consultas(data_inicio: Optional[str] = None, data_fim: Optional[str] = None, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('consulta').select('*, cliente(*), profissional(*), procedimento(*)')
        query = query.eq('id_info_clinica', clinica_id)
        result = query.execute()
        
        consultas = result.data or []
        
        if data_inicio and consultas:
            import re
            filtered = []
            for consulta in consultas:
                intervalo_str = consulta.get('intervalo', '')
                if intervalo_str:
                    match = re.search(r'(\d{4}-\d{2}-\d{2})', intervalo_str)
                    if match:
                        consulta_data = match.group(1)
                        if consulta_data == data_inicio:
                            filtered.append(consulta)
            return filtered
        
        return consultas
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar consultas: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/consultas")
async def create_consulta(consulta: ConsultaCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        assert_owned_record('profissional', consulta.id_profissional, clinica_id, 'Profissional')
        assert_owned_record('cliente', consulta.id_cliente, clinica_id, 'Cliente')
        procedimento = get_procedimento_da_empresa(consulta.id_procedimento, clinica_id)
        data = consulta.model_dump()

        # `montar_intervalo` resolve horário sem offset como local de São Paulo.
        # Interpretar como UTC deslocava o agendamento em três horas em silêncio.
        data['intervalo'] = montar_intervalo(data['data_inicio'], data['duracao_minutos'])
        del data['data_inicio']
        del data['duracao_minutos']

        # Preço congelado no ato do agendamento: reajustar o serviço depois não
        # reescreve o histórico financeiro já emitido.
        data['valor_cobrado'] = dinheiro_para_banco(procedimento.get('valor'))
        data['id_info_clinica'] = clinica_id

        result = supabase.table('consulta').insert(data).execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar consulta: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.put("/consultas/{consulta_id}")
async def update_consulta(consulta_id: int, consulta: ConsultaUpdate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = consulta.model_dump(exclude_none=True)
        assert_owned_record('consulta', consulta_id, clinica_id, 'Agendamento')
        for field, table, label in (
            ('id_profissional', 'profissional', 'Profissional'),
            ('id_cliente', 'cliente', 'Cliente'),
            ('id_procedimento', 'procedimento', 'Serviço'),
        ):
            if field in data:
                assert_owned_record(table, data[field], clinica_id, label)

        # Trocar o serviço troca o preço do atendimento: manter o valor antigo
        # deixaria a consulta com o preço de outro procedimento.
        if 'id_procedimento' in data:
            procedimento = get_procedimento_da_empresa(data['id_procedimento'], clinica_id)
            data['valor_cobrado'] = dinheiro_para_banco(procedimento.get('valor'))
        
        if 'data_inicio' in data and 'duracao_minutos' in data:
            data['intervalo'] = montar_intervalo(data['data_inicio'], data['duracao_minutos'])
            del data['data_inicio']
            del data['duracao_minutos']

        for campo in ('confirmado_em', 'cancelado_em'):
            if data.get(campo):
                data[campo] = com_fuso_de_negocio(data[campo]).isoformat()

        query = supabase.table('consulta').update(data).eq('id', consulta_id).eq('id_info_clinica', clinica_id)
        result = query.execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar consulta: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.delete("/consultas/{consulta_id}")
async def delete_consulta(consulta_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        supabase.table('consulta').delete().eq('id', consulta_id).eq('id_info_clinica', clinica_id).execute()
        return {"message": "Consulta deletada com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao deletar consulta: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

# ===== BLOQUEIOS =====
@api_router.get("/bloqueios")
async def get_bloqueios(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('agenda_bloqueio').select('*, profissional(*)')
        query = query.eq('id_info_clinica', clinica_id)
        result = query.execute()
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar bloqueios: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/bloqueios")
async def create_bloqueio(bloqueio: BloqueioCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        assert_owned_record('profissional', bloqueio.id_profissional, clinica_id, 'Profissional')
        data = bloqueio.model_dump()
        data_inicio = com_fuso_de_negocio(data['data_inicio'])
        data_fim = com_fuso_de_negocio(data['data_fim'])
        if data_fim <= data_inicio:
            raise HTTPException(status_code=400, detail="O fim do bloqueio precisa ser depois do início")
        data['intervalo'] = f'["{data_inicio.isoformat()}","{data_fim.isoformat()}")'
        del data['data_inicio']
        del data['data_fim']
        
        data['id_info_clinica'] = clinica_id
        
        result = supabase.table('agenda_bloqueio').insert(data).execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar bloqueio: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.delete("/bloqueios/{bloqueio_id}")
async def delete_bloqueio(bloqueio_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        supabase.table('agenda_bloqueio').delete().eq('id', bloqueio_id).eq('id_info_clinica', clinica_id).execute()
        return {"message": "Bloqueio deletado com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao deletar bloqueio: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

# ===== ÁREAS DE ATUAÇÃO =====
# `area_atuacao` é catálogo GLOBAL, compartilhado por todas as empresas. Só a
# leitura é exposta: a rota de criação foi removida porque qualquer usuário
# autenticado passava a escrever numa lista que todos os clientes enxergam.
# Incluir um rótulo novo é operação de banco (`scripts/ajustes_ai_api.sql`).
@api_router.get("/areas-atuacao")
async def get_areas_atuacao(current_user: dict = Depends(verify_token)):
    try:
        result = supabase.table('area_atuacao').select('*').order('nome').execute()
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar áreas de atuação: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

# ===== CONFIGURAÇÕES =====
# Ordem fixa do checklist: é a ordem dos passos do onboarding, e o painel a usa
# para apontar o primeiro passo pendente. Mudar a ordem aqui muda a tela.
ITENS_IMPLANTACAO = ('negocio', 'horarios', 'servicos', 'equipe', 'atendente', 'whatsapp')

# Mínimo para ligar o atendimento. `negocio` e `atendente` ficam de fora porque
# o fluxo tem padrão para nome e tom, e porque uma recepção sem o texto do
# negócio ainda marca horário — ela só não sabe responder o que está fora do
# catálogo. Sem horário, serviço, profissional agendável ou WhatsApp, ela não
# consegue marcar nada, e aí ligar seria pior do que não ter.
ITENS_PARA_ATIVAR = ('horarios', 'servicos', 'equipe', 'whatsapp')


def equipe_agendavel(clinica_id: int) -> bool:
    """Existe profissional que a automação consiga oferecer de verdade.

    Ativo, com pelo menos um serviço vinculado E pelo menos uma faixa de
    disponibilidade. Sem os dois, `fn_buscar_slots` devolve zero horário para
    sempre e o cliente ouve "sem vaga" indefinidamente.
    """
    profissionais = (
        supabase.table('profissional')
        .select('id')
        .eq('id_info_clinica', clinica_id)
        .eq('ativo', True)
        .execute()
    )
    ids = [linha['id'] for linha in (profissionais.data or []) if linha.get('id')]
    if not ids:
        return False

    vinculos = (
        supabase.table('profissional_procedimento')
        .select('id_profissional')
        .in_('id_profissional', ids)
        .execute()
    )
    disponibilidades = (
        supabase.table('disponibilidade_profissional')
        .select('id_profissional')
        .in_('id_profissional', ids)
        .execute()
    )
    com_servico = {linha.get('id_profissional') for linha in (vinculos.data or [])}
    com_horario = {linha.get('id_profissional') for linha in (disponibilidades.data or [])}
    return bool(com_servico & com_horario)


async def montar_implantacao(clinica_id: int, user_id: Optional[int]) -> dict:
    """Checklist de implantação calculado no servidor.

    Única fonte de verdade de `GET /config/implantacao` e da recusa de
    `PUT /config/automacao`: se o painel calculasse por conta própria, "falta
    configurar" viraria opinião do navegador.
    """
    empresa = (
        supabase.table('info_clinica')
        .select('nome, descricao, assistente_nome, automacao_ativa')
        .eq('id', clinica_id)
        .limit(1)
        .execute()
    )
    dados = empresa.data[0] if empresa.data else {}

    horarios = (
        supabase.table('horario_clinica').select('id')
        .eq('id_info_clinica', clinica_id).limit(1).execute()
    )
    servicos = (
        supabase.table('procedimento').select('id')
        .eq('id_info_clinica', clinica_id).limit(1).execute()
    )

    itens = {
        # O passo "Negócio" inclui o texto que a recepção usa para responder o
        # que não está no catálogo (pagamento, convênio, estacionamento, o que
        # levar na primeira sessão). Sem ele o campo nasceria morto: é opcional
        # e fica no primeiro passo, que ninguém revisita por conta própria.
        # Não bloqueia a ativação — só aponta o passo no painel.
        'negocio': bool((dados.get('nome') or '').strip())
        and bool((dados.get('descricao') or '').strip()),
        'horarios': bool(horarios.data),
        'servicos': bool(servicos.data),
        'equipe': equipe_agendavel(clinica_id),
        'atendente': bool((dados.get('assistente_nome') or '').strip()),
        'whatsapp': await whatsapp_conectado(user_id),
    }
    pendencias = [item for item in ITENS_IMPLANTACAO if not itens[item]]
    return {
        **itens,
        "automacao_ativa": bool(dados.get('automacao_ativa')),
        "pendencias": pendencias,
        # A flag de automação não entra: ela é o resultado do checklist, não
        # um item dele.
        "completo": not pendencias,
    }


@api_router.get("/config/implantacao")
async def get_implantacao(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = current_user.get('id_info_clinica')
        if not clinica_id:
            raise HTTPException(status_code=404, detail="Empresa não encontrada")
        return await montar_implantacao(int(clinica_id), current_user.get('user_id'))
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao montar o checklist de implantação: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")


@api_router.put("/config/automacao")
async def update_automacao(corpo: AutomacaoUpdate, current_user: dict = Depends(verify_token)):
    """Liga e desliga o atendimento automático desta empresa.

    Desligar é sempre aceito — é o botão de emergência. Ligar exige o mínimo
    pronto: uma atendente que não consegue marcar nada é pior que nenhuma.
    """
    try:
        clinica_id = get_user_clinica_id(current_user)

        if corpo.ativa:
            checklist = await montar_implantacao(clinica_id, current_user.get('user_id'))
            faltando = [item for item in checklist['pendencias'] if item in ITENS_PARA_ATIVAR]
            if faltando:
                return JSONResponse(
                    status_code=409,
                    content={"detail": "Falta configurar antes de ativar.", "pendencias": faltando},
                )

        result = (
            supabase.table('info_clinica')
            .update({"automacao_ativa": corpo.ativa})
            .eq('id', clinica_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=500, detail="Erro interno")
        # O valor persistido, não o pedido: o painel mostra o que o banco tem.
        return {"ativa": bool(result.data[0].get('automacao_ativa'))}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao alterar o atendimento automático: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")


@api_router.get("/config/horarios-clinica")
async def get_horarios_clinica(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('horario_clinica').select('*')
        query = query.eq('id_info_clinica', clinica_id)
        result = query.order('dia_semana').execute()
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar horários da clínica: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/config/horarios-clinica")
async def create_horario_clinica(horario: HorarioClinicaCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = horario.model_dump()
        # hora_inicio e hora_fim já são strings "HH:MM", adicionar :00 para formato TIME
        if data['hora_inicio'] and ':' in data['hora_inicio'] and len(data['hora_inicio']) == 5:
            data['hora_inicio'] = data['hora_inicio'] + ':00'
        if data['hora_fim'] and ':' in data['hora_fim'] and len(data['hora_fim']) == 5:
            data['hora_fim'] = data['hora_fim'] + ':00'
        data['id_info_clinica'] = clinica_id
        result = supabase.table('horario_clinica').insert(data).execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar horário da clínica: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.get("/config/info-clinica")
async def get_info_clinica(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = current_user.get('id_info_clinica')
        if not clinica_id:
            return {}
        result = supabase.table('info_clinica').select('*').eq('id', clinica_id).execute()
        return result.data[0] if result.data else {}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar info da clínica: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.put("/config/info-clinica/{info_id}")
async def update_info_clinica(info_id: int, info: InfoClinicaUpdate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        if info_id != clinica_id:
            raise HTTPException(status_code=404, detail="Empresa não encontrada")
        data = info.model_dump(exclude_none=True)
        # `null` limpa a identidade da assistente e o texto do negócio. As três
        # colunas aceitam nulo; nas demais, null continua sendo ignorado para
        # não gravar vazio em coluna obrigatória.
        # `descricao` precisa disso porque é o único campo que o dono pode
        # querer TIRAR DO AR: sem a linha, apagar no painel não apagava nada e o
        # texto continuava sendo respondido no WhatsApp — uma chave PIX antiga
        # inclusive.
        # `lembrete_horas` entra pela mesma razao: nula E o valor que DESLIGA o
        # lembrete. Sem esta linha o dono liga uma vez e nunca mais desliga.
        for campo in ('assistente_nome', 'assistente_tom', 'descricao', 'lembrete_horas'):
            if campo in info.model_fields_set:
                data[campo] = getattr(info, campo)
        # `automacao_ativa` não entra aqui de propósito: ligar o atendimento
        # tem rota própria, que confere o checklist antes.
        result = supabase.table('info_clinica').update(data).eq('id', clinica_id).execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar info da clínica: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/config/info-clinica")
async def create_info_clinica(info: InfoClinicaCreate, current_user: dict = Depends(verify_token)):
    try:
        user_id = current_user.get('user_id')
        if not user_id:
            raise HTTPException(status_code=401, detail="Sessão inválida")
        if current_user.get('id_info_clinica'):
            raise HTTPException(status_code=409, detail="Empresa já configurada")
        data = info.model_dump()
        data['onboarding_completo'] = False
        
        # Criar clínica
        result = supabase.table('info_clinica').insert(data).execute()
        clinica_id = result.data[0]['id']
        
        # Vincular usuário à clínica
        supabase.table('usuarios').update({'id_info_clinica': clinica_id}).eq('id', user_id).execute()

        response = result.data[0]
        response['access_token'] = create_access_token({
            "user_id": user_id,
            "email": current_user.get('email'),
            "id_info_clinica": clinica_id,
            "role": current_user.get('role', 'owner'),
        })
        return response
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar info da clínica: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.put("/config/horarios-clinica/{horario_id}")
async def update_horario_clinica(horario_id: int, horario: HorarioClinicaCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = horario.model_dump()
        if data['hora_inicio'] and ':' in data['hora_inicio'] and len(data['hora_inicio']) == 5:
            data['hora_inicio'] = data['hora_inicio'] + ':00'
        if data['hora_fim'] and ':' in data['hora_fim'] and len(data['hora_fim']) == 5:
            data['hora_fim'] = data['hora_fim'] + ':00'
        query = supabase.table('horario_clinica').update(data).eq('id', horario_id).eq('id_info_clinica', clinica_id)
        result = query.execute()
        return result.data[0] if result.data else {}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao atualizar horário da clínica: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.delete("/config/horarios-clinica/{horario_id}")
async def delete_horario_clinica(horario_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        supabase.table('horario_clinica').delete().eq('id', horario_id).eq('id_info_clinica', clinica_id).execute()
        return {"message": "Horário deletado com sucesso"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao deletar horário: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

# ===== EVOLUTION API (WhatsApp) =====
# Regra do painel para tudo que fala com a Evolution: erro do provedor nunca
# atravessa. Nem a mensagem, nem a URL, nem a chave — o dono do negócio não tem
# o que fazer com isso e o log guardaria credencial.
def instancia_do_usuario(user_id: Optional[int]) -> Optional[str]:
    """Instância da Evolution deste usuário, ou None se ainda não existe."""
    if not user_id:
        return None
    result = (
        supabase.table('usuarios')
        .select('instance_name')
        .eq('id', user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0].get('instance_name') or None


def montar_nome_instancia(user_id: int, nome: str) -> str:
    """`agm_{id}_{nome sanitizado}` — mesma regra que o cadastro usava.

    O id na frente é o que garante unicidade; o nome só existe para o operador
    reconhecer a instância. Por isso o painel não exibe este valor.
    """
    apelido = regex_module.sub(r'[^a-zA-Z0-9]', '', (nome or '').lower())[:20]
    return f"agm_{user_id}_{apelido}"


async def estado_da_conexao(instance_name: str) -> str:
    """Estado da instância na Evolution. Nunca levanta.

    O painel precisa responder mesmo com o provedor fora do ar: quem lê trata
    "não conectado" como estado, não como erro de sistema.
    """
    import evolution_api
    try:
        estado = await evolution_api.get_connection_state(instance_name)
    except Exception as erro:
        logging.error("Evolution indisponível ao ler o estado (%s)", type(erro).__name__)
        return 'disconnected'
    if not isinstance(estado, dict):
        return 'unknown'
    # A Evolution devolve {"instance": {"instanceName": "...", "state": "open"}}
    instancia = estado.get('instance') if isinstance(estado.get('instance'), dict) else {}
    return instancia.get('state') or estado.get('state') or 'unknown'


async def numero_conectado(instance_name: str) -> Optional[str]:
    """Número conectado, só dígitos, sem o sufixo `@s.whatsapp.net`.

    É o que o painel mostra para o dono testar a atendente de outro telefone.
    Nunca levanta e nunca vai para log: é dado pessoal.
    """
    import evolution_api
    try:
        instancias = await evolution_api.fetch_instances(instance_name)
    except Exception as erro:
        logging.error("Evolution indisponível ao ler o número (%s)", type(erro).__name__)
        return None
    for item in instancias:
        if not isinstance(item, dict):
            continue
        dados = item.get('instance') if isinstance(item.get('instance'), dict) else item
        jid = dados.get('ownerJid') or dados.get('owner')
        if jid:
            return regex_module.sub(r'\D', '', str(jid)) or None
    return None


async def whatsapp_conectado(user_id: Optional[int]) -> bool:
    """Item `whatsapp` do checklist: só `open` conta, falha vira `false`."""
    instancia = instancia_do_usuario(user_id)
    if not instancia:
        return False
    return await estado_da_conexao(instancia) == 'open'


async def garantir_instancia(user_id: int) -> tuple:
    """Instância existente na Evolution, com webhook registrado. Idempotente.

    Devolve `(nome, criada)`. Consultar a Evolution antes de criar cobre os
    três casos com o mesmo caminho: usuário sem instância, instância gravada
    que o provedor não conhece mais (reinstalação, limpeza) e instância já
    pronta. Recriar sempre com o MESMO nome preserva o vínculo com a empresa,
    que a automação deriva de `usuarios.instance_name`.
    """
    import evolution_api
    result = (
        supabase.table('usuarios')
        .select('nome, instance_name')
        .eq('id', user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=401, detail="Sessão inválida")

    usuario = result.data[0]
    gravada = usuario.get('instance_name') or None
    instancia = gravada or montar_nome_instancia(user_id, usuario.get('nome') or '')

    try:
        criada = not await evolution_api.fetch_instances(instancia)
        if criada:
            # `create_instance` registra o webhook em seguida.
            await evolution_api.create_instance(instancia)
    except Exception as erro:
        logging.error("Falha ao preparar a instância do WhatsApp (%s)", type(erro).__name__)
        raise HTTPException(
            status_code=503,
            detail="Não foi possível preparar o WhatsApp agora.",
        )

    if instancia != gravada:
        supabase.table('usuarios').update(
            {"instance_name": instancia}
        ).eq('id', user_id).execute()

    return instancia, criada


@api_router.post("/whatsapp/instancia")
async def criar_instancia_whatsapp(current_user: dict = Depends(verify_token)):
    """Prepara a instância do WhatsApp do usuário. Pode ser chamada de novo."""
    try:
        user_id = current_user.get('user_id')
        if not user_id:
            raise HTTPException(status_code=401, detail="Sessão inválida")
        instancia, criada = await garantir_instancia(user_id)
        return {"instance": instancia, "criada": criada}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao preparar instância WhatsApp: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")


@api_router.get("/whatsapp/status")
async def get_whatsapp_status(current_user: dict = Depends(verify_token)):
    """Retorna o status da conexão WhatsApp"""
    try:
        instance_name = instancia_do_usuario(current_user.get('user_id'))
        if not instance_name:
            return {"connected": False, "instance": None, "state": "not_configured", "numero": None}

        connection_state = await estado_da_conexao(instance_name)
        conectado = connection_state == 'open'
        return {
            "connected": conectado,
            "instance": instance_name,
            "state": connection_state,
            # Só faz sentido perguntar o número de uma sessão aberta.
            "numero": await numero_conectado(instance_name) if conectado else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao buscar status WhatsApp: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.get("/whatsapp/qrcode")
async def get_whatsapp_qrcode(current_user: dict = Depends(verify_token)):
    """Gera QR Code para conectar WhatsApp"""
    import evolution_api
    try:
        user_id = current_user.get('user_id')
        if not user_id:
            raise HTTPException(status_code=401, detail="Sessão inválida")

        # Sem instância, criar é o próximo passo óbvio: recusar com 400 deixava
        # o passo do WhatsApp sem saída para quem se cadastrou antes desta fase.
        instance_name = instancia_do_usuario(user_id)
        if not instance_name:
            instance_name, _ = await garantir_instancia(user_id)

        qr_data = await evolution_api.connect_instance(instance_name)
        
        # Evolution API retorna base64 diretamente na raiz
        qrcode = None
        code = None
        
        if isinstance(qr_data, dict):
            # Tentar diferentes campos possíveis
            qrcode = qr_data.get('base64')
            if not qrcode and 'qrcode' in qr_data:
                qrcode_obj = qr_data.get('qrcode')
                if isinstance(qrcode_obj, dict):
                    qrcode = qrcode_obj.get('base64')
                elif isinstance(qrcode_obj, str):
                    qrcode = qrcode_obj
            code = qr_data.get('code') or qr_data.get('pairingCode')
        
        return {
            "instance": instance_name,
            "qrcode": qrcode,
            "code": code,
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao gerar QR Code: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/whatsapp/restart")
async def restart_whatsapp(current_user: dict = Depends(verify_token)):
    """Reinicia a instância WhatsApp"""
    import evolution_api
    try:
        instance_name = instancia_do_usuario(current_user.get('user_id'))
        if not instance_name:
            raise HTTPException(status_code=400, detail="Instância não configurada")

        await evolution_api.restart_instance(instance_name)
        
        return {"message": "Instância reiniciada com sucesso", "instance": instance_name}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao reiniciar instância: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/whatsapp/disconnect")
async def disconnect_whatsapp(current_user: dict = Depends(verify_token)):
    """Desconecta a instância WhatsApp"""
    import evolution_api
    try:
        instance_name = instancia_do_usuario(current_user.get('user_id'))
        if not instance_name:
            raise HTTPException(status_code=400, detail="Instância não configurada")

        await evolution_api.logout_instance(instance_name)
        
        return {"message": "Instância desconectada com sucesso", "instance": instance_name}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao desconectar instância: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

# Include router
app.include_router(api_router)

# Rotas determinísticas da automação, com token de máquina próprio e empresa
# derivada da instância do WhatsApp.
app.include_router(ai_api.router)
ai_api.registrar_tratadores(app)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[
        origin.strip()
        for origin in os.getenv('CORS_ORIGINS', 'http://localhost:3000').split(',')
        if origin.strip()
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Adicionar rota de health check
@app.get("/health")
async def health_check():
    return {"status": "ok", "message": "Backend is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="localhost", port=8000, reload=True)

logger = logging.getLogger(__name__)
