-- =============================================================================
-- v_clinica_detalhes — contexto de atendimento por empresa
-- Versão: 2 (2026-08-23). Rodar depois de scripts/bootstrap_schema.sql e, para
-- a coluna `automacao_ativa`, depois de scripts/ajustes_onboarding.sql.
--
-- UMA LINHA POR EMPRESA. A automação lê com `operation: get` filtrando
-- id_info_clinica, então a view precisa entregar tudo agregado em uma linha só.
--
-- CONTRATO — nomes conferidos no nó `montar contexto` de
-- AgendaMagnetica-v2.n8n.json, que é quem consome:
--   id_info_clinica     filtro obrigatório
--   clinica_nome        empresa.nome
--   clinica_telefone    empresa.telefone
--   clinica_email       empresa.email
--   clinica_endereco    empresa.endereco
--   assistente_nome     empresa.assistente_nome   (nulo -> fallback do fluxo)
--   assistente_tom      empresa.assistente_tom    (nulo -> fallback do fluxo)
--   exige_profissional  empresa.exige_profissional
--   automacao_ativa     trava por empresa; false encerra o atendimento
--   procedimentos       [{id, nome, valor, duracao_minutos}]
--   profissionais       [{id, nome, area}]
--   horarios            [{dia_semana, hora_inicio, hora_fim}]
--
-- O `id` de procedimento e de profissional é obrigatório no contrato: sem ele o
-- fluxo transfere para uma pessoa em vez de adivinhar.
--
-- NÃO EXPÕE: nada de `usuarios` (senha_hash, e-mail de login, instance_name),
-- nenhuma credencial, nenhum dado de cliente, nenhum agendamento, e nenhuma
-- linha de outra empresa — toda agregação é correlacionada por id_info_clinica.
-- `mensagem_lembrete` e `descricao` ficam de fora: nenhum consumidor os lê.
-- =============================================================================

create or replace view public.v_clinica_detalhes
with (security_invoker = true) as
select
  ic.id                                   as id_info_clinica,
  ic.nome                                 as clinica_nome,
  ic.telefone                             as clinica_telefone,
  ic.email                                as clinica_email,
  ic.endereco                             as clinica_endereco,
  ic.assistente_nome,
  ic.assistente_tom,
  ic.exige_profissional,

  -- Só serviços da própria empresa. coalesce garante array vazio em vez de null:
  -- o fluxo trata [] como catálogo vazio, mas null vira erro de leitura.
  -- `agendavel` distingue "existe no catálogo" de "dá para marcar": um serviço
  -- sem nenhum profissional ativo habilitado tem preço e duração para responder,
  -- mas fn_buscar_slots devolveria zero horário para sempre. Sem essa marca o
  -- fluxo trata a lista vazia como "sem vaga hoje" e volta a oferecer o mesmo
  -- serviço no turno seguinte, em vez de transferir para uma pessoa.
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',              p.id,
             'nome',            p.nome,
             'valor',           p.valor,
             'duracao_minutos', p.duracao_minutos,
             'agendavel',       exists (
               select 1
               from public.profissional_procedimento pp
               join public.profissional pa on pa.id = pp.id_profissional
               where pp.id_procedimento = p.id
                 and pa.ativo
                 and pa.id_info_clinica = ic.id
             )
           ) order by p.nome)
    from public.procedimento p
    where p.id_info_clinica = ic.id
  ), '[]'::jsonb)                         as procedimentos,

  -- Apenas profissionais ativos: inativo não pode ser oferecido no atendimento.
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'id',   pr.id,
             'nome', pr.nome,
             'area', coalesce(aa.nome, '')
           ) order by pr.nome)
    from public.profissional pr
    left join public.area_atuacao aa on aa.id = pr.id_area_atuacao
    where pr.id_info_clinica = ic.id
      and pr.ativo
  ), '[]'::jsonb)                         as profissionais,

  -- HH24:MI porque o valor vai direto para a mensagem enviada ao cliente.
  coalesce((
    select jsonb_agg(jsonb_build_object(
             'dia_semana',  hc.dia_semana,
             'hora_inicio', to_char(hc.hora_inicio, 'HH24:MI'),
             'hora_fim',    to_char(hc.hora_fim, 'HH24:MI')
           ) order by hc.dia_semana, hc.hora_inicio)
    from public.horario_clinica hc
    where hc.id_info_clinica = ic.id
  ), '[]'::jsonb)                         as horarios,

  -- Última de propósito: `create or replace view` só aceita coluna NOVA no fim
  -- da lista. Colocá-la junto de `exige_profissional`, que é onde ela se
  -- encaixaria por assunto, exigiria dropar a view — e a view é lida em
  -- produção pela automação.
  -- `/api/ai/contexto` lê esta coluna ANTES de localizar ou criar o cliente:
  -- empresa com atendimento desligado não cadastra ninguém.
  ic.automacao_ativa

from public.info_clinica ic;

comment on view public.v_clinica_detalhes is
  'Contexto de atendimento por empresa, uma linha por info_clinica. Consumida '
  'pela automação com filtro obrigatório em id_info_clinica. Não expõe usuários, '
  'clientes, agendamentos nem credenciais.';

-- A view roda com os privilégios de quem consulta (security_invoker), então o
-- RLS das tabelas de base continua valendo. service_role tem bypass e enxerga
-- tudo; anon e authenticated continuam sem acesso.
revoke all on public.v_clinica_detalhes from anon, authenticated;
grant select on public.v_clinica_detalhes to service_role;

-- =============================================================================
-- Verificação (somente leitura)
-- =============================================================================
-- select column_name, data_type from information_schema.columns
--  where table_name = 'v_clinica_detalhes' order by ordinal_position;
-- select pg_get_viewdef('public.v_clinica_detalhes'::regclass, true);
