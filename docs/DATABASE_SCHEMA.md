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
| 4 | `scripts/fn_buscar_slots.sql` | RPC de disponibilidade (v2) |
| 5 | `scripts/ajustes_ai_api.sql` | A1–A5: correções para `/api/ai/*` |
| 6 | `scripts/integridade_tenant.sql` | I1–I4: integridade entre empresas no próprio banco |
| — | `scripts/teste_transacional.sql` | prova as garantias e termina em `ROLLBACK` |

Todos são reexecutáveis: rodar duas vezes produz o mesmo estado e nenhum erro —
verificado. Nenhum deles insere dado de **tenant**; o único dado inserido é o
catálogo global de `area_atuacao` (A5), que não pertence a empresa alguma.

**A ordem importa e é circular em um ponto:** T2 recria
`ux_cliente_empresa_whats` e A4 o remove de novo, porque a coluna gerada
`cliente.whats_normalizado` indexa a mesma expressão. Rodar a sequência inteira
sempre termina no mesmo estado; rodar só o passo 2 deixa um índice redundante,
sem consequência funcional.

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
| `whats_normalizado` | text | | **coluna gerada** (A4): só os dígitos de `whats` |
| `id_info_clinica` | int8 | 🔗 **N** | |
| `created_at` | timestamptz | **N** | default `now()` |

`whats` e `telefone` são colunas distintas de propósito.

`whats_normalizado` é `GENERATED ALWAYS AS (nullif(regexp_replace(whats,
'[^0-9]', '', 'g'), ''))`. Existe porque a API precisa **filtrar** por telefone
normalizado, e o PostgREST não consulta expressão indexada — só coluna. A
unicidade por empresa mudou de T2 para `ux_cliente_empresa_whats_norm`
(`id_info_clinica, whats_normalizado`), que indexa a mesma coisa e ainda serve
de filtro. O mesmo telefone em empresas diferentes continua sendo legítimo.

A equivalência entre formas do mesmo número (com e sem `55`, com e sem o nono
dígito) fica na API, em `dominio.telefones_equivalentes`: é heurística de
numeração, e prendê-la numa coluna gerada obrigaria a recriar a coluna a cada
ajuste.

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

**Sem coluna de empresa, de propósito:** é catálogo global, compartilhado por
todas as empresas.

`ux_area_atuacao_nome` (A5) garante unicidade por `lower(btrim(nome))`. O
catálogo inicial tem 24 rótulos do público da Agenda Magnética (estética,
odontologia, podologia, quiropraxia, fisioterapia, massoterapia, psicologia,
nutrição, beleza, barbearia, terapias e afins).

`POST /areas-atuacao` **foi removido do backend**: qualquer usuário autenticado
escrevia numa lista que todos os clientes enxergam (P3). Só `GET` continua
exposto. Incluir rótulo novo é operação de banco, pela lista de A5.

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
| `intervalo` | tstzrange | **N** | CHECK não vazio e **com as duas pontas finitas** (I4) |
| `id_profissional` | int8 | 🔗 **N** | FK **composta** com `id_info_clinica` (I3); `ON DELETE CASCADE` |
| `id_info_clinica` | int8 | 🔗 **N** | a API grava; a documentação antiga não tinha |
| `created_at` | timestamptz | **N** | default `now()` |

### 11. `consulta` — o agendamento

| Coluna | Tipo | | Observação |
|---|---|---|---|
| `id` | int8 | 🔑 | |
| `intervalo` | tstzrange | **N** | a API monta a partir de `data_inicio` + `duracao_minutos`; CHECK não vazio e **com as duas pontas finitas** (I4) |
| `status` | text | **N** | default `'pendente'`; CHECK dos cinco valores (T5) |
| `id_profissional` | int8 | 🔗 **N** | FK **composta** com `id_info_clinica` (I2) |
| `id_cliente` | int8 | 🔗 **N** | FK **composta** com `id_info_clinica` (I2) |
| `id_procedimento` | int8 | 🔗 **N** | FK **composta** com `id_info_clinica` (I2) |
| `confirmado_em` | timestamptz | | instante, não dia (A1) |
| `cancelado_em` | timestamptz | | instante, não dia (A2) |
| `motivo_cancelamento` | text | | |
| `valor_cobrado` | numeric(10,2) | | preço congelado no ato (A3); CHECK `>= 0` ou nulo |
| `id_info_clinica` | int8 | 🔗 **N** | |
| `created_at` | timestamptz | **N** | default `now()` |
| `chave_idempotencia` | text | | criada por T4; única quando preenchida |

