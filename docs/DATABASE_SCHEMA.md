# Banco de Dados — Agenda Magnética

> **Projeto Supabase:** definido em `SUPABASE_URL` / `DATABASE_URL` no `.env`, que não é
> versionado. Nenhuma URL ou identificador de projeto entra neste documento.
> **Servidor:** PostgreSQL 17.6. **Fuso:** `America/Sao_Paulo`. **Moeda:** BRL.
> **Estado:** aplicado e verificado no catálogo em 2026-08-21. Todas as tabelas
> existem e estão **vazias** — nenhum dado de negócio foi inserido por script.

Este documento descreve o schema **realmente criado**, extraído do catálogo, não um
schema pretendido. Cada coluna existe porque um consumidor real a lê ou escreve:
`services/api/server.py`, o dashboard React, ou `AgendaMagnetica-v2.n8n.json`.

## Scripts e ordem de execução

| # | Script | Papel |
|---|---|---|
| 1 | `scripts/bootstrap_schema.sql` | 13 tabelas, FKs, CHECKs locais, índices de FK, RLS e grants |
| 2 | `scripts/travas_corte_vertical.sql` | T1–T6: travas de integridade e índices por empresa |
| 3 | `scripts/v_clinica_detalhes.sql` | view de contexto de atendimento |
| 4 | `scripts/fn_buscar_slots.sql` | RPC de disponibilidade |
| — | `scripts/teste_transacional.sql` | prova as garantias e termina em `ROLLBACK` |

Todos são reexecutáveis: rodar duas vezes produz o mesmo estado e nenhum erro —
verificado. Nenhum deles insere dado de negócio.

**Aposentados, não executar:** `create_usuarios_table.sql` (produz `usuarios`
incompleta), `add_telefone_cliente.sql` (não reexecutável), `enable_rls.sql`
(substituído pelo bloco de RLS do bootstrap), `insert_disponibilidade_profissional.sql`
(dados de exemplo com ids fixos).

---

## Tabelas

Convenção: 🔑 chave primária, 🔗 chave estrangeira, **N** `NOT NULL`.

### 1. `info_clinica` — raiz do tenant

| Coluna | Tipo | | Observação |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `nome` | text | **N** | |
| `telefone` | text | | |
| `email` | text | | |
| `descricao` | text | | |
| `endereco` | text | | |
| `mensagem_lembrete` | text | | modelo de lembrete |
| `onboarding_completo` | bool | **N** | default `false`; `true` ao fim do onboarding |
| `assistente_nome` | text | | identidade da assistente; nulo usa o padrão do fluxo |
| `assistente_tom` | text | | idem |
| `exige_profissional` | bool | **N** | default `false` |
| `created_at` | timestamptz | **N** | default `now()` |

### 2. `usuarios` — login do painel e vínculo com a instância do WhatsApp

| Coluna | Tipo | | Observação |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `email` | text | **N** | `UNIQUE` |
| `senha_hash` | text | **N** | bcrypt |
| `nome` | text | **N** | |
| `id_info_clinica` | int8 | 🔗 | **nulo é válido**: entre o cadastro e o fim do onboarding |
| `role` | text | **N** | default `'owner'` |
| `instance_name` | text | | único quando preenchido (T1) |
| `trial_inicio` | timestamptz | | |
| `trial_fim` | timestamptz | | |
| `status_assinatura` | text | **N** | default `'trial'`; CHECK `trial \| ativo \| expirado \| cancelado` |
| `created_at` | timestamptz | **N** | default `now()` |

`trial_expirado` e `dias_restantes` **não são colunas**: são calculados na resposta do
login a partir de `trial_fim`.

### 3. `cliente`

| Coluna | Tipo | | Observação |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `nome` | text | **N** | |
| `whats` | text | | telefone que a **automação** usa para identificar o contato |
| `telefone` | text | | telefone de **exibição** no painel |
| `email` | text | | |
| `data_nascimento` | date | | |
| `interesses` | text | | |
| `status` | text | **N** | default `'ativo'` |
| `id_plano_saude` | int8 | | **sem FK**: não existe tabela de plano de saúde |
| `id_info_clinica` | int8 | 🔗 **N** | |
| `created_at` | timestamptz | **N** | default `now()` |

`whats` e `telefone` são colunas distintas de propósito. Único por
`(id_info_clinica, dígitos de whats)` — ver T2.

### 4. `profissional`

