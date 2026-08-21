-- ATENÇÃO: este arquivo antigo desabilitava a proteção entre empresas.
-- Ele foi mantido apenas para não quebrar referências existentes e agora faz
-- o oposto: bloqueia acesso direto das chaves públicas. A aplicação acessa os
-- dados somente pelo backend, que valida id_info_clinica em cada operação.

ALTER TABLE public.cliente ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissional ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consulta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_atuacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_bloqueio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disponibilidade_profissional ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_clinica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_clinica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissional_procedimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.cliente,
  public.profissional,
  public.procedimento,
  public.consulta,
  public.area_atuacao,
  public.agenda_bloqueio,
  public.disponibilidade_profissional,
  public.horario_clinica,
  public.info_clinica,
  public.profissional_procedimento,
  public.usuarios
FROM anon, authenticated;

-- A service_role do backend ignora RLS por definição. Portanto, manter os
-- filtros por empresa no backend continua sendo obrigatório.
