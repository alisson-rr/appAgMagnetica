-- =============================================================================
-- Travas mínimas do corte vertical — Agenda Magnética
-- Versão: 1 (2026-08-21)
--
-- Reexecutável: rodar duas vezes produz o mesmo estado e nenhum erro.
-- Não destrutivo: nunca apaga linha, nunca mescla cadastro, nunca escolhe qual
-- registro conflitante manter. Quando encontra conflito, PULA a trava, informa a
-- contagem por NOTICE e segue para a próxima. Limpar dado é decisão do
-- proprietário, não deste script.
-- Auto-guardado: cada bloco confere tabela e coluna antes de agir. Em um banco
-- onde o schema da aplicação ainda não existe, o script roda inteiro sem erro e
-- não aplica nada.
--
-- Travas:
--   T1  unicidade de usuarios.instance_name (ignorando nulos)
--   T2  unicidade de cliente por empresa + WhatsApp normalizado
--   T3  proteção contra sobreposição de horário em consulta
--   T4  idempotência das escritas da automação
--   T5  padronização e CHECK do status de consulta
--   T6  índices mínimos das consultas por empresa
--
-- Rollback: bloco comentado no fim do arquivo.
-- =============================================================================

begin;

-- Necessária para a constraint de exclusão de T3 (igualdade + sobreposição no
-- mesmo índice GiST).
-- Vai para o schema `extensions`, convenção do Supabase: instalada em `public`
-- ela despeja ~140 funções gbt_* lá, e o PostgREST expõe `public` como API.
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
-- T1 — uma empresa por instância do WhatsApp
-- A automação resolve a empresa apenas por usuarios.instance_name. Sem
-- unicidade, duas linhas com o mesmo valor tornam a empresa da conversa
-- não determinística — inclusive nas escritas.
-- Nulos são permitidos: usuário sem WhatsApp conectado é estado normal.
-- -----------------------------------------------------------------------------
do $$
declare
  v_dup bigint;
begin
  if to_regclass('public.usuarios') is null then
    raise notice 'T1 PULADA: tabela usuarios ausente';
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'usuarios'
      and column_name = 'instance_name'
  ) then
    raise notice 'T1 PULADA: coluna usuarios.instance_name ausente';
    return;
  end if;

  select count(*) into v_dup from (
    select instance_name from public.usuarios
    where instance_name is not null and btrim(instance_name) <> ''
    group by 1 having count(*) > 1
  ) d;

  if v_dup > 0 then
    raise notice 'T1 PULADA: % valor(es) de instance_name duplicado(s). Resolver antes de aplicar.', v_dup;
    return;
  end if;

  if to_regclass('public.ux_usuarios_instance_name') is null then
    execute $sql$
      create unique index ux_usuarios_instance_name
        on public.usuarios (instance_name)
        where instance_name is not null and btrim(instance_name) <> ''
    $sql$;
    raise notice 'T1 APLICADA: ux_usuarios_instance_name criado';
  else
    raise notice 'T1 JA EXISTIA: ux_usuarios_instance_name';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- T2 — um cliente por empresa e WhatsApp
-- Normalizado só para dígitos: "+55 (51) 99999-0000" e "5551999990000" são o
-- mesmo contato e não podem virar dois cadastros por corrida de mensagens.
-- -----------------------------------------------------------------------------
do $$
declare
  v_dup bigint;
begin
  if to_regclass('public.cliente') is null then
    raise notice 'T2 PULADA: tabela cliente ausente';
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cliente'
      and column_name in ('id_info_clinica', 'whats')
    group by table_name having count(distinct column_name) = 2
  ) then
    raise notice 'T2 PULADA: cliente.id_info_clinica ou cliente.whats ausente';
    return;
  end if;

  select count(*) into v_dup from (
    select id_info_clinica, regexp_replace(whats, '[^0-9]', '', 'g') as digitos
    from public.cliente
    where whats is not null and regexp_replace(whats, '[^0-9]', '', 'g') <> ''
    group by 1, 2 having count(*) > 1
  ) d;

  if v_dup > 0 then
    raise notice 'T2 PULADA: % par(es) (empresa, whatsapp) duplicado(s). Mesclar cadastro é decisão do proprietário.', v_dup;
    return;
  end if;

  if to_regclass('public.ux_cliente_empresa_whats') is null then
    execute $sql$
      create unique index ux_cliente_empresa_whats
        on public.cliente (id_info_clinica, (regexp_replace(whats, '[^0-9]', '', 'g')))
        where whats is not null and regexp_replace(whats, '[^0-9]', '', 'g') <> ''
    $sql$;
    raise notice 'T2 APLICADA: ux_cliente_empresa_whats criado';
  else
    raise notice 'T2 JA EXISTIA: ux_cliente_empresa_whats';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- T3 — um horário por profissional