| Coluna | Tipo | | Observação |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `nome` | text | **N** | |
| `ativo` | bool | **N** | default `true`; inativo não é ofertado no atendimento |
| `observacoes` | text | | |
| `whats` | text | | |
| `email` | text | | |
| `id_area_atuacao` | int8 | 🔗 | → `area_atuacao.id` |
| `id_info_clinica` | int8 | 🔗 **N** | |
| `created_at` | timestamptz | **N** | default `now()` |

### 5. `procedimento` (serviço)

| Coluna | Tipo | | Observação |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `nome` | text | **N** | |
| `descricao` | text | | |
| `duracao_minutos` | int4 | **N** | CHECK `> 0` |
| `valor` | numeric(10,2) | **N** | CHECK `>= 0` |
| `orientacoes` | text | | |
| `id_info_clinica` | int8 | 🔗 **N** | |
| `created_at` | timestamptz | **N** | default `now()` |

### 6. `area_atuacao` — lista de rótulos

| Coluna | Tipo | | |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `nome` | text | **N** | |
| `created_at` | timestamptz | **N** | default `now()` |

**Sem coluna de empresa, de propósito.** A API lê todas sem filtro e insere sem tenant.
Consequência conhecida: é um catálogo compartilhado entre todas as empresas, e
`POST /areas-atuacao` não verifica empresa nem papel. Separar por empresa exige mudar o
backend e o dashboard primeiro — não é uma decisão de banco.

### 7. `profissional_procedimento` — quem executa o quê

| Coluna | Tipo | | |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `id_profissional` | int8 | 🔗 **N** | `ON DELETE CASCADE` |
| `id_procedimento` | int8 | 🔗 **N** | `ON DELETE CASCADE` |
| `especialista` | bool | **N** | default `false` |

`UNIQUE (id_profissional, id_procedimento)`. Sem coluna de empresa: o tenant chega por
`profissional`.

### 8. `horario_clinica` — funcionamento da empresa

| Coluna | Tipo | | |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `dia_semana` | int4 | **N** | CHECK 1–7 (1=segunda … 7=domingo) |
| `hora_inicio` | time | **N** | |
| `hora_fim` | time | **N** | CHECK `hora_fim > hora_inicio` |
| `id_info_clinica` | int8 | 🔗 **N** | |

Nada impede duas faixas **sobrepostas** no mesmo dia. `fn_buscar_slots` usa `DISTINCT`
para não ofertar o mesmo horário duas vezes por causa disso.

### 9. `disponibilidade_profissional`

| Coluna | Tipo | | |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `dia_semana` | int4 | **N** | CHECK 1–7 |
| `hora_inicio` | time | **N** | |
| `hora_fim` | time | **N** | CHECK `hora_fim > hora_inicio` |
| `id_profissional` | int8 | 🔗 **N** | `ON DELETE CASCADE` |

Sem coluna de empresa: o tenant chega por `profissional`.

### 10. `agenda_bloqueio`

| Coluna | Tipo | | |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `motivo` | text | | |
| `intervalo` | tstzrange | **N** | CHECK não vazio |
| `id_profissional` | int8 | 🔗 **N** | `ON DELETE CASCADE` |
| `id_info_clinica` | int8 | 🔗 **N** | a API grava; a documentação antiga não tinha |
| `created_at` | timestamptz | **N** | default `now()` |

### 11. `consulta` — o agendamento

| Coluna | Tipo | | Observação |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `intervalo` | tstzrange | **N** | a API monta a partir de `data_inicio` + `duracao_minutos` |
| `status` | text | **N** | default `'pendente'`; CHECK dos cinco valores (T5) |
| `id_profissional` | int8 | 🔗 **N** | |
| `id_cliente` | int8 | 🔗 **N** | |
| `id_procedimento` | int8 | 🔗 **N** | |
| `confirmado_em` | date | | |
| `cancelado_em` | date | | |
| `motivo_cancelamento` | text | | |
| `id_info_clinica` | int8 | 🔗 **N** | |
| `created_at` | timestamptz | **N** | default `now()` |
| `chave_idempotencia` | text | | criada por T4; única quando preenchida |

`data_inicio` e `duracao_minutos` **não são colunas**: são campos de entrada da API,
convertidos em `intervalo` e removidos antes do `INSERT`.

`id_profissional` é `NOT NULL` de propósito — é o que faz a trava de sobreposição
proteger de fato. Com nulo, `EXCLUDE` não compara nada e o agendamento duplo passa.

### 12. `planos` — catálogo comercial (vazio)

