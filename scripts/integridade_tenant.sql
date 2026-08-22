-- =============================================================================
-- Integridade entre empresas — Agenda Magnética
-- Versão: 1 (2026-08-21). Rodar DEPOIS de:
--   1. scripts/bootstrap_schema.sql
--   2. scripts/travas_corte_vertical.sql
--   3. scripts/v_clinica_detalhes.sql
--   4. scripts/fn_buscar_slots.sql
--   5. scripts/ajustes_ai_api.sql
--
-- O QUE ESTE SCRIPT RESOLVE
-- As FKs criadas pelo bootstrap provam que o id EXISTE, não que ele pertence à
-- mesma empresa da linha que o referencia. Hoje `consulta` aceita ligar um
-- cliente da empresa A a um profissional da empresa B: o banco não tem como
-- recusar, porque cada FK olha só uma coluna. O isolamento fica inteiro nas
-- mãos da aplicação, e qualquer caminho novo (script de manutenção, correção
-- manual, rota futura, restauração de backup) pode cruzar as duas empresas sem
-- encontrar resistência. A chave estrangeira COMPOSTA move essa garantia para
-- o banco, onde ela vale para todo mundo.
--
--   I1  chaves candidatas (id, id_info_clinica) em cliente, profissional,
--       procedimento — o alvo que as FKs compostas precisam referenciar
--   I2  consulta: FKs compostas de cliente, profissional e procedimento
--   I3  agenda_bloqueio: FK composta de profissional
--   I4  CHECK de limites finitos do intervalo em consulta e agenda_bloqueio
--
-- POR QUE AS FKs SIMPLES SAEM
-- A composta é estritamente mais forte: garante existência E empresa. Manter
-- as duas não acrescenta garantia e quebra o PostgREST — com duas relações
-- entre as mesmas tabelas ele recusa o join embutido (`PGRST201`), e
-- `consulta?select=*,cliente(*),procedimento(...),profissional(...)`, que o
-- painel e `/api/ai/*` usam, para de funcionar. A troca acontece dentro da
-- mesma transação: não existe instante sem integridade referencial.
--
-- PARA em vez de PULAR: encontrando linha que viola, o script lista os ids,
-- levanta exceção e desfaz tudo. Nenhuma linha é apagada, mesclada ou
-- reatribuída — decidir de quem é um registro cruzado é do proprietário.
-- Reexecutável: rodar duas vezes produz o mesmo estado e nenhum erro.
-- Auto-guardado: cada bloco confere tabela, coluna e constraint antes de agir.
--
-- Rollback: bloco comentado no fim do arquivo.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- I1 — chaves candidatas compostas
-- `(id, id_info_clinica)` é redundante como unicidade, já que `id` é chave
-- primária. Ela existe por um motivo só: o PostgreSQL exige que as colunas
-- referenciadas por uma FK sejam cobertas por uma restrição única, e é isso que
-- torna possível referenciar id E empresa no mesmo apontamento.
-- Nenhuma linha pode violá-la, então este bloco não tem ramo de parada.
-- -----------------------------------------------------------------------------
do $$
declare
  alvo   text;
  v_nome text;
begin
  foreach alvo in array array['cliente', 'profissional', 'procedimento'] loop
    if to_regclass('public.' || alvo) is null then
      raise notice 'I1 PULADA: tabela % ausente', alvo;
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = alvo
        and column_name = 'id_info_clinica'
    ) then
      raise notice 'I1 PULADA: %.id_info_clinica ausente', alvo;
      continue;
    end if;

    v_nome := 'ux_' || alvo || '_id_empresa';
    if exists (
      select 1 from pg_constraint
      where conname = v_nome and conrelid = ('public.' || alvo)::regclass
    ) then
      raise notice 'I1 JA EXISTIA: %', v_nome;
      continue;
    end if;

    execute format(
      'alter table public.%I add constraint %I unique (id, id_info_clinica)',
      alvo, v_nome
    );
    raise notice 'I1 APLICADA: % criada', v_nome;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- I2 — a consulta só liga cadastros da própria empresa
-- Cliente, profissional e procedimento passam a ser conferidos junto com a
-- empresa da consulta. Um agendamento que misture empresas deixa de ser
-- gravável, venha ele da API, de um script ou de um UPDATE manual.
-- -----------------------------------------------------------------------------
do $$
declare
  alvo      record;
  v_erradas bigint;
  v_ids     text;
