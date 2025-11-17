#!/usr/bin/env python3
"""Script para criar dados iniciais no Supabase"""

import os
import sys
from pathlib import Path

# Adicionar o diretório backend ao path
sys.path.insert(0, str(Path(__file__).parent.parent / 'backend'))

from dotenv import load_dotenv
from supabase import create_client
from passlib.context import CryptContext

# Carregar variáveis de ambiente
load_dotenv(Path(__file__).parent.parent / 'backend' / '.env')

# Configurar Supabase
supabase_url = os.environ['SUPABASE_URL']
supabase_key = os.environ['SUPABASE_SERVICE_ROLE_KEY']
supabase = create_client(supabase_url, supabase_key)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_initial_data():
    print("🚀 Criando dados iniciais...")
    
    try:
        # 1. Criar tabela de usuários (se não existir)
        print("📝 Verificando tabela de usuários...")
        
        # 2. Criar usuário admin
        print("👤 Criando usuário admin...")
        senha_hash = pwd_context.hash("admin123")
        
        try:
            user_result = supabase.table('usuarios').insert({
                "email": "admin@agendamagnetica.com",
                "senha_hash": senha_hash,
                "nome": "Administrador",
                "created_at": "2025-01-01T00:00:00"
            }).execute()
            print("✅ Usuário admin criado com sucesso!")
            print(f"   Email: admin@agendamagnetica.com")
            print(f"   Senha: admin123")
        except Exception as e:
            print(f"⚠️  Usuário admin já existe ou erro: {str(e)}")
        
        # 3. Criar áreas de atuação
        print("\n🏥 Criando áreas de atuação...")
        areas = [
            {"nome": "Estética Facial"},
            {"nome": "Estética Corporal"},
            {"nome": "Dermatologia"},
            {"nome": "Fisioterapia"},
            {"nome": "Cabeleireiro"},
            {"nome": "Manicure"},
            {"nome": "Maquiagem"}
        ]
        
        for area in areas:
            try:
                supabase.table('area_atuacao').insert(area).execute()
                print(f"   ✅ Área criada: {area['nome']}")
            except Exception as e:
                print(f"   ⚠️  Área {area['nome']} já existe ou erro")
        
        # 4. Criar info da clínica
        print("\n🏢 Criando informações da clínica...")
        try:
            supabase.table('info_clinica').insert({
                "nome": "Agenda Magnética",
                "telefone": "(00) 0000-0000",
                "email": "contato@agendamagnetica.com",
                "descricao": "Sua clínica de estética e beleza",
                "endereco": "Rua Exemplo, 123"
            }).execute()
            print("✅ Informações da clínica criadas!")
        except Exception as e:
            print(f"⚠️  Info da clínica já existe ou erro: {str(e)}")
        
        print("\n✨ Dados iniciais criados com sucesso!")
        print("\n📋 Credenciais de acesso:")
        print("   Email: admin@agendamagnetica.com")
        print("   Senha: admin123")
        
    except Exception as e:
        print(f"\n❌ Erro ao criar dados iniciais: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    create_initial_data()