| Coluna | Tipo | | |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `codigo` | text | **N** | `UNIQUE` |
| `nome` | text | **N** | |
| `preco` | numeric(10,2) | **N** | CHECK `>= 0` |
| `intervalo` | text | **N** | CHECK `mensal \| anual` — **texto**, não é range |
| `ativo` | bool | **N** | default `true` |
| `created_at` | timestamptz | **N** | default `now()` |

### 13. `assinaturas`

| Coluna | Tipo | | |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `id_info_clinica` | int8 | 🔗 **N** | |
| `id_plano` | int8 | 🔗 **N** | → `planos.id` |
| `status` | text | **N** | vocabulário do Stripe (abaixo) |
| `started_at` | timestamptz | **N** | default `now()` |
| `current_period_end` | timestamptz | | |
| `cancel_at_period_end` | bool | **N** | default `false` |
| `provider` | text | | |
| `provider_customer_id` | text | | |
| `provider_subscription_id` | text | | único quando preenchido |
| `created_at` | timestamptz | **N** | default `now()` |

`status` aceita `trialing`, `active`, `past_due`, `canceled`, `incomplete`,
`incomplete_expired`, `unpaid`, `paused` — o espaço de estados do Stripe, que é quem vai
preencher a coluna. Restringir a três valores recusaria `trialing` e `incomplete`, que a
integração recebe por webhook desde o primeiro dia.

`UNIQUE` parcial em `provider_subscription_id` é o que impede o mesmo webhook
reprocessado virar duas assinaturas.

---

## Vocabulário de status de `consulta`

Cinco valores, todos verificados no código:

| Status | Quem entende |
|---|---|
| `pendente` | select de `Agenda.jsx`, valor a receber em `server.py:393` |
| `agendado` | select de `Agenda.jsx` |
| `confirmado` | `server.py:379` e cor própria no Dashboard |
| `cancelado` | select de `Agenda.jsx`, `server.py:375` |
| `concluido` | select de `Agenda.jsx`, `server.py:391` |

Backfill inequívoco aplicado por T5: `cancelada → cancelado`,
`confirmada → confirmado`. Nenhum outro valor recebe correspondência automática.

**Pendência para a automação:** o workflow v2 grava `cancelada` e filtra por `agendada`.
Com o CHECK aplicado, o cancelamento pelo WhatsApp passa a ser recusado pelo banco.

---

## Travas (`scripts/travas_corte_vertical.sql`)

| Trava | Objeto |
|---|---|
| T1 | `ux_usuarios_instance_name` — único parcial, ignora nulo e vazio |
| T2 | `ux_cliente_empresa_whats` — único em `(id_info_clinica, regexp_replace(whats,'[^0-9]','','g'))` |
| T3 | `consulta_sem_sobreposicao` — `EXCLUDE USING gist (id_profissional WITH =, intervalo WITH &&)` para `pendente`, `agendado`, `confirmado` |
| T4 | `consulta.chave_idempotencia` + `ux_consulta_chave_idempotencia` |
| T5 | `consulta_status_valido` — CHECK dos cinco status, após backfill |
| T6 | `ix_<tabela>_info_clinica` em 8 tabelas + `ix_consulta_profissional_intervalo` (GiST) |

`btree_gist` é instalada no schema `extensions`, não em `public`: em `public` ela
despeja ~140 funções `gbt_*` que o PostgREST passaria a expor como API.

---

## View `v_clinica_detalhes`

Uma linha por empresa, `security_invoker = true`. Contrato conferido no nó
`montar contexto` da automação:

| Campo | Tipo | Conteúdo |
|---|---|---|
| `id_info_clinica` | int8 | filtro obrigatório |
| `clinica_nome`, `clinica_telefone`, `clinica_email`, `clinica_endereco` | text | identificação pública |
| `assistente_nome`, `assistente_tom` | text | nulo usa o padrão do fluxo |
| `exige_profissional` | bool | |
| `procedimentos` | jsonb | `[{id, nome, valor, duracao_minutos, agendavel}]`, ordenado por nome |
| `profissionais` | jsonb | `[{id, nome, area}]`, **somente ativos**, ordenado por nome |
| `horarios` | jsonb | `[{dia_semana, hora_inicio, hora_fim}]`, hora em `HH:MM` |

Arrays nunca vêm `null`: empresa sem catálogo recebe `[]`. Não expõe nada de
`usuarios`, `cliente` ou `consulta`, e nenhuma credencial.

`agendavel` é `true` só quando existe pelo menos um profissional **ativo** da empresa
habilitado naquele serviço. Serviço com `agendavel: false` tem preço e duração para
responder a uma pergunta, mas `fn_buscar_slots` devolveria zero horário para sempre —
sem essa marca o fluxo trataria a lista vazia como "sem vaga hoje" e voltaria a
oferecer o mesmo serviço no turno seguinte, em vez de transferir para uma pessoa.

