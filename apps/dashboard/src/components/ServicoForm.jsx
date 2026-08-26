import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { CampoErro, descricaoDoCampo } from './CampoErro';
import { servicoSchema } from '../lib/onboarding';

/**
 * Formulário de serviço usado em Serviços e no passo 3 do onboarding.
 * `enxuto` esconde descrição e orientações: no onboarding só nome, duração e
 * valor importam — são eles que definem os horários que a atendente oferece.
 */
const vazio = { nome: '', descricao: '', duracao_minutos: '', valor: '', orientacoes: '' };

const ServicoForm = ({
  valoresIniciais,
  aoSalvar,
  aoCancelar,
  enviando = false,
  enxuto = false,
  textoBotao = 'Salvar',
  idPrefixo = 'servico',
}) => {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(servicoSchema),
    defaultValues: { ...vazio, ...(valoresIniciais || {}) },
  });

  const enviar = handleSubmit(async (valores) => {
    const payload = {
      nome: valores.nome.trim(),
      duracao_minutos: valores.duracao_minutos,
      valor: valores.valor,
      descricao: (valores.descricao || '').trim() || null,
      orientacoes: (valores.orientacoes || '').trim() || null,
    };
    const salvou = await aoSalvar(payload);
    if (salvou !== false && !valoresIniciais) reset(vazio);
  });

  const id = (campo) => `${idPrefixo}-${campo}`;

  return (
    <form onSubmit={enviar} className="space-y-4" noValidate>
      <div>
        <Label htmlFor={id('nome')}>Nome do serviço *</Label>
        <Input
          id={id('nome')}
          data-testid="input-nome"
          placeholder="Ex.: Limpeza de pele"
          {...descricaoDoCampo(id('nome'), errors.nome?.message)}
          {...register('nome')}
        />
        <CampoErro id={`${id('nome')}-erro`} mensagem={errors.nome?.message} />
      </div>

      {!enxuto && (
        <div>
          <Label htmlFor={id('descricao')}>Descrição</Label>
          <Textarea
            id={id('descricao')}
            data-testid="input-descricao"
            {...descricaoDoCampo(id('descricao'), errors.descricao?.message)}
            {...register('descricao')}
          />
          <CampoErro id={`${id('descricao')}-erro`} mensagem={errors.descricao?.message} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={id('duracao')}>Duração (min) *</Label>
          <Input
            id={id('duracao')}
            data-testid="input-duracao"
            type="number"
            inputMode="numeric"
            min={5}
            step={5}
            placeholder="60"
            {...descricaoDoCampo(id('duracao'), errors.duracao_minutos?.message)}
            {...register('duracao_minutos')}
          />
          <CampoErro id={`${id('duracao')}-erro`} mensagem={errors.duracao_minutos?.message} />
        </div>
        <div>
          <Label htmlFor={id('valor')}>Valor (R$) *</Label>
          <Input
            id={id('valor')}
            data-testid="input-valor"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="150.00"
            {...descricaoDoCampo(id('valor'), errors.valor?.message)}
            {...register('valor')}
          />
          <CampoErro id={`${id('valor')}-erro`} mensagem={errors.valor?.message} />
        </div>
      </div>

      {!enxuto && (
        <div>
          <Label htmlFor={id('orientacoes')}>Orientações</Label>
          <Textarea
            id={id('orientacoes')}
            data-testid="input-orientacoes"
            {...descricaoDoCampo(id('orientacoes'), errors.orientacoes?.message)}
            {...register('orientacoes')}
          />
          <CampoErro id={`${id('orientacoes')}-erro`} mensagem={errors.orientacoes?.message} />
        </div>
      )}

      <div className="flex justify-end gap-3">
        {aoCancelar && (
          <Button type="button" variant="outline" onClick={aoCancelar}>
            Cancelar
          </Button>
        )}
        <Button type="submit" data-testid="submit-servico" disabled={enviando}>
          {enviando ? 'Salvando...' : textoBotao}
        </Button>
      </div>
    </form>
  );
};

export default ServicoForm;
