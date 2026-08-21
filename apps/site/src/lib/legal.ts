export type Documento = { titulo: string; secoes: { titulo: string; texto: string }[] };

export const termosDeUso: Documento = {
  titulo: "Termos de Uso",
  secoes: [
    {
      titulo: "1. Aceitação dos termos",
      texto:
        "Ao acessar e utilizar a Agenda Magnética, você concorda em cumprir estes termos e condições de uso. Se não concordar com qualquer parte deles, não deverá utilizar o serviço.",
    },
    {
      titulo: "2. Descrição do serviço",
      texto:
        "A Agenda Magnética é um sistema de atendimento e gestão de agendamentos para profissionais e pequenos negócios que trabalham com hora marcada. O serviço permite gerenciar horários, clientes, profissionais e serviços, e responder contatos no WhatsApp conforme as regras definidas pelo próprio negócio.",
    },
    {
      titulo: "3. Responsabilidades de quem usa",
      texto:
        "Você é responsável por manter a confidencialidade da sua conta e senha e por todas as atividades realizadas nela. Comunique imediatamente qualquer uso não autorizado.",
    },
    {
      titulo: "4. Uso adequado",
      texto:
        "O serviço deve ser usado apenas para fins legais e de acordo com estes termos. É proibido utilizá-lo para atividades ilegais ou não autorizadas.",
    },
    {
      titulo: "5. Limites da automação",
      texto:
        "A automação executa tarefas administrativas: informa o que foi autorizado, agenda, confirma e encaminha. Ela não oferece diagnóstico, orientação clínica ou decisão profissional, e sempre mantém uma saída para o atendimento humano.",
    },
    {
      titulo: "6. Alterações e responsabilidade",
      texto:
        "Estes termos podem ser modificados; as alterações valem a partir da publicação. A Agenda Magnética não se responsabiliza por danos indiretos ou consequenciais decorrentes do uso ou da indisponibilidade do serviço.",
    },
  ],
};

export const politicaPrivacidade: Documento = {
  titulo: "Política de Privacidade",
  secoes: [
    {
      titulo: "1. Coleta de informações",
      texto:
        "Coletamos as informações que você fornece diretamente, como nome, e-mail e dados necessários para a prestação do serviço, além de informações de uso do sistema.",
    },
    {
      titulo: "2. Uso das informações",
      texto:
        "Usamos os dados para fornecer e manter o serviço, comunicar mudanças relevantes, prestar suporte e acompanhar o funcionamento da plataforma.",
    },
    {
      titulo: "3. Proteção de dados",
      texto:
        "Aplicamos medidas técnicas e organizacionais para proteger as informações pessoais contra acesso não autorizado, alteração, divulgação ou destruição, com separação de acesso por empresa.",
    },
    {
      titulo: "4. Compartilhamento",
      texto:
        "Não vendemos nem comercializamos informações pessoais. O compartilhamento acontece apenas quando necessário para prestar o serviço ou quando exigido por lei.",
    },
    {
      titulo: "5. Seus direitos",
      texto:
        "Você pode solicitar acesso, correção ou exclusão dos seus dados pessoais pelos canais de contato disponíveis.",
    },
    {
      titulo: "6. Cookies",
      texto:
        "Utilizamos cookies e tecnologias similares para o funcionamento do sistema. Você pode recusá-los no navegador, o que pode afetar algumas funcionalidades.",
    },
  ],
};
