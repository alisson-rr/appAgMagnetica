-- Somente banco local descartável, com bootstrap, chat e memória aplicados.
-- Os dados sintéticos são revertidos; sequências podem avançar.
\set ON_ERROR_STOP on
begin;
do $$
declare
  empresa bigint; outra bigint; cliente_a bigint; cliente_b bigint;
  conversa_a bigint; revisao_antes bigint; corte bigint; job record;
begin
  insert into info_clinica(nome,automacao_ativa) values('Teste memória A',true) returning id into empresa;
  insert into info_clinica(nome,automacao_ativa) values('Teste memória B',true) returning id into outra;
  insert into cliente(nome,id_info_clinica) values('Cliente sintético',empresa) returning id into cliente_a;
  insert into cliente(nome,id_info_clinica) values('Cliente sintético',outra) returning id into cliente_b;
  select conversa_id into conversa_a from fn_registrar_mensagem(empresa,'teste-memoria-a','550000000001@s.whatsapp.net',
    cliente_a,'Cliente',false,'cliente','texto','Prefiro cortar com Gustavo','m1',now());
  select revisao into revisao_antes from cliente_memoria_fila where id_info_clinica=empresa and id_cliente=cliente_a;
  assert revisao_antes=1, 'A mensagem precisa enfileirar atomicamente';
  perform fn_registrar_mensagem(empresa,'teste-memoria-a','550000000001@s.whatsapp.net',
    cliente_a,'Cliente',false,'cliente','texto','Prefiro cortar com Gustavo','m1',now());
  assert (select revisao from cliente_memoria_fila where id_info_clinica=empresa and id_cliente=cliente_a)=1,
    'Webhook repetido não pode criar outra revisão';
  assert (select count(*) from fn_claim_memorias(3,empresa,cliente_a))=0, 'Aguardar a inatividade';
  perform fn_priorizar_memoria(empresa,cliente_a);
  insert into mensagem(id_conversa,id_info_clinica,do_negocio,autor,conteudo,provider_message_id)
    values(conversa_a,empresa,true,'ia','Vou consultar os horários do Gustavo','resposta1');
  assert (select processar_apos<=now() from cliente_memoria_fila
    where id_info_clinica=empresa and id_cliente=cliente_a), 'Resposta não adia preferência priorizada';
  assert (select count(*) from fn_claim_memorias(3,outra,cliente_a))=0, 'Não atravessar empresas';
  select * into job from fn_claim_memorias(3,empresa,cliente_a);
  assert job.claim_id is not null, 'Encerramento deve antecipar a consolidação';
  assert (select count(*) from fn_claim_memorias(3,empresa,cliente_a))=0, 'Lease evita dois processadores';
  insert into mensagem(id_conversa,id_info_clinica,do_negocio,autor,conteudo,provider_message_id,provider_em)
    values(conversa_a,empresa,false,'cliente','Agora prefiro Helena','m2',now());
  assert not fn_concluir_memoria(empresa,cliente_a,job.revisao,job.claim_id,'Resumo velho','{}'),
    'Mensagem durante a extração deve invalidar o resumo antigo';
  perform fn_liberar_memoria(empresa,cliente_a,job.claim_id);
  perform fn_priorizar_memoria(empresa,cliente_a);
  select * into job from fn_claim_memorias(3,empresa,cliente_a);
  assert fn_concluir_memoria(empresa,cliente_a,job.revisao,job.claim_id,'Prefere Helena','{"profissional:1":{"valor":"Helena"}}'),
    'Resumo com revisão atual deve persistir';
  assert (select resumo from cliente_memoria where id_info_clinica=empresa and id_cliente=cliente_a)='Prefere Helena';
  assert not fn_concluir_memoria(empresa,cliente_a,job.revisao,job.claim_id,'Duplicado','{}'),
    'Não concluir duas vezes o mesmo job';
  insert into mensagem(id_conversa,id_info_clinica,do_negocio,autor,conteudo,provider_message_id)
    values(conversa_a,empresa,false,'cliente','Quero apagar minhas preferências','m3') returning id into corte;
  perform fn_priorizar_memoria(empresa,cliente_a);
  select * into job from fn_claim_memorias(3,empresa,cliente_a);
  perform fn_limpar_memoria(empresa,cliente_a);
  assert not fn_concluir_memoria(empresa,cliente_a,job.revisao,job.claim_id,'Ressuscitado','{}'),
    'Limpeza invalida extrações em andamento';
  assert (select resumo='' and preferencias='{}'::jsonb and ignorar_ate=corte
    from cliente_memoria where id_info_clinica=empresa and id_cliente=cliente_a), 'Limpeza deve manter corte do histórico';
  assert not exists(select 1 from cliente_memoria where id_info_clinica=outra), 'Perfil da outra empresa intacto';
  begin
    perform fn_limpar_memoria(outra,cliente_a);
    raise exception 'Aceitou cliente de outra empresa';
  exception when raise_exception then
    if sqlerrm <> 'Cliente inválido' then raise; end if;
  end;
  insert into mensagem(id_conversa,id_info_clinica,do_negocio,autor,conteudo,provider_message_id)
    values(conversa_a,empresa,false,'cliente','Agora prefiro mensagens breves','m4');
  update info_clinica set automacao_ativa=false where id=empresa;
  perform fn_priorizar_memoria(empresa,cliente_a);
  assert (select count(*) from fn_claim_memorias(3,empresa,cliente_a))=0, 'Empresa desativada não é processada';
  assert not has_table_privilege('anon','cliente_memoria','SELECT');
  assert not has_table_privilege('authenticated','cliente_memoria_fila','UPDATE');
  assert not has_function_privilege('authenticated','fn_claim_memorias(integer,bigint,bigint)','EXECUTE');
  assert has_function_privilege('service_role','fn_claim_memorias(integer,bigint,bigint)','EXECUTE');
  raise notice 'Memória: fila, deduplicação, lease, revisão, isolamento, limpeza e permissões aprovados.';
end $$;
rollback;
