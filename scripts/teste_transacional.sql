-- =============================================================================
-- Teste transacional do schema — Agenda Magnética
-- Versão: 1 (2026-08-21)
--
-- Cria duas empresas de mentira, prova todas as garantias e termina em ROLLBACK.
-- NADA persiste. Pode rodar quantas vezes quiser, inclusive no banco oficial.
--
-- Rodar DEPOIS de: bootstrap_schema.sql, travas_corte_vertical.sql,
--                  v_clinica_detalhes.sql, fn_buscar_slots.sql
--
-- Cada verificação emite NOTICE 'OK: ...'. Qualquer falha levanta exceção e
-- aborta — silêncio no fim significa que algo não rodou.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Fixtures: duas empresas, o MESMO telefone nas duas, um profissional e um
-- serviço em cada. A segunda-feira da semana que vem serve de dia de teste.
-- -----------------------------------------------------------------------------
create temporary table t_ids (chave text primary key, valor int8) on commit drop;
create temporary table t_dia (dia date) on commit drop;

insert into t_dia
select (date_trunc('week', (now() at time zone 'America/Sao_Paulo'))::date + 7);

with a as (
  insert into public.info_clinica (nome, telefone, email, endereco, assistente_nome)
  values ('Empresa A de Teste', '5133330000', 'a@teste.local', 'Rua A, 1', 'Ana')
  returning id
), b as (
  insert into public.info_clinica (nome, telefone, email, endereco)
  values ('Empresa B de Teste', '5144440000', 'b@teste.local', 'Rua B, 2')
  returning id
)
insert into t_ids (chave, valor)
select 'empresa_a', id from a
union all
select 'empresa_b', id from b;

-- Usuários, um por empresa, cada um com sua instância de WhatsApp.
insert into public.usuarios (email, senha_hash, nome, id_info_clinica, instance_name)
select 'a@login.local', 'hash', 'Dono A', valor, 'agm_teste_a' from t_ids where chave = 'empresa_a';
insert into public.usuarios (email, senha_hash, nome, id_info_clinica, instance_name)
select 'b@login.local', 'hash', 'Dono B', valor, 'agm_teste_b' from t_ids where chave = 'empresa_b';

-- Profissionais e serviços.
with novo as (
  insert into public.profissional (nome, id_info_clinica)
  select 'Profissional A', valor from t_ids where chave = 'empresa_a'
  returning id
)
insert into t_ids (chave, valor) select 'prof_a', id from novo;
with novo as (
  insert into public.profissional (nome, id_info_clinica)
  select 'Profissional B', valor from t_ids where chave = 'empresa_b'
  returning id
)
insert into t_ids (chave, valor) select 'prof_b', id from novo;
with novo as (
  insert into public.procedimento (nome, duracao_minutos, valor, id_info_clinica)
  select 'Servico A', 60, 100.00, valor from t_ids where chave = 'empresa_a'
  returning id
)
insert into t_ids (chave, valor) select 'proc_a', id from novo;
with novo as (
  insert into public.procedimento (nome, duracao_minutos, valor, id_info_clinica)
  select 'Servico B', 60, 200.00, valor from t_ids where chave = 'empresa_b'
  returning id
)
insert into t_ids (chave, valor) select 'proc_b', id from novo;

-- Quem executa o quê.
insert into public.profissional_procedimento (id_profissional, id_procedimento)
select (select valor from t_ids where chave = 'prof_a'),
       (select valor from t_ids where chave = 'proc_a');
insert into public.profissional_procedimento (id_profissional, id_procedimento)
select (select valor from t_ids where chave = 'prof_b'),
       (select valor from t_ids where chave = 'proc_b');

-- Segunda a sexta, 08:00–18:00, nas duas empresas.
insert into public.horario_clinica (dia_semana, hora_inicio, hora_fim, id_info_clinica)
select d, '08:00', '18:00', i.valor
from generate_series(1, 5) d, t_ids i
where i.chave in ('empresa_a', 'empresa_b');

-- Disponibilidade dos dois profissionais no mesmo intervalo.
insert into public.disponibilidade_profissional (dia_semana, hora_inicio, hora_fim, id_profissional)
select d, '08:00', '18:00', i.valor
from generate_series(1, 5) d, t_ids i
where i.chave in ('prof_a', 'prof_b');

-- O MESMO telefone cadastrado nas duas empresas.
insert into public.cliente (nome, whats, telefone, id_info_clinica)
select 'Cliente Compartilhado', '5551999990000@s.whatsapp.net', '51999990000', valor
from t_ids where chave = 'empresa_a';
with novo as (
  insert into public.cliente (nome, whats, telefone, id_info_clinica)
  select 'Cliente Compartilhado', '5551999990000@s.whatsapp.net', '51999990000', valor
  from t_ids where chave = 'empresa_b'
  returning id
)
insert into t_ids (chave, valor) select 'cliente_b', id from novo;