---

## Função `fn_buscar_slots`

`SECURITY INVOKER`, `STABLE`, `search_path` fixo em `public, pg_temp`.

**Parâmetros** (nomeados, via corpo JSON do PostgREST):

| Parâmetro | Tipo | |
|---|---|---|
| `p_id_info_clinica` | int8 | **obrigatório** — a empresa é dada, nunca deduzida |
| `p_procedimento_id` | int8 | **obrigatório** |
| `p_inicio` | timestamptz | início da janela |
| `p_fim` | timestamptz | fim da janela |
| `p_profissional_id` | int8 | opcional; nulo = qualquer profissional apto |
| `p_step_minutos` | int | padrão 30 |
| `p_duracao_minutos` | int | nulo usa a duração do procedimento |

**Retorno:** `id_info_clinica`, `id_profissional`, `id_procedimento`, `inicio`, `fim`,
`profissional_nome`. **Toda linha traz `id_profissional`** — slot sem profissional não
existe.

**Isolamento em três pontos:** o procedimento tem de ser da empresa (senão levanta
exceção), o profissional tem de ser da empresa, e o profissional tem de executar aquele
procedimento. Como `disponibilidade_profissional` e `profissional_procedimento` não têm
coluna de empresa, o tenant chega nelas passando por `profissional.id_info_clinica`.

**Respeita:** horário da empresa, disponibilidade do profissional, `agenda_bloqueio` e
consultas vivas (mesmo conjunto de status da constraint T3). Nunca oferta passado.

---

## RLS

RLS está **habilitado nas 13 tabelas**, com **zero políticas**. Não é omissão:

- O frontend não fala com o Supabase; ele chama a API.
- A API e a automação usam `service_role`, que tem `rolbypassrls = true` — verificado no
  catálogo. Ligar RLS não afeta nenhuma das duas.
- `anon` e `authenticated` **não** têm bypass. Com RLS ligado e nenhuma política, ficam
  sem acesso — reforçado por `REVOKE ALL` explícito.
- Política com `auth.uid()` só faz sentido quando existir autenticação de usuário final
  no Supabase, que o produto não usa. Escrever política agora seria regra para um modelo
  de sessão inexistente.

**O isolamento principal entre empresas é validado pela API**, em
`get_user_clinica_id()` (`server.py:200`) e `assert_owned_record()` (`server.py:211`),
que filtram por `id_info_clinica` em toda operação. O RLS é a segunda barreira.

---

## Histórico

| Data | Alteração |
|---|---|
| 2025-12-18 → 2026-02-05 | Histórico do schema anterior, em outro projeto Supabase |
| 2026-08-21 | Projeto novo adotado como fonte oficial; `public` estava vazio |
| 2026-08-21 | `bootstrap_schema.sql`: 13 tabelas, FKs, CHECKs, RLS e grants |
| 2026-08-21 | `travas_corte_vertical.sql`: T1–T6 aplicadas |
| 2026-08-21 | `v_clinica_detalhes` e `fn_buscar_slots` criadas do zero |
| 2026-08-21 | `btree_gist` movida de `public` para `extensions` |
| 2026-08-21 | Quatro scripts antigos marcados como aposentados |
| 2026-08-21 | URL de projeto removida deste documento |

---

## Diferenças em relação ao schema antigo

| Diferença | Por quê |
|---|---|
| `info_clinica.onboarding_completo` **nova** | a API grava; faltava na documentação |
| `info_clinica.assistente_nome`, `assistente_tom`, `exige_profissional` **novas** | a automação lê pela view |
| `agenda_bloqueio.id_info_clinica` **documentada** | a API sempre gravou; faltava no documento |
| `consulta.chave_idempotencia` **nova** | T4 |
| `profissional.id_especialidade` **removida** | nenhum código usa |
| `consulta.motivo` **não criada** | lida só por uma tela que não está roteada |
| `area_atuacao.created_at` **nova** | consistência |
| `assinaturas.status` com 8 valores | o espaço de estados do Stripe |
| `procedimento.duracao_minutos` int4 em vez de int2 | a API aceita int sem limite |
| `usuarios.status_assinatura` com CHECK | vocabulário fechado |
| FKs **explícitas** em toda relação | os joins embutidos do PostgREST (`cliente(*)`, `area_atuacao(*)`) só funcionam com FK real |
| `NOT NULL` em `id_info_clinica` das tabelas de negócio | linha órfã de empresa não deveria existir |
