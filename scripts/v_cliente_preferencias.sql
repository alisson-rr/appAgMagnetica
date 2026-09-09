-- =============================================================================
-- v_cliente_preferencias — o profissional de sempre, deduzido do histórico
-- Versão: 1 (2026-09-09). Rodar depois de scripts/bootstrap_schema.sql.
-- É `create or replace`, não altera tabela e pode rodar com a automação no ar.
--
-- POR QUE: quem marca todo mês com o mesmo profissional espera ser reconhecido.
-- Hoje a recepção pergunta "com quem você quer marcar?" toda vez, inclusive
-- para o cliente que nunca marcou com outra pessoa. A informação para não
-- perguntar já existe em `consulta` — falta só ler.
--
-- POR QUE NÃO UMA COLUNA `id_profissional_preferido` EM `cliente`: seria uma
-- segunda fonte de verdade para um fato que o histórico já responde, e alguém
-- teria de mantê-la em cada agendamento, cancelamento e troca. Preferência
-- declarada é outro produto ("quero sempre a Ana"); isto aqui é observação.
--
-- CONTRATO — consumido por `/api/ai/contexto` (services/api/ai_api.py):
--   id_info_clinica             filtro obrigatório; a dedução NUNCA cruza empresas
--   id_cliente                  filtro obrigatório
--   profissional_habitual_id    para o fluxo pedir horário já com ele
--   profissional_habitual_nome  para a recepção falar o nome
--   consultas_com_ele           quantas das consideradas foram com ele
--   consultas_no_total          quantas foram consideradas
--
-- Uma linha por (empresa, cliente) — e só quando há sinal. Cliente sem hábito
-- claro simplesmente não aparece, e a recepção volta a perguntar como hoje.
-- =============================================================================

create or replace view public.v_cliente_preferencias as

-- JANELA DE 12 MESES: "de sempre" é recente E repetido. Sem o corte, quem
-- trocou de profissional há um ano continuaria sendo mandado para o antigo
-- pelo peso do histórico velho — o oposto de parecer atencioso.
--
-- `cancelado` fica de fora: consulta desmarcada não é preferência. `pendente`
-- entra, porque escolher o profissional já foi uma decisão da pessoa mesmo que
-- a consulta ainda não tenha acontecido.
with consideradas as (
  select
    c.id_info_clinica,
    c.id_cliente,
    c.id_profissional,
    count(*) as vezes
  from public.consulta c
  where c.status <> 'cancelado'
    and lower(c.intervalo) >= (now() - interval '12 months')
  group by c.id_info_clinica, c.id_cliente, c.id_profissional
),

total_por_cliente as (
  select
    id_info_clinica,
    id_cliente,
    sum(vezes) as total
  from consideradas
  group by id_info_clinica, id_cliente
),

-- `distinct on` com `vezes desc` pega o mais frequente. O desempate por
-- `id_profissional` existe só para a view ser determinística: empate real
-- (2 e 2 em 4 consultas) não chega ao resultado, porque 50% não passa do corte.
mais_frequente as (
  select distinct on (v.id_info_clinica, v.id_cliente)
    v.id_info_clinica,
    v.id_cliente,
    v.id_profissional,
    v.vezes,
    t.total
  from consideradas v
  join total_por_cliente t
    on t.id_info_clinica = v.id_info_clinica
   and t.id_cliente      = v.id_cliente
  order by v.id_info_clinica, v.id_cliente, v.vezes desc, v.id_profissional
)

select
  m.id_info_clinica,
  m.id_cliente,
  m.id_profissional as profissional_habitual_id,
  p.nome            as profissional_habitual_nome,
  m.vezes           as consultas_com_ele,
  m.total           as consultas_no_total
from mais_frequente m
join public.profissional p
  on p.id = m.id_profissional
 -- A FK garante que o profissional existe, não que ele é da mesma empresa da
 -- consulta. A recepção não pode oferecer profissional de outra empresa.
 and p.id_info_clinica = m.id_info_clinica
-- Quem saiu não é oferecido: o cliente ouviria o nome de alguém que não
-- atende mais, e o pedido de horário voltaria vazio.
where p.ativo
  -- DOIS CORTES CONTRA RUÍDO. Uma consulta só não é hábito — todo cliente novo
  -- teria "profissional habitual" logo depois do primeiro atendimento. E 60%
  -- exige maioria folgada: quem alterna entre duas pessoas não tem uma de
  -- sempre, e nesse caso perguntar é o comportamento certo.
  and m.total >= 2
  and (m.vezes::numeric / m.total) >= 0.60;

comment on view public.v_cliente_preferencias is
  'Profissional habitual por cliente, deduzido das consultas nao canceladas dos '
  'ultimos 12 meses. Exige no minimo 2 consultas e 60% com a mesma pessoa. '
  'Sem preferencia declarada: e observacao, nao cadastro.';

grant select on public.v_cliente_preferencias to service_role;
