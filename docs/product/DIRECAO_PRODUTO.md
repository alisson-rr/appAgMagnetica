# Agenda Magnética — direção de produto 2026

## Prioridade de atendimento registrada em 14/09/2026

A prioridade atual é corrigir os agendamentos do n8n e melhorar a conversa:
modelo econômico para interpretar, modelo de boa redação para escrever mensagens
acolhedoras, claras e sem travessões, com memória das preferências entre visitas.
Histórico, preferência declarada e escolha atual devem ser tratados separadamente.
Requisitos, diagnóstico e critérios de entrega estão na
[revisão do atendimento com IA](../planning/REVISAO_ATENDIMENTO_IA_2026-09-14.md).

## Resumo executivo

A Agenda Magnética não deve disputar o mercado como “mais um sistema de agenda”.
Agenda, cadastro e financeiro básico já são recursos comuns e baratos. O espaço
mais promissor é ser a **recepção inteligente no WhatsApp para pequenos negócios
de atendimento com hora marcada**.

> **Promessa:** você cuida dos seus clientes. A Agenda Magnética responde,
> agenda, protege seus horários e chama você apenas quando necessário.

O produto antigo tinha bons componentes, mas contava histórias diferentes:

- o site vendia uma transformação quase exclusiva para estética;
- os materiais vendiam agenda, marketing, conteúdo, vendas e gestão ao mesmo tempo;
- o aplicativo mostrava um sistema administrativo genérico;
- a automação entregava a parte mais diferenciada, mas isso quase não aparecia no app;
- números, escassez e benefícios eram apresentados sem prova suficiente;
- havia riscos técnicos que impediam uma publicação responsável.

A nova direção concentra o produto em uma sensação clara: **“meu dia está sob
controle, mesmo quando eu estou atendendo.”**

## O que foi analisado

Foram inventariados 230 arquivos na pasta de documentos e examinados os
materiais próprios, referências, identidade, criativos, vídeos, planilhas,
apresentação, site, aplicativo, backend e os dois arquivos da automação n8n.

Os materiais incluem:

- guia principal e sete mini-guias;
- roteiros e mensagens para WhatsApp;
- identidade visual e versões da marca;
- criativos e vídeos de campanhas antigas;
- planejamento, público, concorrência e oferta;
- automação n8n com 90 nós;
- landing page;
- aplicativo React e backend FastAPI/Supabase;
- referências de copy, mecanismo, produto e validação.

## Diagnóstico do produto antigo

### 1. A promessa era ampla demais

O produto tentava ser agenda, assistente, marketing, conteúdo, vendas, gestão e
treinamento. Isso diluía o motivo de compra. O cliente não compra “mais
organização”; compra a possibilidade de continuar atendendo sem perder mensagens,
horários e receita.

### 2. O diferencial estava escondido

A automação tem uma ideia valiosa: receber mensagens, interpretar intenção,
consultar disponibilidade, criar, remarcar e cancelar horários, além de pausar a
IA para atendimento humano. Porém, o aplicativo abria com indicadores genéricos
e não mostrava essa operação.

### 3. O público parecia menor do que realmente é

O material visual focava quase apenas em estética e em mulheres preocupadas. A
dor é transversal a negócios com hora marcada: podologia, estética, massoterapia,
quiropraxia, terapias, barbearia premium, studios, pequenos consultórios e outros.

O produto deve ter **um núcleo horizontal** e **configurações por segmento**, sem
hard-code de “clínica”, “paciente”, “procedimento” ou uma persona feminina.

### 4. A comunicação criava desconfiança

Claims como percentuais de melhora, “zero falhas” e vagas artificiais não tinham
prova documentada. Para um produto que toca WhatsApp, agenda e dados de clientes,
confiança vale mais do que urgência de lançamento.

### 5. A base técnica não estava pronta para produção

Foram encontrados segredos no código, automação ativa em modo de teste, uso de
chave administrativa em operações escolhidas pela IA, confiança em URL recebida
por webhook, RLS desabilitada e rotas que podiam operar sem filtro de empresa.

Esses pontos não são detalhes: poderiam expor ou alterar dados de clientes de
outras empresas.

## Posicionamento recomendado

### Categoria

**Recepção inteligente no WhatsApp.**

Não usar como categoria principal:

- sistema de gestão completo;
- agenda online genérica;
- “robô de IA”;
- secretária que substitui pessoas;
- solução apenas para estética.

### Frase principal

**Você cuida dos seus clientes. A Agenda Magnética cuida do resto.**

### Explicação curta

