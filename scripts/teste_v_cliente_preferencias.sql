-- =============================================================================
-- Teste de v_cliente_preferencias — Agenda Magnética
-- Versão: 1 (2026-09-09)
--
-- Cria duas empresas de mentira, prova as sete regras da view e termina em
-- ROLLBACK. NADA persiste. Pode rodar quantas vezes quiser, inclusive no banco
-- oficial. Rodar DEPOIS de scripts/v_cliente_preferencias.sql.
--
-- Cada verificação emite NOTICE 'OK: ...'. Qualquer falha levanta exceção e
-- aborta — não existe "passou pela metade".
-- =============================================================================
begin;

do $$
declare
  emp_a  int8; emp_b  int8;
  gustavo int8; natalia int8; saiu int8; prof_b int8;
  proc_a int8; proc_b int8;
  c_fiel int8; c_uma int8; c_meio int8; c_dois_de_tres int8;
  c_cancelador int8; c_do_que_saiu int8; c_cruzado int8;
  achou int8; nome text; n int;
begin
  insert into public.info_clinica (nome) values ('Teste A') returning id into emp_a;
  insert into public.info_clinica (nome) values ('Teste B') returning id into emp_b;

  insert into public.profissional (nome, id_info_clinica) values ('Gustavo', emp_a) returning id into gustavo;
  insert into public.profissional (nome, id_info_clinica) values ('Natalia', emp_a) returning id into natalia;
  insert into public.profissional (nome, ativo, id_info_clinica) values ('Saiu', false, emp_a) returning id into saiu;
  insert into public.profissional (nome, id_info_clinica) values ('Prof B', emp_b) returning id into prof_b;

  insert into public.procedimento (nome, duracao_minutos, valor, id_info_clinica)
    values ('Corte', 30, 50, emp_a) returning id into proc_a;
  insert into public.procedimento (nome, duracao_minutos, valor, id_info_clinica)
    values ('Corte', 30, 50, emp_b) returning id into proc_b;

  insert into public.cliente (nome, id_info_clinica) values ('Fiel', emp_a) returning id into c_fiel;
  insert into public.cliente (nome, id_info_clinica) values ('So uma', emp_a) returning id into c_uma;
  insert into public.cliente (nome, id_info_clinica) values ('Meio a meio', emp_a) returning id into c_meio;
  insert into public.cliente (nome, id_info_clinica) values ('Dois de tres', emp_a) returning id into c_dois_de_tres;
  insert into public.cliente (nome, id_info_clinica) values ('Cancelador', emp_a) returning id into c_cancelador;
  insert into public.cliente (nome, id_info_clinica) values ('Do que saiu', emp_a) returning id into c_do_que_saiu;
  insert into public.cliente (nome, id_info_clinica) values ('Cruzado', emp_b) returning id into c_cruzado;

  -- FIEL: 3 consultas com o Gustavo -> habitual
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
  select tstzrange(now() - (i || ' days')::interval, now() - (i || ' days')::interval + interval '30 min'),
         'concluido', gustavo, c_fiel, proc_a, emp_a
  from generate_series(10, 30, 10) i;

  -- SO UMA: uma consulta -> nao aparece (corte de 2)
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
  values (tstzrange(now() - interval '10 days', now() - interval '10 days' + interval '30 min'),
          'concluido', gustavo, c_uma, proc_a, emp_a);

  -- MEIO A MEIO: 1 Gustavo + 1 Natalia = 50% -> nao aparece
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
  values (tstzrange(now() - interval '10 days', now() - interval '10 days' + interval '30 min'),
          'concluido', gustavo, c_meio, proc_a, emp_a),
         (tstzrange(now() - interval '20 days', now() - interval '20 days' + interval '30 min'),
          'concluido', natalia, c_meio, proc_a, emp_a);

  -- DOIS DE TRES: 67% -> aparece com Gustavo
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
  values (tstzrange(now() - interval '10 days', now() - interval '10 days' + interval '30 min'),
          'concluido', gustavo, c_dois_de_tres, proc_a, emp_a),
         (tstzrange(now() - interval '20 days', now() - interval '20 days' + interval '30 min'),
          'concluido', gustavo, c_dois_de_tres, proc_a, emp_a),
         (tstzrange(now() - interval '30 days', now() - interval '30 days' + interval '30 min'),
          'concluido', natalia, c_dois_de_tres, proc_a, emp_a);

  -- CANCELADOR: 3 canceladas com Gustavo + 0 validas -> nao aparece
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
  select tstzrange(now() - (i || ' days')::interval, now() - (i || ' days')::interval + interval '30 min'),
         'cancelado', gustavo, c_cancelador, proc_a, emp_a
  from generate_series(10, 30, 10) i;

  -- DO QUE SAIU: 3 com profissional inativo -> nao aparece
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
  select tstzrange(now() - (i || ' days')::interval, now() - (i || ' days')::interval + interval '30 min'),
         'concluido', saiu, c_do_que_saiu, proc_a, emp_a
  from generate_series(10, 30, 10) i;

  -- CRUZADO (empresa B): 2 com prof_b -> aparece, mas so na empresa B
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
  values (tstzrange(now() - interval '10 days', now() - interval '10 days' + interval '30 min'),
          'concluido', prof_b, c_cruzado, proc_b, emp_b),
         (tstzrange(now() - interval '20 days', now() - interval '20 days' + interval '30 min'),
          'concluido', prof_b, c_cruzado, proc_b, emp_b);

  -- ================= ASSERCOES =================
  select profissional_habitual_id, profissional_habitual_nome into achou, nome
    from public.v_cliente_preferencias where id_cliente = c_fiel;
  if achou is distinct from gustavo then raise exception 'FALHOU: fiel deveria ser Gustavo, veio %', achou; end if;
  if nome <> 'Gustavo' then raise exception 'FALHOU: nome errado: %', nome; end if;
  raise notice 'OK: 3 consultas com o mesmo -> habitual, com nome';

  if exists (select 1 from public.v_cliente_preferencias where id_cliente = c_uma) then
    raise exception 'FALHOU: uma consulta so nao pode virar habito'; end if;
  raise notice 'OK: uma consulta so nao vira habito';

  if exists (select 1 from public.v_cliente_preferencias where id_cliente = c_meio) then
    raise exception 'FALHOU: 50%% nao pode passar do corte de 60%%'; end if;
  raise notice 'OK: 50 por cento nao passa';

  select profissional_habitual_id into achou
    from public.v_cliente_preferencias where id_cliente = c_dois_de_tres;
  if achou is distinct from gustavo then raise exception 'FALHOU: 2 de 3 deveria dar Gustavo, veio %', achou; end if;
  raise notice 'OK: 2 de 3 (67 por cento) passa';

  if exists (select 1 from public.v_cliente_preferencias where id_cliente = c_cancelador) then
    raise exception 'FALHOU: consulta cancelada nao e preferencia'; end if;
  raise notice 'OK: cancelada nao conta';

  if exists (select 1 from public.v_cliente_preferencias where id_cliente = c_do_que_saiu) then
    raise exception 'FALHOU: profissional inativo nao pode ser oferecido'; end if;
  raise notice 'OK: profissional que saiu nao e oferecido';

  select count(*) into n from public.v_cliente_preferencias
    where id_cliente = c_cruzado and id_info_clinica = emp_a;
  if n <> 0 then raise exception 'FALHOU: vazou entre empresas'; end if;
  select count(*) into n from public.v_cliente_preferencias
    where id_cliente = c_cruzado and id_info_clinica = emp_b;
  if n <> 1 then raise exception 'FALHOU: empresa B deveria ter 1 linha, tem %', n; end if;
  raise notice 'OK: isolamento entre empresas';

  -- JANELA: envelhecer as consultas do fiel para 13 meses atras
  update public.consulta set intervalo = tstzrange(
      lower(intervalo) - interval '13 months', upper(intervalo) - interval '13 months')
    where id_cliente = c_fiel;
  if exists (select 1 from public.v_cliente_preferencias where id_cliente = c_fiel) then
    raise exception 'FALHOU: historico de 13 meses nao deveria mais contar'; end if;
  raise notice 'OK: janela de 12 meses corta historico velho';

  raise notice '--- TODAS AS ASSERCOES PASSARAM ---';
end $$;

rollback;
