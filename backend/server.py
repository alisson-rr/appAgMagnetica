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
from datetime import datetime, date, time, timedelta
import jwt
from passlib.context import CryptContext

ROOT_DIR = Path(__file__).parent

# Tentar carregar .env primeiro, se não existir, usar settings.py
env_path = ROOT_DIR / '.env'
if env_path.exists():
    load_dotenv(env_path)
else:
    import settings  # Isso vai configurar as variáveis de ambiente

# Supabase connection
supabase_url = os.environ.get('SUPABASE_URL', 'https://xyzcompanyid.supabase.co')
supabase_key = os.environ.get('SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5emNvbXBhbnlpZCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjQ2MjM5MDIyLCJleHAiOjE5NjE4MTUwMjJ9.dummy_key')

try:
    supabase: Client = create_client(supabase_url, supabase_key)
    logging.info("Supabase client criado com sucesso")
except Exception as e:
    logging.warning(f"Erro ao conectar ao Supabase: {e}. Servidor iniciará sem conexão com banco de dados.")
    supabase = None

# JWT Configuration
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = os.environ['JWT_ALGORITHM']
JWT_EXPIRATION_HOURS = int(os.environ['JWT_EXPIRATION_HOURS'])

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
    email: Optional[str] = None
    data_nascimento: Optional[date] = None
    interesses: Optional[str] = None
    id_plano_saude: Optional[int] = None
    status: Optional[str] = "ativo"

class ClienteUpdate(BaseModel):
    nome: Optional[str] = None
    whats: Optional[str] = None
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
    id_profissional: int
    dia_semana: int  # 0-6
    hora_inicio: time

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

def get_user_clinica_id(current_user: dict) -> Optional[int]:
    """Retorna o id_info_clinica do usuário logado"""
    return current_user.get('id_info_clinica')

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
                "role": user.get('role', 'owner')
            }
        )
    except Exception as e:
        logging.error(f"Erro no login: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/auth/register")
