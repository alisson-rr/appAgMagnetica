/**
 * Verificação executável da lógica de implantação (contrato §4.6).
 *
 * `node --test`, sem dependência nova. Só entra aqui o que pode quebrar em
 * silêncio: passo retomado errado, turno pela metade salvo sem aviso, número
 * virando link torto, recibo interpolando HTML de terceiro.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIAS_SEMANA,
  HORAS,
  ITENS_IMPLANTACAO,
  PASSOS,
  TOTAL_PASSOS,
  agruparHorarios,
  atendenteSchema,
  disponibilidadeDosHorarios,
  formatarNumeroWa,
  fraseDeExemplo,
  idsRemovidos,
  linkWa,
  negocioSchema,
  numeroParaWa,
  passoDaQuery,
  passoDoItem,
  primeiroPassoPendente,
  profissionalSchema,
  resumoImplantacao,
  servicoSchema,
  tituloDoItem,
  turnosPreenchidos,
  validarHorarios,
} from '../src/lib/onboarding.js';
import { escaparHtml, formatPhone, unformatPhone } from '../src/utils/formatters.js';

const checklist = (parcial = {}) => ({
  negocio: false,
  horarios: false,
  servicos: false,
  equipe: false,
  atendente: false,
  whatsapp: false,
  automacao_ativa: false,
  ...parcial,
});

// ===== Passos e checklist =====

test('a ordem dos passos é a mesma ordem de `pendencias` do servidor', () => {
  assert.deepEqual(ITENS_IMPLANTACAO, [
    'negocio',
    'horarios',
    'servicos',
    'equipe',
    'atendente',
    'whatsapp',
  ]);
  assert.equal(PASSOS.length, TOTAL_PASSOS);
  assert.deepEqual(
    PASSOS.map((passo) => passo.numero),
    [1, 2, 3, 4, 5, 6],
  );
});

test('primeiroPassoPendente abre no primeiro item falso', () => {
  assert.equal(primeiroPassoPendente(checklist()), 1);
  assert.equal(primeiroPassoPendente(checklist({ negocio: true })), 2);
  assert.equal(
    primeiroPassoPendente(checklist({ negocio: true, horarios: true, servicos: true })),
    4,
  );
});

test('primeiroPassoPendente ignora buracos no meio e devolve o primeiro pendente', () => {
  // Checklist com o WhatsApp já conectado mas a equipe faltando: o passo certo
  // é a equipe, não o WhatsApp.
  const parcial = checklist({ negocio: true, horarios: true, servicos: true, whatsapp: true });
  assert.equal(primeiroPassoPendente(parcial), 4);
});

test('checklist completo aponta para o último passo, não para o primeiro', () => {
  const completo = checklist({
    negocio: true,
    horarios: true,
    servicos: true,
    equipe: true,
    atendente: true,
    whatsapp: true,
  });
  assert.equal(primeiroPassoPendente(completo), TOTAL_PASSOS);
});

test('sem checklist (rede fora) o wizard começa do passo 1', () => {
  assert.equal(primeiroPassoPendente(null), 1);
  assert.equal(primeiroPassoPendente(undefined), 1);
});

test('resumoImplantacao conta "N de 6" e lista o que falta pelo título', () => {
  const resumo = resumoImplantacao(
    checklist({ negocio: true, horarios: true, servicos: true, atendente: true }),
  );
  assert.equal(resumo.concluidos, 4);
  assert.equal(resumo.total, 6);
  assert.deepEqual(resumo.faltando, ['Equipe', 'WhatsApp']);
  assert.equal(resumo.passo, 4);
  assert.equal(resumo.completo, false);
  assert.equal(resumo.automacaoAtiva, false);
});

test('resumoImplantacao marca completo e lê a flag de automação', () => {
  const resumo = resumoImplantacao(
    checklist({
      negocio: true,
      horarios: true,
      servicos: true,
      equipe: true,
      atendente: true,
      whatsapp: true,
      automacao_ativa: true,
    }),
  );
  assert.equal(resumo.completo, true);
  assert.deepEqual(resumo.faltando, []);
  assert.equal(resumo.automacaoAtiva, true);
});

test('pendência do 409 vira passo e rótulo', () => {
  assert.equal(passoDoItem('equipe'), 4);
  assert.equal(passoDoItem('whatsapp'), 6);
  assert.equal(tituloDoItem('atendente'), 'Atendente');
  // Item desconhecido não derruba a tela.
  assert.equal(passoDoItem('inventado'), 1);
  assert.equal(tituloDoItem('inventado'), 'inventado');
});

test('passoDaQuery aceita 1..6 e recusa o resto', () => {
  assert.equal(passoDaQuery('3'), 3);
  assert.equal(passoDaQuery(6), 6);
  assert.equal(passoDaQuery('0'), null);
  assert.equal(passoDaQuery('7'), null);
  assert.equal(passoDaQuery('-2'), null);
  assert.equal(passoDaQuery('2.5'), null);
  assert.equal(passoDaQuery('abc'), null);
  assert.equal(passoDaQuery(''), null);
  assert.equal(passoDaQuery(null), null);
});

// ===== Número do WhatsApp =====

test('numeroParaWa aceita o formato do servidor e o local com DDD', () => {
  assert.equal(numeroParaWa('5551999990000'), '5551999990000');
  assert.equal(numeroParaWa('51999990000'), '5551999990000');
  assert.equal(numeroParaWa('5133334444'), '555133334444');
  assert.equal(numeroParaWa('(51) 99999-0000'), '5551999990000');
});

test('numeroParaWa recusa o que não fecha um telefone', () => {
  assert.equal(numeroParaWa(''), null);
  assert.equal(numeroParaWa(null), null);
  assert.equal(numeroParaWa(undefined), null);
  assert.equal(numeroParaWa('123'), null);
  assert.equal(numeroParaWa('9999999999999999999'), null);
  assert.equal(numeroParaWa('abc'), null);
});

test('linkWa leva só o número na URL', () => {
  assert.equal(linkWa('5551999990000'), 'https://wa.me/5551999990000');
  assert.equal(linkWa('nada'), null);
  assert.ok(!/[?&]/.test(linkWa('51999990000')));
});

test('formatarNumeroWa mostra o número de um jeito conferível', () => {
  assert.equal(formatarNumeroWa('5551999990000'), '+55 (51) 99999-0000');
  assert.equal(formatarNumeroWa('5551333344444'.slice(0, 12)), '+55 (51) 3333-4444');
  assert.equal(formatarNumeroWa('351912345678'), '+351912345678');
  assert.equal(formatarNumeroWa('x'), '');
});

// ===== Horários do negócio =====

test('agruparHorarios devolve os 7 dias, com turno vazio para dia fechado', () => {
  const grade = agruparHorarios([
    { id: 1, dia_semana: 1, hora_inicio: '08:00:00', hora_fim: '12:00:00' },
    { id: 2, dia_semana: 1, hora_inicio: '13:00:00', hora_fim: '18:00:00' },
  ]);
  assert.equal(grade.length, DIAS_SEMANA.length);
  assert.equal(grade[0].turnos.length, 2);
  assert.deepEqual(grade[0].turnos[0], { id: 1, hora_inicio: '08:00', hora_fim: '12:00' });
  assert.deepEqual(grade[1].turnos, [{ hora_inicio: '', hora_fim: '' }]);
});

test('agruparHorarios aguenta lista vazia e nula', () => {
  assert.equal(agruparHorarios([]).length, 7);
  assert.equal(agruparHorarios(null).length, 7);
});

test('validarHorarios aceita a grade com pelo menos um dia completo', () => {
  const grade = agruparHorarios([
    { id: 1, dia_semana: 2, hora_inicio: '09:00:00', hora_fim: '17:00:00' },
  ]);
  const resultado = validarHorarios(grade);
  assert.equal(resultado.valido, true);
  assert.equal(resultado.preenchidos, 1);
  assert.deepEqual(resultado.erros, {});
});

test('validarHorarios recusa turno pela metade em vez de salvar em silêncio', () => {
  const grade = agruparHorarios([]);
  grade[0].turnos = [{ hora_inicio: '08:00', hora_fim: '' }];
  const resultado = validarHorarios(grade);
  assert.equal(resultado.valido, false);
  assert.equal(resultado.erros['1-0'], 'Preencha o início e o fim deste turno.');
});

test('validarHorarios recusa fim menor ou igual ao início', () => {
  const grade = agruparHorarios([]);
  grade[0].turnos = [{ hora_inicio: '18:00', hora_fim: '09:00' }];
  assert.equal(validarHorarios(grade).erros['1-0'], 'O fim precisa ser depois do início.');

  grade[0].turnos = [{ hora_inicio: '09:00', hora_fim: '09:00' }];
  assert.equal(validarHorarios(grade).erros['1-0'], 'O fim precisa ser depois do início.');
});

test('validarHorarios exige pelo menos um dia de atendimento', () => {
  const resultado = validarHorarios(agruparHorarios([]));
  assert.equal(resultado.valido, false);
  assert.equal(resultado.erros.geral, 'Marque pelo menos um dia de atendimento.');
});

test('validarHorarios aponta o turno errado do dia certo', () => {
  const grade = agruparHorarios([]);
  grade[2].turnos = [
    { hora_inicio: '08:00', hora_fim: '12:00' },
    { hora_inicio: '15:00', hora_fim: '14:00' },
  ];
  const resultado = validarHorarios(grade);
  assert.equal(resultado.erros['3-1'], 'O fim precisa ser depois do início.');
  assert.equal(resultado.erros['3-0'], undefined);
});

test('turnosPreenchidos ignora turnos em branco e corta os segundos', () => {
  const grade = agruparHorarios([
    { id: 7, dia_semana: 5, hora_inicio: '08:00:00', hora_fim: '12:00:00' },
  ]);
  grade[0].turnos = [{ hora_inicio: '', hora_fim: '' }];
  const turnos = turnosPreenchidos(grade);
  assert.equal(turnos.length, 1);
  assert.deepEqual(turnos[0], { id: 7, dia_semana: 5, hora_inicio: '08:00', hora_fim: '12:00' });
});

test('idsRemovidos lista o que sumiu da tela e precisa de DELETE', () => {
  const originais = [
    { id: 1, dia_semana: 1, hora_inicio: '08:00:00', hora_fim: '12:00:00' },
    { id: 2, dia_semana: 1, hora_inicio: '13:00:00', hora_fim: '18:00:00' },
  ];
  const grade = agruparHorarios(originais);
  grade[0].turnos = grade[0].turnos.filter((turno) => turno.id !== 2);
  assert.deepEqual(idsRemovidos(originais, grade), [2]);
});

test('idsRemovidos trata turno esvaziado como removido', () => {
  const originais = [{ id: 9, dia_semana: 3, hora_inicio: '08:00:00', hora_fim: '12:00:00' }];
  const grade = agruparHorarios(originais);
  grade[2].turnos = [{ id: 9, hora_inicio: '', hora_fim: '' }];
  assert.deepEqual(idsRemovidos(originais, grade), [9]);
});

test('idsRemovidos não apaga nada quando a grade não mudou', () => {
  const originais = [{ id: 4, dia_semana: 6, hora_inicio: '09:00:00', hora_fim: '13:00:00' }];
  assert.deepEqual(idsRemovidos(originais, agruparHorarios(originais)), []);
});

test('"Sou eu mesmo" copia os horários do negócio, sem id', () => {
  const grade = agruparHorarios([
    { id: 1, dia_semana: 1, hora_inicio: '08:00:00', hora_fim: '12:00:00' },
    { id: 2, dia_semana: 1, hora_inicio: '13:00:00', hora_fim: '18:00:00' },
    { id: 3, dia_semana: 4, hora_inicio: '09:00:00', hora_fim: '15:00:00' },
  ]);
  const disponibilidade = disponibilidadeDosHorarios(grade);
  assert.equal(disponibilidade.length, 3);
  assert.deepEqual(disponibilidade[0], { dia_semana: 1, hora_inicio: '08:00', hora_fim: '12:00' });
  assert.ok(disponibilidade.every((item) => !('id' in item)));
});

test('sem horário do negócio não há disponibilidade para copiar', () => {
  assert.deepEqual(disponibilidadeDosHorarios(agruparHorarios([])), []);
});

test('HORAS cobre as meias horas do dia inteiro', () => {
  assert.equal(HORAS.length, 48);
  assert.equal(HORAS[0].value, '00:00');
  assert.equal(HORAS[1].value, '00:30');
  assert.equal(HORAS.at(-1).value, '23:30');
});

// ===== Esquemas de fronteira =====

test('negocioSchema aceita o texto do negócio até o mesmo teto do servidor', () => {
  // Este texto entra no system prompt da recepção. O número aqui precisa
  // concordar com LIMITE_DESCRICAO em services/api/server.py: menor no painel
  // e o assinante é impedido de escrever o que o servidor aceitaria; maior e o
  // formulário promete um tamanho que o servidor recusa com 422 sem explicar.
  const LIMITE_DESCRICAO = 2000;
  assert.equal(
    negocioSchema.safeParse({ nome: 'Studio', descricao: 'x'.repeat(LIMITE_DESCRICAO) }).success,
    true,
    'o painel recusa um texto que o servidor aceita',
  );
  assert.equal(
    negocioSchema.safeParse({ nome: 'Studio', descricao: 'x'.repeat(LIMITE_DESCRICAO + 1) }).success,
    false,
    'o painel promete um tamanho que o servidor devolve como 422',
  );
});

test('negocioSchema exige nome e valida telefone e e-mail quando preenchidos', () => {
  assert.equal(negocioSchema.safeParse({ nome: 'Studio Bem Estar' }).success, true);
  assert.equal(negocioSchema.safeParse({ nome: 'A' }).success, false);
  assert.equal(negocioSchema.safeParse({ nome: '   ' }).success, false);
  assert.equal(
    negocioSchema.safeParse({ nome: 'Studio', telefone: '(51) 99999-0000' }).success,
    true,
  );
  assert.equal(negocioSchema.safeParse({ nome: 'Studio', telefone: '123' }).success, false);
  assert.equal(negocioSchema.safeParse({ nome: 'Studio', email: 'nao-e-email' }).success, false);
  assert.equal(negocioSchema.safeParse({ nome: 'Studio', email: '' }).success, true);
});

test('servicoSchema recusa campo numérico vazio em vez de virar zero', () => {
  const valido = servicoSchema.safeParse({ nome: 'Corte', duracao_minutos: '45', valor: '80.50' });
  assert.equal(valido.success, true);
  assert.equal(valido.data.duracao_minutos, 45);
  assert.equal(valido.data.valor, 80.5);

  assert.equal(
    servicoSchema.safeParse({ nome: 'Corte', duracao_minutos: '', valor: '80' }).success,
    false,
  );
  assert.equal(
    servicoSchema.safeParse({ nome: 'Corte', duracao_minutos: '45', valor: '' }).success,
    false,
  );
  assert.equal(
    servicoSchema.safeParse({ nome: 'Corte', duracao_minutos: '45', valor: '-1' }).success,
    false,
  );
  assert.equal(
    servicoSchema.safeParse({ nome: 'Corte', duracao_minutos: '2', valor: '10' }).success,
    false,
  );
});

test('servicoSchema aceita serviço gratuito', () => {
  assert.equal(
    servicoSchema.safeParse({ nome: 'Avaliação', duracao_minutos: '30', valor: '0' }).success,
    true,
  );
});

test('atendenteSchema repete as regras do servidor para nome e tom', () => {
  const ok = atendenteSchema.safeParse({
    assistente_nome: 'Marina',
    assistente_tom: 'acolhedor',
    exige_profissional: true,
  });
  assert.equal(ok.success, true);

  const base = { assistente_tom: 'objetivo', exige_profissional: false };
  assert.equal(atendenteSchema.safeParse({ ...base, assistente_nome: 'M' }).success, false);
  assert.equal(atendenteSchema.safeParse({ ...base, assistente_nome: 'A'.repeat(41) }).success, false);
  assert.equal(atendenteSchema.safeParse({ ...base, assistente_nome: 'Ana Júlia' }).success, true);
  // Texto livre do dono entra no prompt de sistema: a fronteira recusa.
  assert.equal(
    atendenteSchema.safeParse({ ...base, assistente_nome: 'Ana <script>' }).success,
    false,
  );
  assert.equal(atendenteSchema.safeParse({ ...base, assistente_nome: 'Bot 3000' }).success, false);
  assert.equal(
    atendenteSchema.safeParse({
      assistente_nome: 'Ana',
      assistente_tom: 'sarcastico',
      exige_profissional: false,
    }).success,
    false,
  );
});

test('profissionalSchema recusa disponibilidade invertida', () => {
  const base = { nome: 'Marina Souza', ativo: true, procedimentos: [1], disponibilidades: [] };
  assert.equal(profissionalSchema.safeParse(base).success, true);
  assert.equal(
    profissionalSchema.safeParse({
      ...base,
      disponibilidades: [{ dia_semana: 1, hora_inicio: '08:00', hora_fim: '12:00' }],
    }).success,
    true,
  );
  assert.equal(
    profissionalSchema.safeParse({
      ...base,
      disponibilidades: [{ dia_semana: 1, hora_inicio: '18:00', hora_fim: '09:00' }],
    }).success,
    false,
  );
  assert.equal(
    profissionalSchema.safeParse({
      ...base,
      disponibilidades: [{ dia_semana: 9, hora_inicio: '08:00', hora_fim: '12:00' }],
    }).success,
    false,
  );
});

// ===== Textos e recibo =====

test('fraseDeExemplo muda com o tom e usa o nome escolhido', () => {
  const acolhedor = fraseDeExemplo('Marina', 'acolhedor');
  const objetivo = fraseDeExemplo('Marina', 'objetivo');
  assert.ok(acolhedor.includes('Marina'));
  assert.ok(objetivo.includes('Marina'));
  assert.notEqual(acolhedor, objetivo);
  // Nome ainda vazio não vira frase quebrada.
  assert.ok(fraseDeExemplo('', 'objetivo').includes('a atendente'));
  assert.ok(fraseDeExemplo('  ', null).length > 0);
});

test('escaparHtml neutraliza HTML de terceiro no recibo', () => {
  assert.equal(
    escaparHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
  );
  assert.equal(escaparHtml("O'Brien & Filhos"), 'O&#39;Brien &amp; Filhos');
  assert.equal(escaparHtml('Ana Maria'), 'Ana Maria');
  assert.equal(escaparHtml(null), '');
  assert.equal(escaparHtml(undefined), '');
  assert.equal(escaparHtml(42), '42');
});

test('formatPhone e unformatPhone continuam de acordo', () => {
  assert.equal(formatPhone('51999990000'), '(51) 99999-0000');
  assert.equal(formatPhone('5133334444'), '(51) 3333-4444');
  assert.equal(formatPhone(''), '');
  assert.equal(unformatPhone('(51) 99999-0000'), '51999990000');
});
