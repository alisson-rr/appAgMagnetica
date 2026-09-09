-- =============================================================================
-- Teste de fn_claim_lembretes — Agenda Magnética
-- Versão: 1 (2026-09-09)
--
-- Cria duas empresas de mentira, prova as oito regras do claim e termina em
-- ROLLBACK. NADA persiste. Rodar DEPOIS de scripts/lembrete_confirmacao.sql.
--
-- A regra mais cara é a segunda: o mesmo lembrete não pode sair duas vezes.
-- =============================================================================
begin;

do $$
declare
  emp_a int8; emp_b int8;
  prof_a int8; prof_b int8;
  proc_a int8; proc_b int8;
  cli_a int8; cli_b int8;
  c_janela int8; c_passado int8; c_longe int8; c_confirmada int8; c_cancelada int8;
  c_empresa_b int8; c_sem_lembrete int8;
  emp_desligada int8; prof_d int8; proc_d int8; cli_d int8; c_desligada int8;
  n int; linha record;
begin
  -- ---------------------------------------------------------------- cenario
  insert into public.info_clinica (nome, lembrete_horas, automacao_ativa, mensagem_lembrete)
    values ('Studio A', 24, true, 'Oi! Confirma seu horario?') returning id into emp_a;
  insert into public.info_clinica (nome, lembrete_horas, automacao_ativa)
    values ('Barbearia B', 24, true) returning id into emp_b;
  -- Empresa com o atendimento automatico DESLIGADO.
  insert into public.info_clinica (nome, lembrete_horas, automacao_ativa)
    values ('Desligada', 24, false) returning id into emp_desligada;

  insert into public.usuarios (email, senha_hash, nome, id_info_clinica, instance_name)
    values ('a@exemplo.test', 'x', 'Dona A', emp_a, 'agm_teste_a');
  insert into public.usuarios (email, senha_hash, nome, id_info_clinica, instance_name)
    values ('b@exemplo.test', 'x', 'Dono B', emp_b, 'agm_teste_b');
  insert into public.usuarios (email, senha_hash, nome, id_info_clinica, instance_name)
    values ('d@exemplo.test', 'x', 'Dono D', emp_desligada, 'agm_teste_d');

  insert into public.profissional (nome, id_info_clinica) values ('Ana', emp_a) returning id into prof_a;
  insert into public.profissional (nome, id_info_clinica) values ('Bruno', emp_b) returning id into prof_b;
  insert into public.profissional (nome, id_info_clinica) values ('Dara', emp_desligada) returning id into prof_d;

  insert into public.procedimento (nome, duracao_minutos, valor, id_info_clinica)
    values ('Limpeza', 60, 180, emp_a) returning id into proc_a;
  insert into public.procedimento (nome, duracao_minutos, valor, id_info_clinica)
    values ('Corte', 30, 50, emp_b) returning id into proc_b;
  insert into public.procedimento (nome, duracao_minutos, valor, id_info_clinica)
    values ('Corte', 30, 50, emp_desligada) returning id into proc_d;

  insert into public.cliente (nome, telefone, whats, id_info_clinica)
    values ('Marina', '5551999990000', '5551999990000', emp_a) returning id into cli_a;
  insert into public.cliente (nome, telefone, whats, id_info_clinica)
    values ('Joao', '5551988880000', '5551988880000', emp_b) returning id into cli_b;
  insert into public.cliente (nome, telefone, whats, id_info_clinica)
    values ('Dora', '5551977770000', '5551977770000', emp_desligada) returning id into cli_d;

  -- Dentro da janela de 24 h: o unico caso que DEVE sair na empresa A.
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
    values (tstzrange(now() + interval '5 hours', now() + interval '6 hours'),
            'agendado', prof_a, cli_a, proc_a, emp_a) returning id into c_janela;
  -- Ja passou.
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
    values (tstzrange(now() - interval '5 hours', now() - interval '4 hours'),
            'agendado', prof_a, cli_a, proc_a, emp_a) returning id into c_passado;
  -- Longe demais (3 dias, janela de 24 h).
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
    values (tstzrange(now() + interval '3 days', now() + interval '3 days 1 hour'),
            'agendado', prof_a, cli_a, proc_a, emp_a) returning id into c_longe;
  -- Ja confirmada: nao precisa ser lembrada.
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
    values (tstzrange(now() + interval '7 hours', now() + interval '8 hours'),
            'confirmado', prof_a, cli_a, proc_a, emp_a) returning id into c_confirmada;
  -- Cancelada.
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
    values (tstzrange(now() + interval '9 hours', now() + interval '10 hours'),
            'cancelado', prof_a, cli_a, proc_a, emp_a) returning id into c_cancelada;
  -- Empresa B, tambem na janela: tem de sair com o instance_name DELA.
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
    values (tstzrange(now() + interval '4 hours', now() + interval '5 hours'),
            'agendado', prof_b, cli_b, proc_b, emp_b) returning id into c_empresa_b;
  -- Empresa com automacao desligada.
  insert into public.consulta (intervalo, status, id_profissional, id_cliente, id_procedimento, id_info_clinica)
    values (tstzrange(now() + interval '4 hours', now() + interval '5 hours'),
            'agendado', prof_d, cli_d, proc_d, emp_desligada) returning id into c_desligada;

  -- ------------------------------------------------------------- assercoes
  create temp table saida_1 on commit drop as
    select * from public.fn_claim_lembretes(100);

  select count(*) into n from saida_1 where id_consulta = c_janela;
  if n <> 1 then raise exception 'FALHOU: a consulta da janela nao saiu (n=%)', n; end if;
  raise notice 'OK: consulta dentro da janela sai';

  select count(*) into n from saida_1
   where id_consulta in (c_passado, c_longe, c_confirmada, c_cancelada, c_desligada);
  if n <> 0 then raise exception 'FALHOU: saiu consulta que nao devia (n=%)', n; end if;
  raise notice 'OK: passado, fora da janela, confirmada, cancelada e empresa desligada ficam de fora';

  select * into linha from saida_1 where id_consulta = c_janela;
  if linha.instance_name <> 'agm_teste_a' then
    raise exception 'FALHOU: instance_name errado: %', linha.instance_name; end if;
  if linha.telefone <> '5551999990000' then
    raise exception 'FALHOU: telefone errado: %', linha.telefone; end if;
  if linha.mensagem_lembrete <> 'Oi! Confirma seu horario?' then
    raise exception 'FALHOU: mensagem da empresa nao veio'; end if;
  if linha.servico_nome <> 'Limpeza' or linha.profissional_nome <> 'Ana' then
    raise exception 'FALHOU: servico ou profissional errado'; end if;
  raise notice 'OK: a linha carrega instancia, telefone, servico, profissional e a mensagem da empresa';

  select instance_name into linha from saida_1 where id_consulta = c_empresa_b;
  if linha.instance_name <> 'agm_teste_b' then
    raise exception 'FALHOU: empresa B saiu com a instancia errada: %', linha.instance_name; end if;
  raise notice 'OK: cada empresa sai com a propria instancia';

  -- A REGRA MAIS CARA: a segunda chamada nao pode devolver nada de novo.
  select count(*) into n from public.fn_claim_lembretes(100);
  if n <> 0 then raise exception 'FALHOU: lembrete duplicado — a segunda chamada devolveu % linha(s)', n; end if;
  raise notice 'OK: segunda chamada nao repete (sem lembrete duplicado)';

  select count(*) into n from public.consulta
   where id = c_janela and lembrete_enviado_em is not null;
  if n <> 1 then raise exception 'FALHOU: a marca de envio nao foi gravada'; end if;
  raise notice 'OK: a marca de envio fica gravada na consulta';

  -- Desligar o lembrete da empresa tira as proximas do claim.
  update public.info_clinica set lembrete_horas = null where id = emp_b;
  update public.consulta set lembrete_enviado_em = null where id = c_empresa_b;
  select count(*) into n from public.fn_claim_lembretes(100) where id_consulta = c_empresa_b;
  if n <> 0 then raise exception 'FALHOU: empresa com lembrete desligado continuou saindo'; end if;
  raise notice 'OK: lembrete_horas nula desliga a empresa';

  raise notice '--- TODAS AS ASSERCOES PASSARAM ---';
end $$;

rollback;