begin
  if to_regclass('public.consulta') is null then
    raise notice 'I2 PULADA: tabela consulta ausente';
    return;
  end if;

  for alvo in
    select * from (values
      ('id_cliente',      'cliente',      'consulta_cliente_da_empresa',
       'consulta_id_cliente_fkey'),
      ('id_profissional', 'profissional', 'consulta_profissional_da_empresa',
       'consulta_id_profissional_fkey'),
      ('id_procedimento', 'procedimento', 'consulta_procedimento_da_empresa',
       'consulta_id_procedimento_fkey')
    ) as t(coluna, referida, nova, antiga)
  loop
    if to_regclass('public.' || alvo.referida) is null then
      raise notice 'I2 PULADA: tabela % ausente', alvo.referida;
      continue;
    end if;
    if exists (
      select 1 from pg_constraint
      where conname = alvo.nova and conrelid = 'public.consulta'::regclass
    ) then
      raise notice 'I2 JA EXISTIA: %', alvo.nova;
      continue;
    end if;
    if not exists (
      select 1 from pg_constraint
      where conname = 'ux_' || alvo.referida || '_id_empresa'
        and conrelid = ('public.' || alvo.referida)::regclass
    ) then
      raise notice 'I2 PULADA: % sem a chave candidata composta (ver I1)', alvo.referida;
      continue;
    end if;

    execute format(
      $fmt$select count(*) from public.consulta c
             join public.%I x on x.id = c.%I
            where x.id_info_clinica is distinct from c.id_info_clinica$fmt$,
      alvo.referida, alvo.coluna
    ) into v_erradas;

    if v_erradas > 0 then
      execute format(
        $fmt$select string_agg(id::text, ', ') from (
               select c.id from public.consulta c
                 join public.%I x on x.id = c.%I
                where x.id_info_clinica is distinct from c.id_info_clinica
                order by c.id limit 20) d$fmt$,
        alvo.referida, alvo.coluna
      ) into v_ids;
      raise exception
        'I2 PARADO: % consulta(s) apontam % de outra empresa. Nada foi aplicado; nenhuma linha foi tocada. ids (ate 20): %',
        v_erradas, alvo.referida, v_ids;
    end if;

    execute format(
      'alter table public.consulta add constraint %I '
      'foreign key (%I, id_info_clinica) references public.%I (id, id_info_clinica)',
      alvo.nova, alvo.coluna, alvo.referida
    );
    raise notice 'I2 APLICADA: % criada', alvo.nova;

    -- A simples vira redundante no mesmo instante em que a composta existe.
    if exists (
      select 1 from pg_constraint
      where conname = alvo.antiga and conrelid = 'public.consulta'::regclass
    ) then
      execute format('alter table public.consulta drop constraint %I', alvo.antiga);
      raise notice 'I2: % removida (a composta ja garante existencia e empresa)', alvo.antiga;
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- I3 — o bloqueio de agenda é do profissional da própria empresa
-- `on delete cascade` é preservado de propósito: o bloqueio só existe enquanto
-- o profissional existir, e mudar isso transformaria a exclusão de um
-- profissional sem histórico em erro na tela do painel.
-- -----------------------------------------------------------------------------
do $$
declare
  v_erradas bigint;
  v_ids     text;
begin
  if to_regclass('public.agenda_bloqueio') is null or to_regclass('public.profissional') is null then
    raise notice 'I3 PULADA: agenda_bloqueio ou profissional ausente';
    return;
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'agenda_bloqueio_profissional_da_empresa'
      and conrelid = 'public.agenda_bloqueio'::regclass
  ) then
    raise notice 'I3 JA EXISTIA: agenda_bloqueio_profissional_da_empresa';
    return;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'ux_profissional_id_empresa'
      and conrelid = 'public.profissional'::regclass
  ) then
    raise notice 'I3 PULADA: profissional sem a chave candidata composta (ver I1)';
    return;
  end if;

  select count(*) into v_erradas
  from public.agenda_bloqueio b
  join public.profissional p on p.id = b.id_profissional
  where p.id_info_clinica is distinct from b.id_info_clinica;

  if v_erradas > 0 then
    select string_agg(id::text, ', ') into v_ids from (
      select b.id from public.agenda_bloqueio b
        join public.profissional p on p.id = b.id_profissional
       where p.id_info_clinica is distinct from b.id_info_clinica
       order by b.id limit 20
    ) d;
    raise exception
      'I3 PARADO: % bloqueio(s) apontam profissional de outra empresa. Nada foi aplicado. ids (ate 20): %',
      v_erradas, v_ids;
  end if;

  alter table public.agenda_bloqueio
    add constraint agenda_bloqueio_profissional_da_empresa
    foreign key (id_profissional, id_info_clinica)
    references public.profissional (id, id_info_clinica)
    on delete cascade;
  raise notice 'I3 APLICADA: agenda_bloqueio_profissional_da_empresa criada';

  if exists (
    select 1 from pg_constraint
    where conname = 'agenda_bloqueio_id_profissional_fkey'
      and conrelid = 'public.agenda_bloqueio'::regclass
  ) then
    alter table public.agenda_bloqueio drop constraint agenda_bloqueio_id_profissional_fkey;
    raise notice 'I3: agenda_bloqueio_id_profissional_fkey removida (substituida pela composta)';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- I4 — todo intervalo tem começo e fim
