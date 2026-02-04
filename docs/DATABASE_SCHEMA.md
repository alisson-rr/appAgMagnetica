# Notas: start back: "python server.py"
# Documentação do Banco de Dados - AgMagnetica

> **Supabase URL:** https://nkeiylfzzrqpjjlstpcj.supabase.co

## Visão Geral

Este documento contém a estrutura completa do banco de dados PostgreSQL utilizado pelo sistema AgMagnetica.

---

## Tabelas

### 1. `info_clinica` (Tabela Central)
Armazena informações das clínicas cadastradas no sistema.

| Coluna     | Tipo    | Descrição                    |
|------------|---------|------------------------------|
| `id`       | int8    | 🔑 Chave primária            |
| `nome`     | text    | Nome da clínica              |
| `telefone` | text    | Telefone de contato          |
| `email`    | text    | E-mail da clínica            |
| `descricao`| text    | Descrição da clínica         |
| `endereco` | text    | Endereço completo            |

---

### 2. `usuarios`
Usuários do sistema com autenticação.

| Coluna            | Tipo        | Descrição                    |
|-------------------|-------------|------------------------------|
| `id`              | int8        | 🔑 Chave primária            |
| `email`           | text        | 🔒 E-mail único (login)      |
| `senha_hash`      | text        | Hash da senha                |
| `nome`            | text        | Nome do usuário              |
| `created_at`      | timestamptz | Data de criação              |
| `id_info_clinica` | int8        | 🔗 FK → info_clinica         |
| `role`            | text        | Papel do usuário (default: 'owner') |
| `instance_name`   | text        | Nome da instância Evolution API |

---

### 3. `cliente`
Pacientes/clientes cadastrados.

| Coluna            | Tipo        | Descrição                    |
|-------------------|-------------|------------------------------|
| `id`              | int8        | 🔑 Chave primária            |
| `nome`            | text        | Nome completo                |
| `whats`           | text        | WhatsApp                     |
| `status`          | text        | Status do cliente            |
| `interesses`      | text        | Interesses/preferências      |
| `created_at`      | timestamptz | Data de cadastro             |
| `id_plano_saude`  | int8        | FK → plano de saúde          |
| `email`           | text        | E-mail                       |
| `data_nascimento` | date        | Data de nascimento           |
| `id_info_clinica` | int8        | 🔗 FK → info_clinica         |

---

### 4. `profissional`
Profissionais de saúde (médicos, dentistas, etc).

| Coluna            | Tipo  | Descrição                         |
|-------------------|-------|-----------------------------------|
| `id`              | int8  | 🔑 Chave primária                 |
| `nome`            | text  | Nome do profissional              |
| `ativo`           | bool  | Se está ativo                     |
| `observacoes`     | text  | Observações gerais                |
| `id_especialidade`| int8  | FK → especialidade                |
| `id_area_atuacao` | int8  | FK → area_atuacao                 |
| `whats`           | text  | WhatsApp                          |
| `email`           | text  | E-mail                            |
| `id_info_clinica` | int8  | 🔗 FK → info_clinica              |

---

### 5. `procedimento`
Procedimentos/serviços oferecidos.

| Coluna            | Tipo    | Descrição                       |
|-------------------|---------|---------------------------------|
| `id`              | int8    | 🔑 Chave primária               |
| `nome`            | text    | Nome do procedimento            |
| `descricao`       | text    | Descrição detalhada             |
| `duracao_minutos` | int2    | Duração em minutos              |
| `valor`           | numeric | Valor do procedimento           |
| `orientacoes`     | text    | Orientações ao paciente         |
| `id_info_clinica` | int8    | 🔗 FK → info_clinica            |

---

### 6. `area_atuacao`
Áreas de atuação dos profissionais.

| Coluna | Tipo | Descrição           |
|--------|------|---------------------|
| `id`   | int8 | 🔑 Chave primária   |
| `nome` | text | Nome da área        |

---

### 7. `profissional_procedimento`
Relação N:N entre profissionais e procedimentos.

