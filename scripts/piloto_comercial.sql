-- Ajustes aditivos do piloto. Sem limpeza, reset ou alteração de agendas existentes.
begin;
alter table public.info_clinica
  add column if not exists piloto_ate timestamptz,
  add column if not exists piloto_liberado_por int8 references public.usuarios(id),
  add column if not exists piloto_liberado_em timestamptz,
  add column if not exists whatsapp_responsavel text;

alter table public.conversa
  add column if not exists humano_solicitado_em timestamptz,
  add column if not exists humano_assumido_em timestamptz,
  add column if not exists humano_motivo text,
  add column if not exists aviso_tentativa_em timestamptz,
  add column if not exists aviso_resultado text,
  add column if not exists aviso_provider_id text;

-- Trava no registro: uma solicitação aberta produz no máximo uma tentativa de aviso.
create or replace function public.fn_solicitar_humano(p_empresa int8, p_instancia text, p_jid text, p_motivo text)
returns table(conversa_id int8, nova boolean, solicitado_em timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.conversa;
begin
  if not exists(select 1 from public.usuarios where id_info_clinica=p_empresa and instance_name=p_instancia) then
    raise exception 'instancia invalida';
  end if;
  insert into public.conversa(id_info_clinica,instance_name,remote_jid)
    values(p_empresa,p_instancia,p_jid) on conflict(instance_name,remote_jid) do nothing;
  select * into v from public.conversa where id_info_clinica=p_empresa and instance_name=p_instancia and remote_jid=p_jid for update;
  if not found then raise exception 'conversa invalida'; end if;
  if v.humano_solicitado_em is not null and (v.ia_liberada_em is null or v.humano_solicitado_em>v.ia_liberada_em) then
    return query select v.id,false,v.humano_solicitado_em; return;
  end if;
  update public.conversa set humano_solicitado_em=clock_timestamp(),humano_assumido_em=null,
    humano_motivo=left(p_motivo,80),aviso_tentativa_em=clock_timestamp(),
    aviso_resultado='processando',aviso_provider_id=null where id=v.id
    returning * into v;
  return query select v.id,true,v.humano_solicitado_em;
end $$;
revoke all on function public.fn_solicitar_humano(int8,text,text,text) from public,anon,authenticated;
grant execute on function public.fn_solicitar_humano(int8,text,text,text) to service_role;

alter table public.consulta
  add column if not exists lembrete_tentativa_id uuid,
  add column if not exists lembrete_tentativa_em timestamptz,
  add column if not exists lembrete_inicio timestamptz,
  add column if not exists lembrete_resultado text,
  add column if not exists lembrete_provider_id text,
  add column if not exists lembrete_resultado_em timestamptz;

-- A versão anterior permanece compatível até a atualização do workflow.
-- Não se repete envio de resultado desconhecido: a revisão operacional decide.
create or replace function public.fn_claim_lembretes_v2(p_limite int default 20, p_empresa int8 default null)
returns table(id_consulta int8,instance_name text,telefone text,cliente_nome text,
  inicio timestamptz,servico_nome text,profissional_nome text,mensagem_lembrete text,tentativa_id uuid)
language plpgsql security definer set search_path=public,pg_temp as $$
declare v record;
begin
  for v in
    select c.id,c.id_info_clinica,c.id_cliente,lower(c.intervalo) as inicio
    from public.consulta c join public.info_clinica ic on ic.id=c.id_info_clinica
    where (p_empresa is null or c.id_info_clinica=p_empresa)
      and c.lembrete_enviado_em is null and c.lembrete_tentativa_id is null
      and c.status in ('pendente','agendado') and ic.automacao_ativa
      and ic.lembrete_horas is not null and lower(c.intervalo)>now()
      and lower(c.intervalo)<=now()+make_interval(hours=>ic.lembrete_horas)
      and not exists(select 1 from public.conversa cv where cv.id_info_clinica=c.id_info_clinica
        and cv.id_cliente=c.id_cliente
        and greatest(cv.humano_solicitado_em,cv.humano_assumido_em)>coalesce(cv.ia_liberada_em,'-infinity'::timestamptz))
    order by lower(c.intervalo) limit greatest(1,least(p_limite,100))
    for update of c skip locked
  loop
    -- Uma confirmação em aberto por titular. Evita trocar a reserva a confirmar.
    perform 1 from public.cliente where id=v.id_cliente for update;
    if exists(select 1 from public.consulta c where c.id_cliente=v.id_cliente
      and c.id_info_clinica=v.id_info_clinica and c.id<>v.id
      and c.status in ('pendente','agendado') and lower(c.intervalo)>now()
      and c.lembrete_tentativa_id is not null and c.lembrete_resultado in ('processando','aceito','incerto')) then
      continue;
    end if;
    update public.consulta set lembrete_tentativa_id=gen_random_uuid(),lembrete_tentativa_em=now(),
      lembrete_inicio=v.inicio,lembrete_resultado='processando' where id=v.id;
    if not exists(select 1 from public.usuarios us where us.id_info_clinica=v.id_info_clinica and nullif(us.instance_name,'') is not null)
      or not exists(select 1 from public.cliente cl where cl.id=v.id_cliente and coalesce(nullif(cl.telefone,''),nullif(cl.whats,'')) is not null) then
      update public.consulta set lembrete_resultado='falha',lembrete_resultado_em=now() where id=v.id;
      continue;
    end if;
    return query select c.id,u.instance_name,coalesce(cl.telefone,cl.whats),cl.nome,v.inicio,
      pr.nome,p.nome,ic.mensagem_lembrete,c.lembrete_tentativa_id
    from public.consulta c join public.info_clinica ic on ic.id=c.id_info_clinica
      join public.cliente cl on cl.id=c.id_cliente
      join public.procedimento pr on pr.id=c.id_procedimento
      join public.profissional p on p.id=c.id_profissional
      left join lateral (select us.instance_name from public.usuarios us where us.id_info_clinica=c.id_info_clinica
        and us.instance_name is not null order by us.id limit 1) u on true
    where c.id=v.id;
  end loop;
end $$;
revoke all on function public.fn_claim_lembretes_v2(int,int8) from public,anon,authenticated;
grant execute on function public.fn_claim_lembretes_v2(int,int8) to service_role;

-- Callback idempotente, vinculado à tentativa e ao horário que foi lembrado.
create or replace function public.fn_resultado_lembrete(p_empresa int8,p_consulta int8,p_tentativa uuid,
  p_resultado text,p_provider_id text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.consulta;
begin
  if p_resultado not in ('aceito','falha','incerto') then raise exception 'resultado invalido'; end if;
  if p_resultado='aceito' and coalesce(trim(p_provider_id),'')='' then raise exception 'id obrigatorio'; end if;
  select * into v from public.consulta where id=p_consulta and id_info_clinica=p_empresa
    and lembrete_tentativa_id=p_tentativa for update;
  if not found then return false; end if;
  if v.lembrete_resultado<>'processando' then return v.lembrete_resultado=p_resultado; end if;
  update public.consulta set lembrete_resultado=p_resultado,lembrete_provider_id=p_provider_id,
    lembrete_resultado_em=now(),lembrete_enviado_em=case when p_resultado='aceito' then now() else null end
    where id=v.id;
  return true;
end $$;
revoke all on function public.fn_resultado_lembrete(int8,int8,uuid,text,text) from public,anon,authenticated;
grant execute on function public.fn_resultado_lembrete(int8,int8,uuid,text,text) to service_role;
comment on column public.consulta.lembrete_enviado_em is 'Aceito pelo provedor com id; não comprova entrega ou leitura.';
notify pgrst,'reload schema';
commit;
