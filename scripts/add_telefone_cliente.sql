-- Script para adicionar campo telefone na tabela cliente
-- O campo whats continua existindo para uso exclusivo do N8N
-- O campo telefone é para uso no sistema (exibição e contato)

ALTER TABLE cliente ADD COLUMN telefone TEXT;

-- Criar índice para busca
CREATE INDEX idx_cliente_telefone ON cliente(telefone);
