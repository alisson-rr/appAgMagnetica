#!/usr/bin/env python3
"""Script para criar usuário admin com hash correto"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))

from dotenv import load_dotenv
from supabase import create_client
from passlib.context import CryptContext

load_dotenv(Path(__file__).parent.parent / 'backend' / '.env')

supabase_url = os.environ['SUPABASE_URL']
supabase_key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
supabase = create_client(supabase_url, supabase_key)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Gerar novo hash
senha = "admin123"
senha_hash = pwd_context.hash(senha)

print(f"Hash gerado: {senha_hash}")

# Deletar usuário existente
try:
    supabase.table('usuarios').delete().eq('email', 'admin@agendamagnetica.com').execute()
    print("✅ Usuário anterior deletado")
except Exception as e:
    print(f"⚠️  Erro ao deletar: {e}")

# Criar novo usuário
try:
    result = supabase.table('usuarios').insert({
        "email": "admin@agendamagnetica.com",
        "senha_hash": senha_hash,
        "nome": "Administrador"
    }).execute()
    print("✅ Novo usuário criado com sucesso!")
    print(f"   Email: admin@agendamagnetica.com")
    print(f"   Senha: admin123")
except Exception as e:
    print(f"❌ Erro: {e}")
