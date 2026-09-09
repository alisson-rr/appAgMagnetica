-- =============================================================================
-- Teste de fn_registrar_mensagem — Agenda Magnética
-- Versão: 1 (2026-09-09)
--
-- Prova a idempotência e os efeitos colaterais, e termina em ROLLBACK.
-- NADA persiste. Rodar DEPOIS de scripts/chat_atendimento.sql.
--
-- A regra que mais importa: reentrega do mesmo webhook não pode contar duas
-- vezes como não lida nem duplicar a mensagem na tela.
-- =============================================================================
begin;

do $$
declare
  emp_a int8; emp_b int8; cli int8;
  r record; conversa_a int8; n int; texto text;
begin
  insert into public.info_clinica (nome) values ('Chat A') returning id into emp_a;
  insert into public.info_clinica (nome) values ('Chat B') returning id into emp_b;
  insert into public.cliente (nome, telefone, whats, id_info_clinica)
    values ('Marina', '5551999990000', '5551999990000', emp_a) returning id into cli;

  -- 1. primeira mensagem do cliente
  select * into r from public.fn_registrar_mensagem(
    emp_a, 'agm_a', '5551999990000@s.whatsapp.net', cli, 'Marina',
    false, 'cliente', 'texto', 'oi, quero marcar', 'MSG1', now());
  if not r.inserida then raise exception 'FALHOU: a primeira mensagem nao foi inserida'; end if;
  if r.nao_lidas_total <> 1 then raise exception 'FALHOU: nao lidas deveria ser 1, e %', r.nao_lidas_total; end if;
  conversa_a := r.conversa_id;
  raise notice 'OK: primeira mensagem cria conversa e conta como nao lida';

  -- 2. A REGRA CARA: reentrega do mesmo id nao duplica nem reconta
  select * into r from public.fn_registrar_mensagem(
    emp_a, 'agm_a', '5551999990000@s.whatsapp.net', cli, 'Marina',
    false, 'cliente', 'texto', 'oi, quero marcar', 'MSG1', now());
  if r.inserida then raise exception 'FALHOU: reentrega foi inserida de novo'; end if;
  if r.nao_lidas_total <> 1 then raise exception 'FALHOU: reentrega recontou nao lida (%)', r.nao_lidas_total; end if;
  select count(*) into n from public.mensagem where id_conversa = conversa_a;
  if n <> 1 then raise exception 'FALHOU: mensagem duplicada na tela (%)', n; end if;
  raise notice 'OK: reentrega do mesmo webhook nao duplica nem reconta';

  -- 3. resposta do negocio nao conta como nao lida
  select * into r from public.fn_registrar_mensagem(
    emp_a, 'agm_a', '5551999990000@s.whatsapp.net', cli, 'Marina',
    true, 'ia', 'texto', 'Oi! Claro, para quando?', 'MSG2', now() + interval '1 second');
  if r.nao_lidas_total <> 1 then raise exception 'FALHOU: resposta do negocio contou como nao lida'; end if;
  raise notice 'OK: resposta do negocio nao conta como nao lida';

  -- 4. o resumo acompanha a mensagem mais nova
  select ultima_mensagem into texto from public.conversa where id = conversa_a;
  if texto <> 'Oi! Claro, para quando?' then
    raise exception 'FALHOU: resumo nao acompanhou (%)', texto; end if;
  raise notice 'OK: o resumo mostra a mensagem mais nova';

  -- 5. webhook atrasado nao rebobina o resumo
  perform public.fn_registrar_mensagem(
    emp_a, 'agm_a', '5551999990000@s.whatsapp.net', cli, 'Marina',
    false, 'cliente', 'texto', 'MENSAGEM VELHA', 'MSG0', now() - interval '1 hour');
  select ultima_mensagem into texto from public.conversa where id = conversa_a;
  if texto <> 'Oi! Claro, para quando?' then
    raise exception 'FALHOU: webhook atrasado sobrescreveu o resumo (%)', texto; end if;
  raise notice 'OK: webhook fora de ordem nao rebobina o resumo';

  -- 6. mensagem do painel entra como intervencao humana, e nao como IA
  select * into r from public.fn_registrar_mensagem(
    emp_a, 'agm_a', '5551999990000@s.whatsapp.net', cli, 'Marina',
    true, 'painel', 'texto', 'aqui e a Ana, pode falar', 'MSG3', now() + interval '2 seconds');
  select count(*) into n from public.mensagem
   where id_conversa = conversa_a and autor = 'painel';
  if n <> 1 then raise exception 'FALHOU: autor painel nao foi gravado'; end if;
  raise notice 'OK: mensagem do painel fica marcada como pessoa, nao como IA';

  -- 7. o mesmo contato em OUTRA instancia e outra conversa
  select * into r from public.fn_registrar_mensagem(
    emp_b, 'agm_b', '5551999990000@s.whatsapp.net', null, 'Marina',
    false, 'cliente', 'texto', 'oi', 'MSG9', now());
  if r.conversa_id = conversa_a then
    raise exception 'FALHOU: o mesmo telefone juntou duas empresas na mesma conversa'; end if;
  select count(*) into n from public.mensagem
   where id_conversa = conversa_a and id_info_clinica <> emp_a;
  if n <> 0 then raise exception 'FALHOU: mensagem de outra empresa entrou na conversa'; end if;
  raise notice 'OK: mesmo telefone em duas empresas sao duas conversas';

  -- 8. o mesmo id de provedor pode existir em conversas diferentes
  select * into r from public.fn_registrar_mensagem(
    emp_b, 'agm_b', '5551999990000@s.whatsapp.net', null, 'Marina',
    false, 'cliente', 'texto', 'outro', 'MSG1', now());
  if not r.inserida then
    raise exception 'FALHOU: id de provedor de OUTRA conversa foi tratado como repetido'; end if;
  raise notice 'OK: a unicidade e por conversa, nao global';

  raise notice '--- TODAS AS ASSERCOES PASSARAM ---';
end $$;

rollback;
