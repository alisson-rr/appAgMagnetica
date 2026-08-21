-- =============================================================================
-- fn_buscar_slots — disponibilidade real, calculada no servidor
-- Versão: 1 (2026-08-21). Rodar depois de scripts/bootstrap_schema.sql.
--
-- CONTRATO (PostgREST: POST /rest/v1/rpc/fn_buscar_slots, corpo JSON com os
-- nomes dos parâmetros):
--   p_id_info_clinica  int8  OBRIGATÓRIO — a empresa é dada, nunca deduzida
--   p_procedimento_id  int8  OBRIGATÓRIO
--   p_inicio           timestamptz  início da janela de busca
--   p_fim              timestamptz  fim da janela de busca
--   p_profissional_id  int8  opcional — null = qualquer profissional apto
--   p_step_minutos     int   opcional, padrão 30
--   p_duracao_minutos  int   opcional — null usa a duração do procedimento
--
-- RETORNO: uma linha por horário livre, sempre com
--   id_info_clinica, id_profissional, id_procedimento, inicio, fim,
--   profissional_nome
-- NUNCA devolve linha sem id_profissional: o profissional faz parte do slot.
--
-- ISOLAMENTO — a empresa entra como parâmetro e é verificada em três pontos:
--   1. o procedimento tem de pertencer a p_id_info_clinica;
--   2. o profissional tem de pertencer a p_id_info_clinica;
--   3. o profissional tem de executar aquele procedimento.
-- Como disponibilidade_profissional e profissional_procedimento não têm coluna
-- de empresa, o tenant chega nelas passando por profissional.id_info_clinica —
-- ler por id_profissional direto derrubaria o isolamento.
--
-- FUSO: America/Sao_Paulo em todo o cálculo. `dia_semana` usa a convenção do
-- produto (1=segunda .. 7=domingo), que coincide com `isodow` do PostgreSQL.
--
-- SEGURANÇA: SECURITY INVOKER (padrão) — não há necessidade de DEFINER, já que
-- quem chama é o service_role, que ignora RLS. `search_path` fixo e todos os
-- nomes qualificados, para não depender do caminho de quem chama.
-- =============================================================================

create or replace function public.fn_buscar_slots(
  p_id_info_clinica int8,
  p_procedimento_id int8,
  p_inicio          timestamptz,
  p_fim             timestamptz,
  p_profissional_id int8 default null,
  p_step_minutos    int  default 30,
  p_duracao_minutos int  default null
)
returns table (
  id_info_clinica   int8,
  id_profissional   int8,
  id_procedimento   int8,
  inicio            timestamptz,
  fim               timestamptz,
  profissional_nome text
)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_fuso     constant text := 'America/Sao_Paulo';
  v_duracao  int;
  v_step     int;
  v_agora    timestamptz := now();