-- Bloqueio do profissional A: segunda que vem, 10:00–12:00 (hora local).
insert into public.agenda_bloqueio (motivo, intervalo, id_profissional, id_info_clinica)
select 'Bloqueio de teste',
       tstzrange(((select dia from t_dia) + time '10:00') at time zone 'America/Sao_Paulo',
                 ((select dia from t_dia) + time '12:00') at time zone 'America/Sao_Paulo', '[)'),
       (select valor from t_ids where chave = 'prof_a'),
       (select valor from t_ids where chave = 'empresa_a');

do $$ begin raise notice 'OK  0. fixtures das duas empresas criadas'; end $$;

-- -----------------------------------------------------------------------------
-- 1. O mesmo telefone PODE existir em empresas diferentes
-- -----------------------------------------------------------------------------
do $$
declare v int;
begin
  select count(*) into v
  from public.cliente
  where regexp_replace(whats, '[^0-9]', '', 'g') = '5551999990000';
  if v <> 2 then
    raise exception 'FALHOU 1: esperava o mesmo telefone em 2 empresas, achei %', v;
  end if;
  raise notice 'OK  1. mesmo telefone coexiste em empresas diferentes';
end $$;

-- -----------------------------------------------------------------------------
-- 2. O mesmo telefone NÃO pode duplicar dentro da mesma empresa (T2)
--    Inclusive escrito em outro formato: a trava normaliza para dígitos.
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.cliente (nome, whats, id_info_clinica)
    select 'Duplicata', '+55 (51) 99999-0000', valor from t_ids where chave = 'empresa_a';
    raise exception 'FALHOU 2: cliente duplicado na mesma empresa foi aceito';
  exception when unique_violation then
    raise notice 'OK  2. cliente duplicado por WhatsApp normalizado foi recusado';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 3. instance_name não pode duplicar (T1)
-- -----------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.usuarios (email, senha_hash, nome, instance_name)
    values ('c@login.local', 'hash', 'Terceiro', 'agm_teste_a');
    raise exception 'FALHOU 3: instance_name duplicado foi aceito';
  exception when unique_violation then
    raise notice 'OK  3. instance_name duplicado foi recusado';
  end;
end $$;

-- Nulo e vazio continuam permitidos: usuário sem WhatsApp conectado é normal.
do $$
begin
  insert into public.usuarios (email, senha_hash, nome, instance_name)
  values ('d@login.local', 'hash', 'Sem instancia', null);
  insert into public.usuarios (email, senha_hash, nome, instance_name)
  values ('e@login.local', 'hash', 'Instancia vazia', '');
  raise notice 'OK  3b. varios usuarios sem instancia convivem';
end $$;

-- -----------------------------------------------------------------------------
-- 4. Um profissional não recebe consultas sobrepostas (T3)
-- -----------------------------------------------------------------------------
do $$
declare
  v_ini      timestamptz := ((select dia from t_dia) + time '14:00') at time zone 'America/Sao_Paulo';
  v_cliente  int8;
begin
  select id into v_cliente from public.cliente
  where id_info_clinica = (select valor from t_ids where chave = 'empresa_a') limit 1;

  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
  values (tstzrange(v_ini, v_ini + interval '60 min', '[)'), 'agendado',
          (select valor from t_ids where chave = 'prof_a'), v_cliente,
          (select valor from t_ids where chave = 'proc_a'),
          (select valor from t_ids where chave = 'empresa_a'));

  begin
    insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
    values (tstzrange(v_ini + interval '30 min', v_ini + interval '90 min', '[)'), 'agendado',
            (select valor from t_ids where chave = 'prof_a'), v_cliente,
            (select valor from t_ids where chave = 'proc_a'),
            (select valor from t_ids where chave = 'empresa_a'));
    raise exception 'FALHOU 4: consulta sobreposta foi aceita';
  exception when exclusion_violation then
    raise notice 'OK  4. consulta sobreposta para o mesmo profissional foi recusada';
  end;

  -- O mesmo horário para OUTRO profissional continua livre.
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
  select tstzrange(v_ini, v_ini + interval '60 min', '[)'), 'agendado',
         (select valor from t_ids where chave = 'prof_b'),
         (select valor from t_ids where chave = 'cliente_b'),
         (select valor from t_ids where chave = 'proc_b'),
         (select valor from t_ids where chave = 'empresa_b');
  raise notice 'OK  4b. o mesmo horario para outro profissional segue livre';