| Coluna           | Tipo | Descrição                    |
|------------------|------|------------------------------|
| `id`             | int8 | 🔑 Chave primária            |
| `id_profissional`| int8 | FK → profissional            |
| `id_procedimento`| int8 | FK → procedimento            |
| `especialista`   | bool | Se é especialista            |

---

### 8. `horario_clinica`
Horários de funcionamento da clínica.

| Coluna            | Tipo | Descrição                       |
|-------------------|------|---------------------------------|
| `id`              | int8 | 🔑 Chave primária               |
| `dia_semana`      | int4 | Dia da semana (1-7)             |
| `hora_inicio`     | time | Hora de abertura                |
| `hora_fim`        | time | Hora de fechamento              |
| `id_info_clinica` | int8 | 🔗 FK → info_clinica            |

---

### 9. `disponibilidade_profissional`
Horários de disponibilidade de cada profissional.

| Coluna           | Tipo | Descrição                    |
|------------------|------|------------------------------|
| `id`             | int8 | 🔑 Chave primária            |
| `dia_semana`     | int4 | Dia da semana (1-7)          |
| `hora_inicio`    | time | Hora de início               |
| `hora_fim`       | time | Hora de fim                  |
| `id_profissional`| int8 | FK → profissional            |

---

### 10. `agenda_bloqueio`
Bloqueios na agenda (feriados, folgas, etc).

| Coluna           | Tipo      | Descrição                    |
|------------------|-----------|------------------------------|
| `id`             | int8      | 🔑 Chave primária            |
| `motivo`         | text      | Motivo do bloqueio           |
| `intervalo`      | tstzrange | Período bloqueado            |
| `id_profissional`| int8      | FK → profissional            |

---

### 11. `consulta`
Agendamentos/consultas marcadas.

| Coluna               | Tipo      | Descrição                    |
|----------------------|-----------|------------------------------|
| `id`                 | int8      | 🔑 Chave primária            |
| `intervalo`          | tstzrange | Período da consulta          |
| `status`             | text      | Status (agendada, etc)       |
| `id_profissional`    | int8      | FK → profissional            |
| `id_cliente`         | int8      | FK → cliente                 |
| `id_procedimento`    | int8      | FK → procedimento            |
| `confirmado_em`      | date      | Data de confirmação          |
| `cancelado_em`       | date      | Data de cancelamento         |
| `motivo_cancelamento`| text      | Motivo do cancelamento       |
| `id_info_clinica`    | int8      | 🔗 FK → info_clinica         |

---

### 12. `planos`
Planos disponíveis no sistema.

| Coluna      | Tipo        | Descrição                         |
|-------------|-------------|-----------------------------------|
| `id`        | int8        | 🔑 Chave primária                 |
| `codigo`    | text        | 🔒 Código único do plano          |
| `nome`      | text        | Nome do plano                     |
| `preco`     | numeric     | Valor do plano                    |
| `intervalo` | text        | Intervalo (mensal \| anual)       |
| `ativo`     | bool        | Se o plano está ativo             |
| `created_at`| timestamptz | Data de criação                   |

---

### 13. `assinaturas`
Controle de assinaturas de planos por clínica.

| Coluna                    | Tipo        | Descrição                              |
|---------------------------|-------------|----------------------------------------|
| `id`                      | int8        | 🔑 Chave primária                      |
| `id_info_clinica`         | int8        | 🔗 FK → info_clinica                   |
| `id_plano`                | int8        | 🔗 FK → planos                         |
| `status`                  | text        | Status (active, past_due, canceled)    |
| `started_at`              | timestamptz | Data de início                         |
| `current_period_end`      | timestamptz | Fim do período atual                   |
| `cancel_at_period_end`    | bool        | Cancelar ao fim do período             |
| `provider`                | text        | Provedor de pagamento                  |
| `provider_customer_id`    | text        | ID do cliente no provedor              |
| `provider_subscription_id`| text        | ID da assinatura no provedor           |
| `created_at`              | timestamptz | Data de criação                        |

---

## Diagrama de Relacionamentos

