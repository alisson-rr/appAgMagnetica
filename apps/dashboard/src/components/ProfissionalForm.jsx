import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Plus, X } from 'lucide-react';

import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { CampoErro, descricaoDoCampo } from './CampoErro';
import { DIAS_SEMANA, profissionalSchema } from '../lib/onboarding';
import { formatPhone, unformatPhone } from '../utils/formatters';

/**
 * Formulário de profissional usado em Profissionais e no passo 4 do
 * onboarding. Serviços e disponibilidade fazem parte do formulário porque um
 * profissional sem os dois não é agendável — é assim que o checklist do
 * servidor conta o item `equipe` (contrato §3.3).
 */
const vazio = {
  nome: '',
  email: '',
  whats: '',
  id_area_atuacao: '',
  ativo: true,
  observacoes: '',
  procedimentos: [],
  disponibilidades: [],
};

const ProfissionalForm = ({
  valoresIniciais,
  areas = [],
  procedimentos = [],
  aoSalvar,
  aoCancelar,
  enviando = false,
  textoBotao = 'Salvar',
  idPrefixo = 'profissional',
}) => {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(profissionalSchema),
    defaultValues: { ...vazio, ...(valoresIniciais || {}) },
  });

  const ativo = watch('ativo');
  const whats = watch('whats');
  const escolhidos = watch('procedimentos') || [];
  const disponibilidades = watch('disponibilidades') || [];

  const id = (campo) => `${idPrefixo}-${campo}`;

  const alternarProcedimento = (procId) =>
    setValue(
      'procedimentos',
      escolhidos.includes(procId)
        ? escolhidos.filter((item) => item !== procId)
        : [...escolhidos, procId],
      { shouldDirty: true },
    );

  const mudarDisponibilidade = (indice, campo, valor) =>
    setValue(
      'disponibilidades',
      disponibilidades.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)),
      { shouldDirty: true, shouldValidate: true },
    );

  const enviar = handleSubmit(async (valores) => {
    const salvou = await aoSalvar({
      nome: valores.nome.trim(),
      email: (valores.email || '').trim() || null,
      whats: unformatPhone(valores.whats || '') || null,
      id_area_atuacao: valores.id_area_atuacao ? Number(valores.id_area_atuacao) : null,
      ativo: valores.ativo,
      observacoes: (valores.observacoes || '').trim() || null,
      procedimentos: valores.procedimentos,
      disponibilidades: valores.disponibilidades,
    });
    if (salvou !== false && !valoresIniciais) reset(vazio);
  });

  const areasUnicas = areas.filter(
    (area, indice, lista) => indice === lista.findIndex((outra) => outra.nome === area.nome),
  );

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <div>
        <Label htmlFor={id('nome')}>Nome *</Label>
        <Input
          id={id('nome')}
          data-testid="input-nome"
          placeholder="Quem atende"
          {...descricaoDoCampo(id('nome'), errors.nome?.message)}
          {...register('nome')}
        />
        <CampoErro id={`${id('nome')}-erro`} mensagem={errors.nome?.message} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={id('email')}>E-mail</Label>
          <Input
            id={id('email')}
            data-testid="input-email"
            type="email"
            {...descricaoDoCampo(id('email'), errors.email?.message)}
            {...register('email')}
          />
          <CampoErro id={`${id('email')}-erro`} mensagem={errors.email?.message} />
        </div>
        <div>
          <Label htmlFor={id('whats')}>WhatsApp</Label>
          <Input
            id={id('whats')}
            data-testid="input-whatsapp"
            type="tel"
            inputMode="tel"
            maxLength={15}
            placeholder="(00) 00000-0000"
            {...descricaoDoCampo(id('whats'), errors.whats?.message)}
            {...register('whats')}
            value={formatPhone(whats || '')}
            onChange={(evento) =>
              setValue('whats', formatPhone(evento.target.value), {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          <CampoErro id={`${id('whats')}-erro`} mensagem={errors.whats?.message} />
        </div>
      </div>

      {areasUnicas.length > 0 && (
        <div>
          <Label htmlFor={id('area')}>Área de atuação</Label>
          <select
            id={id('area')}
            data-testid="select-area"
            className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
            {...register('id_area_atuacao')}
          >
            <option value="">Não informada</option>
            {areasUnicas.map((area) => (
              <option key={area.id} value={String(area.id)}>
                {area.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Switch
          id={id('ativo')}
          data-testid="switch-ativo"
          checked={ativo}
          onCheckedChange={(marcado) => setValue('ativo', marcado, { shouldDirty: true })}
        />
        <Label htmlFor={id('ativo')}>Atende e pode receber agendamentos</Label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-foreground">Serviços que realiza</legend>
        <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-border/70 p-3">
          {procedimentos.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Cadastre um serviço antes de escolher o que esta pessoa atende.
            </p>
          ) : (
            procedimentos.map((proc) => (
              <label
                key={proc.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 hover:bg-accent/50"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={escolhidos.includes(proc.id)}
                  onChange={() => alternarProcedimento(proc.id)}
                />
                <span className="text-sm text-foreground">
                  {proc.nome} ({proc.duracao_minutos} min)
                </span>
              </label>
            ))
          )}
        </div>
      </fieldset>

      <fieldset>
        <div className="flex items-center justify-between">
          <legend className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Clock className="h-4 w-4 text-primary" />
            Horários de trabalho
          </legend>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() =>
              setValue(
                'disponibilidades',
                [...disponibilidades, { dia_semana: 1, hora_inicio: '08:00', hora_fim: '18:00' }],
                { shouldDirty: true, shouldValidate: true },
              )
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Adicionar
          </Button>
        </div>

        <div className="mt-1 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-border/70 p-3">
          {disponibilidades.length === 0 ? (
            <p className="py-2 text-center text-sm text-muted-foreground">
              Sem horário cadastrado, esta pessoa não aparece na agenda.
            </p>
          ) : (
            disponibilidades.map((disp, indice) => (
              <div key={indice} className="flex items-center gap-2 rounded bg-muted p-2">
                <select
                  aria-label={`Dia da semana do horário ${indice + 1}`}
                  value={disp.dia_semana}
                  onChange={(evento) =>
                    mudarDisponibilidade(indice, 'dia_semana', Number(evento.target.value))
                  }
                  className="h-9 flex-1 rounded-lg border border-input bg-card px-2 text-sm"
                >
                  {DIAS_SEMANA.map((dia) => (
                    <option key={dia.value} value={dia.value}>
                      {dia.label}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  aria-label={`Início do horário ${indice + 1}`}
                  value={disp.hora_inicio}
                  onChange={(evento) => mudarDisponibilidade(indice, 'hora_inicio', evento.target.value)}
                  className="h-9 w-24 rounded-lg border border-input bg-card px-2 text-sm"
                />
                <span className="text-sm text-muted-foreground">até</span>
                <input
                  type="time"
                  aria-label={`Fim do horário ${indice + 1}`}
                  value={disp.hora_fim}
                  onChange={(evento) => mudarDisponibilidade(indice, 'hora_fim', evento.target.value)}
                  className="h-9 w-24 rounded-lg border border-input bg-card px-2 text-sm"
                />
                <button
                  type="button"
                  aria-label={`Remover horário ${indice + 1}`}
                  onClick={() =>
                    setValue(
                      'disponibilidades',
                      disponibilidades.filter((_, i) => i !== indice),
                      { shouldDirty: true, shouldValidate: true },
                    )
                  }
                  className="icon-action icon-action-danger h-8 w-8 shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
        <CampoErro id={`${id('disponibilidades')}-erro`} mensagem={errors.disponibilidades?.message} />
      </fieldset>

      <div>
        <Label htmlFor={id('observacoes')}>Observações</Label>
        <Textarea
          id={id('observacoes')}
          data-testid="input-observacoes"
          {...descricaoDoCampo(id('observacoes'), errors.observacoes?.message)}
          {...register('observacoes')}
        />
        <CampoErro id={`${id('observacoes')}-erro`} mensagem={errors.observacoes?.message} />
      </div>

      <div className="flex justify-end gap-3">
        {aoCancelar && (
          <Button type="button" variant="outline" onClick={aoCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit" data-testid="submit-profissional" disabled={enviando}>
          {enviando ? 'Salvando...' : textoBotao}
        </Button>
      </div>
    </form>
  );
};

export default ProfissionalForm;