-- Constraint nativa de exclusão: dois agendamentos vivos do mesmo profissional
-- não podem ter intervalos que se cruzam. A recusa acontece no banco, não na
-- aplicação, então vale para dashboard e automação ao mesmo tempo.
-- Status vivos: pendente, agendado, confirmado (ver T5).
-- -----------------------------------------------------------------------------
do $$
declare
  v_sobrepostos bigint;
  v_tipo text;
begin
  if to_regclass('public.consulta') is null then
    raise notice 'T3 PULADA: tabela consulta ausente';
    return;
  end if;

  select data_type into v_tipo from information_schema.columns
  where table_schema = 'public' and table_name = 'consulta' and column_name = 'intervalo';

  if v_tipo is null then
    raise notice 'T3 PULADA: coluna consulta.intervalo ausente';
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'consulta' and column_name = 'id_profissional'
  ) then
    raise notice 'T3 PULADA: coluna consulta.id_profissional ausente';
    return;
  end if;

  if exists (select 1 from pg_constraint where conname = 'consulta_sem_sobreposicao') then
    raise notice 'T3 JA EXISTIA: consulta_sem_sobreposicao';
    return;
  end if;

  select count(*) into v_sobrepostos
  from public.consulta a
  join public.consulta b
    on a.id < b.id
   and a.id_profissional = b.id_profissional
   and a.intervalo && b.intervalo
  where a.status in ('pendente', 'agendado', 'confirmado')
    and b.status in ('pendente', 'agendado', 'confirmado');

  if v_sobrepostos > 0 then
    raise notice 'T3 PULADA: % par(es) de consulta ja sobrepostos. Escolher qual manter é decisão do proprietário.', v_sobrepostos;
    return;
  end if;

  alter table public.consulta
    add constraint consulta_sem_sobreposicao
    exclude using gist (
      id_profissional with =,
      intervalo with &&
    ) where (status in ('pendente', 'agendado', 'confirmado'));
  raise notice 'T3 APLICADA: consulta_sem_sobreposicao criada';
end $$;

-- -----------------------------------------------------------------------------
-- T4 — idempotência das escritas da automação
-- Uma coluna com índice único parcial resolve, sem tabela nova: a automação
-- envia uma chave determinística e trata a colisão como sucesso repetido.
-- Uma retentativa deixa de virar um segundo agendamento.
-- -----------------------------------------------------------------------------
do $$
declare
  v_colisoes bigint;
begin
  if to_regclass('public.consulta') is null then
    raise notice 'T4 PULADA: tabela consulta ausente';
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'consulta'
      and column_name = 'chave_idempotencia'
  ) then
    alter table public.consulta add column chave_idempotencia text;
    raise notice 'T4: coluna consulta.chave_idempotencia criada';
  else
    raise notice 'T4: coluna consulta.chave_idempotencia ja existia';
  end if;

  select count(*) into v_colisoes from (
    select chave_idempotencia from public.consulta
    where chave_idempotencia is not null
    group by 1 having count(*) > 1
  ) d;

  if v_colisoes > 0 then
    raise notice 'T4 INDICE PULADO: % chave(s) de idempotencia ja colidindo.', v_colisoes;
    return;
  end if;

  if to_regclass('public.ux_consulta_chave_idempotencia') is null then
    execute $sql$
      create unique index ux_consulta_chave_idempotencia
        on public.consulta (chave_idempotencia)
        where chave_idempotencia is not null
    $sql$;
    raise notice 'T4 APLICADA: ux_consulta_chave_idempotencia criado';
  else
    raise notice 'T4 JA EXISTIA: ux_consulta_chave_idempotencia';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- T5 — vocabulário único de status
-- Valores efetivamente entendidos pelo produto, verificados no código:
--   pendente    Agenda.jsx (select), server.py (valor a receber)
--   agendado    Agenda.jsx (select)
--   confirmado  server.py:379 e Dashboard (cor propria) — NAO omitir
--   cancelado   Agenda.jsx (select), server.py:375
--   concluido   Agenda.jsx (select), server.py:391
-- Backfill somente do que é inequívoco: variante de gênero do mesmo valor.
--   cancelada  -> cancelado
--   confirmada -> confirmado
-- Qualquer outro valor desconhecido faz o CHECK ser PULADO. Este script não
-- inventa correspondência.
-- -----------------------------------------------------------------------------
do $$
declare
  v_desconhecidos bigint;
  v_lista text;
  v_ajustadas bigint;