end $$;

-- -----------------------------------------------------------------------------
-- 5. Idempotência impede repetição (T4)
-- -----------------------------------------------------------------------------
do $$
declare
  v_ini     timestamptz := ((select dia from t_dia) + time '16:00') at time zone 'America/Sao_Paulo';
  v_cliente int8;
begin
  select id into v_cliente from public.cliente
  where id_info_clinica = (select valor from t_ids where chave = 'empresa_a') limit 1;

  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento,
                               id_info_clinica, chave_idempotencia)
  values (tstzrange(v_ini, v_ini + interval '60 min', '[)'), 'pendente',
          (select valor from t_ids where chave = 'prof_a'), v_cliente,
          (select valor from t_ids where chave = 'proc_a'),
          (select valor from t_ids where chave = 'empresa_a'), 'acao-teste-1');
  begin
    -- Reentrega: mesma chave, horário diferente para isolar o efeito da chave.
    insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento,
                                 id_info_clinica, chave_idempotencia)
    values (tstzrange(v_ini + interval '2 hour', v_ini + interval '3 hour', '[)'), 'pendente',
            (select valor from t_ids where chave = 'prof_a'), v_cliente,
            (select valor from t_ids where chave = 'proc_a'),
            (select valor from t_ids where chave = 'empresa_a'), 'acao-teste-1');
    raise exception 'FALHOU 5: chave de idempotencia repetida foi aceita';
  exception when unique_violation then
    raise notice 'OK  5. chave de idempotencia repetida foi recusada';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Status inválido é recusado (T5)
-- -----------------------------------------------------------------------------
do $$
declare v_cliente int8;
begin
  select id into v_cliente from public.cliente
  where id_info_clinica = (select valor from t_ids where chave = 'empresa_a') limit 1;
  begin
    insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
    values (tstzrange(now() + interval '30 day', now() + interval '30 day 1 hour', '[)'),
            'cancelada',  -- feminino: o que a automacao grava hoje
            (select valor from t_ids where chave = 'prof_a'), v_cliente,
            (select valor from t_ids where chave = 'proc_a'),
            (select valor from t_ids where chave = 'empresa_a'));
    raise exception 'FALHOU 6: status invalido foi aceito';
  exception when check_violation then
    raise notice 'OK  6. status fora do vocabulario foi recusado (inclui cancelada)';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 7. fn_buscar_slots nunca mistura empresas
-- -----------------------------------------------------------------------------
do $$
declare
  v_a       int8 := (select valor from t_ids where chave = 'empresa_a');
  v_b       int8 := (select valor from t_ids where chave = 'empresa_b');
  v_proc_a  int8 := (select valor from t_ids where chave = 'proc_a');
  v_prof_a  int8 := (select valor from t_ids where chave = 'prof_a');
  v_dia     date := (select dia from t_dia);
  v_total   int;
  v_fora    int;
begin
  select count(*),
         count(*) filter (where s.id_info_clinica <> v_a or s.id_profissional <> v_prof_a)
    into v_total, v_fora
  from public.fn_buscar_slots(
         v_a, v_proc_a,
         (v_dia + time '08:00') at time zone 'America/Sao_Paulo',
         (v_dia + time '18:00') at time zone 'America/Sao_Paulo') s;

  if v_total = 0 then
    raise exception 'FALHOU 7: nenhum slot devolvido para a empresa A';
  end if;
  if v_fora > 0 then
    raise exception 'FALHOU 7: % slot(s) de fora da empresa A', v_fora;
  end if;
  raise notice 'OK  7. % slots devolvidos, todos da empresa A e do profissional dela', v_total;

  -- Procedimento da empresa B pedido como se fosse da A: tem de falhar alto.
  begin
    perform * from public.fn_buscar_slots(
      v_a, (select valor from t_ids where chave = 'proc_b'),
      (v_dia + time '08:00') at time zone 'America/Sao_Paulo',
      (v_dia + time '18:00') at time zone 'America/Sao_Paulo');
    raise exception 'FALHOU 7b: procedimento de outra empresa foi aceito';
  exception when raise_exception then
    if sqlerrm like 'FALHOU%' then raise;
    end if;
    raise notice 'OK  7b. procedimento de outra empresa foi recusado pela funcao';
  end;

  -- Empresa B tem o seu proprio catalogo e nao ve nada da A.
  select count(*) filter (where s.id_info_clinica <> v_b) into v_fora
  from public.fn_buscar_slots(
         v_b, (select valor from t_ids where chave = 'proc_b'),
         (v_dia + time '08:00') at time zone 'America/Sao_Paulo',
         (v_dia + time '18:00') at time zone 'America/Sao_Paulo') s;
  if v_fora > 0 then
    raise exception 'FALHOU 7c: empresa B recebeu % slot(s) de outra empresa', v_fora;
  end if;
  raise notice 'OK  7c. empresa B recebe somente slots dela';
