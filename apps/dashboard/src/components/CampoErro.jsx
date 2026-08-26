import React from 'react';

/**
 * Mensagem de erro ao lado do campo, ligada a ele por `aria-describedby`.
 * Use sempre em par com `descricaoDoCampo(id, erro)` no input.
 */
export const CampoErro = ({ id, mensagem }) =>
  mensagem ? (
    <p id={id} role="alert" className="mt-1 text-xs font-semibold text-destructive">
      {mensagem}
    </p>
  ) : null;

/** Atributos que o input precisa para apontar para o próprio erro. */
export const descricaoDoCampo = (id, mensagem) => ({
  'aria-invalid': mensagem ? 'true' : undefined,
  'aria-describedby': mensagem ? `${id}-erro` : undefined,
});

export default CampoErro;