`valor_cobrado` é o preço acertado no dia do agendamento. `procedimento.valor` é
o preço de **hoje**: sem a cópia, reajustar um serviço reescreveria o histórico
financeiro já emitido. A API grava na criação (painel e automação) e relê nos
totais de `/api/dashboard/stats`, caindo em `procedimento.valor` só quando a
coluna é nula — o caso de consultas anteriores a A3.

`chave_idempotencia` é gravada pela automação no formato `emp<id>:<chave>`. O
índice único é global; sem o prefixo de empresa, duas empresas que usassem o
mesmo identificador de ação colidiriam entre si.

`data_inicio` e `duracao_minutos` **não são colunas**: são campos de entrada da API,
convertidos em `intervalo` e removidos antes do `INSERT`.

`id_profissional` é `NOT NULL` de propósito — é o que faz a trava de sobreposição
proteger de fato. Com nulo, `EXCLUDE` não compara nada e o agendamento duplo passa.

As três chaves estrangeiras são **compostas** com `id_info_clinica`
(`integridade_tenant.sql`): elas provam que o cadastro existe **e** que é da
mesma empresa da consulta. A forma de uma coluna, que provava só a existência,
foi substituída — não somada. Com as duas, o PostgREST encontraria duas relações
entre as mesmas tabelas e recusaria o join embutido (`PGRST201`).

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
| `pendente` | select de `Agenda.jsx`, valor a receber; é o status que `POST /api/ai/agendamentos` grava |
| `agendado` | select de `Agenda.jsx` |
| `confirmado` | `/api/dashboard/stats` e cor própria no Dashboard |
| `cancelado` | select de `Agenda.jsx`; é o que `POST /api/ai/agendamentos/cancelar` grava |
| `concluido` | select de `Agenda.jsx`, total recebido do mês |

Backfill inequívoco aplicado por T5: `cancelada → cancelado`,
`confirmada → confirmado`. Nenhum outro valor recebe correspondência automática.

**Pendência para a automação:** o workflow v2 grava `cancelada` e filtra por `agendada`.
Com o CHECK aplicado, o cancelamento pelo WhatsApp é recusado pelo banco. A rota
`/api/ai/agendamentos/cancelar` já grava `cancelado`; migrar o nó para ela
resolve sem o fluxo precisar conhecer o vocabulário.

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

## Ajustes (`scripts/ajustes_ai_api.sql`)

Migração corretiva aplicada depois das travas. Resolve P3, P4 e P5 e prepara a
normalização de telefone que `/api/ai/*` exige.

| Ajuste | Objeto | Pendência que fecha |
|---|---|---|
| A1 | `consulta.confirmado_em` → `timestamptz` | P4 |
| A2 | `consulta.cancelado_em` → `timestamptz` | P4 |
| A3 | `consulta.valor_cobrado` + `consulta_valor_cobrado_nao_negativo` | P5 |
| A4 | `cliente.whats_normalizado` + `ux_cliente_empresa_whats_norm`; remove `ux_cliente_empresa_whats` | isolamento e busca por telefone |
| A5 | `ux_area_atuacao_nome` + 24 rótulos do catálogo global | P3 (metade de banco) |

Termina com `notify pgrst, 'reload schema'`: sem isso as colunas novas só
aparecem na API no próximo reinício do PostgREST.

## Integridade entre empresas (`scripts/integridade_tenant.sql`)

As FKs do bootstrap provavam que o id **existia**, não que ele pertencia à mesma
empresa da linha que o referencia. Nada no banco impedia uma `consulta` da
empresa A apontar para um cliente da empresa B — o isolamento ficava inteiro na
aplicação, e qualquer caminho novo (script de manutenção, correção manual,
restauração de backup) podia cruzar as duas empresas sem encontrar resistência.

