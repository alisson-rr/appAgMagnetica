-- =============================================================================
-- add_origem_consulta.sql — de onde veio cada agendamento
-- Versão: 1 (2026-09-06). Rodar depois de scripts/bootstrap_schema.sql.
--
-- POR QUE: a métrica principal do produto é "agendamentos resolvidos sem
-- interromper o profissional". Hoje não dá para respondê-la: criação pela
-- automação é reconhecível de raspão (`chave_idempotencia` preenchida), mas
-- remarcação e cancelamento feitos pela IA não deixam marca nenhuma, e uma
-- consulta criada no painel é indistinguível de uma criada no WhatsApp.
--
-- ORDEM DE APLICAÇÃO (importa): rode este script ANTES de subir o backend que
-- grava a coluna. Deploy primeiro, coluna depois, quebra toda escrita de
-- agenda com "column origem does not exist".
--
-- Idempotente: pode rodar de novo sem efeito.
-- =============================================================================

begin;

alter table public.consulta
  add column if not exists origem text not null default 'painel';

-- Vocabulário fechado, igual ao resto do schema: o produto só tem duas portas
-- de escrita, e uma terceira apareceria como erro em vez de virar dado sujo.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'consulta_origem_valida'
  ) then
    alter table public.consulta
      add constraint consulta_origem_valida
      check (origem in ('painel', 'automacao'));
  end if;
end
$$;

comment on column public.consulta.origem is
  'Quem criou o agendamento: painel (o dono, na tela) ou automacao (a recepção no WhatsApp).';

-- Histórico: o que já existe foi criado antes de a automação rodar, então
-- 'painel' (o default) está correto e nada precisa ser reescrito.

-- A contagem por origem é a leitura mais frequente desta coluna.
create index if not exists ix_consulta_origem_empresa
  on public.consulta (id_info_clinica, origem);

commit;

-- Verificação:
--   select origem, count(*) from public.consulta group by origem;
--   \d+ public.consulta
