-- Desabilitar RLS temporariamente para desenvolvimento
-- OU criar políticas permissivas

-- Opção 1: Desabilitar RLS (mais simples para desenvolvimento)
ALTER TABLE public.cliente DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissional DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.procedimento DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.consulta DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_atuacao DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_bloqueio DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.disponibilidade_profissional DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.horario_clinica DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.info_clinica DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profissional_procedimento DISABLE ROW LEVEL SECURITY;

-- Opção 2: Criar políticas permissivas (mais seguro, mas permite tudo)
-- Descomentar se preferir usar políticas em vez de desabilitar RLS

/*
-- Políticas para cliente
CREATE POLICY "Enable all for cliente" ON public.cliente FOR ALL USING (true) WITH CHECK (true);

-- Políticas para profissional
CREATE POLICY "Enable all for profissional" ON public.profissional FOR ALL USING (true) WITH CHECK (true);

-- Políticas para procedimento
CREATE POLICY "Enable all for procedimento" ON public.procedimento FOR ALL USING (true) WITH CHECK (true);

-- Políticas para consulta
CREATE POLICY "Enable all for consulta" ON public.consulta FOR ALL USING (true) WITH CHECK (true);

-- Políticas para area_atuacao
CREATE POLICY "Enable all for area_atuacao" ON public.area_atuacao FOR ALL USING (true) WITH CHECK (true);

-- Políticas para agenda_bloqueio
CREATE POLICY "Enable all for agenda_bloqueio" ON public.agenda_bloqueio FOR ALL USING (true) WITH CHECK (true);

-- Políticas para disponibilidade_profissional
CREATE POLICY "Enable all for disponibilidade" ON public.disponibilidade_profissional FOR ALL USING (true) WITH CHECK (true);

-- Políticas para horario_clinica
CREATE POLICY "Enable all for horario" ON public.horario_clinica FOR ALL USING (true) WITH CHECK (true);

-- Políticas para info_clinica
CREATE POLICY "Enable all for info" ON public.info_clinica FOR ALL USING (true) WITH CHECK (true);

-- Políticas para profissional_procedimento
CREATE POLICY "Enable all for prof_proc" ON public.profissional_procedimento FOR ALL USING (true) WITH CHECK (true);
*/
