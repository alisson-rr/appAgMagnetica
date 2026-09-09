-- =============================================================================
-- Chat de atendimento no painel — Agenda Magnética
-- Versão: 1 (2026-09-09). Rodar depois de scripts/bootstrap_schema.sql.
-- Reexecutável: rodar duas vezes produz o mesmo estado e nenhum erro.
--
-- O QUE ENTRA
--   C1  conversa   — uma por (instância, contato)
--   C2  mensagem   — uma por (conversa, id do provedor)
--   C3  índices de leitura
--   C4  fn_registrar_mensagem — grava e diz se REALMENTE inseriu
--   C5  RLS e grants
--
-- IDEMPOTÊNCIA POR CONSTRAINT, NÃO POR CHECAGEM. As duas chaves únicas fazem o
-- banco recusar a repetição, e `fn_registrar_mensagem` devolve `inserida`. Todo
-- efeito colateral (contador de não lidas, "última mensagem") só acontece se
-- `inserida` for verdadeiro. Checar antes de inserir perde a corrida entre duas
-- entregas do mesmo webhook; a constraint não perde.
--
-- ESTA TABELA É O DEDUPE DE TELA, E NÃO SUBSTITUI `am:enviada` NO REDIS.
-- São coisas diferentes com nomes parecidos:
--   `mensagem.provider_message_id`  → "esta mensagem já está na tela"
--   `am:enviada`                    → "quem enviou foi o robô, não uma pessoa"
-- Mensagem enviada pelo painel É intervenção humana: ela entra aqui para não
-- duplicar na tela, e NÃO entra em `am:enviada` — é assim que a IA percebe que
-- o dono assumiu e se cala por 30 minutos.
-- =============================================================================

-- C1 ------------------------------------------------------------------------
create table if not exists public.conversa (
  id               bigserial   primary key,
  id_info_clinica  int8        not null references public.info_clinica (id),
  -- A instância é o que a Evolution manda no webhook e é de onde a empresa é
  -- derivada. Fica junto para a chave única não depender de join.
  instance_name    text        not null,
  remote_jid       text        not null,
  id_cliente       int8        references public.cliente (id),
  contato_nome     text,
  ultima_mensagem  text,
  ultima_em        timestamptz,
  nao_lidas        int4        not null default 0,
  created_at       timestamptz not null default now(),
  constraint conversa_nao_lidas_nao_negativo check (nao_lidas >= 0)
);

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'ux_conversa_instancia_contato') then
    raise notice 'C1 JA EXISTIA: ux_conversa_instancia_contato';
  else
    alter table public.conversa
      add constraint ux_conversa_instancia_contato unique (instance_name, remote_jid);
    raise notice 'C1 APLICADA: conversa';
  end if;
end $$;

-- C2 ------------------------------------------------------------------------
create table if not exists public.mensagem (
  id                  bigserial   primary key,
  id_conversa         int8        not null references public.conversa (id) on delete cascade,
  -- Repetido de `conversa` de propósito: toda leitura do painel filtra empresa,
  -- e sem a coluna aqui cada consulta precisaria de join só para isolar.
  id_info_clinica     int8        not null references public.info_clinica (id),
  do_negocio          boolean     not null,
  -- Quem escreveu do lado do negócio: a recepção automática ou uma pessoa no
  -- painel. É o que permite a tela mostrar "respondido por você".
  autor               text        not null default 'cliente',
  tipo                text        not null default 'texto',
  conteudo            text,
  provider_message_id text,
  provider_em         timestamptz,
  created_at          timestamptz not null default now(),
  constraint mensagem_autor_valido check (autor in ('cliente', 'ia', 'painel')),
  constraint mensagem_tipo_valido
    check (tipo in ('texto', 'audio', 'imagem', 'documento', 'video', 'outro'))
);

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'ux_mensagem_provedor') then
    raise notice 'C2 JA EXISTIA: ux_mensagem_provedor';
  else
    -- Nulo não conflita em UNIQUE: mensagem sem id do provedor (falha no envio,
    -- por exemplo) pode repetir. É o comportamento certo — não há como saber
    -- que são a mesma.
    alter table public.mensagem
      add constraint ux_mensagem_provedor unique (id_conversa, provider_message_id);
    raise notice 'C2 APLICADA: mensagem';
  end if;