end $$;

-- -----------------------------------------------------------------------------
-- 8. Bloqueios e consultas existentes são respeitados
-- -----------------------------------------------------------------------------
do $$
declare
  v_a      int8 := (select valor from t_ids where chave = 'empresa_a');
  v_proc_a int8 := (select valor from t_ids where chave = 'proc_a');
  v_dia    date := (select dia from t_dia);
  v_bloq   int;
  v_ocup   int;
begin
  -- Bloqueio 10:00–12:00: nenhum slot pode começar em 10:00 ou 11:00.
  select count(*) into v_bloq
  from public.fn_buscar_slots(
         v_a, v_proc_a,
         (v_dia + time '08:00') at time zone 'America/Sao_Paulo',
         (v_dia + time '18:00') at time zone 'America/Sao_Paulo') s
  where s.inicio < ((v_dia + time '12:00') at time zone 'America/Sao_Paulo')
    and s.fim    > ((v_dia + time '10:00') at time zone 'America/Sao_Paulo');
  if v_bloq > 0 then
    raise exception 'FALHOU 8: % slot(s) dentro do bloqueio', v_bloq;
  end if;
  raise notice 'OK  8. nenhum slot oferecido dentro do bloqueio';

  -- Consulta já marcada às 14:00: nada pode ser oferecido em cima dela.
  select count(*) into v_ocup
  from public.fn_buscar_slots(
         v_a, v_proc_a,
         (v_dia + time '08:00') at time zone 'America/Sao_Paulo',
         (v_dia + time '18:00') at time zone 'America/Sao_Paulo') s
  where s.inicio < ((v_dia + time '15:00') at time zone 'America/Sao_Paulo')
    and s.fim    > ((v_dia + time '14:00') at time zone 'America/Sao_Paulo');
  if v_ocup > 0 then
    raise exception 'FALHOU 8b: % slot(s) sobre consulta existente', v_ocup;
  end if;
  raise notice 'OK  8b. nenhum slot oferecido sobre consulta existente';

  -- Fora do horario da empresa (fecha 18:00) nada aparece.
  if exists (
    select 1 from public.fn_buscar_slots(
      v_a, v_proc_a,
      (v_dia + time '08:00') at time zone 'America/Sao_Paulo',
      (v_dia + time '23:00') at time zone 'America/Sao_Paulo') s
    where s.fim > ((v_dia + time '18:00') at time zone 'America/Sao_Paulo')
  ) then
    raise exception 'FALHOU 8c: slot depois do fechamento da empresa';
  end if;
  raise notice 'OK  8c. nada oferecido depois do fechamento';
end $$;

-- -----------------------------------------------------------------------------
-- 9. A view pode ser filtrada por empresa e não mistura catálogos
-- -----------------------------------------------------------------------------
do $$
declare
  v_a     int8 := (select valor from t_ids where chave = 'empresa_a');
  v_linha record;
begin
  select * into v_linha from public.v_clinica_detalhes where id_info_clinica = v_a;
  if v_linha is null then
    raise exception 'FALHOU 9: view nao devolveu linha para a empresa A';
  end if;
  if jsonb_array_length(v_linha.procedimentos) <> 1 then
    raise exception 'FALHOU 9: esperava 1 servico na empresa A, achei %',
      jsonb_array_length(v_linha.procedimentos);
  end if;
  if v_linha.procedimentos -> 0 ->> 'nome' <> 'Servico A' then
    raise exception 'FALHOU 9: catalogo da empresa A trouxe servico de outra empresa';
  end if;
  if (v_linha.procedimentos -> 0 -> 'id') is null
     or (v_linha.profissionais -> 0 -> 'id') is null then
    raise exception 'FALHOU 9: view precisa expor id de servico e de profissional';
  end if;
  if jsonb_array_length(v_linha.horarios) <> 5 then
    raise exception 'FALHOU 9: esperava 5 dias de horario, achei %',
      jsonb_array_length(v_linha.horarios);
  end if;
  if v_linha.assistente_nome <> 'Ana' then
    raise exception 'FALHOU 9: view nao expos assistente_nome';
  end if;
  -- O servico da empresa A tem profissional ativo habilitado: e agendavel.
  if (v_linha.procedimentos -> 0 ->> 'agendavel') <> 'true' then
    raise exception 'FALHOU 9: servico com profissional ativo deveria ser agendavel';
  end if;
  raise notice 'OK  9. view filtrada por empresa, com ids, sem misturar catalogo';
