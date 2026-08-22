"""Cliente único do Supabase para o backend.

A chave administrativa fica somente no servidor. O isolamento por empresa é
reforçado em todas as consultas do backend e complementado por RLS.

Módulo separado para que `server` e `ai_api` compartilhem a mesma conexão sem
import circular.
"""

from supabase import Client, create_client

from settings import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
