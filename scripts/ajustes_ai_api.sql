-- =============================================================================
-- Ajustes corretivos para a API determinística da automação — Agenda Magnética
-- Versão: 1 (2026-08-21). Rodar DEPOIS de:
--   1. scripts/bootstrap_schema.sql
--   2. scripts/travas_corte_vertical.sql
--   3. scripts/v_clinica_detalhes.sql
--   4. scripts/fn_buscar_slots.sql
--
-- Migração corretiva: os scripts anteriores já foram aplicados e não são
-- editados. Este arquivo resolve as pendências P3, P4, P5 e a normalização de
-- telefone exigida por `/api/ai/*`.
--
--   A1  consulta.confirmado_em  date -> timestamptz   (P4)
--   A2  consulta.cancelado_em   date -> timestamptz   (P4)
--   A3  consulta.valor_cobrado  numeric(10,2)         (P5)
--   A4  cliente.whats_normalizado + unicidade por empresa
--   A5  area_atuacao: unicidade de nome + catálogo inicial   (P3)
--
-- Reexecutável: rodar duas vezes produz o mesmo estado e nenhum erro.
-- Auto-guardado: cada bloco confere tabela e coluna antes de agir.
-- Não destrutivo para dados: nenhuma linha de negócio é apagada. O único DROP é
-- de um índice tornado redundante por A4 (índices não guardam dado).
-- Não insere dado de tenant: `area_atuacao` é catálogo global, sem empresa.
--
-- Rollback: bloco comentado no fim do arquivo.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- A1/A2 — confirmado_em e cancelado_em passam a ser instantes
-- Semanticamente são momentos ("confirmou às 14h32"), não dias. Com `date` a
-- hora é descartada no INSERT e a automação não consegue distinguir duas ações
-- do mesmo dia. Migrar agora é barato: a tabela está vazia.
-- O USING converte pela zona da sessão; com zero linhas, nada é reinterpretado.
-- -----------------------------------------------------------------------------
do $$
declare
  coluna text;
  tipo   text;
begin
  if to_regclass('public.consulta') is null then
    raise notice 'A1/A2 PULADO: tabela consulta ausente';
    return;
  end if;

  foreach coluna in array array['confirmado_em', 'cancelado_em'] loop
    select data_type into tipo
    from information_schema.columns
    where table_schema = 'public' and table_name = 'consulta' and column_name = coluna;

    if tipo is null then
      raise notice 'A1/A2 PULADO: consulta.% ausente', coluna;
    elsif tipo = 'timestamp with time zone' then
      raise notice 'A1/A2 JA APLICADO: consulta.% ja e timestamptz', coluna;
    elsif tipo = 'date' then
      execute format(
        'alter table public.consulta alter column %I type timestamptz using %I::timestamptz',
        coluna, coluna
      );
      raise notice 'A1/A2 APLICADO: consulta.% date -> timestamptz', coluna;
    else
      raise notice 'A1/A2 PULADO: consulta.% tem tipo inesperado (%)', coluna, tipo;
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- A3 — preço histórico do agendamento
-- `procedimento.valor` é o preço de HOJE. Sem cópia no momento do agendamento,
-- reajustar um serviço reescreve o histórico financeiro já emitido.
-- Nula é estado válido: consultas criadas antes desta coluna não têm preço
-- congelado, e o relatório cai de volta em `procedimento.valor` nesse caso.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.consulta') is null then
    raise notice 'A3 PULADO: tabela consulta ausente';
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'consulta'
      and column_name = 'valor_cobrado'
  ) then
    alter table public.consulta add column valor_cobrado numeric(10,2);
    raise notice 'A3 APLICADO: consulta.valor_cobrado criada';
  else
    raise notice 'A3 JA EXISTIA: consulta.valor_cobrado';
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'consulta_valor_cobrado_nao_negativo'
  ) then
    alter table public.consulta
      add constraint consulta_valor_cobrado_nao_negativo
      check (valor_cobrado is null or valor_cobrado >= 0);
    raise notice 'A3 APLICADO: consulta_valor_cobrado_nao_negativo criada';
  else
    raise notice 'A3 JA EXISTIA: consulta_valor_cobrado_nao_negativo';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- A4 — telefone do cliente com forma única e consultável
