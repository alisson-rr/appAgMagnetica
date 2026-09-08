/**
 * Lógica pura da implantação (Fase 3).
 *
 * Tudo aqui é função sem React, sem rede e sem `window`: é o que o
 * `tests/onboarding.test.mjs` consegue executar com `node --test`. Regra de
 * bolso: se depende do checklist do servidor, mora aqui; se depende de tela,
 * mora no componente.
 *
 * O checklist verdadeiro é o do servidor (`GET /config/implantacao`,
 * contrato §3.3). Este arquivo só o traduz para passo, contagem e rótulo.
 */
import { z } from 'zod';

export const TOTAL_PASSOS = 6;

/** Os 6 passos, na ordem em que cada um desbloqueia o seguinte (contrato P2). */
export const PASSOS = [
  { numero: 1, chave: 'negocio', titulo: 'Negócio' },
  { numero: 2, chave: 'horarios', titulo: 'Horários' },
  { numero: 3, chave: 'servicos', titulo: 'Serviços' },
  { numero: 4, chave: 'equipe', titulo: 'Equipe' },
  { numero: 5, chave: 'atendente', titulo: 'Atendente' },
  { numero: 6, chave: 'whatsapp', titulo: 'WhatsApp' },
];

/** Mesma ordem fixa que o servidor usa em `pendencias` (contrato §3.3). */
export const ITENS_IMPLANTACAO = PASSOS.map((passo) => passo.chave);

export const DIAS_SEMANA = [
  { value: 1, label: 'Segunda-feira', curto: 'Seg' },
  { value: 2, label: 'Terça-feira', curto: 'Ter' },
  { value: 3, label: 'Quarta-feira', curto: 'Qua' },
  { value: 4, label: 'Quinta-feira', curto: 'Qui' },
  { value: 5, label: 'Sexta-feira', curto: 'Sex' },
  { value: 6, label: 'Sábado', curto: 'Sáb' },
  { value: 7, label: 'Domingo', curto: 'Dom' },
];

/** Meias horas de 00:00 a 23:30, em ordem. */
export const HORAS = Array.from({ length: 48 }, (_, i) => {
  const valor = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
  return { value: valor, label: valor };
});

export const TONS = [
  { valor: 'acolhedor', rotulo: 'Acolhedor', descricao: 'Caloroso, próximo, com tempo para a pessoa.' },
  { valor: 'objetivo', rotulo: 'Objetivo', descricao: 'Direto ao ponto, sem rodeio.' },
  { valor: 'descontraido', rotulo: 'Descontraído', descricao: 'Leve e informal, como uma conversa de balcão.' },
];

export const passoDoItem = (chave) =>
  PASSOS.find((passo) => passo.chave === chave)?.numero ?? 1;

export const tituloDoItem = (chave) =>
  PASSOS.find((passo) => passo.chave === chave)?.titulo ?? chave;

/**
 * Primeiro passo ainda pendente segundo o checklist do servidor.
 * Checklist completo (ou ausente por falha de rede) devolve o último passo,
 * que é onde o dono termina a implantação — nunca o passo 1, que já está feito.
 */
export const primeiroPassoPendente = (implantacao) => {
  if (!implantacao) return 1;
  const pendente = PASSOS.find((passo) => !implantacao[passo.chave]);
  return pendente ? pendente.numero : TOTAL_PASSOS;
};

/** "Implantação: N de 6 · falta: Equipe, WhatsApp" (contrato §4.4). */
export const resumoImplantacao = (implantacao) => {
  const feitos = PASSOS.filter((passo) => Boolean(implantacao?.[passo.chave]));
  const faltando = PASSOS.filter((passo) => !implantacao?.[passo.chave]);
  return {
    concluidos: feitos.length,
    total: TOTAL_PASSOS,
    faltando: faltando.map((passo) => passo.titulo),
    passo: primeiroPassoPendente(implantacao),
    completo: feitos.length === TOTAL_PASSOS,
    automacaoAtiva: Boolean(implantacao?.automacao_ativa),
  };
};

/** `?passo=` só vale de 1 a 6; qualquer outra coisa é ignorada. */
export const passoDaQuery = (valor) => {
  if (valor === null || valor === undefined || `${valor}`.trim() === '') return null;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > TOTAL_PASSOS) return null;
  return numero;
};

const somenteDigitos = (valor) => String(valor ?? '').replace(/\D/g, '');

/**
 * Número no formato que o `wa.me` aceita: só dígitos, com DDI.
 * Número brasileiro sem DDI (10 ou 11 dígitos) ganha o 55; o que não fecha
 * um telefone plausível devolve `null` em vez de virar link quebrado.
 */
