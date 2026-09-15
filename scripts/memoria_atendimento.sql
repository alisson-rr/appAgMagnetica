-- Memória por empresa e cliente. Aplicar depois de chat_atendimento.sql.
-- Reexecutável. Não copia conversas nem modifica a agenda.
begin;

create table if not exists public.cliente_memoria (
  id_info_clinica bigint not null references public.info_clinica(id) on delete cascade,
  id_cliente bigint not null references public.cliente(id) on delete cascade,
  resumo text not null default '' check (length(resumo) <= 800),
  preferencias jsonb not null default '{}'::jsonb check (jsonb_typeof(preferencias) = 'object'),
  versao bigint not null default 0,
  ignorar_ate bigint not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (id_info_clinica, id_cliente)
);

create table if not exists public.cliente_memoria_fila (
  id_info_clinica bigint not null references public.info_clinica(id) on delete cascade,
  id_cliente bigint not null references public.cliente(id) on delete cascade,
  revisao bigint not null default 1,
  processar_apos timestamptz,
  claim_id uuid,
  claim_ate timestamptz,
  primary key (id_info_clinica, id_cliente)
);
create index if not exists ix_memoria_pendente on public.cliente_memoria_fila(processar_apos)
  where processar_apos is not null;

-- A fila nasce na mesma transação da mensagem. Uma falha de rede depois do
-- registro não pode perder o pedido de resumo. Toda inserção aumenta a revisão,
-- inclusive uma mensagem atrasada cujo id seja menor que o último processado.
create or replace function public.fn_enfileirar_memoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cliente bigint;
begin
  select c.id_cliente into v_cliente
    from public.conversa c join public.cliente p on p.id = c.id_cliente
   where c.id = new.id_conversa and c.id_info_clinica = new.id_info_clinica
     and p.id_info_clinica = new.id_info_clinica;
  if v_cliente is null then return new; end if;
  insert into public.cliente_memoria_fila(id_info_clinica,id_cliente,processar_apos)
  values(new.id_info_clinica,v_cliente,now() + interval '30 minutes')
  on conflict(id_info_clinica,id_cliente) do update
    set revisao = cliente_memoria_fila.revisao + 1,
        -- A resposta da recepção não adia uma preferência explícita já priorizada.
        processar_apos = case when cliente_memoria_fila.processar_apos <= now()
          then cliente_memoria_fila.processar_apos else now() + interval '30 minutes' end;
  return new;
end $$;
drop trigger if exists mensagem_enfileira_memoria on public.mensagem;
create trigger mensagem_enfileira_memoria after insert on public.mensagem
  for each row execute function public.fn_enfileirar_memoria();

create or replace function public.fn_priorizar_memoria(p_empresa bigint,p_cliente bigint)
returns void language sql security definer set search_path = public as $$
  update public.cliente_memoria_fila set processar_apos = now()
   where id_info_clinica = p_empresa and id_cliente = p_cliente
     and exists(select 1 from public.cliente c where c.id = p_cliente and c.id_info_clinica = p_empresa);
$$;

-- O relógio usa todas as empresas ativas. Uma chamada dirigida usa os dois
-- filtros juntos; nenhum identificador de empresa vem do modelo/n8n.
create or replace function public.fn_claim_memorias(
  p_limite integer default 3, p_empresa bigint default null, p_cliente bigint default null
) returns table(id_info_clinica bigint,id_cliente bigint,revisao bigint,claim_id uuid)
language plpgsql security definer set search_path = public as $$
begin
  if (p_empresa is null) <> (p_cliente is null) then
    raise exception 'Filtros incompletos';
  end if;
  return query
  with escolhidas as (
    select f.id_info_clinica,f.id_cliente from public.cliente_memoria_fila f
    join public.info_clinica e on e.id = f.id_info_clinica
    join public.cliente c on c.id = f.id_cliente and c.id_info_clinica = f.id_info_clinica
    where f.processar_apos <= now() and (f.claim_ate is null or f.claim_ate < now())
      and e.automacao_ativa
      and (p_empresa is null or (f.id_info_clinica = p_empresa and f.id_cliente = p_cliente))
    order by f.processar_apos
    limit greatest(1,least(p_limite,5)) for update of f skip locked
  )
  update public.cliente_memoria_fila f
     set claim_id = gen_random_uuid(), claim_ate = now() + interval '5 minutes'
    from escolhidas x
   where f.id_info_clinica = x.id_info_clinica and f.id_cliente = x.id_cliente
  returning f.id_info_clinica,f.id_cliente,f.revisao,f.claim_id;