**Uma recepção inteligente no WhatsApp que responde dúvidas, organiza horários,
confirma agendamentos e entrega para você só o que precisa de atenção humana.**

### Mecanismo memorável

1. **Responde:** atende rapidamente com as informações reais do negócio.
2. **Agenda:** oferece apenas horários disponíveis e registra a escolha.
3. **Protege:** confirma, identifica risco e ajuda a evitar buracos na agenda.
4. **Entrega:** pausa a automação e chama uma pessoa quando há dúvida, pedido ou
   assunto sensível.

### Inimigo da marca

Não é “a agenda de papel”. É a **recepção fragmentada**: conversa perdida,
resposta atrasada, horário sem confirmação, informação espalhada e o profissional
interrompendo o atendimento para mexer no celular.

## Cliente ideal inicial

### Perfil principal

Negócio com uma a cinco pessoas, atendimento com hora marcada, WhatsApp como
principal canal e dono ainda envolvido na operação diária.

Sinais de forte aderência:

- recebe mensagens durante os atendimentos;
- demora a responder e perde oportunidades;
- confirma horários manualmente;
- sofre com faltas, cancelamentos ou encaixes;
- mantém informações em WhatsApp, papel e planilhas;
- ainda não precisa de um ERP grande ou já tem agenda, mas o atendimento continua
  manual.

### Segmentos para o piloto

Começar por estética, podologia, massoterapia e quiropraxia. Têm alto uso de
WhatsApp, jornada simples e decisão concentrada no dono. Consultórios com dados
de saúde e decisões clínicas exigem controles adicionais e devem entrar depois
da validação de privacidade, linguagem e acesso.

### Trabalho que o cliente contrata

> “Quando eu estiver atendendo, quero que as mensagens e os horários continuem
> andando com segurança, para terminar o dia sem descobrir clientes esquecidos ou
> buracos que eu poderia ter evitado.”

## Experiência desejada

### Site

O visitante deve entender em poucos segundos:

- para quem é;
- o que o produto resolve;
- como funciona;
- quando a automação chama uma pessoa;
- como pedir uma demonstração.

A demonstração deve mostrar um dia real, não uma lista abstrata de recursos.

### Primeira tela do aplicativo: Central do Dia

A primeira tela deve responder quatro perguntas:

1. Quantos atendimentos tenho hoje?
2. Quantos já estão confirmados?
3. O que ainda precisa de atenção?
4. Qual é o próximo horário?

Foi criada uma primeira versão dessa tela com dados existentes. O próximo passo
é alimentá-la com eventos reais da automação e incluir exceções humanas.

### Centro de Atendimento — recurso essencial ainda ausente

Antes de vender a automação como produto completo, o app precisa de uma área com:

- conversas recentes e busca;
- indicação visível de “automação” ou “humano”;
- motivo da transferência;
- botão assumir/pausar e devolver à automação;
- histórico de ações e ferramentas usadas;
- falhas de envio e tentativa novamente;
- consentimento e situação da janela de atendimento do WhatsApp;
- respostas sugeridas sem envio automático quando o assunto for sensível.

Sem essa tela, a promessa principal continua invisível para quem opera o negócio.

## Escopo do MVP vendável

### Deve existir no primeiro piloto

- onboarding do negócio, horários, equipe e serviços;
- conexão do WhatsApp com estado claro;
- respostas baseadas apenas em informações cadastradas;
- consulta de horários reais;
- agendamento, remarcação e cancelamento com confirmação explícita;
- confirmação de agendamentos;
- transferência imediata para humano;
- pausa manual da automação;
- Central do Dia;
- histórico mínimo e trilha de auditoria;
- separação rígida entre empresas;
- consentimento, política de privacidade e processo de exclusão/exportação.

### Depois de validar o núcleo

- lista de espera e preenchimento automático de cancelamentos;
- recuperação de conversas que demonstraram interesse e pararam;
- campanhas segmentadas com consentimento;
- pagamentos e sinal;
- relatórios de origem e conversão;
- integrações com agendas externas;
- pacotes específicos por segmento.

### Não construir agora

- rede social ou fábrica de conteúdo dentro do produto;
- CRM genérico com dezenas de funis;
- prontuário clínico;
- marketplace;
- comissionamento sofisticado;
- planos e limites muito complexos;
- múltiplos provedores de WhatsApp antes de validar um fluxo confiável.

## Automação: direção técnica

O fluxo atual tem uma boa base conceitual: webhook, normalização, buffer,
tratamento de texto/áudio/imagem, roteamento de intenção, memória, agenda e
handoff. Para produção, a ordem segura é:

```text
Webhook autenticado
  → normalização e deduplicação
  → identificação da empresa e do cliente
  → política de consentimento/janela
  → classificação de intenção
  → ferramenta restrita no backend
  → confirmação explícita para ações destrutivas
  → resposta
  → auditoria e métrica
  → humano quando necessário
```

Regras obrigatórias:

- a mensagem nunca define URL, credencial, empresa ou filtro;
- a IA escolhe intenção e parâmetros limitados, não a requisição completa;
- criar, remarcar e cancelar passam por endpoints do backend, idealmente com
  idempotência e transação;
- toda consulta usa `id_info_clinica` obtido da sessão/instância, nunca do texto;
- profissional, cliente, serviço e horário precisam pertencer à mesma empresa;
- cancelamento e remarcação exigem confirmação explícita;
- cada ação registra quem/que fluxo fez, horário, resultado e erro;
- a automação deve falhar fechada: se houver dúvida, não altera agenda e chama
  uma pessoa;
- lembretes e follow-up precisam de gatilhos periódicos próprios — eles eram
  prometidos nos materiais, mas não estavam implementados no fluxo analisado.

O JSON foi deixado inativo para homologação, com segredos removidos, URLs vindas
do ambiente e cancelamento limitado por empresa. A migração das operações diretas
do Supabase para endpoints internos continua sendo uma condição para produção.

## Segurança e privacidade

### Correções já aplicadas no código local

- credenciais removidas do site, app, backend e JSON da automação;
- variáveis de ambiente documentadas;
- backend usa chave administrativa somente no servidor;
- empresa obrigatória em rotas operacionais;
- validação de vínculo em relações críticas de agenda;
- atualização da empresa limitada à própria conta;
- onboarding renova o token com a empresa recém-criada;
- CORS limitado a origens configuradas;
- script antigo de desabilitar RLS agora ativa RLS e bloqueia acesso público;
- URL da Evolution não vem mais do corpo do webhook;
- logs não imprimem resposta completa ou QR Code;
- scripts externos de gravação de sessão/telemetria foram removidos do app;
- plugins antigos capazes de editar e versionar arquivos foram removidos;
- frontend do app migrado de Create React App para Vite 8 e React 18;
- telas do app carregadas sob demanda, reduzindo o pacote inicial;
- automação de homologação não inventa clientes e não fica ativa ao importar.

### Ações externas obrigatórias antes de qualquer publicação

1. Revogar e gerar novamente todas as credenciais que estavam nos arquivos:
   Supabase, JWT, Evolution API e conta de serviço Google.
2. Configurar os novos valores apenas em cofres/variáveis do ambiente.
3. Aplicar e testar RLS no banco real.
4. Validar o mapeamento de cada instância de WhatsApp para uma única empresa.
5. Colocar autenticação ou assinatura no webhook.
6. Criar política de privacidade, termos, canal de exclusão e registro de
   consentimento.
7. Testar isolamento com duas empresas reais de homologação.
8. Fazer backup e plano de rollback antes de reativar o fluxo.

Credenciais antigas devem ser consideradas comprometidas mesmo depois de
removidas do código.

## WhatsApp e atendimento humano

O produto deve trabalhar de forma explícita com as regras da plataforma:

- obter consentimento antes de iniciar mensagens;
- fora da janela de 24 horas, usar somente templates aprovados;
- deixar claro quando há automação;
- oferecer caminho direto para uma pessoa;
- proteger dados e limitar o conteúdo armazenado;
- não usar a automação para diagnósticos ou decisões clínicas.

Essas regras devem aparecer no produto, no onboarding e na operação — não apenas
nos termos jurídicos.

## Métricas que provam valor

### Métrica principal

**Agendamentos resolvidos sem interrupção do profissional**, separados em
criados, confirmados, remarcados e cancelados corretamente.

### Métricas de produto

- tempo até a primeira resposta;
- percentual de conversas resolvidas sem humano;
- percentual transferido e motivo;
- agendamentos criados pela recepção inteligente;
- taxa de confirmação;
- faltas e cancelamentos tardios;
- horários recuperados após cancelamento;
- falhas ou correções manuais da automação;
- tempo poupado estimado, com metodologia transparente.

### Métricas de venda

- visita → pedido de demonstração;
- demonstração → piloto;
- piloto → assinatura;
- tempo até primeiro valor;
- retenção em 30, 60 e 90 dias;
- principal motivo de cancelamento.