export const numeroParaWa = (numero) => {
  const digitos = somenteDigitos(numero);
  if (!digitos) return null;
  const completo = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  return completo.length >= 12 && completo.length <= 15 ? completo : null;
};

/** Link de conversa. Só o número entra na URL — nada de dado do negócio. */
export const linkWa = (numero) => {
  const digitos = numeroParaWa(numero);
  return digitos ? `https://wa.me/${digitos}` : null;
};

/** Número conectado em formato legível, para o dono conferir se é o dele. */
export const formatarNumeroWa = (numero) => {
  const digitos = numeroParaWa(numero);
  if (!digitos) return '';
  const nacional = digitos.startsWith('55') ? digitos.slice(2) : '';
  if (nacional.length === 11) {
    return `+55 (${nacional.slice(0, 2)}) ${nacional.slice(2, 7)}-${nacional.slice(7)}`;
  }
  if (nacional.length === 10) {
    return `+55 (${nacional.slice(0, 2)}) ${nacional.slice(2, 6)}-${nacional.slice(6)}`;
  }
  return `+${digitos}`;
};

/** Prévia do passo 5: como a atendente abre a conversa no tom escolhido. */
export const fraseDeExemplo = (nome, tom) => {
  const quem = String(nome ?? '').trim() || 'a atendente';
  const frases = {
    acolhedor: `Oi! Aqui é ${quem}. Que bom falar com você. Me conta o que você precisa que eu já procuro um horário.`,
    objetivo: `Olá, aqui é ${quem}. Qual serviço você quer marcar? Já verifico os horários livres.`,
    descontraido: `Oi, tudo bem? Sou ${quem}. Me diz o que você quer marcar que eu dou um jeito no horário.`,
  };
  return frases[tom] || frases.acolhedor;
};

// ===== Horários do negócio =====

const HORA_VALIDA = /^([01]\d|2[0-3]):[0-5]\d$/;

const hhmm = (valor) => String(valor ?? '').slice(0, 5);

/** Linhas de `GET /config/horarios-clinica` viram a grade de 7 dias da tela. */
export const agruparHorarios = (linhas) =>
  DIAS_SEMANA.map((dia) => {
    const turnos = (linhas || [])
      .filter((linha) => linha.dia_semana === dia.value)
      .map((linha) => ({
        id: linha.id,
        hora_inicio: hhmm(linha.hora_inicio),
        hora_fim: hhmm(linha.hora_fim),
      }));
    return {
      dia_semana: dia.value,
      turnos: turnos.length ? turnos : [{ hora_inicio: '', hora_fim: '' }],
    };
  });

/** Só os turnos com início e fim; dia em branco é dia fechado, não erro. */
export const turnosPreenchidos = (dias) =>
  (dias || []).flatMap((dia) =>
    (dia.turnos || [])
      .filter((turno) => turno.hora_inicio && turno.hora_fim)
      .map((turno) => ({
        id: turno.id,
        dia_semana: dia.dia_semana,
        hora_inicio: hhmm(turno.hora_inicio),
        hora_fim: hhmm(turno.hora_fim),
      })),
  );

/** Turnos que existiam no servidor e sumiram da tela: precisam de DELETE. */
export const idsRemovidos = (originais, dias) => {
  const mantidos = new Set(
    turnosPreenchidos(dias)
      .map((turno) => turno.id)
      .filter(Boolean),
  );
  return (originais || [])
    .map((linha) => linha.id)
    .filter((id) => id && !mantidos.has(id));
};

/**
 * Valida a grade inteira antes de salvar.
 * Turno pela metade é erro explícito: salvar em silêncio deixaria o dono
 * achando que marcou um horário que a agenda nunca vai oferecer.
 */
export const validarHorarios = (dias) => {
  const erros = {};
  let preenchidos = 0;

  (dias || []).forEach((dia) => {
    (dia.turnos || []).forEach((turno, indice) => {
      const inicio = hhmm(turno.hora_inicio);
      const fim = hhmm(turno.hora_fim);
      const chave = `${dia.dia_semana}-${indice}`;

      if (!inicio && !fim) return;
      if (!inicio || !fim) {
        erros[chave] = 'Preencha o início e o fim deste turno.';
        return;
      }
      if (!HORA_VALIDA.test(inicio) || !HORA_VALIDA.test(fim)) {
        erros[chave] = 'Horário inválido.';
        return;
      }
      if (fim <= inicio) {
        erros[chave] = 'O fim precisa ser depois do início.';
        return;
      }
      preenchidos += 1;
    });
  });

  if (preenchidos === 0 && Object.keys(erros).length === 0) {
    erros.geral = 'Marque pelo menos um dia de atendimento.';
  }

  return { valido: Object.keys(erros).length === 0, erros, preenchidos };
};

