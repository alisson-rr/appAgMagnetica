#!/usr/bin/env python3
"""Script para criar tabela de usuários no Supabase via SQL"""

import os
import sys
from pathlib import Path
import requests

# Carregar variáveis de ambiente
sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / 'backend' / '.env')

supabase_url = os.environ['SUPABASE_URL']
supabase_service_key = os.environ['SUPABASE_SERVICE_ROLE_KEY']

# SQL para criar tabela
sql = """
-- Criar tabela de usuários
CREATE TABLE IF NOT EXISTS public.usuarios (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Criar índice
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(email);
"""

print("🔧 Configurando tabela de usuários...")
print(f"📡 Supabase URL: {supabase_url}")
print("\n⚠️  IMPORTANTE: Execute o seguinte SQL no Supabase SQL Editor:")
print("=" * 60)
print(sql)
print("=" * 60)
print("\n📝 Depois execute novamente o script seed_data.py")
print("\nOu acesse: https://supabase.com/dashboard/project/_/sql")
