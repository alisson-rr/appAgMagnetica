-- =============================================================================
-- Bootstrap oficial do schema — Agenda Magnética
-- Versão: 1 (2026-08-21)
--
-- Base limpa, derivada do COMPORTAMENTO ATUAL DO CÓDIGO, não da documentação
-- antiga. Cada coluna aqui é lida ou escrita por pelo menos um consumidor real:
-- `services/api/server.py`, o dashboard React ou `AgendaMagnetica-v2.n8n.json`.
--
-- Reexecutável: rodar duas vezes produz o mesmo estado e nenhum erro.
-- Não destrutivo: só cria. Nunca dropa, nunca altera tipo, nunca apaga linha.
-- Não insere dado de negócio: nenhum plano, preço, cliente ou empresa fictícia.
--
-- ORDEM DE EXECUÇÃO:
--   1. scripts/bootstrap_schema.sql        (este arquivo)
--   2. scripts/travas_corte_vertical.sql   (T1..T6 — travas de integridade)
--   3. scripts/v_clinica_detalhes.sql      (view de atendimento)
--   4. scripts/fn_buscar_slots.sql         (RPC de disponibilidade)
--
-- DIVISÃO DE RESPONSABILIDADE — não duplicar:
--   Este arquivo    : tabelas, chaves estrangeiras, CHECK locais, índices de FK.
--   travas_corte_*  : unicidade de instância, cliente único por empresa,
--                     exclusão de sobreposição, idempotência, CHECK de status
--                     de consulta e índices por empresa.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. btree_gist
-- Necessária AQUI, não só nas travas: `ix_agenda_bloqueio_profissional` é um
-- índice GiST sobre (int8, tstzrange), e GiST sobre int8 só existe com esta
-- extensão. Sem este bloco, rodar o bootstrap num banco limpo — a ordem
-- documentada — falha no índice e aborta a transação inteira.
-- Vai para o schema `extensions`, convenção do Supabase: em `public` ela
-- despeja ~140 funções gbt_* e o PostgREST expõe `public` como API.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'btree_gist') then
    return;
  end if;
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    execute 'create extension btree_gist schema extensions';
  else
    execute 'create extension btree_gist';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. info_clinica — raiz do tenant
