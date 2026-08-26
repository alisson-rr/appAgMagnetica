import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { CampoErro } from './CampoErro';
import { DIAS_SEMANA, HORAS } from '../lib/onboarding';

/**
 * Grade de horários do negócio, compartilhada pelo passo 2 do onboarding e
 * por Configurações > Horário de Atendimento. Uma grade só: quando a regra de
 * "fim depois do início" mudar, ela muda nos dois lugares.
 *
 * A validação vive em `validarHorarios` (lib/onboarding.js); aqui só se mostra
 * o que ela apontou, com a chave `${dia}-${indice}`.
 */
const HorariosEditor = ({ dias, aoMudar, erros = {}, idPrefixo = 'horario' }) => {
  const mudarTurno = (diaSemana, indice, campo, valor) =>
    aoMudar(
      dias.map((dia) =>
        dia.dia_semana === diaSemana
          ? {
              ...dia,
              turnos: dia.turnos.map((turno, i) => (i === indice ? { ...turno, [campo]: valor } : turno)),
            }
          : dia,
      ),
    );

  const adicionarTurno = (diaSemana) =>
    aoMudar(
      dias.map((dia) =>
        dia.dia_semana === diaSemana
          ? { ...dia, turnos: [...dia.turnos, { hora_inicio: '', hora_fim: '' }] }
          : dia,
      ),
    );

  const removerTurno = (diaSemana, indice) =>
    aoMudar(
      dias.map((dia) =>
        dia.dia_semana === diaSemana
          ? { ...dia, turnos: dia.turnos.filter((_, i) => i !== indice) }
          : dia,
      ),
    );

  return (
    <div className="space-y-3">
      {erros.geral && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
          {erros.geral}
        </p>
      )}

      {dias.map((dia) => {
        const rotulo = DIAS_SEMANA.find((item) => item.value === dia.dia_semana)?.label;
        return (
          <fieldset key={dia.dia_semana} className="surface-muted p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <legend className="font-semibold text-ink">{rotulo}</legend>
              <button
                type="button"
                onClick={() => adicionarTurno(dia.dia_semana)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-primary transition hover:bg-accent"
              >
                <Plus size={14} />
                Adicionar turno
              </button>
            </div>

            {dia.turnos.map((turno, indice) => {
              const chave = `${dia.dia_semana}-${indice}`;
              const erro = erros[chave];
              const idErro = `${idPrefixo}-${chave}-erro`;
              const vazio = !turno.hora_inicio && !turno.hora_fim;

              return (
                <div key={indice} className="mb-2">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <Select
                      value={turno.hora_inicio}
                      onValueChange={(valor) => mudarTurno(dia.dia_semana, indice, 'hora_inicio', valor)}
                    >
                      <SelectTrigger
                        className="w-28"
                        aria-label={`Início do turno ${indice + 1} — ${rotulo}`}
                        aria-describedby={erro ? idErro : undefined}
                        aria-invalid={erro ? 'true' : undefined}
                      >
                        <SelectValue placeholder="Início" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {HORAS.map((hora) => (
                          <SelectItem key={hora.value} value={hora.value}>
                            {hora.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <span className="text-sm text-muted-foreground">até</span>

                    <Select
                      value={turno.hora_fim}
                      onValueChange={(valor) => mudarTurno(dia.dia_semana, indice, 'hora_fim', valor)}
                    >
                      <SelectTrigger
                        className="w-28"
                        aria-label={`Fim do turno ${indice + 1} — ${rotulo}`}
                        aria-describedby={erro ? idErro : undefined}
                        aria-invalid={erro ? 'true' : undefined}
                      >
                        <SelectValue placeholder="Fim" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[200px]">
                        {HORAS.map((hora) => (
                          <SelectItem key={hora.value} value={hora.value}>
                            {hora.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {dia.turnos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removerTurno(dia.dia_semana, indice)}
                        aria-label={`Remover turno ${indice + 1} de ${rotulo}`}
                        className="icon-action icon-action-danger"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}

                    {vazio && indice === 0 && dia.turnos.length === 1 && (
                      <span className="badge badge-neutral">Fechado</span>
                    )}
                  </div>
                  <CampoErro id={idErro} mensagem={erro} />
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
};

export default HorariosEditor;
