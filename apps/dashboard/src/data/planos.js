/**
 * Catálogo de planos (provisório) — códigos e preços vindos da versão anterior
 * de EscolherPlano.jsx. Fonte única para a página de planos e para o cadastro.
 *
 * `recursos` lista apenas o que já existe no produto hoje.
 * `roadmap` lista o que ainda não está disponível e é exibido como tal.
 *
 * Quando o billing entrar, cada plano precisará de um identificador de preço
 * do provedor (ex.: priceIdMensal / priceIdAnual) e o handler de seleção em
 * EscolherPlano.jsx passa a iniciar o checkout no backend.
 */
export const PLANOS = [
  {
    id: 'essencial',
    nome: 'Plano Essencial',
    descricao: 'Ideal para começar',
    precoMensal: 399,
    precoAnual: 297,
    popular: false,
    recursos: [
      'Atendimento no WhatsApp com as regras que você define',
      'Agendamento a partir dos horários reais da sua agenda',
      'Central do dia com o que precisa da sua atenção',
      'Cadastro de clientes, serviços e horários de funcionamento',
      'Suporte e manutenção contínuos',
    ],
    roadmap: [],
  },
  {
    id: 'premium',
    nome: 'Plano Premium',
    descricao: 'O mais escolhido',
    precoMensal: 599,
    precoAnual: 467,
    popular: true,
    recursos: [
      'Tudo do Plano Essencial',
      'Vários profissionais na mesma agenda',
      'Disponibilidade e serviços por profissional',
      'Acompanhamento de implantação por 90 dias',
    ],
    roadmap: ['Lembretes de consulta', 'Histórico do cliente para recomendações', 'Avaliações pós-atendimento'],
  },
  {
    id: 'personalizado',
    nome: 'Plano Personalizado',
    descricao: 'Para clínicas que querem mais',
    precoMinimo: 799,
    popular: false,
    recursos: [
      'Tudo dos planos anteriores',
      'Configuração sob medida para o seu fluxo de atendimento',
      'Conversa direta com o time durante a implantação',
    ],
    roadmap: ['Cadastro automático de clientes', 'Envio de links de pagamento', 'Campanhas por data', 'Triagem inicial'],
  },
];

/** Resolve um código vindo da URL. Retorna null para qualquer valor desconhecido. */
export const encontrarPlano = (codigo) =>
  PLANOS.find((plano) => plano.id === codigo) || null;