-- A automação identifica o contato por `whats`, que chega como JID
-- ("5551999990000@s.whatsapp.net"), enquanto o painel grava o mesmo número
-- formatado ("(51) 99999-0000"). São o MESMO contato e precisam colidir.
--
-- T2 já garantia isso com um índice sobre a expressão, mas expressão não é
-- consultável pelo PostgREST: a API não conseguiria FILTRAR por telefone
-- normalizado, só evitar duplicata depois do erro. A coluna gerada resolve os
-- dois lados com o mesmo dado.
--
-- Normalização mínima de propósito — só dígitos. A equivalência entre formas
-- com e sem código do país (e com e sem o nono dígito) é resolvida na API, que
-- consulta o conjunto de formas candidatas. Colocar essa regra aqui exigiria
-- recriar a coluna a cada ajuste do heurístico.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.cliente') is null then
    raise notice 'A4 PULADO: tabela cliente ausente';
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cliente'
      and column_name = 'whats_normalizado'
  ) then
    alter table public.cliente
      add column whats_normalizado text
      generated always as (nullif(regexp_replace(coalesce(whats, ''), '[^0-9]', '', 'g'), ''))
      stored;
    raise notice 'A4 APLICADO: cliente.whats_normalizado criada';
  else
    raise notice 'A4 JA EXISTIA: cliente.whats_normalizado';
  end if;
end $$;

do $$
declare
  v_dup bigint;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cliente'
      and column_name = 'whats_normalizado'
  ) then
    return;
  end if;

  if to_regclass('public.ux_cliente_empresa_whats_norm') is not null then
    raise notice 'A4 JA EXISTIA: ux_cliente_empresa_whats_norm';
  else
    select count(*) into v_dup from (
      select id_info_clinica, whats_normalizado
      from public.cliente
      where whats_normalizado is not null
      group by 1, 2 having count(*) > 1
    ) d;

    if v_dup > 0 then
      raise notice 'A4 INDICE PULADO: % par(es) (empresa, telefone) duplicado(s). Mesclar cadastro é decisão do proprietário.', v_dup;
      return;
    end if;

    create unique index ux_cliente_empresa_whats_norm
      on public.cliente (id_info_clinica, whats_normalizado);
    raise notice 'A4 APLICADO: ux_cliente_empresa_whats_norm criado';
  end if;

  -- T2 indexava exatamente a mesma expressão. Manter os dois só paga custo de
  -- escrita duas vezes. Índice não guarda dado: remover não perde nada.
  if to_regclass('public.ux_cliente_empresa_whats') is not null then
    drop index public.ux_cliente_empresa_whats;
    raise notice 'A4: ux_cliente_empresa_whats removido (substituido pela coluna gerada)';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- A5 — area_atuacao vira catálogo global fechado
-- A tabela sempre foi compartilhada por todas as empresas, mas qualquer usuário
-- autenticado podia escrever nela por `POST /areas-atuacao` — rota removida do
-- backend junto com esta migração. Sem unicidade, uma rotina de manutenção
-- reexecutada duplicaria rótulos e o select do painel mostraria a mesma área
-- duas vezes.
--
-- O catálogo inicial cobre o público da Agenda Magnética. Não é dado de tenant:
-- nenhuma linha aqui pertence a uma empresa, e nenhuma empresa, cliente ou
-- consulta fictícia é criada por este script.
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.area_atuacao') is null then
    raise notice 'A5 PULADO: tabela area_atuacao ausente';
    return;
  end if;

  -- Unicidade insensível a caixa e a espaço nas pontas: "Estética Facial",
  -- "estetica facial " e "Estética Facial" seriam três rótulos na tela.
  if to_regclass('public.ux_area_atuacao_nome') is null then
    if exists (
      select 1 from public.area_atuacao
      group by lower(btrim(nome)) having count(*) > 1
    ) then
      raise notice 'A5 INDICE PULADO: nomes duplicados em area_atuacao. Mesclar é decisão do proprietário.';
    else
      create unique index ux_area_atuacao_nome on public.area_atuacao (lower(btrim(nome)));
      raise notice 'A5 APLICADO: ux_area_atuacao_nome criado';
    end if;
  else
    raise notice 'A5 JA EXISTIA: ux_area_atuacao_nome';
  end if;