end $$;

-- C3 ------------------------------------------------------------------------
create index if not exists ix_conversa_empresa_recente
  on public.conversa (id_info_clinica, ultima_em desc nulls last, id desc);

-- Paginação da thread por keyset: mais recente primeiro.
create index if not exists ix_mensagem_conversa_recente
  on public.mensagem (id_conversa, created_at desc, id desc);

-- C4 ------------------------------------------------------------------------
drop function if exists public.fn_registrar_mensagem(int8, text, text, int8, text, boolean, text, text, text, text, timestamptz);

create function public.fn_registrar_mensagem(
  p_id_info_clinica     int8,
  p_instance_name       text,
  p_remote_jid          text,
  p_id_cliente          int8,
  p_contato_nome        text,
  p_do_negocio          boolean,
  p_autor               text,
  p_tipo                text,
  p_conteudo            text,
  p_provider_message_id text,
  p_provider_em         timestamptz
)
returns table (conversa_id int8, mensagem_id int8, inserida boolean, nao_lidas_total int4)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversa int8;
  v_mensagem int8;
  v_quando   timestamptz := coalesce(p_provider_em, now());
begin
  insert into public.conversa as c
    (id_info_clinica, instance_name, remote_jid, id_cliente, contato_nome)
  values (p_id_info_clinica, p_instance_name, p_remote_jid, p_id_cliente, p_contato_nome)
  on conflict (instance_name, remote_jid) do update
    -- O nome só melhora, nunca piora: quem já tem cadastro não é rebaixado ao
    -- apelido do WhatsApp.
    set contato_nome = coalesce(nullif(excluded.contato_nome, ''), c.contato_nome),
        id_cliente   = coalesce(excluded.id_cliente, c.id_cliente)
  returning c.id into v_conversa;

  insert into public.mensagem
    (id_conversa, id_info_clinica, do_negocio, autor, tipo, conteudo,
     provider_message_id, provider_em)
  values (v_conversa, p_id_info_clinica, p_do_negocio, coalesce(p_autor, 'cliente'),
          coalesce(p_tipo, 'texto'), p_conteudo, p_provider_message_id, v_quando)
  on conflict (id_conversa, provider_message_id) do nothing
  returning id into v_mensagem;

  if v_mensagem is null then
    -- Repetição: nada muda. É o caso normal quando o webhook reentrega.
    return query select v_conversa, null::int8, false,
                        (select c.nao_lidas from public.conversa c where c.id = v_conversa);
    return;
  end if;

  update public.conversa c
     set ultima_mensagem = case
           -- Guarda contra fora de ordem: webhook atrasado não pode sobrescrever
           -- o resumo com uma mensagem mais velha do que a que já está lá.
           when c.ultima_em is null or v_quando >= c.ultima_em then left(coalesce(p_conteudo, ''), 500)
           else c.ultima_mensagem end,
         ultima_em = greatest(coalesce(c.ultima_em, v_quando), v_quando),
         nao_lidas = case when p_do_negocio then c.nao_lidas else c.nao_lidas + 1 end
   where c.id = v_conversa;

  return query select v_conversa, v_mensagem, true,
                      (select c.nao_lidas from public.conversa c where c.id = v_conversa);
end $$;

comment on function public.fn_registrar_mensagem is
  'Grava conversa e mensagem de forma idempotente e devolve `inserida`. Todo efeito '
  'colateral (nao lidas, ultima mensagem) depende desse booleano.';

-- C5 ------------------------------------------------------------------------
alter table public.conversa enable row level security;
alter table public.mensagem enable row level security;

grant select, insert, update, delete on public.conversa to service_role;
grant select, insert, update, delete on public.mensagem to service_role;
grant usage, select on sequence public.conversa_id_seq to service_role;
grant usage, select on sequence public.mensagem_id_seq to service_role;

revoke all on function public.fn_registrar_mensagem(
  int8, text, text, int8, text, boolean, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.fn_registrar_mensagem(
  int8, text, text, int8, text, boolean, text, text, text, text, timestamptz)
  to service_role;
