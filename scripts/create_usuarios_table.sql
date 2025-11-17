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

-- Inserir usuário admin padrão (senha: admin123)
-- Hash bcrypt de 'admin123': $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyJEzYIoYuqa
INSERT INTO public.usuarios (email, senha_hash, nome, created_at)
VALUES ('admin@agendamagnetica.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5GyJEzYIoYuqa', 'Administrador', NOW())
ON CONFLICT (email) DO NOTHING;

-- Comentário explicativo
COMMENT ON TABLE public.usuarios IS 'Tabela de usuários do sistema para autenticação JWT';