begin
  if to_regclass('public.consulta') is null then
    raise notice 'T5 PULADA: tabela consulta ausente';
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'consulta' and column_name = 'status'
  ) then
    raise notice 'T5 PULADA: coluna consulta.status ausente';
    return;
  end if;

  update public.consulta set status = 'cancelado'  where status = 'cancelada';
  get diagnostics v_ajustadas = row_count;
  if v_ajustadas > 0 then
    raise notice 'T5 backfill: % linha(s) cancelada -> cancelado', v_ajustadas;
  end if;

  update public.consulta set status = 'confirmado' where status = 'confirmada';
  get diagnostics v_ajustadas = row_count;
  if v_ajustadas > 0 then
    raise notice 'T5 backfill: % linha(s) confirmada -> confirmado', v_ajustadas;
  end if;

  select count(*), string_agg(distinct coalesce(status, '<null>'), ', ')
    into v_desconhecidos, v_lista
  from public.consulta
  where status is null
     or status not in ('pendente', 'agendado', 'confirmado', 'cancelado', 'concluido');

  if v_desconhecidos > 0 then
    raise notice 'T5 CHECK PULADO: % linha(s) com status fora do vocabulario (%). Mapear é decisão do proprietário.',
      v_desconhecidos, v_lista;
    return;
  end if;

  if exists (select 1 from pg_constraint where conname = 'consulta_status_valido') then
    raise notice 'T5 JA EXISTIA: consulta_status_valido';
    return;
  end if;

  alter table public.consulta
    add constraint consulta_status_valido
    check (status in ('pendente', 'agendado', 'confirmado', 'cancelado', 'concluido'));
  raise notice 'T5 APLICADA: consulta_status_valido criada';
end $$;

-- -----------------------------------------------------------------------------
-- T6 — índices mínimos das consultas por empresa
-- Todo acesso operacional filtra por id_info_clinica. Sem índice, cada tela e
-- cada turno de conversa vira varredura completa.
-- -----------------------------------------------------------------------------
do $$
declare
  alvo record;
  v_indice text;
begin
  for alvo in
    select * from (values
      ('usuarios'),     ('cliente'),        ('consulta'),
      ('procedimento'), ('profissional'),   ('horario_clinica'),
      ('assinaturas'),  ('agenda_bloqueio')
    ) as t(tabela)
  loop
    if to_regclass('public.' || alvo.tabela) is null then
      raise notice 'T6 PULADA: tabela % ausente', alvo.tabela;
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = alvo.tabela
        and column_name = 'id_info_clinica'
    ) then
      raise notice 'T6 PULADA: %.id_info_clinica ausente', alvo.tabela;
      continue;
    end if;

    v_indice := 'ix_' || alvo.tabela || '_info_clinica';
    if to_regclass('public.' || v_indice) is null then
      execute format('create index %I on public.%I (id_info_clinica)', v_indice, alvo.tabela);
      raise notice 'T6 APLICADA: % criado', v_indice;
    else
      raise notice 'T6 JA EXISTIA: %', v_indice;
    end if;
  end loop;

  -- A automação sempre busca a agenda por empresa + profissional + intervalo.
  if to_regclass('public.consulta') is not null
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'consulta'
                   and column_name = 'id_profissional')
     and to_regclass('public.ix_consulta_profissional_intervalo') is null then
    create index ix_consulta_profissional_intervalo
      on public.consulta using gist (id_profissional, intervalo);
    raise notice 'T6 APLICADA: ix_consulta_profissional_intervalo criado';
  end if;
end $$;

commit;

-- =============================================================================
-- Verificação (somente leitura). Rode depois de aplicar.
-- =============================================================================
-- select conname, contype, pg_get_constraintdef(oid)
--   from pg_constraint
--  where conname in ('consulta_sem_sobreposicao', 'consulta_status_valido');
--
-- select indexrelid::regclass as indice, indisunique, pg_get_indexdef(indexrelid)
--   from pg_index
--  where indexrelid::regclass::text in (
--    'ux_usuarios_instance_name', 'ux_cliente_empresa_whats',
--    'ux_consulta_chave_idempotencia', 'ix_consulta_profissional_intervalo');

-- =============================================================================
-- Rollback (não executar sem necessidade)
-- =============================================================================
-- begin;
-- drop index if exists public.ux_usuarios_instance_name;
-- drop index if exists public.ux_cliente_empresa_whats;
-- drop index if exists public.ux_consulta_chave_idempotencia;
-- drop index if exists public.ix_consulta_profissional_intervalo;
-- drop index if exists public.ix_usuarios_info_clinica;
-- drop index if exists public.ix_cliente_info_clinica;
-- drop index if exists public.ix_consulta_info_clinica;
-- drop index if exists public.ix_procedimento_info_clinica;
-- drop index if exists public.ix_profissional_info_clinica;
-- drop index if exists public.ix_horario_clinica_info_clinica;
-- drop index if exists public.ix_assinaturas_info_clinica;
-- alter table public.consulta drop constraint if exists consulta_sem_sobreposicao;
-- alter table public.consulta drop constraint if exists consulta_status_valido;
-- -- A coluna chave_idempotencia pode permanecer: nula e sem uso, não atrapalha.
-- commit;