end $$;

-- 9b. Servico sem nenhum profissional habilitado aparece, mas como nao agendavel.
do $$
declare
  v_a     int8 := (select valor from t_ids where chave = 'empresa_a');
  v_linha record;
  v_orfao jsonb;
begin
  insert into public.procedimento (nome, duracao_minutos, valor, id_info_clinica)
  values ('Servico Sem Profissional', 30, 50.00, v_a);

  select * into v_linha from public.v_clinica_detalhes where id_info_clinica = v_a;
  select p into v_orfao
  from jsonb_array_elements(v_linha.procedimentos) p
  where p ->> 'nome' = 'Servico Sem Profissional';

  if v_orfao is null then
    raise exception 'FALHOU 9b: servico sem profissional desapareceu do catalogo';
  end if;
  if (v_orfao ->> 'agendavel') <> 'false' then
    raise exception 'FALHOU 9b: servico sem profissional deveria vir agendavel=false';
  end if;
  raise notice 'OK  9b. servico sem profissional aparece com agendavel=false';
end $$;

-- 9c. Profissional inativo nao e ofertado e desabilita o servico.
do $$
declare
  v_a int8 := (select valor from t_ids where chave = 'empresa_a');
  v_linha record;
begin
  update public.profissional set ativo = false
  where id = (select valor from t_ids where chave = 'prof_a');

  select * into v_linha from public.v_clinica_detalhes where id_info_clinica = v_a;
  if jsonb_array_length(v_linha.profissionais) <> 0 then
    raise exception 'FALHOU 9c: profissional inativo apareceu na view';
  end if;
  if (v_linha.procedimentos -> 0 ->> 'agendavel') <> 'false' then
    raise exception 'FALHOU 9c: servico sem profissional ATIVO deveria virar agendavel=false';
  end if;

  update public.profissional set ativo = true
  where id = (select valor from t_ids where chave = 'prof_a');
  raise notice 'OK  9c. profissional inativo sai da view e desagenda o servico';
end $$;

-- 9d. Exclusao de profissional com historico e RECUSADA pelo banco (FK RESTRICT).
-- A API traduz isso em 409 com explicacao (raise_if_in_use em server.py).
do $$
begin
  begin
    delete from public.profissional
    where id = (select valor from t_ids where chave = 'prof_a');
    raise exception 'FALHOU 9d: profissional com agendamento foi excluido';
  exception when foreign_key_violation then
    raise notice 'OK  9d. exclusao de profissional com historico foi recusada';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- 10. Todo slot tem profissional e procedimento
-- -----------------------------------------------------------------------------
do $$
declare
  v_dia date := (select dia from t_dia);
  v_nulos int;
begin
  select count(*) into v_nulos
  from public.fn_buscar_slots(
         (select valor from t_ids where chave = 'empresa_a'),
         (select valor from t_ids where chave = 'proc_a'),
         (v_dia + time '08:00') at time zone 'America/Sao_Paulo',
         (v_dia + time '18:00') at time zone 'America/Sao_Paulo') s
  where s.id_profissional is null
     or s.id_procedimento is null
     or s.inicio is null
     or s.fim is null
     or s.id_info_clinica is null;
  if v_nulos > 0 then
    raise exception 'FALHOU 10: % slot(s) sem campo obrigatorio', v_nulos;
  end if;
  raise notice 'OK 10. todo slot traz empresa, profissional, procedimento, inicio e fim';
end $$;

-- -----------------------------------------------------------------------------
-- 11. RLS realmente nega quem não é o backend
-- -----------------------------------------------------------------------------
do $$
declare v_erro text;
begin
  begin
    set local role anon;
    perform count(*) from public.cliente;
    reset role;
    raise exception 'FALHOU 11: anon conseguiu ler cliente';
  exception
    when insufficient_privilege then
      reset role;
      raise notice 'OK 11. anon sem privilegio em cliente';
    when others then
      v_erro := sqlerrm;
      reset role;
      if v_erro like 'FALHOU%' then raise exception '%', v_erro; end if;
      raise notice 'OK 11. anon barrado em cliente (%)', v_erro;
  end;
end $$;

rollback;

-- =============================================================================
-- Confirmação depois do ROLLBACK (rodar em sessão nova):
--   select count(*) from public.info_clinica;   -- deve ser 0
--   select count(*) from public.consulta;       -- deve ser 0
-- =============================================================================
