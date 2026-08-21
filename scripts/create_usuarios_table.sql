-- APOSENTADO em 2026-08-21. NAO EXECUTE.
-- Cria `usuarios` sem id_info_clinica, role, instance_name, trial_* nem
-- status_assinatura. A tabela resultante quebra registro e login.
-- Substituido por scripts/bootstrap_schema.sql.

-- Criar tabela de usuários para autenticação JWT
CREATE TABLE IF NOT EXISTS public.usuarios (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    senha_hash TEXT NOT NULL,
    nome TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(email);

-- Comentário explicativo
COMMENT ON TABLE public.usuarios IS 'Tabela de usuários do sistema para autenticação JWT';
