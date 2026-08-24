-- =============================================================================
-- Ajustes do onboarding (Fase 3) — Agenda Magnética
-- Versão: 1 (2026-08-23). Rodar DEPOIS de:
--   1. scripts/bootstrap_schema.sql
--   2. scripts/travas_corte_vertical.sql
--   3. scripts/v_clinica_detalhes.sql
--   4. scripts/fn_buscar_slots.sql
--   5. scripts/ajustes_ai_api.sql
--   6. scripts/integridade_tenant.sql
--   7. este arquivo
--   8. scripts/v_clinica_detalhes.sql DE NOVO — a view é `create or replace` e
--      só consegue expor `automacao_ativa` depois que a coluna existe.
--
-- O QUE ESTE SCRIPT RESOLVE
--   O1  info_clinica.automacao_ativa — ligar/desligar o atendimento automático
--       é decisão POR EMPRESA. O workflow do n8n é um só para todos os
--       clientes: usar o `active` dele desligaria o atendimento de todo mundo
--       junto. Com a flag em `false`, /api/ai/contexto recusa com
--       AUTOMACAO_DESATIVADA e o fluxo encerra sem responder ao cliente.
--   O2  CHECK do vocabulário de `assistente_tom`. O valor entra no prompt de
--       sistema da IA: texto livre gravado pelo dono é vetor de injeção, e a
--       validação da API sozinha não protege contra script de manutenção,
--       correção manual ou rota futura.
--
-- Nulo continua permitido em `assistente_tom`: é o estado normal de quem ainda
-- não passou pelo passo Atendente, e o fluxo aplica o padrão dele.
--
-- Reexecutável: rodar duas vezes produz o mesmo estado e nenhum objeto novo.
-- Não destrutivo: não apaga linha, não altera tipo, não insere dado de negócio.
-- PARA em vez de PULAR: linha com tom fora do vocabulário aborta a transação
-- com os ids listados. Decidir o que fazer com o valor é do proprietário.
--
-- Rollback: bloco comentado no fim do arquivo.
-- =============================================================================

\set ON_ERROR_STOP on

begin;

-- -----------------------------------------------------------------------------
-- O1 — info_clinica.automacao_ativa
-- `not null default false`: empresa nova entra desligada. Ligar exige o mínimo
-- pronto (horários, serviço, equipe agendável e WhatsApp conectado), e quem
-- decide isso é PUT /config/automacao, não o banco.
-- -----------------------------------------------------------------------------
alter table public.info_clinica
  add column if not exists automacao_ativa boolean not null default false;

comment on column public.info_clinica.automacao_ativa is
  'Atendimento automático ligado nesta empresa. Falso faz /api/ai/contexto '
  'recusar com AUTOMACAO_DESATIVADA, e o fluxo encerra sem responder.';

-- -----------------------------------------------------------------------------
-- O2 — vocabulário fechado de `assistente_tom`
-- A conferência vem antes do ADD CONSTRAINT de propósito: sem ela, o erro seria
-- a violação crua do PostgreSQL, sem dizer QUAIS empresas precisam de correção.
-- -----------------------------------------------------------------------------
do $$
declare
  invalidos text;
begin
  select string_agg(id::text, ', ' order by id) into invalidos
    from public.info_clinica
   where assistente_tom is not null
     and assistente_tom not in ('acolhedor', 'objetivo', 'descontraido');

  if invalidos is not null then
    raise exception
      'O2 PARADA: info_clinica com assistente_tom fora do vocabulário (ids: %). '
      'Corrija o valor ou apague-o antes de reexecutar.', invalidos;
  end if;
end $$;

-- drop + add em vez de "criar se não existir": é o que permite reapertar a
-- regra num banco que já tem a constraint com outro conteúdo. O objeto final é
-- sempre o mesmo, então a segunda passada não cria nada novo.
alter table public.info_clinica
  drop constraint if exists info_clinica_assistente_tom_valido;

alter table public.info_clinica
  add constraint info_clinica_assistente_tom_valido
  check (assistente_tom is null or assistente_tom in ('acolhedor', 'objetivo', 'descontraido'));

commit;

-- O PostgREST guarda o schema em cache: sem este aviso, a coluna nova só
-- aparece na API depois de um reinício.
notify pgrst, 'reload schema';

-- =============================================================================
-- Verificação (somente leitura)
-- =============================================================================
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'info_clinica'
--    and column_name = 'automacao_ativa';
--
-- select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--  where conrelid = 'public.info_clinica'::regclass and contype = 'c'
--  order by 1;
--
-- -- Depois de reexecutar scripts/v_clinica_detalhes.sql:
-- select column_name from information_schema.columns
--  where table_name = 'v_clinica_detalhes' and column_name = 'automacao_ativa';

-- =============================================================================
-- Rollback (não executar sem necessidade)
-- Derrubar a coluna desliga a trava por empresa: /api/ai/contexto volta a
-- responder para toda empresa que tenha instância conectada.
-- =============================================================================
-- begin;
-- alter table public.info_clinica drop constraint if exists info_clinica_assistente_tom_valido;
-- -- A view referencia a coluna: recriar a versão anterior antes de derrubá-la.
-- -- drop view if exists public.v_clinica_detalhes;
-- -- alter table public.info_clinica drop column if exists automacao_ativa;
-- commit;
-- notify pgrst, 'reload schema';
