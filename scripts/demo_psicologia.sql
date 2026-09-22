-- Conta modelo autorizada: dev.alisson.rosa@gmail.com / empresa 65.
-- Execute no SQL Editor do Supabase ou em uma conexão administrativa.
-- Transacional e reexecutável: atualiza os cadastros desta conta e acrescenta
-- 8 contatos fictícios e 15 consultas, sem duplicar ou apagar o histórico.
-- Não altera login, instância, prazo do piloto, planos, preços ou pagamentos.
-- Os contatos novos ficam SEM telefone/WhatsApp. Consultas futuras já estão
-- confirmadas, portanto não entram na fila de lembretes da demonstração.
-- A semana é a atual em São Paulo na primeira execução e fica preservada depois.

begin;

do $$
declare
  v_empresa constant bigint := 65;
  v_profissional constant bigint := 59;
  v_ids bigint[];
  v_horas bigint[];
  v_clientes bigint[] := '{}';
  v_nomes text[] := array['Ana Martins','Bruno Almeida','Camila Lopes','Diego Ferreira',
                         'Elisa Costa','Felipe Moura','Gabriela Santos','Henrique Lima'];
  v_semana date;
  v_inicio timestamptz;
  v_status text;
  v_cliente bigint;
  v_email text;
  v_dia int;
  v_hora_inicio time;
  v_hora_fim time;
  i int;
  r record;
begin
  perform pg_advisory_xact_lock(650921, v_empresa::int);
  if not exists(select 1 from public.usuarios where id=86
      and email='dev.alisson.rosa@gmail.com' and id_info_clinica=v_empresa
      and instance_name='agm_86_alissonrosa') then
    raise exception 'A conta/empresa de demonstração não corresponde ao destino autorizado.';
  end if;
  perform 1 from public.info_clinica where id=v_empresa for update;
  if not exists(select 1 from public.profissional where id=v_profissional and id_info_clinica=v_empresa)
     or (select count(*) from public.procedimento where id in (66,96) and id_info_clinica=v_empresa)<>2 then
    raise exception 'Os cadastros esperados da demonstração não foram encontrados.';
  end if;
  if exists(select 1 from public.consulta where id_info_clinica=v_empresa
      and status in ('pendente','agendado','confirmado') and lower(intervalo)>now()
      and coalesce(chave_idempotencia,'') not like 'demo-psicologia-65:%') then
    raise exception 'Há reserva futura fora da demonstração. Confira antes de mudar serviços e expediente.';
  end if;

  update public.info_clinica set
    nome='Marina Azevedo · Psicologia',
    email='contato.marina.azevedo@example.invalid',
    endereco='Atendimento online · Porto Alegre/RS',
    descricao=$texto$Consultório demonstrativo de psicologia, com profissional e pacientes fictícios.