```
                         ┌─────────────────┐
                         │  info_clinica   │
                         │   (TENANT)      │
                         └────────┬────────┘
                                  │
    ┌──────────┬──────────┬───────┼───────┬──────────┬──────────┐
    │          │          │       │       │          │          │
    ▼          ▼          ▼       ▼       ▼          ▼          ▼
┌────────┐┌────────┐┌─────────┐┌──────┐┌───────┐┌────────┐┌──────────┐
│usuarios││cliente ││consulta ││prof. ││proced.││horario ││assinat.  │
└────────┘└────────┘└─────────┘└──────┘└───────┘└────────┘└────┬─────┘
                                                               │
                                                               ▼
                                                         ┌──────────┐
                                                         │  planos  │
                                                         └──────────┘
```

---

## SQL de Alterações

### Adicionar FK `id_info_clinica` nas tabelas

```sql
-- 1. Adicionar coluna em horario_clinica
ALTER TABLE horario_clinica 
ADD COLUMN id_info_clinica INT8 REFERENCES info_clinica(id);

-- 2. Adicionar coluna em profissional
ALTER TABLE profissional 
ADD COLUMN id_info_clinica INT8 REFERENCES info_clinica(id);

-- 3. Adicionar coluna em procedimento
ALTER TABLE procedimento 
ADD COLUMN id_info_clinica INT8 REFERENCES info_clinica(id);
```

### Criar índices para performance

```sql
CREATE INDEX idx_horario_clinica_info ON horario_clinica(id_info_clinica);
CREATE INDEX idx_profissional_info ON profissional(id_info_clinica);
CREATE INDEX idx_procedimento_info ON procedimento(id_info_clinica);
CREATE INDEX idx_usuarios_info ON usuarios(id_info_clinica);
CREATE INDEX idx_cliente_info ON cliente(id_info_clinica);
CREATE INDEX idx_consulta_info ON consulta(id_info_clinica);
```

### Adicionar FK nas novas tabelas

```sql
-- Adicionar id_info_clinica em usuarios
ALTER TABLE usuarios 
ADD COLUMN id_info_clinica INT8 REFERENCES info_clinica(id),
ADD COLUMN role TEXT DEFAULT 'owner';

-- Adicionar id_info_clinica em cliente
ALTER TABLE cliente 
ADD COLUMN id_info_clinica INT8 REFERENCES info_clinica(id);

-- Adicionar id_info_clinica em consulta
ALTER TABLE consulta 
ADD COLUMN id_info_clinica INT8 REFERENCES info_clinica(id);

-- Criar tabela planos
CREATE TABLE planos (
  id BIGSERIAL PRIMARY KEY,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  preco NUMERIC NOT NULL,
  intervalo TEXT CHECK (intervalo IN ('mensal', 'anual')),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Criar tabela assinaturas
CREATE TABLE assinaturas (
  id BIGSERIAL PRIMARY KEY,
  id_info_clinica INT8 REFERENCES info_clinica(id),
  id_plano INT8 REFERENCES planos(id),
  status TEXT CHECK (status IN ('active', 'past_due', 'canceled')),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Histórico de Alterações

| Data       | Alteração                                              |
|------------|--------------------------------------------------------|
| 2025-12-18 | Documento criado com schema inicial                    |
| 2025-12-18 | Adicionado id_info_clinica em horario_clinica          |
| 2025-12-18 | Adicionado id_info_clinica em profissional             |
| 2025-12-18 | Adicionado id_info_clinica em procedimento             |
| 2026-01-31 | Adicionado id_info_clinica e role em usuarios          |
| 2026-01-31 | Adicionado id_info_clinica em cliente                  |
| 2026-01-31 | Adicionado id_info_clinica em consulta                 |
| 2026-01-31 | Criada tabela planos                                   |
| 2026-01-31 | Criada tabela assinaturas                              |
| 2026-02-04 | Adicionado instance_name em usuarios (Evolution API)   |

---

### SQL: Adicionar instance_name em usuarios

```sql
ALTER TABLE usuarios ADD COLUMN instance_name TEXT;
```

---

*Documento gerado automaticamente. Manter atualizado conforme alterações no banco.*
