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