end $$;

do $$
declare
  rotulo text;
  v_novos int := 0;
begin
  if to_regclass('public.area_atuacao') is null then
    return;
  end if;

  foreach rotulo in array array[
    'Acupuntura',
    'Barbearia',
    'Cabelo',
    'Cílios e Sobrancelhas',
    'Depilação',
    'Enfermagem',
    'Estética Corporal',
    'Estética Facial',
    'Fisioterapia',
    'Fonoaudiologia',
    'Manicure e Pedicure',
    'Maquiagem',
    'Massoterapia',
    'Nutrição',
    'Odontologia',
    'Personal Trainer',
    'Pilates',
    'Podologia',
    'Psicologia',
    'Quiropraxia',
    'Tatuagem e Piercing',
    'Terapia Ocupacional',
    'Terapias Integrativas',
    'Outros'
  ] loop
    -- `where not exists` em vez de `on conflict`: funciona mesmo quando o índice
    -- único foi pulado por duplicata preexistente.
    insert into public.area_atuacao (nome)
    select rotulo
    where not exists (
      select 1 from public.area_atuacao where lower(btrim(nome)) = lower(btrim(rotulo))
    );
    v_novos := v_novos + case when found then 1 else 0 end;
  end loop;

  raise notice 'A5: % rotulo(s) novo(s) no catalogo de areas', v_novos;
end $$;

commit;

-- O PostgREST guarda o schema em cache. Sem o aviso, `valor_cobrado` e
-- `whats_normalizado` só aparecem na API depois do próximo reinício.
notify pgrst, 'reload schema';

-- =============================================================================
-- Verificação (somente leitura). Rode depois de aplicar.
-- =============================================================================
-- select column_name, data_type, is_generated
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'consulta'
--    and column_name in ('confirmado_em', 'cancelado_em', 'valor_cobrado');
--
-- select column_name, data_type, is_generated, generation_expression
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'cliente'
--    and column_name = 'whats_normalizado';
--
-- select indexrelid::regclass as indice, pg_get_indexdef(indexrelid) from pg_index
--  where indexrelid::regclass::text in
--        ('ux_cliente_empresa_whats_norm', 'ux_area_atuacao_nome');
--
-- select count(*) as areas from public.area_atuacao;

-- =============================================================================
-- Rollback (não executar sem necessidade)
-- =============================================================================
-- begin;
-- drop index if exists public.ux_area_atuacao_nome;
-- drop index if exists public.ux_cliente_empresa_whats_norm;
-- alter table public.cliente drop column if exists whats_normalizado;
-- create unique index ux_cliente_empresa_whats
--   on public.cliente (id_info_clinica, (regexp_replace(whats, '[^0-9]', '', 'g')))
--   where whats is not null and regexp_replace(whats, '[^0-9]', '', 'g') <> '';
-- alter table public.consulta drop constraint if exists consulta_valor_cobrado_nao_negativo;
-- alter table public.consulta drop column if exists valor_cobrado;
-- alter table public.consulta alter column confirmado_em type date using confirmado_em::date;
-- alter table public.consulta alter column cancelado_em  type date using cancelado_em::date;
-- -- As linhas de area_atuacao ficam: apagar rótulo em uso quebraria profissional.id_area_atuacao.
-- commit;
-- notify pgrst, 'reload schema';