/**
 * Disponibilidade do atalho "Sou eu mesmo" (contrato P3): os horários do
 * negócio viram os horários da pessoa. Sem isso, `fn_buscar_slots` não
 * devolve horário nenhum e a atendente nunca consegue marcar.
 */
export const disponibilidadeDosHorarios = (dias) =>
  turnosPreenchidos(dias).map(({ dia_semana, hora_inicio, hora_fim }) => ({
    dia_semana,
    hora_inicio,
    hora_fim,
  }));

// ===== Esquemas de fronteira =====

const numerico = (schema) =>
  z.preprocess(
    (valor) => (valor === '' || valor === null || valor === undefined ? Number.NaN : Number(valor)),
    schema,
  );

const textoOpcional = (max, mensagem) =>
  z.string().trim().max(max, mensagem).optional().or(z.literal(''));

export const telefoneOpcional = z
  .string()
  .trim()
  .optional()
  .refine((valor) => !valor || [10, 11].includes(somenteDigitos(valor).length), {
    message: 'Informe DDD e número (10 ou 11 dígitos).',
  });

const emailOpcional = z
  .string()
  .trim()
  .optional()
  .refine((valor) => !valor || z.string().email().safeParse(valor).success, {
    message: 'E-mail inválido.',
  });

export const negocioSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe o nome do negócio.')
    .max(120, 'O nome pode ter até 120 caracteres.'),
  telefone: telefoneOpcional,
  email: emailOpcional,
  endereco: textoOpcional(200, 'O endereço pode ter até 200 caracteres.'),
  // 2000, e não 500: este texto é a única fonte da recepção para o que não
  // cabe no catálogo (pagamento, convênio, estacionamento, o que levar na
  // primeira sessão). Precisa concordar com LIMITE_DESCRICAO em
  // services/api/server.py — o servidor é quem recusa de verdade.
  descricao: textoOpcional(2000, 'O texto pode ter até 2000 caracteres.'),
});

export const servicoSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe o nome do serviço.')
    .max(120, 'O nome pode ter até 120 caracteres.'),
  duracao_minutos: numerico(
    z
      .number({ invalid_type_error: 'Informe a duração em minutos.' })
      .int('Use minutos inteiros.')
      .min(5, 'A duração mínima é de 5 minutos.')
      .max(600, 'A duração máxima é de 600 minutos.'),
  ),
  valor: numerico(
    z
      .number({ invalid_type_error: 'Informe o valor.' })
      .min(0, 'O valor não pode ser negativo.')
      .max(99999.99, 'Valor acima do limite.'),
  ),
  descricao: textoOpcional(500, 'A descrição pode ter até 500 caracteres.'),
  orientacoes: textoOpcional(500, 'As orientações podem ter até 500 caracteres.'),
});

export const profissionalSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe o nome.')
    .max(120, 'O nome pode ter até 120 caracteres.'),
  email: emailOpcional,
  whats: telefoneOpcional,
  id_area_atuacao: z.string().optional(),
  ativo: z.boolean(),
  observacoes: textoOpcional(500, 'As observações podem ter até 500 caracteres.'),
  procedimentos: z.array(z.number()).default([]),
  disponibilidades: z
    .array(
      z.object({
        dia_semana: z.number().int().min(1).max(7),
        hora_inicio: z.string().regex(HORA_VALIDA, 'Horário inválido.'),
        hora_fim: z.string().regex(HORA_VALIDA, 'Horário inválido.'),
      }),
    )
    .default([])
    .refine((lista) => lista.every((item) => item.hora_fim > item.hora_inicio), {
      message: 'Em cada horário, o fim precisa ser depois do início.',
    }),
});

/**
 * Mesmas regras do servidor (contrato §3.4 / P9). Os dois campos entram no
 * prompt de sistema da atendente: recusar aqui evita ida e volta, mas quem
 * decide continua sendo o servidor.
 */
export const NOME_ATENDENTE = /^[A-Za-zÀ-ÖØ-öø-ÿ ]+$/;

export const atendenteSchema = z.object({
  assistente_nome: z
    .string()
    .trim()
    .min(2, 'O nome precisa de pelo menos 2 letras.')
    .max(40, 'O nome pode ter até 40 letras.')
    .regex(NOME_ATENDENTE, 'Use apenas letras e espaços.'),
  assistente_tom: z.enum(['acolhedor', 'objetivo', 'descontraido'], {
    errorMap: () => ({ message: 'Escolha um tom de conversa.' }),
  }),
  exige_profissional: z.boolean(),
});
