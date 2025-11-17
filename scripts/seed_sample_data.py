#!/usr/bin/env python3
"""Script para criar dados de exemplo"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / 'backend' / '.env')

supabase_url = os.environ['SUPABASE_URL']
supabase_key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
supabase = create_client(supabase_url, supabase_key)

print("🌱 Criando dados de exemplo...\n")

# 1. Criar clientes
print("👥 Criando clientes...")
clientes = [
    {"nome": "Maria Silva", "whats": "(11) 99999-1111", "email": "maria@email.com", "status": "ativo"},
    {"nome": "João Santos", "whats": "(11) 99999-2222", "email": "joao@email.com", "status": "ativo"},
    {"nome": "Ana Costa", "whats": "(11) 99999-3333", "email": "ana@email.com", "status": "ativo"},
]

for cliente in clientes:
    try:
        supabase.table('cliente').insert(cliente).execute()
        print(f"   ✅ Cliente: {cliente['nome']}")
    except Exception as e:
        print(f"   ⚠️  {cliente['nome']}: {str(e)}")

# 2. Criar profissionais
print("\n👨‍⚕️ Criando profissionais...")
profissionais = [
    {"nome": "Dra. Fernanda Lima", "email": "fernanda@clinica.com", "ativo": True, "id_area_atuacao": 1},
    {"nome": "Juliana Carvalho", "whats": "(11) 98888-1111", "ativo": True, "id_area_atuacao": 2},
    {"nome": "Roberto Mendes", "email": "roberto@clinica.com", "ativo": True, "id_area_atuacao": 5},
]

for prof in profissionais:
    try:
        supabase.table('profissional').insert(prof).execute()
        print(f"   ✅ Profissional: {prof['nome']}")
    except Exception as e:
        print(f"   ⚠️  {prof['nome']}: {str(e)}")

# 3. Criar procedimentos
print("\n💆 Criando procedimentos...")
procedimentos = [
    {"nome": "Limpeza de Pele", "descricao": "Limpeza profunda facial", "duracao_minutos": 60, "valor": 150.00},
    {"nome": "Massagem Relaxante", "descricao": "Massagem corporal", "duracao_minutos": 90, "valor": 200.00},
    {"nome": "Depilação Completa", "descricao": "Depilação corporal", "duracao_minutos": 120, "valor": 180.00},
    {"nome": "Manicure", "descricao": "Cuidados com as unhas", "duracao_minutos": 45, "valor": 50.00},
    {"nome": "Corte de Cabelo", "descricao": "Corte e finalização", "duracao_minutos": 60, "valor": 80.00},
]

for proc in procedimentos:
    try:
        supabase.table('procedimento').insert(proc).execute()
        print(f"   ✅ Procedimento: {proc['nome']} - {proc['duracao_minutos']}min - R$ {proc['valor']}")
    except Exception as e:
        print(f"   ⚠️  {proc['nome']}: {str(e)}")

print("\n✨ Dados de exemplo criados com sucesso!")
print("\n📋 Resumo:")
print("   - 3 Clientes")
print("   - 3 Profissionais")
print("   - 5 Procedimentos")