async def register(request: UsuarioCreate):
    try:
        # Verificar se usuário já existe
        result = supabase.table('usuarios').select('id').eq('email', request.email).execute()
        if result.data:
            raise HTTPException(status_code=400, detail="Email já cadastrado")
        
        # Hash da senha
        senha_hash = get_password_hash(request.senha)
        
        # Inserir usuário
        user_data = {
            "email": request.email,
            "senha_hash": senha_hash,
            "nome": request.nome,
            "created_at": datetime.utcnow().isoformat()
        }
        
        result = supabase.table('usuarios').insert(user_data).execute()
        
        return {"message": "Usuário criado com sucesso", "id": result.data[0]['id']}
    except Exception as e:
        logging.error(f"Erro no registro: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== DASHBOARD =====
@api_router.get("/dashboard/stats")
async def get_dashboard_stats(current_user: dict = Depends(verify_token)):
    try:
        import re
        from datetime import date, datetime
        
        clinica_id = get_user_clinica_id(current_user)
        
        hoje = date.today()
        hoje_str = hoje.isoformat()
        mes_atual = hoje.strftime('%Y-%m')
        
        # Buscar consultas filtradas por clínica
        query = supabase.table('consulta').select('*, cliente(*), profissional(*), procedimento(*)')
        if clinica_id:
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
        
        total_atendimentos = len(consultas_hoje)
        
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
        proximos = sorted(consultas_hoje, key=lambda x: x.get('intervalo', ''))[:5]
        
        return {
            "total_atendimentos": total_atendimentos,
            "total_recebido": total_recebido,
            "total_pendente": total_pendente,
            "proximos_agendamentos": proximos
        }
    except Exception as e:
        logging.error(f"Erro ao buscar estatísticas: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== CLIENTES =====
@api_router.get("/clientes")
async def get_clientes(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('cliente').select('*')
        if clinica_id:
            query = query.eq('id_info_clinica', clinica_id)
        result = query.order('nome').execute()
        return result.data
    except Exception as e:
        logging.error(f"Erro ao buscar clientes: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/clientes/{cliente_id}")
async def get_cliente(cliente_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('cliente').select('*')
        if clinica_id:
            query = query.eq('id_info_clinica', clinica_id)
        result = query.eq('id', cliente_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao buscar cliente: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/clientes")
async def create_cliente(cliente: ClienteCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = cliente.model_dump()
        if data.get('data_nascimento'):
            data['data_nascimento'] = data['data_nascimento'].isoformat()
        data['created_at'] = datetime.utcnow().isoformat()
        if clinica_id:
            data['id_info_clinica'] = clinica_id
        
        result = supabase.table('cliente').insert(data).execute()
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao criar cliente: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/clientes/{cliente_id}")
async def update_cliente(cliente_id: int, cliente: ClienteUpdate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = cliente.model_dump(exclude_none=True)
        if data.get('data_nascimento'):
            data['data_nascimento'] = data['data_nascimento'].isoformat()
        
        if clinica_id:
            query = supabase.table('cliente').update(data).eq('id', cliente_id).eq('id_info_clinica', clinica_id)
        else:
            query = supabase.table('cliente').update(data).eq('id', cliente_id)
        result = query.execute()
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao atualizar cliente: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/clientes/{cliente_id}")
async def delete_cliente(cliente_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        if clinica_id:
            supabase.table('cliente').delete().eq('id', cliente_id).eq('id_info_clinica', clinica_id).execute()
        else:
            supabase.table('cliente').delete().eq('id', cliente_id).execute()
        return {"message": "Cliente deletado com sucesso"}
    except Exception as e:
        logging.error(f"Erro ao deletar cliente: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== PROFISSIONAIS =====
@api_router.get("/profissionais")
async def get_profissionais(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('profissional').select('*, area_atuacao(*)')
        if clinica_id:
            query = query.eq('id_info_clinica', clinica_id)
        result = query.order('nome').execute()
        return result.data
    except Exception as e:
        logging.error(f"Erro ao buscar profissionais: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/profissionais/{prof_id}")
async def get_profissional(prof_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('profissional').select('*, area_atuacao(*)')
        if clinica_id:
            query = query.eq('id_info_clinica', clinica_id)
        result = query.eq('id', prof_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Profissional não encontrado")
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao buscar profissional: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/profissionais")
async def create_profissional(prof: ProfissionalCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = prof.model_dump()
        if clinica_id:
            data['id_info_clinica'] = clinica_id
        result = supabase.table('profissional').insert(data).execute()
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao criar profissional: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/profissionais/{prof_id}/procedimentos")
async def add_procedimentos_profissional(prof_id: int, procedimentos: List[int], current_user: dict = Depends(verify_token)):
    try:
        # Nota: profissional_procedimento é tabela de relação N:N, não tem id_info_clinica
        # Deletar relações antigas
        supabase.table('profissional_procedimento').delete().eq('id_profissional', prof_id).execute()
        
        # Inserir novas relações
        if procedimentos:
            relations = [{"id_profissional": prof_id, "id_procedimento": proc_id, "especialista": False} for proc_id in procedimentos]
            supabase.table('profissional_procedimento').insert(relations).execute()
        
        return {"message": "Procedimentos atualizados"}
    except Exception as e:
        logging.error(f"Erro ao atualizar procedimentos: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/profissionais/{prof_id}/procedimentos")
async def get_procedimentos_profissional(prof_id: int, current_user: dict = Depends(verify_token)):
    try:
        # Nota: profissional_procedimento não tem id_info_clinica
        result = supabase.table('profissional_procedimento').select('id_procedimento').eq('id_profissional', prof_id).execute()
        return [r['id_procedimento'] for r in result.data]
    except Exception as e:
        logging.error(f"Erro ao buscar procedimentos: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/profissionais/{prof_id}")
async def update_profissional(prof_id: int, prof: ProfissionalUpdate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = prof.model_dump(exclude_none=True)
        if clinica_id:
            query = supabase.table('profissional').update(data).eq('id', prof_id).eq('id_info_clinica', clinica_id)
        else:
            query = supabase.table('profissional').update(data).eq('id', prof_id)
        result = query.execute()
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao atualizar profissional: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/profissionais/{prof_id}")
async def delete_profissional(prof_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        if clinica_id:
            supabase.table('profissional').delete().eq('id', prof_id).eq('id_info_clinica', clinica_id).execute()
        else:
            supabase.table('profissional').delete().eq('id', prof_id).execute()
        return {"message": "Profissional deletado com sucesso"}
    except Exception as e:
        logging.error(f"Erro ao deletar profissional: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== PROCEDIMENTOS =====
@api_router.get("/procedimentos")
async def get_procedimentos(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('procedimento').select('*')
        if clinica_id:
            query = query.eq('id_info_clinica', clinica_id)
        result = query.order('nome').execute()
        return result.data
    except Exception as e:
        logging.error(f"Erro ao buscar procedimentos: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/procedimentos")
async def create_procedimento(proc: ProcedimentoCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = proc.model_dump()
        if clinica_id:
            data['id_info_clinica'] = clinica_id
        result = supabase.table('procedimento').insert(data).execute()
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao criar procedimento: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/procedimentos/{proc_id}")
async def update_procedimento(proc_id: int, proc: ProcedimentoUpdate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = proc.model_dump(exclude_none=True)
        if clinica_id:
            query = supabase.table('procedimento').update(data).eq('id', proc_id).eq('id_info_clinica', clinica_id)
        else:
            query = supabase.table('procedimento').update(data).eq('id', proc_id)
        result = query.execute()
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao atualizar procedimento: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/procedimentos/{proc_id}")
async def delete_procedimento(proc_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        if clinica_id:
            supabase.table('procedimento').delete().eq('id', proc_id).eq('id_info_clinica', clinica_id).execute()
        else:
            supabase.table('procedimento').delete().eq('id', proc_id).execute()
        return {"message": "Procedimento deletado com sucesso"}
    except Exception as e:
        logging.error(f"Erro ao deletar procedimento: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== CONSULTAS/AGENDA =====
@api_router.get("/consultas")
async def get_consultas(data_inicio: Optional[str] = None, data_fim: Optional[str] = None, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        # Buscar consultas filtradas por clínica
        query = supabase.table('consulta').select('*, cliente(*), profissional(*), procedimento(*)')
        if clinica_id:
            query = query.eq('id_info_clinica', clinica_id)
        result = query.execute()
        
        consultas = result.data or []
        
        # Se tiver filtro de data, filtrar manualmente
        if data_inicio and consultas:
            import re
            filtered = []
            for consulta in consultas:
                intervalo_str = consulta.get('intervalo', '')
                # Extrair a data do intervalo [\"2025-11-17 14:00:00+00\",\"2025-11-17 15:00:00+00\")
                if intervalo_str:
                    match = re.search(r'(\d{4}-\d{2}-\d{2})', intervalo_str)
                    if match:
                        consulta_data = match.group(1)
                        if consulta_data == data_inicio:
                            filtered.append(consulta)
            return filtered
        
        return consultas
    except Exception as e:
        logging.error(f"Erro ao buscar consultas: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/consultas")
async def create_consulta(consulta: ConsultaCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = consulta.model_dump()
        data_inicio = data['data_inicio']
        data_fim = data_inicio + timedelta(minutes=data['duracao_minutos'])
        
        # Criar intervalo no formato PostgreSQL
        data['intervalo'] = f"[{data_inicio.isoformat()},{data_fim.isoformat()})"
        del data['data_inicio']
        del data['duracao_minutos']
        
        if clinica_id:
            data['id_info_clinica'] = clinica_id
        
        result = supabase.table('consulta').insert(data).execute()
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao criar consulta: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/consultas/{consulta_id}")
async def update_consulta(consulta_id: int, consulta: ConsultaUpdate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = consulta.model_dump(exclude_none=True)
        
        if 'data_inicio' in data and 'duracao_minutos' in data:
            data_inicio = data['data_inicio']
            data_fim = data_inicio + timedelta(minutes=data['duracao_minutos'])
            data['intervalo'] = f"[{data_inicio.isoformat()},{data_fim.isoformat()})"
            del data['data_inicio']
            del data['duracao_minutos']
        
        if data.get('confirmado_em'):
            data['confirmado_em'] = data['confirmado_em'].isoformat()
        if data.get('cancelado_em'):
            data['cancelado_em'] = data['cancelado_em'].isoformat()
        
        if clinica_id:
            query = supabase.table('consulta').update(data).eq('id', consulta_id).eq('id_info_clinica', clinica_id)
        else:
            query = supabase.table('consulta').update(data).eq('id', consulta_id)
        result = query.execute()
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao atualizar consulta: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/consultas/{consulta_id}")
async def delete_consulta(consulta_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        if clinica_id:
            supabase.table('consulta').delete().eq('id', consulta_id).eq('id_info_clinica', clinica_id).execute()
        else:
            supabase.table('consulta').delete().eq('id', consulta_id).execute()
        return {"message": "Consulta deletada com sucesso"}
    except Exception as e:
        logging.error(f"Erro ao deletar consulta: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== BLOQUEIOS =====
@api_router.get("/bloqueios")
async def get_bloqueios(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('agenda_bloqueio').select('*, profissional(*)')
        if clinica_id:
            query = query.eq('id_info_clinica', clinica_id)
        result = query.execute()
        return result.data
    except Exception as e:
        logging.error(f"Erro ao buscar bloqueios: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/bloqueios")
async def create_bloqueio(bloqueio: BloqueioCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = bloqueio.model_dump()
        data_inicio = data['data_inicio']
        data_fim = data['data_fim']
        data['intervalo'] = f"[{data_inicio.isoformat()},{data_fim.isoformat()})"
        del data['data_inicio']
        del data['data_fim']
        
        if clinica_id:
            data['id_info_clinica'] = clinica_id
        
        result = supabase.table('agenda_bloqueio').insert(data).execute()
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao criar bloqueio: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/bloqueios/{bloqueio_id}")
async def delete_bloqueio(bloqueio_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        if clinica_id:
            supabase.table('agenda_bloqueio').delete().eq('id', bloqueio_id).eq('id_info_clinica', clinica_id).execute()
        else:
            supabase.table('agenda_bloqueio').delete().eq('id', bloqueio_id).execute()
        return {"message": "Bloqueio deletado com sucesso"}
    except Exception as e:
        logging.error(f"Erro ao deletar bloqueio: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== ÁREAS DE ATUAÇÃO =====
# Nota: area_atuacao é uma tabela global (lookup), não filtrada por clínica
@api_router.get("/areas-atuacao")
async def get_areas_atuacao(current_user: dict = Depends(verify_token)):
    try:
        result = supabase.table('area_atuacao').select('*').order('nome').execute()
        return result.data
    except Exception as e:
        logging.error(f"Erro ao buscar áreas de atuação: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/areas-atuacao")
async def create_area_atuacao(area: AreaAtuacaoCreate, current_user: dict = Depends(verify_token)):
    try:
        result = supabase.table('area_atuacao').insert(area.model_dump()).execute()
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao criar área de atuação: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# ===== CONFIGURAÇÕES =====
@api_router.get("/config/horarios-clinica")
async def get_horarios_clinica(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        query = supabase.table('horario_clinica').select('*')
        if clinica_id:
            query = query.eq('id_info_clinica', clinica_id)
        result = query.order('dia_semana').execute()
        return result.data
    except Exception as e:
        logging.error(f"Erro ao buscar horários da clínica: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
        if clinica_id:
            data['id_info_clinica'] = clinica_id
        result = supabase.table('horario_clinica').insert(data).execute()
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao criar horário da clínica: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/config/info-clinica")
async def get_info_clinica(current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        if clinica_id:
            result = supabase.table('info_clinica').select('*').eq('id', clinica_id).execute()
        else:
            result = supabase.table('info_clinica').select('*').limit(1).execute()
        return result.data[0] if result.data else {}
    except Exception as e:
        logging.error(f"Erro ao buscar info da clínica: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/config/info-clinica/{info_id}")
async def update_info_clinica(info_id: int, info: InfoClinicaUpdate, current_user: dict = Depends(verify_token)):
    try:
        data = info.model_dump(exclude_none=True)
        result = supabase.table('info_clinica').update(data).eq('id', info_id).execute()
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao atualizar info da clínica: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/config/info-clinica")
async def create_info_clinica(info: InfoClinicaCreate, current_user: dict = Depends(verify_token)):
    try:
        user_id = current_user.get('user_id')
        data = info.model_dump()
        data['onboarding_completo'] = False
        
        # Criar clínica
        result = supabase.table('info_clinica').insert(data).execute()
        clinica_id = result.data[0]['id']
        
        # Vincular usuário à clínica
        supabase.table('usuarios').update({'id_info_clinica': clinica_id}).eq('id', user_id).execute()
        
        return result.data[0]
    except Exception as e:
        logging.error(f"Erro ao criar info da clínica: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/config/horarios-clinica/{horario_id}")
async def update_horario_clinica(horario_id: int, horario: HorarioClinicaCreate, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        data = horario.model_dump()
        if data['hora_inicio'] and ':' in data['hora_inicio'] and len(data['hora_inicio']) == 5:
            data['hora_inicio'] = data['hora_inicio'] + ':00'
        if data['hora_fim'] and ':' in data['hora_fim'] and len(data['hora_fim']) == 5:
            data['hora_fim'] = data['hora_fim'] + ':00'
        if clinica_id:
            query = supabase.table('horario_clinica').update(data).eq('id', horario_id).eq('id_info_clinica', clinica_id)
        else:
            query = supabase.table('horario_clinica').update(data).eq('id', horario_id)
        result = query.execute()
        return result.data[0] if result.data else {}
    except Exception as e:
        logging.error(f"Erro ao atualizar horário da clínica: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/config/horarios-clinica/{horario_id}")
async def delete_horario_clinica(horario_id: int, current_user: dict = Depends(verify_token)):
    try:
        clinica_id = get_user_clinica_id(current_user)
        if clinica_id:
            supabase.table('horario_clinica').delete().eq('id', horario_id).eq('id_info_clinica', clinica_id).execute()
        else:
            supabase.table('horario_clinica').delete().eq('id', horario_id).execute()
        return {"message": "Horário deletado com sucesso"}
    except Exception as e:
        logging.error(f"Erro ao deletar horário: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
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
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)

logger = logging.getLogger(__name__)