end $$;

create or replace function public.fn_concluir_memoria(
  p_empresa bigint,p_cliente bigint,p_revisao bigint,p_claim uuid,
  p_resumo text,p_preferencias jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare f public.cliente_memoria_fila;
begin
  select * into f from public.cliente_memoria_fila
   where id_info_clinica = p_empresa and id_cliente = p_cliente for update;
  if not found or f.revisao <> p_revisao or f.claim_id is distinct from p_claim
     or f.claim_ate <= now() then return false; end if;
  if not exists(select 1 from public.cliente c where c.id = p_cliente and c.id_info_clinica = p_empresa)
    then return false; end if;
  insert into public.cliente_memoria(id_info_clinica,id_cliente,resumo,preferencias,versao)
    values(p_empresa,p_cliente,left(p_resumo,800),p_preferencias,1)
  on conflict(id_info_clinica,id_cliente) do update
    set resumo = excluded.resumo, preferencias = excluded.preferencias,
        versao = cliente_memoria.versao + 1, atualizado_em = now();
  update public.cliente_memoria_fila set processar_apos = null,claim_id = null,claim_ate = null
    where id_info_clinica = p_empresa and id_cliente = p_cliente;
  return true;
end $$;

create or replace function public.fn_liberar_memoria(p_empresa bigint,p_cliente bigint,p_claim uuid)
returns void language sql security definer set search_path = public as $$
  update public.cliente_memoria_fila
     set claim_id = null,claim_ate = null,
         processar_apos = greatest(coalesce(processar_apos,now()),now() + interval '5 minutes')
   where id_info_clinica = p_empresa and id_cliente = p_cliente and claim_id = p_claim;
$$;

-- Limpeza deixa um corte de histórico para o próximo resumo não reaprender o
-- que acabou de ser apagado. Também invalida resumos que já estavam em voo.
create or replace function public.fn_limpar_memoria(p_empresa bigint,p_cliente bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_corte bigint;
begin
  if not exists(select 1 from public.cliente c where c.id = p_cliente and c.id_info_clinica = p_empresa)
    then raise exception 'Cliente inválido'; end if;
  insert into public.cliente_memoria_fila(id_info_clinica,id_cliente)
    values(p_empresa,p_cliente) on conflict do nothing;
  perform 1 from public.cliente_memoria_fila
    where id_info_clinica = p_empresa and id_cliente = p_cliente for update;
  select coalesce(max(m.id),0) into v_corte from public.mensagem m
    join public.conversa c on c.id = m.id_conversa and c.id_info_clinica = m.id_info_clinica
    where c.id_info_clinica = p_empresa and c.id_cliente = p_cliente;
  insert into public.cliente_memoria(id_info_clinica,id_cliente,ignorar_ate)
    values(p_empresa,p_cliente,v_corte)
  on conflict(id_info_clinica,id_cliente) do update
    set resumo = '',preferencias = '{}'::jsonb,ignorar_ate = v_corte,
        versao = cliente_memoria.versao + 1,atualizado_em = now();
  update public.cliente_memoria_fila
    set revisao = revisao + 1,processar_apos = null,claim_id = null,claim_ate = null
    where id_info_clinica = p_empresa and id_cliente = p_cliente;
end $$;

alter table public.cliente_memoria enable row level security;
alter table public.cliente_memoria_fila enable row level security;
revoke all on public.cliente_memoria,public.cliente_memoria_fila from anon,authenticated;
grant select,insert,update,delete on public.cliente_memoria,public.cliente_memoria_fila to service_role;
revoke all on function public.fn_enfileirar_memoria() from public,anon,authenticated;
revoke all on function public.fn_priorizar_memoria(bigint,bigint) from public,anon,authenticated;
revoke all on function public.fn_claim_memorias(integer,bigint,bigint) from public,anon,authenticated;
revoke all on function public.fn_concluir_memoria(bigint,bigint,bigint,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.fn_liberar_memoria(bigint,bigint,uuid) from public,anon,authenticated;
revoke all on function public.fn_limpar_memoria(bigint,bigint) from public,anon,authenticated;
grant execute on function public.fn_priorizar_memoria(bigint,bigint) to service_role;
grant execute on function public.fn_claim_memorias(integer,bigint,bigint) to service_role;
grant execute on function public.fn_concluir_memoria(bigint,bigint,bigint,uuid,text,jsonb) to service_role;
grant execute on function public.fn_liberar_memoria(bigint,bigint,uuid) to service_role;
grant execute on function public.fn_limpar_memoria(bigint,bigint) to service_role;
commit;