| Trava | Objeto |
|---|---|
| I1 | `ux_cliente_id_empresa`, `ux_profissional_id_empresa`, `ux_procedimento_id_empresa` — `UNIQUE (id, id_info_clinica)` |
| I2 | `consulta_cliente_da_empresa`, `consulta_profissional_da_empresa`, `consulta_procedimento_da_empresa` — FKs compostas; substituem `consulta_id_*_fkey` |
| I3 | `agenda_bloqueio_profissional_da_empresa` — FK composta com `ON DELETE CASCADE`; substitui `agenda_bloqueio_id_profissional_fkey` |
| I4 | `consulta_intervalo_limitado`, `agenda_bloqueio_intervalo_limitado` — `lower`/`upper` do `intervalo` não nulos |

I1 é redundante como unicidade (`id` já é chave primária) e existe por um motivo
só: o PostgreSQL exige restrição única sobre as colunas referenciadas por uma FK.

As FKs de uma coluna foram **substituídas na mesma transação**, não duplicadas —
duas relações entre as mesmas tabelas fazem o PostgREST recusar o join embutido
(`PGRST201`), e `consulta?select=*,cliente(*),...` é o que o painel e `/api/ai/*`
usam. Verificado depois de aplicar: os três `select` embutidos do produto
continuam resolvendo.

I4 fecha um buraco que `not isempty(...)` não cobre: `[2026-08-28 14:00,)` é um
intervalo válido, não vazio e **sem fim**. Um único registro assim sobrepõe toda
a agenda futura do profissional — a constraint de exclusão passaria a recusar
qualquer agendamento novo — e `ler_intervalo` não consegue interpretá-lo,
devolvendo `FALHA_TEMPORARIA` em toda leitura daquela linha.

Encontrando linha que viola, o script **para**, lista os ids e não aplica nada.
Nenhuma linha é apagada, mesclada ou reatribuída.

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
| `p_ignorar_consulta_id` | int8 | v2; ignora esta consulta ao calcular ocupação |

**Retorno:** `id_info_clinica`, `id_profissional`, `id_procedimento`, `inicio`, `fim`,
`profissional_nome`. **Toda linha traz `id_profissional`** — slot sem profissional não
existe.

**Isolamento em três pontos:** o procedimento tem de ser da empresa (senão levanta
exceção), o profissional tem de ser da empresa, e o profissional tem de executar aquele
procedimento. Como `disponibilidade_profissional` e `profissional_procedimento` não têm
coluna de empresa, o tenant chega nelas passando por `profissional.id_info_clinica`.

**`p_ignorar_consulta_id` (v2)** é nulo em toda busca normal e só é preenchido na
revalidação de reagendamento. Sem ele, a consulta que está sendo movida ocupa o
horário antigo e a função devolve zero slot quando o horário novo encosta no
atual — a API recusaria uma remarcação válida. A alternativa seria reimplementar
a regra de disponibilidade dentro do backend, criando duas fontes de verdade.

A v1 tinha 7 parâmetros; `create or replace` com 8 criaria uma **sobrecarga**, e
o PostgREST ficaria com duas candidatas para a mesma chamada nomeada. Por isso o
script derruba a assinatura antiga antes de recriar, e `teste_transacional.sql`
verifica que existe uma única `fn_buscar_slots` em `public`.

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

**O isolamento principal entre empresas é validado pela API**: no painel, por
`get_user_clinica_id()` e `assert_owned_record()` (`services/api/server.py`); na
automação, por `resolver_empresa()`, `obter_procedimento()`,
`obter_profissional()` e `consulta_do_cliente()`
(`services/api/ai_api.py`), que derivam a empresa de `usuarios.instance_name` e
conferem cada id contra ela. O RLS é a segunda barreira.

Enquanto o workflow n8n falar direto com o PostgREST usando `service_role`, essa
barreira não vale para ele — é a razão de `/api/ai/*` existir. Ver
`docs/planning/BACKEND_AI_API_HANDOFF.md`.

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
| 2026-08-21 | `ajustes_ai_api.sql`: A1–A5 aplicadas (P3, P4, P5) |
| 2026-08-21 | `fn_buscar_slots` v2 com `p_ignorar_consulta_id` |
| 2026-08-21 | `POST /areas-atuacao` removido do backend |
| 2026-08-21 | `integridade_tenant.sql`: I1–I4 aplicadas; FKs de `consulta` e `agenda_bloqueio` passam a ser compostas com a empresa |

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
