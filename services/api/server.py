from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from supabase import create_client, Client
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime, date, time, timedelta, timezone

# Timezone de São Paulo (UTC-03:00)
SAO_PAULO_TZ = timezone(timedelta(hours=-3))
import jwt
from passlib.context import CryptContext
import re as regex_module

ROOT_DIR = Path(__file__).parent

env_path = ROOT_DIR / '.env'
if env_path.exists():
    load_dotenv(env_path)

from settings import (
    JWT_ALGORITHM,
    JWT_EXPIRATION_HOURS,
    JWT_SECRET,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
)

# A chave administrativa fica somente no backend. O isolamento por empresa é
# reforçado em todas as consultas abaixo e deve ser complementado por RLS.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

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
    valor: float
    orientacoes: Optional[str] = None

class ProcedimentoUpdate(BaseModel):
    nome: Optional[str] = None
    descricao: Optional[str] = None
    duracao_minutos: Optional[int] = None
    valor: Optional[float] = None
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
    confirmado_em: Optional[date] = None
    cancelado_em: Optional[date] = None
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

# Área de Atuação
class AreaAtuacaoCreate(BaseModel):
    nome: str

# Horário Clínica
class HorarioClinicaCreate(BaseModel):
    dia_semana: int
    hora_inicio: str
    hora_fim: str

# Info Clínica
class InfoClinicaUpdate(BaseModel):
    nome: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None
    descricao: Optional[str] = None
    endereco: Optional[str] = None
    onboarding_completo: Optional[bool] = None
    mensagem_lembrete: Optional[str] = None

class InfoClinicaCreate(BaseModel):
    nome: str
    telefone: Optional[str] = None
    email: Optional[str] = None
    descricao: Optional[str] = None
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

# ===== AUTH ROUTES =====
@api_router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    try:
        # Buscar usuário no Supabase
        result = supabase.table('usuarios').select('*').eq('email', request.email).execute()
        
        if not result.data:
            raise HTTPException(status_code=401, detail="Credenciais inválidas")
        
        user = result.data[0]
        
        if not verify_password(request.senha, user['senha_hash']):
            raise HTTPException(status_code=401, detail="Credenciais inválidas")
        
        # Verificar status do trial
        status_assinatura = user.get('status_assinatura', 'trial')
        trial_fim = user.get('trial_fim')
        trial_expirado = False
        dias_restantes = 0
        
        if status_assinatura == 'trial' and trial_fim:
            from datetime import datetime as dt
            try:
                trial_fim_dt = dt.fromisoformat(trial_fim.replace('Z', '+00:00'))
                agora = dt.utcnow().replace(tzinfo=trial_fim_dt.tzinfo) if trial_fim_dt.tzinfo else dt.utcnow()
                if agora > trial_fim_dt:
                    trial_expirado = True
                    status_assinatura = 'expirado'
                    # Atualizar status no banco
                    supabase.table('usuarios').update({"status_assinatura": "expirado"}).eq('id', user['id']).execute()
                else:
                    dias_restantes = (trial_fim_dt - agora).days
            except:
                pass
        
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
                "status_assinatura": status_assinatura,
                "trial_expirado": trial_expirado,
                "dias_restantes": dias_restantes,
                "trial_fim": trial_fim
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro no login: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