-- Consumidores: server.py (/config/info-clinica), Onboarding.jsx,
-- Configuracoes.jsx, v_clinica_detalhes.
-- -----------------------------------------------------------------------------
create table if not exists public.info_clinica (
  id                  bigserial primary key,
  nome                text        not null,
  telefone            text,
  email               text,
  descricao           text,
  endereco            text,
  mensagem_lembrete   text,
  -- server.py:987 grava false na criação; Onboarding.jsx:144 grava true no fim.
  onboarding_completo boolean     not null default false,
  -- Identidade da assistente, lida por 'montar contexto' na automação v2.
  -- Nulo é estado normal: o fluxo aplica o padrão dele.
  assistente_nome     text,
  assistente_tom      text,
  exige_profissional  boolean     not null default false,
  created_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. area_atuacao — lista de rótulos
-- ATENÇÃO: sem coluna de empresa, de propósito. server.py:896 lê todas sem
-- filtro e server.py:907 insere sem tenant. Criar id_info_clinica aqui deixaria
-- a coluna sempre nula e não mudaria a leitura. Se a separação por empresa
-- virar requisito, ela precisa começar pelo backend, não pelo banco.
-- -----------------------------------------------------------------------------
create table if not exists public.area_atuacao (
  id         bigserial primary key,
  nome       text        not null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. usuarios — login do painel e vínculo com a instância do WhatsApp
-- Consumidores: server.py (/auth/*, /whatsapp/*), automação (empresa pela
-- instância). id_info_clinica é nulo entre o cadastro e o fim do onboarding.
-- -----------------------------------------------------------------------------
create table if not exists public.usuarios (
  id                bigserial primary key,
  email             text        not null unique,
  senha_hash        text        not null,
  nome              text        not null,
  id_info_clinica   int8        references public.info_clinica (id),
  role              text        not null default 'owner',
  instance_name     text,
  trial_inicio      timestamptz,
  trial_fim         timestamptz,
  status_assinatura text        not null default 'trial',
  created_at        timestamptz not null default now(),
  constraint usuarios_status_assinatura_valido
    check (status_assinatura in ('trial', 'ativo', 'expirado', 'cancelado'))
);

-- -----------------------------------------------------------------------------
-- 4. cliente
-- 'whats' é o telefone que a automação usa para identificar o contato.
-- 'telefone' é o campo de exibição do painel. São colunas distintas de
-- propósito — confirmado em docs e no uso real.
-- id_plano_saude fica sem FK: nenhuma tabela de plano de saúde existe e o
-- backend só a repassa como inteiro opcional (server.py:69).
-- -----------------------------------------------------------------------------
create table if not exists public.cliente (
  id              bigserial primary key,
  nome            text        not null,
  whats           text,
  telefone        text,
  email           text,
  data_nascimento date,
  interesses      text,
  status          text        not null default 'ativo',
  id_plano_saude  int8,
  id_info_clinica int8        not null references public.info_clinica (id),
  created_at      timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 5. profissional
-- O join embutido `area_atuacao(*)` de server.py:500 EXIGE esta FK: sem ela o
-- PostgREST não descobre a relação e a tela de Profissionais quebra.
-- -----------------------------------------------------------------------------
create table if not exists public.profissional (
  id               bigserial primary key,
  nome             text        not null,
  ativo            boolean     not null default true,
  observacoes      text,
  whats            text,
  email            text,
  id_area_atuacao  int8        references public.area_atuacao (id),
  id_info_clinica  int8        not null references public.info_clinica (id),
  created_at       timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 6. procedimento (serviço)
-- duracao_minutos e valor são obrigatórios: ProcedimentoCreate os exige sem
-- default (server.py:100). A automação depende dos dois para ofertar horário.
-- -----------------------------------------------------------------------------
create table if not exists public.procedimento (
  id              bigserial primary key,
  nome            text          not null,
  descricao       text,
  duracao_minutos int4          not null,
  valor           numeric(10,2) not null,
  orientacoes     text,
  id_info_clinica int8          not null references public.info_clinica (id),
  created_at      timestamptz   not null default now(),
  constraint procedimento_duracao_positiva check (duracao_minutos > 0),
  constraint procedimento_valor_nao_negativo check (valor >= 0)
);

-- -----------------------------------------------------------------------------
-- 7. profissional_procedimento — quem executa o quê
-- server.py:554 grava {id_profissional, id_procedimento, especialista}.
-- ON DELETE CASCADE porque a linha só existe para ligar as duas pontas.
-- -----------------------------------------------------------------------------
create table if not exists public.profissional_procedimento (
  id              bigserial primary key,
  id_profissional int8    not null references public.profissional (id) on delete cascade,
  id_procedimento int8    not null references public.procedimento (id) on delete cascade,
  especialista    boolean not null default false,
  constraint ux_profissional_procedimento unique (id_profissional, id_procedimento)
);

-- -----------------------------------------------------------------------------
-- 8. horario_clinica — funcionamento da empresa
-- -----------------------------------------------------------------------------
create table if not exists public.horario_clinica (
  id              bigserial primary key,
  dia_semana      int4 not null,
  hora_inicio     time not null,
  hora_fim        time not null,
  id_info_clinica int8 not null references public.info_clinica (id),
  constraint horario_clinica_dia_valido check (dia_semana between 1 and 7),
  constraint horario_clinica_ordem check (hora_fim > hora_inicio)
);

-- -----------------------------------------------------------------------------
-- 9. disponibilidade_profissional
-- Sem coluna de empresa: o tenant vem por id_profissional. server.py:634 grava
-- exatamente estes quatro campos.
-- -----------------------------------------------------------------------------
create table if not exists public.disponibilidade_profissional (
  id              bigserial primary key,
  dia_semana      int4 not null,
  hora_inicio     time not null,
  hora_fim        time not null,
  id_profissional int8 not null references public.profissional (id) on delete cascade,
  constraint disponibilidade_dia_valido check (dia_semana between 1 and 7),
  constraint disponibilidade_ordem check (hora_fim > hora_inicio)
);

-- -----------------------------------------------------------------------------
-- 10. agenda_bloqueio — férias, folga, feriado
-- server.py:865 grava id_info_clinica junto: a coluna é real, apesar de ausente
-- na documentação antiga. O join embutido `profissional(*)` exige a FK.
-- -----------------------------------------------------------------------------
create table if not exists public.agenda_bloqueio (
  id              bigserial primary key,
  motivo          text,
  intervalo       tstzrange   not null,
  id_profissional int8        not null references public.profissional (id) on delete cascade,
  id_info_clinica int8        not null references public.info_clinica (id),
  created_at      timestamptz not null default now(),
  constraint agenda_bloqueio_intervalo_nao_vazio check (not isempty(intervalo))
);

-- -----------------------------------------------------------------------------
-- 11. consulta — o agendamento
-- Os três joins embutidos de server.py:373 (`cliente(*)`, `profissional(*)`,
-- `procedimento(*)`) EXIGEM as três FKs abaixo.
-- O CHECK de status, a coluna chave_idempotencia e a constraint de
-- sobreposição pertencem a travas_corte_vertical.sql — não repetir aqui.
-- -----------------------------------------------------------------------------
create table if not exists public.consulta (
  id                  bigserial primary key,
  intervalo           tstzrange   not null,
  status              text        not null default 'pendente',
  id_profissional     int8        not null references public.profissional (id),
  id_cliente          int8        not null references public.cliente (id),
  id_procedimento     int8        not null references public.procedimento (id),
  confirmado_em       date,
  cancelado_em        date,
  motivo_cancelamento text,
  id_info_clinica     int8        not null references public.info_clinica (id),
  created_at          timestamptz not null default now(),
  constraint consulta_intervalo_nao_vazio check (not isempty(intervalo))
);

-- -----------------------------------------------------------------------------
-- 12. planos — catálogo comercial. Vazio de propósito.
-- Necessária para o passo de cobrança. Nenhum preço é inserido por script.
-- -----------------------------------------------------------------------------
create table if not exists public.planos (
  id         bigserial primary key,
  codigo     text          not null unique,
  nome       text          not null,
  preco      numeric(10,2) not null,
  intervalo  text          not null,
  ativo      boolean       not null default true,
  created_at timestamptz   not null default now(),
  constraint planos_intervalo_valido check (intervalo in ('mensal', 'anual')),
  constraint planos_preco_nao_negativo check (preco >= 0)
);

-- -----------------------------------------------------------------------------
-- 13. assinaturas
-- O vocabulário de status é o do Stripe, que é quem vai preencher a coluna no
-- próximo passo. Restringir a 'active/past_due/canceled' recusaria 'trialing' e
-- 'incomplete', que a integração recebe por webhook desde o primeiro dia.
-- A unicidade de provider_subscription_id é o que impede o mesmo webhook
-- reprocessado virar duas assinaturas.
-- -----------------------------------------------------------------------------
create table if not exists public.assinaturas (
  id                       bigserial primary key,
  id_info_clinica          int8        not null references public.info_clinica (id),
  id_plano                 int8        not null references public.planos (id),
  status                   text        not null,
  started_at               timestamptz not null default now(),
  current_period_end       timestamptz,
  cancel_at_period_end     boolean     not null default false,
  provider                 text,
  provider_customer_id     text,
  provider_subscription_id text,
  created_at               timestamptz not null default now(),
  constraint assinaturas_status_valido check (status in (
    'trialing', 'active', 'past_due', 'canceled',
    'incomplete', 'incomplete_expired', 'unpaid', 'paused'
  ))
);

do $$
begin
  if to_regclass('public.ux_assinaturas_provider_subscription') is null then
    create unique index ux_assinaturas_provider_subscription
      on public.assinaturas (provider_subscription_id)
      where provider_subscription_id is not null;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Índices de chave estrangeira
-- O PostgreSQL não indexa FK automaticamente. Os índices POR EMPRESA pertencem
-- a travas_corte_vertical.sql (T6); aqui ficam só os que sustentam os joins.
-- -----------------------------------------------------------------------------
create index if not exists ix_profissional_area_atuacao
  on public.profissional (id_area_atuacao);
create index if not exists ix_disponibilidade_profissional
  on public.disponibilidade_profissional (id_profissional);
create index if not exists ix_agenda_bloqueio_profissional
  on public.agenda_bloqueio using gist (id_profissional, intervalo);
create index if not exists ix_profissional_procedimento_procedimento
  on public.profissional_procedimento (id_procedimento);
create index if not exists ix_consulta_cliente
  on public.consulta (id_cliente);
create index if not exists ix_consulta_procedimento
  on public.consulta (id_procedimento);
create index if not exists ix_assinaturas_plano
  on public.assinaturas (id_plano);

-- -----------------------------------------------------------------------------
-- RLS e privilégios
--
-- O frontend NÃO fala com o Supabase: ele chama a API, que usa `service_role`.
-- Esse papel tem `rolbypassrls = true`, então ligar RLS não afeta o backend nem
-- a automação — verificado no catálogo em 2026-08-21.
--
-- Nenhuma política é criada. Com RLS ligado e zero políticas, `anon` e
-- `authenticated` — que NÃO têm bypass — recebem zero linhas. É a postura
-- correta enquanto ninguém consulta o banco direto do navegador.
--
-- Política só faz sentido quando existir autenticação de usuário final no
-- Supabase (auth.uid()), que o produto ainda não usa. Inventar política agora
-- seria escrever regra para um modelo de sessão que não existe.
--
-- ISOLAMENTO PRINCIPAL: continua sendo validado pela API, em
-- get_user_clinica_id() (server.py:200) e assert_owned_record() (server.py:211),
-- que filtram por id_info_clinica em toda operação. O RLS aqui é a segunda
-- barreira, não a primeira.
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'info_clinica', 'area_atuacao', 'usuarios', 'cliente', 'profissional',
    'procedimento', 'profissional_procedimento', 'horario_clinica',
    'disponibilidade_profissional', 'agenda_bloqueio', 'consulta',
    'planos', 'assinaturas'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;

-- As sequências precisam acompanhar o grant das tabelas, senão o INSERT do
-- backend falha ao gerar o id.
do $$
declare
  s text;
begin
  for s in
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('revoke all on sequence public.%I from anon, authenticated', s);
    execute format('grant usage, select on sequence public.%I to service_role', s);
  end loop;
end $$;

commit;

-- =============================================================================
-- Verificação (somente leitura)
-- =============================================================================
-- select relname, relrowsecurity from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind = 'r' order by 1;
--
-- select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid)
--   from pg_constraint where connamespace = 'public'::regnamespace and contype = 'f'
--  order by 1, 2;
