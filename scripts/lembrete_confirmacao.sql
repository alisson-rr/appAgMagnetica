-- =============================================================================
-- Lembrete de confirmação de consulta — Agenda Magnética
-- Versão: 1 (2026-09-09). Rodar depois de scripts/bootstrap_schema.sql.
-- Reexecutável: rodar duas vezes produz o mesmo estado e nenhum erro.
--
-- O QUE ENTRA
--   L1  info_clinica.lembrete_horas  — antecedência em horas; NULA = desligado.
--                                      Uma coluna cobre liga/desliga e prazo.
--   L2  consulta.lembrete_enviado_em — marca de envio, para não mandar duas vezes.
--   L3  índice do claim
--   L4  fn_claim_lembretes           — pega e marca no MESMO comando
--
-- POR QUE UMA FUNÇÃO E NÃO DUAS CHAMADAS: entre "listar quem vence amanhã" e
-- "marcar como enviado" cabe outra execução do cron. Duas chamadas mandam o
-- lembrete duplicado para o mesmo cliente — o erro mais visível que esta
-- funcionalidade pode cometer. `for update skip locked` mais a marca dentro da
-- mesma instrução tornam isso impossível, mesmo com dois workers.
--
-- ATENÇÃO — ESTA É A ÚNICA LEITURA DO PROJETO QUE ATRAVESSA EMPRESAS, E É DE
-- PROPÓSITO. Um relógio não tem conversa, e portanto não tem instância de onde
-- derivar a empresa. Cada linha devolvida carrega o próprio `instance_name`, e
-- é ele que a automação usa para enviar e para todas as chamadas seguintes —
-- que continuam derivando a empresa da instância, como sempre. A função só é
-- alcançável pela `service_role`, que só o backend tem.
-- =============================================================================

-- L1 ------------------------------------------------------------------------
alter table public.info_clinica
  add column if not exists lembrete_horas int;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'info_clinica_lembrete_horas_valido') then
    raise notice 'L1 JA EXISTIA: info_clinica_lembrete_horas_valido';
  else
    -- Teto de 168 h (7 dias): lembrete de duas semanas antes não é lembrete, e
    -- um valor absurdo faria a janela do claim varrer a agenda inteira.
    alter table public.info_clinica
      add constraint info_clinica_lembrete_horas_valido
      check (lembrete_horas is null or (lembrete_horas >= 1 and lembrete_horas <= 168));
    raise notice 'L1 APLICADA: info_clinica.lembrete_horas';
  end if;
end $$;

comment on column public.info_clinica.lembrete_horas is
  'Horas de antecedencia do lembrete de confirmacao. NULA = lembrete desligado.';

-- L2 ------------------------------------------------------------------------
alter table public.consulta
  add column if not exists lembrete_enviado_em timestamptz;

comment on column public.consulta.lembrete_enviado_em is
  'Quando o lembrete saiu. NULA = ainda nao enviado. Marcada dentro de fn_claim_lembretes.';

-- L3 ------------------------------------------------------------------------
-- Parcial: só interessa quem ainda não recebeu. Mantém o índice pequeno mesmo
-- com a tabela crescendo, porque a linha sai dele assim que o lembrete vai.
create index if not exists ix_consulta_lembrete_pendente
  on public.consulta (lower(intervalo))
  where lembrete_enviado_em is null and status in ('pendente', 'agendado');

-- L4 ------------------------------------------------------------------------
drop function if exists public.fn_claim_lembretes(int);

create function public.fn_claim_lembretes(p_limite int default 50)
returns table (
  id_consulta        int8,
  instance_name      text,
  telefone           text,
  cliente_nome       text,
  inicio             timestamptz,
  servico_nome       text,
  profissional_nome  text,
  mensagem_lembrete  text
)
language sql
security definer
set search_path = public
as $$
  with alvo as (
    select c.id
    from public.consulta c
    join public.info_clinica ic on ic.id = c.id_info_clinica
    where c.lembrete_enviado_em is null
      -- `confirmado` fica de fora: quem já confirmou não precisa ser lembrado.
      -- `cancelado` e `concluido`, idem.
      and c.status in ('pendente', 'agendado')
      and ic.lembrete_horas is not null
      -- A trava por empresa do atendimento automático vale aqui também: empresa
      -- com a automação desligada não manda mensagem nenhuma.
      and ic.automacao_ativa
      -- Consulta que já passou não recebe lembrete. Sem esta linha, ligar o
      -- lembrete dispararia a agenda histórica inteira de uma vez.
      and lower(c.intervalo) > now()
      and lower(c.intervalo) <= now() + make_interval(hours => ic.lembrete_horas)
    order by lower(c.intervalo)
    limit greatest(p_limite, 1)
    for update of c skip locked
  ),
  marcadas as (
    update public.consulta c
       set lembrete_enviado_em = now()
      from alvo
     where c.id = alvo.id
    returning c.id, c.id_info_clinica, c.id_cliente, c.id_procedimento,
              c.id_profissional, lower(c.intervalo) as inicio
  )
  select
    m.id,
    u.instance_name,
    coalesce(cl.telefone, cl.whats),
    cl.nome,
    m.inicio,
    pr.nome,
    p.nome,
    ic.mensagem_lembrete
  from marcadas m
  join public.info_clinica ic on ic.id = m.id_info_clinica
  join public.cliente      cl on cl.id = m.id_cliente
  join public.procedimento pr on pr.id = m.id_procedimento
  join public.profissional p  on p.id  = m.id_profissional
  -- `usuarios` é quem guarda a instância do WhatsApp da empresa. Sem instância
  -- não há por onde enviar, então a linha simplesmente não sai — e continua
  -- marcada, o que é o certo: reenviar depois seria pior que não enviar.
  join public.usuarios     u  on u.id_info_clinica = m.id_info_clinica
                             and u.instance_name is not null;
$$;

comment on function public.fn_claim_lembretes(int) is
  'Pega e marca, no mesmo comando, as consultas que vencem dentro da antecedencia '
  'cadastrada por empresa. Atravessa empresas de proposito: cada linha carrega o '
  'proprio instance_name. So a service_role alcanca.';

revoke all on function public.fn_claim_lembretes(int) from public, anon, authenticated;
grant execute on function public.fn_claim_lembretes(int) to service_role;