begin
  -- Parâmetros de empresa e procedimento são obrigatórios de fato, não só na
  -- assinatura: sem eles não existe busca segura.
  if p_id_info_clinica is null or p_procedimento_id is null then
    raise exception 'fn_buscar_slots exige p_id_info_clinica e p_procedimento_id';
  end if;

  -- 1. O procedimento tem de ser da empresa informada. Divergência aqui é erro
  -- de chamada ou tentativa de acesso cruzado: falha alto, não devolve vazio.
  -- A duração padrão vem do próprio cadastro.
  select proc.duracao_minutos
    into v_duracao
  from public.procedimento proc
  where proc.id = p_procedimento_id
    and proc.id_info_clinica = p_id_info_clinica;

  if not found then
    raise exception 'procedimento nao pertence a empresa informada';
  end if;

  v_duracao := coalesce(nullif(p_duracao_minutos, 0), v_duracao);
  v_step    := greatest(coalesce(nullif(p_step_minutos, 0), 30), 1);

  if v_duracao is null or v_duracao <= 0 then
    raise exception 'duracao invalida para o procedimento informado';
  end if;

  -- Janela de busca: sem ela, nada a fazer. O passado nunca é ofertado.
  if p_inicio is null or p_fim is null or p_fim <= p_inicio then
    return;
  end if;

  return query
  with
  -- 2. Profissionais da EMPRESA, ativos, e que executam ESTE procedimento.
  aptos as (
    select pr.id, pr.nome
    from public.profissional pr
    join public.profissional_procedimento pp
      on pp.id_profissional = pr.id
     and pp.id_procedimento = p_procedimento_id
    where pr.id_info_clinica = p_id_info_clinica
      and pr.ativo
      and (p_profissional_id is null or pr.id = p_profissional_id)
  ),
  dias as (
    select d::date as dia
    from generate_series(
           ((greatest(p_inicio, v_agora)) at time zone v_fuso)::date,
           (p_fim at time zone v_fuso)::date,
           interval '1 day'
         ) as d
  ),
  -- 3. Janela efetiva do dia: interseção entre o horário da EMPRESA e a
  -- disponibilidade daquele PROFISSIONAL no mesmo dia da semana.
  janelas as (
    select
      d.dia,
      a.id   as id_profissional,
      a.nome as profissional_nome,
      greatest(hc.hora_inicio, dp.hora_inicio) as hora_ini,
      least(hc.hora_fim, dp.hora_fim)          as hora_fim
    from dias d
    cross join aptos a
    join public.horario_clinica hc
      on hc.id_info_clinica = p_id_info_clinica
     and hc.dia_semana = extract(isodow from d.dia)
    join public.disponibilidade_profissional dp
      on dp.id_profissional = a.id
     and dp.dia_semana = extract(isodow from d.dia)
    where greatest(hc.hora_inicio, dp.hora_inicio) < least(hc.hora_fim, dp.hora_fim)
  ),
  -- 4. Passos de grade dentro de cada janela. O último slot só nasce se a
  -- duração inteira couber antes do fechamento.
  candidatos as (
    select
      j.id_profissional,
      j.profissional_nome,
      ((j.dia + j.hora_ini + make_interval(mins => passo)) at time zone v_fuso) as inicio,
      ((j.dia + j.hora_ini + make_interval(mins => passo)) at time zone v_fuso)
        + make_interval(mins => v_duracao)                                     as fim
    from janelas j
    -- Grade em MINUTOS: generate_series não aceita interval como passo.
    -- O limite já desconta a duração, então o último slot sempre cabe inteiro
    -- antes do fechamento; janela menor que a duração não gera linha nenhuma.
    cross join lateral generate_series(
        0,
        (extract(epoch from (j.hora_fim - j.hora_ini)) / 60)::int - v_duracao,
        v_step
      ) as passo
  )
  -- DISTINCT não é decoração. Nada impede a empresa de cadastrar duas faixas de
  -- horario_clinica que se sobrepõem no mesmo dia (08–12 e 10–16, por exemplo);
  -- o cruzamento com a disponibilidade geraria o MESMO slot duas vezes, e a
  -- automação ofereceria o mesmo horário como se fossem duas opções distintas.
  select distinct
    p_id_info_clinica,
    c.id_profissional,
    p_procedimento_id,
    c.inicio,
    c.fim,
    c.profissional_nome
  from candidatos c
  where c.inicio >= greatest(p_inicio, v_agora)
    and c.fim   <= p_fim
    -- 5. Bloqueios do profissional (férias, folga, feriado).
    and not exists (
      select 1
      from public.agenda_bloqueio ab
      where ab.id_profissional = c.id_profissional
        and ab.intervalo && tstzrange(c.inicio, c.fim, '[)')
    )
    -- 6. Agendamentos vivos do profissional. Mesmo vocabulário da constraint
    -- consulta_sem_sobreposicao, para a função e o banco concordarem.
    and not exists (
      select 1
      from public.consulta cs
      where cs.id_profissional = c.id_profissional
        and cs.status in ('pendente', 'agendado', 'confirmado')
        and cs.intervalo && tstzrange(c.inicio, c.fim, '[)')
    )
  order by c.inicio, c.id_profissional;
end;
$$;

comment on function public.fn_buscar_slots(int8, int8, timestamptz, timestamptz, int8, int, int) is
  'Horarios livres de uma empresa para um procedimento. A empresa entra como '
  'parametro e e validada no procedimento e no profissional. Respeita horario da '
  'empresa, disponibilidade do profissional, bloqueios e agendamentos vivos. '
  'Toda linha traz id_profissional. Fuso America/Sao_Paulo.';

revoke all on function public.fn_buscar_slots(int8, int8, timestamptz, timestamptz, int8, int, int)
  from public, anon, authenticated;
grant execute on function public.fn_buscar_slots(int8, int8, timestamptz, timestamptz, int8, int, int)
  to service_role;

-- =============================================================================
-- Verificação (somente leitura)
-- =============================================================================
-- select pg_get_function_identity_arguments(p.oid), pg_get_function_result(p.oid),
--        p.prosecdef, p.proconfig
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'fn_buscar_slots';
