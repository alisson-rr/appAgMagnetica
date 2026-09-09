-- =============================================================================
-- Devolver a conversa para a recepção automática — Agenda Magnética
-- Versão: 1 (2026-09-09). Rodar depois de scripts/chat_atendimento.sql.
-- Reexecutável. Migração corretiva: não edita o script já aplicado.
--
-- O PROBLEMA: a pausa da IA vive no Redis da VPS, em rede interna. O backend
-- roda na Vercel e não alcança aquele Redis — então o painel não tinha como
-- devolver a conversa antes dos 30 minutos expirarem.
--
-- A SOLUÇÃO, E POR QUE NÃO SÃO DUAS FONTES DE VERDADE: o Redis responde
-- "uma pausa começou em T". Esta coluna responde "o dono devolveu em R". São
-- dois fatos diferentes, e a decisão que os combina é UMA, e mora em um lugar
-- só: a rota `/api/ai/handoff/valido`. A regra é
--
--     ainda pausado  ⇔  não existe R posterior a T
--
-- Devolver não apaga a chave do Redis (nem poderia): ela expira sozinha, e
-- enquanto isso a devolução mais recente é que manda.
-- =============================================================================

alter table public.conversa
  add column if not exists ia_liberada_em timestamptz;

comment on column public.conversa.ia_liberada_em is
  'Quando o dono devolveu a conversa para a recepcao automatica. Compara-se com '
  'o instante em que a pausa comecou (am:handoff). Nula = nunca devolveu.';
