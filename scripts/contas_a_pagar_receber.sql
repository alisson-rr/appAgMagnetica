-- =============================================================================
-- Contas a pagar e a receber — Agenda Magnética
-- Versão: 1 (2026-09-09). Rodar depois de scripts/bootstrap_schema.sql.
-- Reexecutável: rodar duas vezes produz o mesmo estado e nenhum erro.
--
-- UMA TABELA SÓ para as duas coisas. "A pagar" e "a receber" têm exatamente os
-- mesmos campos e o mesmo ciclo (nasce em aberto, vence, é quitada); o que muda
-- é o sinal. Duas tabelas iguais dariam duas telas, duas rotas e dois lugares
-- para esquecer o filtro de empresa.
--
-- NÃO se conecta a `consulta`. O dinheiro dos atendimentos já é calculado pela
-- agenda; isto aqui é o resto — aluguel, material, fornecedor, a parcela que
-- alguém ficou de pagar. Ligar as duas coisas faria a mesma receita aparecer
-- duas vezes no mesmo total.
-- =============================================================================

create table if not exists public.lancamento (
  id              bigserial   primary key,
  id_info_clinica int8        not null references public.info_clinica (id),
  tipo            text        not null,
  descricao       text        not null,
  valor           numeric(10,2) not null,
  vencimento      date        not null,
  quitado_em      date,
  observacoes     text,
  created_at      timestamptz not null default now(),
  constraint lancamento_tipo_valido check (tipo in ('pagar', 'receber')),
  -- Zero é lançamento sem sentido e negativo inverteria o tipo pela porta dos
  -- fundos: uma conta "a receber" de -100 viraria despesa no total.
  constraint lancamento_valor_positivo check (valor > 0),
  constraint lancamento_descricao_nao_vazia check (length(btrim(descricao)) > 0)
);

comment on table public.lancamento is
  'Contas a pagar e a receber que NAO vem dos atendimentos. O dinheiro das '
  'consultas e calculado a partir de `consulta`.';

-- A tela abre sempre pela mesma pergunta: o que vence primeiro nesta empresa.
create index if not exists ix_lancamento_empresa_vencimento
  on public.lancamento (id_info_clinica, vencimento);

-- Parcial: "o que ainda está em aberto" é a consulta do dia a dia, e o índice
-- encolhe sozinho conforme as contas são quitadas.
create index if not exists ix_lancamento_em_aberto
  on public.lancamento (id_info_clinica, vencimento)
  where quitado_em is null;

alter table public.lancamento enable row level security;

grant select, insert, update, delete on public.lancamento to service_role;
grant usage, select on sequence public.lancamento_id_seq to service_role;