-- `tstzrange` aceita ponta infinita, e `not isempty(...)` não pega isso:
-- `[2026-08-28 14:00,)` é um intervalo válido, não vazio e sem fim. Um único
-- registro assim sobrepõe TODA a agenda futura do profissional — a constraint
-- de exclusão passaria a recusar qualquer agendamento novo — e `ler_intervalo`
-- não consegue interpretá-lo, o que devolveria FALHA_TEMPORARIA ao fluxo em
-- toda leitura daquela linha.
-- -----------------------------------------------------------------------------
do $$
declare
  alvo      record;
  v_erradas bigint;
  v_ids     text;
begin
  for alvo in
    select * from (values
      ('consulta',        'consulta_intervalo_limitado'),
      ('agenda_bloqueio', 'agenda_bloqueio_intervalo_limitado')
    ) as t(tabela, nome)
  loop
    if to_regclass('public.' || alvo.tabela) is null then
      raise notice 'I4 PULADA: tabela % ausente', alvo.tabela;
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = alvo.tabela
        and column_name = 'intervalo'
    ) then
      raise notice 'I4 PULADA: %.intervalo ausente', alvo.tabela;
      continue;
    end if;
    if exists (
      select 1 from pg_constraint
      where conname = alvo.nome and conrelid = ('public.' || alvo.tabela)::regclass
    ) then
      raise notice 'I4 JA EXISTIA: %', alvo.nome;
      continue;
    end if;

    execute format(
      $fmt$select count(*) from public.%I
            where lower(intervalo) is null or upper(intervalo) is null$fmt$,
      alvo.tabela
    ) into v_erradas;

    if v_erradas > 0 then
      execute format(
        $fmt$select string_agg(id::text, ', ') from (
               select id from public.%I
                where lower(intervalo) is null or upper(intervalo) is null
                order by id limit 20) d$fmt$,
        alvo.tabela
      ) into v_ids;
      raise exception
        'I4 PARADO: % linha(s) de % com intervalo sem limite. Nada foi aplicado. ids (ate 20): %',
        v_erradas, alvo.tabela, v_ids;
    end if;

    execute format(
      'alter table public.%I add constraint %I '
      'check (lower(intervalo) is not null and upper(intervalo) is not null)',
      alvo.tabela, alvo.nome
    );
    raise notice 'I4 APLICADA: % criada', alvo.nome;
  end loop;
end $$;

commit;

-- O PostgREST guarda o mapa de relações em cache. Sem o aviso, os joins
-- embutidos continuariam resolvidos pelas FKs antigas até o próximo reinício.
notify pgrst, 'reload schema';

-- =============================================================================
-- Verificação (somente leitura). Rode depois de aplicar.
-- =============================================================================
-- select conrelid::regclass as tabela, conname, pg_get_constraintdef(oid)
--   from pg_constraint
--  where connamespace = 'public'::regnamespace
--    and conrelid::regclass::text in ('consulta', 'agenda_bloqueio')
--    and contype in ('f', 'c')
--  order by 1, 2;
--
-- -- Cada par (consulta, tabela referida) precisa ter EXATAMENTE uma FK, senao
-- -- o join embutido do PostgREST volta a ficar ambiguo.
-- select confrelid::regclass as referida, count(*)
--   from pg_constraint
--  where conrelid = 'public.consulta'::regclass and contype = 'f'
--  group by 1 having count(*) > 1;

-- =============================================================================
-- Rollback (não executar sem necessidade)
-- Volta às FKs de uma coluna. O estado anterior aceitava consulta cruzando
-- empresas: só desfaça se algo dependia disso.
-- =============================================================================
-- begin;
-- alter table public.consulta drop constraint if exists consulta_cliente_da_empresa;
-- alter table public.consulta drop constraint if exists consulta_profissional_da_empresa;
-- alter table public.consulta drop constraint if exists consulta_procedimento_da_empresa;
-- alter table public.consulta drop constraint if exists consulta_intervalo_limitado;
-- alter table public.agenda_bloqueio
--   drop constraint if exists agenda_bloqueio_profissional_da_empresa;
-- alter table public.agenda_bloqueio
--   drop constraint if exists agenda_bloqueio_intervalo_limitado;
-- alter table public.consulta add constraint consulta_id_cliente_fkey
--   foreign key (id_cliente) references public.cliente (id);
-- alter table public.consulta add constraint consulta_id_profissional_fkey
--   foreign key (id_profissional) references public.profissional (id);
-- alter table public.consulta add constraint consulta_id_procedimento_fkey
--   foreign key (id_procedimento) references public.procedimento (id);
-- alter table public.agenda_bloqueio add constraint agenda_bloqueio_id_profissional_fkey
--   foreign key (id_profissional) references public.profissional (id) on delete cascade;
-- alter table public.cliente      drop constraint if exists ux_cliente_id_empresa;
-- alter table public.profissional drop constraint if exists ux_profissional_id_empresa;
-- alter table public.procedimento drop constraint if exists ux_procedimento_id_empresa;
-- commit;
-- notify pgrst, 'reload schema';