Não publicar percentuais de resultado antes de haver amostra, período e método
documentados.

## Modelo comercial para validar

Não abrir uma grade complexa de planos ainda. Vender um **piloto assistido** com:

- configuração feita junto com o cliente;
- um número de WhatsApp;
- uma unidade;
- até cinco profissionais;
- acompanhamento semanal no primeiro mês;
- preço mensal simples e taxa de implantação explícita.

Hipótese inicial para entrevistas, não preço final: implantação entre R$ 300 e
R$ 900 e mensalidade entre R$ 197 e R$ 397, variando por volume e necessidade de
atendimento humano. Validar disposição a pagar com pelo menos dez negócios antes
de publicar valores.

Não competir por “agenda mais barata”. O preço deve ser comparado ao tempo do
dono, oportunidades perdidas e custo de recepção — com evidência, não promessa.

## Plano de validação em 12 semanas

### Semanas 1–2 — problema e linguagem

- entrevistar 12 a 15 donos dos quatro segmentos iniciais;
- observar o atendimento real no WhatsApp;
- medir volume, horários de pico, motivos e falhas;
- testar a nova landing page com pedido de demonstração;
- escolher um segmento de entrada pelo comportamento, não por preferência.

### Semanas 3–5 — operação assistida

- implantar em três negócios com revisão humana de toda ação;
- registrar onde a IA erra ou pede contexto;
- limitar inicialmente a dúvidas, disponibilidade e criação confirmada;
- validar Central do Dia e handoff.

### Semanas 6–8 — proteção da agenda

- adicionar confirmação e lembretes conforme política do WhatsApp;
- medir faltas e resposta;
- criar trilha de auditoria e painel de exceções;
- testar duas empresas simultaneamente para isolamento.

### Semanas 9–12 — piloto pago

- chegar a dez clientes-piloto;
- cobrar implantação e mensalidade;
- documentar três casos com dados reais;
- decidir preço, segmento e escopo da versão pública;
- só então construir página de planos e claims quantitativos.

## Direção de comunicação e criativos

Mostrar a situação, não um banco de imagens preocupado.

Boas cenas:

- profissional atendendo enquanto mensagens são resolvidas;
- “Central do Dia” com apenas duas pendências claras;
- conversa realista: dúvida → dois horários → confirmação;
- cancelamento que vira oportunidade de preencher o horário;
- passagem da automação para humano sem o cliente repetir tudo.

Ângulos recomendados:

- “Seu WhatsApp continua atendendo enquanto você trabalha.”
- “Abra o dia sabendo o que está confirmado e o que precisa de você.”
- “Automação com limites: ela resolve o simples e chama você no sensível.”
- “Menos interrupções. Nenhum cliente largado no meio da conversa.”

Evitar:

- urgência falsa;
- resultados sem base;
- medo exagerado;
- estética feminina genérica como único universo;
- afirmar que a IA substitui recepcionista;
- sugerir aconselhamento clínico.

## Referências de mercado usadas

- [Clinia](https://clinia.io/) — posiciona comunicação, IA, inbox, handoff e
  métricas como camada de relacionamento, não como ERP.
- [Trinks IA](https://sistema.trinks.com/ia) — mostra a IA entrando em um
  ecossistema de gestão já amplo.
- [Simples Agenda](https://www.simplesagenda.com.br/site) — evidencia que agenda
  e gestão básica são uma categoria madura e barata.
- [Agenda médica do iClinic](https://iclinic.com.br/funcionalidades/agenda-medica/)
  — confirma lembretes, confirmação e status como recursos esperados.
- [Política do WhatsApp Business](https://www.whatsappbusiness.com/policy/) —
  consentimento, janela, templates e escalonamento humano.
- [Guia de segurança da ANPD para agentes de pequeno porte](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-sobre-seguranca-da-informacao-para-agentes-de-tratamento-de-pequeno-porte)
  — controles administrativos e técnicos também se aplicam aos pequenos.

## Critério para dizer “pronto para publicar”

O produto estará pronto quando:

- dez clientes tiverem usado o piloto pago;
- as ações críticas passarem pelo backend e forem auditáveis;
- o isolamento entre empresas tiver testes automatizados;
- houver inbox/handoff utilizável;
- confirmação e lembrete funcionarem de ponta a ponta;
- política, consentimento e exclusão estiverem operacionais;
- credenciais antigas estiverem revogadas;
- métricas reais sustentarem a comunicação;
- suporte e rollback tiverem responsáveis definidos.

Até lá, a nomenclatura correta é **homologação/piloto**, não produção pública.