@api_router.post("/auth/register")
async def register(request: UsuarioCreate):
    try:
        import evolution_api
        import re
        
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
        
        # Criar instância Evolution API
        # Nome: user_id + nome sanitizado (sem espaços e caracteres especiais)
        nome_sanitizado = re.sub(r'[^a-zA-Z0-9]', '', request.nome.lower())[:20]
        instance_name = f"agm_{user_id}_{nome_sanitizado}"
        
        try:
            await evolution_api.create_instance(instance_name)
            # Atualizar usuário com o nome da instância
            supabase.table('usuarios').update({"instance_name": instance_name}).eq('id', user_id).execute()
        except Exception as evo_error:
            logging.warning(f"Erro ao criar instância Evolution (usuário criado sem instância): {str(evo_error)}")
        
        return {"message": "Usuário criado com sucesso", "id": user_id, "instance_name": instance_name}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro no registro: {str(e)}")
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
        
        # Calcular valores do mês
        total_recebido = 0.0
        total_pendente = 0.0
        
        for consulta in consultas_mes:
            valor = consulta.get('procedimento', {}).get('valor', 0) or 0
            if consulta.get('status') == 'concluido':
                total_recebido += float(valor)
            elif consulta.get('status') == 'pendente':
                total_pendente += float(valor)
        
        # Próximos agendamentos (ordenar por horário)
        proximos = sorted(consultas_ativas, key=lambda x: x.get('intervalo', ''))[:5]
        
        return {
            "total_atendimentos": total_atendimentos,
            "confirmados": len(confirmados),
            "aguardando_confirmacao": len(aguardando_confirmacao),
            "cancelados_hoje": cancelados_hoje,
            "total_recebido": total_recebido,
            "total_pendente": total_pendente,
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

        # Deletar disponibilidades antigas
        supabase.table('disponibilidade_profissional').delete().eq('id_profissional', prof_id).execute()
        
        # Inserir novas disponibilidades
        if disponibilidades:
            records = []
            for d in disponibilidades:
                hora_inicio = d.hora_inicio if len(d.hora_inicio) == 8 else d.hora_inicio + ':00'
                hora_fim = d.hora_fim if len(d.hora_fim) == 8 else d.hora_fim + ':00'
                records.append({
                    "id_profissional": prof_id,
                    "dia_semana": d.dia_semana,
                    "hora_inicio": hora_inicio,
                    "hora_fim": hora_fim
                })
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
        assert_owned_record('procedimento', consulta.id_procedimento, clinica_id, 'Serviço')
        data = consulta.model_dump()
        data_inicio = data['data_inicio']
        
        # Converter para timezone de São Paulo antes de extrair a string
        # Pydantic pode converter para UTC internamente, então precisamos converter de volta
        if data_inicio.tzinfo is not None:
            data_inicio_local = data_inicio.astimezone(SAO_PAULO_TZ)
            data_fim_local = data_inicio_local + timedelta(minutes=data['duracao_minutos'])
            local_str = data_inicio_local.strftime('%Y-%m-%d %H:%M:%S')
            local_fim_str = data_fim_local.strftime('%Y-%m-%d %H:%M:%S')
            data['intervalo'] = f'["{local_str}-03","{local_fim_str}-03")'
        else:
            data_fim = data_inicio + timedelta(minutes=data['duracao_minutos'])
            data['intervalo'] = f"[{data_inicio.isoformat()},{data_fim.isoformat()})"
        
        del data['data_inicio']
        del data['duracao_minutos']
        
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
        
        if 'data_inicio' in data and 'duracao_minutos' in data:
            data_inicio = data['data_inicio']
            logging.info(f"[DEBUG] data_inicio recebido: {data_inicio}")
            logging.info(f"[DEBUG] data_inicio.tzinfo: {data_inicio.tzinfo}")
            # Converter para timezone de São Paulo antes de extrair a string
            # Pydantic converte para UTC internamente, então precisamos converter de volta
            if data_inicio.tzinfo is not None:
                data_inicio_local = data_inicio.astimezone(SAO_PAULO_TZ)
                logging.info(f"[DEBUG] data_inicio_local após astimezone: {data_inicio_local}")
                data_fim_local = data_inicio_local + timedelta(minutes=data['duracao_minutos'])
                local_str = data_inicio_local.strftime('%Y-%m-%d %H:%M:%S')
                local_fim_str = data_fim_local.strftime('%Y-%m-%d %H:%M:%S')
                logging.info(f"[DEBUG] intervalo final: [{local_str}-03,{local_fim_str}-03)")
                data['intervalo'] = f'["{local_str}-03","{local_fim_str}-03")'
            else:
                data_fim = data_inicio + timedelta(minutes=data['duracao_minutos'])
                data['intervalo'] = f"[{data_inicio.isoformat()},{data_fim.isoformat()})"
            del data['data_inicio']
            del data['duracao_minutos']
        
        if data.get('confirmado_em'):
            data['confirmado_em'] = data['confirmado_em'].isoformat()
        if data.get('cancelado_em'):
            data['cancelado_em'] = data['cancelado_em'].isoformat()
        
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
        data_inicio = data['data_inicio']
        data_fim = data['data_fim']
        data['intervalo'] = f"[{data_inicio.isoformat()},{data_fim.isoformat()})"
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
# Nota: area_atuacao é uma tabela global (lookup), não filtrada por clínica
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

@api_router.post("/areas-atuacao")
async def create_area_atuacao(area: AreaAtuacaoCreate, current_user: dict = Depends(verify_token)):
    try:
        result = supabase.table('area_atuacao').insert(area.model_dump()).execute()
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao criar área de atuação: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

# ===== CONFIGURAÇÕES =====
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
@api_router.get("/whatsapp/status")
async def get_whatsapp_status(current_user: dict = Depends(verify_token)):
    """Retorna o status da conexão WhatsApp"""
    import evolution_api
    try:
        user_id = current_user.get('user_id')
        result = supabase.table('usuarios').select('instance_name').eq('id', user_id).execute()
        
        if not result.data or not result.data[0].get('instance_name'):
            return {"connected": False, "instance": None, "state": "not_configured"}
        
        instance_name = result.data[0]['instance_name']
        
        try:
            state = await evolution_api.get_connection_state(instance_name)
            # Evolution API retorna: {"instance": {"instanceName": "...", "state": "open"}}
            instance_data = state.get('instance', {})
            connection_state = instance_data.get('state', state.get('state', 'unknown'))
            return {
                "connected": connection_state == 'open',
                "instance": instance_name,
                "state": connection_state,
            }
        except Exception as inner_e:
            logging.error(f"Erro ao buscar estado: {str(inner_e)}")
            return {"connected": False, "instance": instance_name, "state": "disconnected"}
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
        result = supabase.table('usuarios').select('instance_name').eq('id', user_id).execute()
        
        if not result.data or not result.data[0].get('instance_name'):
            raise HTTPException(status_code=400, detail="Instância não configurada")
        
        instance_name = result.data[0]['instance_name']
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
        user_id = current_user.get('user_id')
        result = supabase.table('usuarios').select('instance_name').eq('id', user_id).execute()
        
        if not result.data or not result.data[0].get('instance_name'):
            raise HTTPException(status_code=400, detail="Instância não configurada")
        
        instance_name = result.data[0]['instance_name']
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
        user_id = current_user.get('user_id')
        result = supabase.table('usuarios').select('instance_name').eq('id', user_id).execute()
        
        if not result.data or not result.data[0].get('instance_name'):
            raise HTTPException(status_code=400, detail="Instância não configurada")
        
        instance_name = result.data[0]['instance_name']
        await evolution_api.logout_instance(instance_name)
        
        return {"message": "Instância desconectada com sucesso", "instance": instance_name}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Erro ao desconectar instância: {str(e)}")
        raise HTTPException(status_code=500, detail="Erro interno")

# Include router
app.include_router(api_router)

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