Psicoterapia individual para adultos, com atendimento online pela psicóloga Marina Azevedo.
As sessões duram 50 minutos. Na primeira sessão, a profissional acolhe a demanda e combina os próximos passos com a pessoa.
Atendimento de segunda a sexta, das 9h às 12h e das 14h às 19h, sempre com agendamento. Não há atendimento aos sábados e domingos.
Para a sessão online, escolha um lugar reservado, com internet estável e, se possível, fones de ouvido. O acesso à chamada é combinado diretamente com a profissional.
Atendimento particular. Valores aparecem no catálogo de serviços; o pagamento é combinado diretamente com a profissional.
Se precisar remarcar ou cancelar, avise pelo WhatsApp, de preferência com 24 horas de antecedência.
A assistente virtual do consultório ajuda com informações, horários e agendamentos. Dúvidas clínicas são encaminhadas à profissional. Este WhatsApp não é um serviço de emergência.$texto$,
    assistente_nome='Clara', assistente_tom='acolhedor', exige_profissional=false,
    mensagem_lembrete='Oi, {nome}! Passando para lembrar da sua sessão em {data}, às {horario}. Você confirma sua presença? Se precisar remarcar, me avise por aqui.'
  where id=v_empresa;

  update public.profissional set nome='Marina Azevedo', ativo=true,
    id_area_atuacao=(select id from public.area_atuacao where nome='Psicologia' order by id limit 1),
    observacoes='Profissional fictícia da conta demonstrativa. Psicoterapia individual online para adultos.'
  where id=v_profissional and id_info_clinica=v_empresa;
  -- O cadastro usado na validação anterior permanece inativo e com seu histórico.
  update public.profissional set nome='Marina Azevedo (arquivo de testes)', ativo=false,
    observacoes='Cadastro inativo da validação técnica anterior; não oferece horários.'
  where id=99 and id_info_clinica=v_empresa;

  update public.procedimento set nome='Sessão de psicoterapia individual', duracao_minutos=50,
    descricao='Sessão individual online de acompanhamento com Marina Azevedo.',
    orientacoes='Reserve um ambiente tranquilo e com privacidade para os 50 minutos de sessão.'
  where id=66 and id_info_clinica=v_empresa;
  update public.procedimento set nome='Primeira sessão de psicoterapia', duracao_minutos=50,
    descricao='Primeiro encontro online para conhecer a demanda e combinar o acompanhamento.',
    orientacoes='Não é necessário preparar um relato. O acesso à chamada é combinado com a profissional.'
  where id=96 and id_info_clinica=v_empresa;
  insert into public.profissional_procedimento(id_profissional,id_procedimento)
    values(v_profissional,66),(v_profissional,96)
    on conflict(id_profissional,id_procedimento) do nothing;

  -- Reaproveita as linhas existentes em vez de apagar horários.
  select array_agg(id order by id) into v_ids from public.horario_clinica where id_info_clinica=v_empresa;
  select array_agg(id order by id) into v_horas from public.disponibilidade_profissional where id_profissional=v_profissional;
  if coalesce(cardinality(v_ids),0)>10 or coalesce(cardinality(v_horas),0)>10 then
    raise exception 'Há mais turnos que o esperado. Revisão manual necessária; nenhum horário foi apagado.';
  end if;
  for i in 1..10 loop
    v_dia := ((i-1)/2)+1;
    v_hora_inicio := case when i%2=1 then time '09:00' else time '14:00' end;
    v_hora_fim := case when i%2=1 then time '12:00' else time '19:00' end;
    if v_ids[i] is null then
      insert into public.horario_clinica(id_info_clinica,dia_semana,hora_inicio,hora_fim)
        values(v_empresa,v_dia,v_hora_inicio,v_hora_fim);
    else
      update public.horario_clinica set dia_semana=v_dia,hora_inicio=v_hora_inicio,hora_fim=v_hora_fim
        where id=v_ids[i] and id_info_clinica=v_empresa;
    end if;
    if v_horas[i] is null then
      insert into public.disponibilidade_profissional(id_profissional,dia_semana,hora_inicio,hora_fim)
        values(v_profissional,v_dia,v_hora_inicio,v_hora_fim);
    else
      update public.disponibilidade_profissional set dia_semana=v_dia,hora_inicio=v_hora_inicio,hora_fim=v_hora_fim
        where id=v_horas[i] and id_profissional=v_profissional;
    end if;
  end loop;

  for i in 1..cardinality(v_nomes) loop
    v_email := 'demo.psicologia.' || i || '@example.invalid';
    select id into v_cliente from public.cliente where id_info_clinica=v_empresa and email=v_email;
    if v_cliente is null then
      insert into public.cliente(nome,email,telefone,whats,status,interesses,id_info_clinica)
        values(v_nomes[i],v_email,null,null,'ativo','Contato fictício para demonstração; sem envio de mensagens.',v_empresa)
        returning id into v_cliente;
    elsif exists(select 1 from public.cliente where id=v_cliente
        and (nullif(telefone,'') is not null or nullif(whats,'') is not null)) then
      raise exception 'Um contato de demonstração recebeu telefone. Nenhuma mensagem ou alteração foi feita.';
    end if;
    v_clientes := array_append(v_clientes,v_cliente);
  end loop;

  select date_trunc('week',min(lower(intervalo)) at time zone 'America/Sao_Paulo')::date
    into v_semana from public.consulta where id_info_clinica=v_empresa
      and chave_idempotencia like 'demo-psicologia-65:%';
  v_semana := coalesce(v_semana,date_trunc('week',now() at time zone 'America/Sao_Paulo')::date);
  for r in select * from (values
    (1,0,time '09:00',1,66,false),(2,0,time '10:00',2,96,false),
    (3,0,time '14:00',3,66,false),(4,0,time '15:00',4,66,true),
    (5,0,time '18:00',5,96,false),(6,1,time '09:00',6,66,false),
    (7,1,time '10:30',7,96,false),(8,1,time '14:00',8,66,false),
    (9,2,time '09:00',1,66,false),(10,2,time '11:00',2,66,false),
    (11,2,time '16:00',3,66,false),(12,3,time '09:00',4,96,false),
    (13,3,time '14:00',5,66,false),(14,4,time '10:00',6,66,false),
    (15,4,time '15:00',7,66,false)
  ) as exemplos(numero,dia,hora,cliente,servico,cancelada) loop
    v_inicio := ((v_semana+r.dia)+r.hora) at time zone 'America/Sao_Paulo';
    v_status := case when r.cancelada then 'cancelado'
                     when v_inicio+interval '50 minutes'<now() then 'concluido' else 'confirmado' end;
    insert into public.consulta(id_info_clinica,id_profissional,id_cliente,id_procedimento,
      intervalo,status,valor_cobrado,chave_idempotencia,confirmado_em,cancelado_em,motivo_cancelamento)
    select v_empresa,v_profissional,v_clientes[r.cliente],r.servico,
      tstzrange(v_inicio,v_inicio+interval '50 minutes','[)'),v_status,p.valor,
      'demo-psicologia-65:'||lpad(r.numero::text,2,'0'),
      case when not r.cancelada then least(now(),v_inicio-interval '1 day') end,
      case when r.cancelada then least(now(),v_inicio-interval '1 day') end,
      case when r.cancelada then 'Cancelamento fictício da demonstração' end
    from public.procedimento p where p.id=r.servico and p.id_info_clinica=v_empresa
    on conflict(chave_idempotencia) where chave_idempotencia is not null do nothing;
  end loop;
end $$;

commit;

-- Conferência: 8 contatos sem telefone, 15 consultas, 10 turnos e 1 profissional ativo.
select 'contatos de exemplo' as item,count(*) as quantidade from public.cliente
  where id_info_clinica=65 and email like 'demo.psicologia.%@example.invalid'
union all select 'consultas de exemplo',count(*) from public.consulta
  where id_info_clinica=65 and chave_idempotencia like 'demo-psicologia-65:%'
union all select 'turnos do consultório',count(*) from public.horario_clinica where id_info_clinica=65
union all select 'profissionais ativos',count(*) from public.profissional where id_info_clinica=65 and ativo;
