-- APOSENTADO em 2026-08-21. NAO EXECUTE.
-- Nao e reexecutavel (falha na segunda vez) e a coluna cliente.telefone ja
-- nasce em scripts/bootstrap_schema.sql.

-- Script para adicionar campo telefone na tabela cliente
-- O campo whats continua existindo para uso exclusivo do N8N
-- O campo telefone é para uso no sistema (exibição e contato)

ALTER TABLE cliente ADD COLUMN telefone TEXT;

-- Criar índice para busca
CREATE INDEX idx_cliente_telefone ON cliente(telefone);
