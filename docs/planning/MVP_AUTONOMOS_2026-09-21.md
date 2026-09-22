# MVP para autônomos: implementação e validação

Atualizado em 21/09/2026. Público: principalmente profissionais autônomos;
psicologia, fisioterapia, estética e pequenos salões. Escopo: primeiro piloto
comercial acompanhado, usando a arquitetura e a base compartilhada existentes.

## Situação da entrega

Os seis ajustes foram implementados. A migração aditiva foi aplicada, painel/API
foram publicados e os dois workflows foram importados e publicados pelo Alisson.
O teste integrado encontrou duas incompatibilidades: data ISO na remarcação e entidades repetidas do
histórico no aceite de cancelamento. Ambas foram corrigidas e publicadas
no n8n. O atendimento foi conferido por exportação:
os 102 nós e todas as conexões/parâmetros coincidem com o JSON do repositório.

Não houve reset, limpeza de banco, alteração de preços/planos ou simulação de
pagamento. Os registros criados para validação permanecem identificados no banco.

## 1. Remarcação e continuidade

- O fluxo identifica a reserva original e já consulta o novo dia/hora informados.
- Com várias reservas, preserva o destino enquanto pergunta qual delas alterar.
- Correção parcial mantém serviço, profissional e hora ainda válidos.
- A proposta corrigida substitui a anterior; confirmação depende da última
  proposta efetivamente apresentada. Remarcação mantém o ID da reserva.
- Confiança mínima para preparar uma consulta: 0,75. Ações de confirmação e
  cancelamento continuam exigindo 0,85; confirmação explícita foi preservada.
- Datas ISO devolvidas pela interpretação agora são reconhecidas antes de dd/mm.
  Essa incompatibilidade fazia uma correção de dia reutilizar a oferta anterior
  pela mesma hora. O texto do cliente também filtra o dia se a entidade faltar.
- Horas de ofertas são comparadas com os minutos exatos.
- No aceite, entidades repetidas do histórico pelo modelo não são tratadas como
  uma nova correção. Só mudança presente no texto atual reabre esse caminho.

Verificado: conversa pela instância real passou de sexta, 25/09, às 16h para
quarta, 30/09, às 16h, com nova pergunta de autorização. Só depois do aceite a
consulta 301 mudou, mantendo ID, serviço e profissional. O cancelamento posterior
também foi concluído no mesmo registro após nova pergunta e aceite explícito.

## 2. Linguagem e fidelidade

- Textos operacionais, falhas, esclarecimentos e catálogo foram revisados para
  português acolhedor e direto; valor formatado como R$ 137,50 na origem.
- Interpretadora e redator existente receberam regras coerentes de continuidade,
  acolhimento, limites e transparência sobre ser assistente virtual.
- Redação preserva fatos, valores, ordem das opções e pergunta final necessária.
  Falha, rejeição ou ausência de modelo mantém a resposta-base completa.
- Resultado desconhecido não anuncia sucesso nem afirma que nada foi alterado.
- Divisão em mensagens preserva parágrafos e o final da resposta.

Verificado: as respostas reais desta rodada usaram a base revisada. A chamada
publicada de `/api/ai/redigir` informou `modelo_nao_configurado`: não há chave
OpenAI no backend da redação. A interpretadora do n8n está funcionando. As regras
do redator foram testadas com respostas controladas; geração real desse redator
não foi verificada. Sua configuração é opcional para o piloto com a base atual.

Exemplos efetivamente recebidos pelo caminho de envio:

> Sessão Teste MVP: R$ 137,50, 60 minutos por sessão.

> Sim! O lembrete está programado para 24 horas antes, aqui no WhatsApp.
> Você pode responder por aqui para confirmar sua presença.

> Prontinho, remarcado! Agora ficou Sessão Teste MVP, quarta-feira (30/09)
> às 16h com Profissional Teste MVP. O horário anterior foi liberado.

## 3. Lembretes e presença

- O contexto da conversa recebe a configuração efetiva, inclusive desligamento.
- Texto padrão faz uma única pergunta; templates já contendo pedido de presença
  não ganham outra pergunta automática.
- `fn_claim_lembretes_v2` registra tentativa, sem marcar envio como concluído.
  Callback identifica empresa, consulta e UUID da tentativa; é idempotente.
- Somente `key.id` do provedor autoriza resultado `aceito` e a data de envio.
  Isso não comprova entrega ou leitura. Resposta desconhecida fica `incerto`.
- Reexecução não reenvia tentativa já registrada. Falhas/incertezas ficam
  identificadas para revisão operacional, sem repetição automática arriscada.
- Uma confirmação de lembrete em aberto por titular. Contexto do lembrete tem
  chave própria e precede uma proposta antiga quando for a pergunta mais recente.
- Presença exige o início esperado da reserva; mudança de data invalida o lembrete
  anterior. Remarcação limpa confirmação e campos do lembrete do horário antigo.
- Conversa em atendimento humano persistido não recebe novo lembrete.

Verificado: o workflow publicado enviou o lembrete da consulta 301 e registrou
`aceito` com ID do provedor. Reexecução não chegou ao envio. “Sim, confirmado”
alterou essa mesma consulta para `confirmado`, sem outra reserva. Após remarcar,
a consulta ficou `agendado`, com os campos do lembrete anterior limpos.

## 4. Bug de 16h40

Causa confirmada no código: a oferta dependia de uma grade de 30 minutos e
podia excluir um início válido antes de verificar a possibilidade de gravá-lo.

- Busca pontual do início solicitado, validando duração, expediente, bloqueios
  e ocupações com a mesma RPC usada antes de gravar.
- A grade continua oferecendo alternativas; o alvo é priorizado antes do limite
  de resultados. Deduplicação usa o instante normalizado no fuso do negócio.
- Remarcação ignora somente a própria reserva, após conferir empresa/titular.

Verificado: consulta 301 criada para 22/09/2026 às 16h40 em America/Sao_Paulo,
com duração de 60 minutos. Os testes integrados no mesmo banco também verificaram
conflito real, repetição idempotente e remarcação sobreposta à própria reserva.

## 5. Intervenção humana

- Pedido persistido por conversa, com motivo e resultado do aviso ao responsável.
- Destino configurável em Configurações → Automação. Não se inventa destinatário
  e não se envia aviso de responsável ao próprio cliente do encaminhamento.
- Repetir um pedido ainda aberto não dispara novo aviso.
- Painel destaca “precisa de você”, estado e erro de carregamento; permite assumir
  e devolver. Envio pelo painel assume antes de chamar o provedor.
- Pausa persistente até devolução; fluxo consulta essa pausa inclusive imediatamente
  antes de enviar resposta. Pedidos naturais e aceite de oferta de humano são tratados.
- Mensagem ao cliente só afirma registro quando a API confirma o encaminhamento.

Verificado: solicitação de teste criou conversa 83; aviso ao contato de teste
configurado foi aceito pelo provedor, sem repetição na segunda solicitação.
Listagem, assumir, pausa e devolver foram conferidos pelas rotas publicadas.
Na conversa 31, “quero falar com alguém” gerou o encaminhamento e resposta
fiel ao registro. A mensagem seguinte não recebeu resposta automática durante
a pausa. A conversa foi assumida e devolvida à IA ao encerrar. Como nesse cenário
o cliente era também o responsável, o aviso adicional foi corretamente
suprimido (`destinatario_e_cliente`); o envio real do aviso foi provado na conversa 83.

## 6. Acesso do piloto

- Prazo por empresa (`piloto_ate`), com administrador e instante da liberação.
- Permissão administrativa é relida do banco; alegar admin somente no JWT não basta.
- Piloto válido mantém acesso mesmo com teste comum vencido. Expiração das outras
  empresas e estado de assinatura/pagamentos permanecem próprios.
- Sessão atualiza prazo ao recuperar foco e periodicamente.
- Formulário em Configurações → Minha assinatura, apenas para administradores.
  Administrador com teste vencido consegue acessar essa gestão pelo botão
  “Administrar pilotos”, sem liberar globalmente as demais telas.

Verificado: liberação, expiração do teste, isolamento de outra empresa e revogação
foram exercitados na base compartilhada. Alisson autorizou tornar
`dev.alisson.rosa@gmail.com` administrador; usuário 86 atualizado e acesso ao
formulário conferido no navegador publicado.

O usuário definiu o prazo da empresa 65 pelo formulário: 21/10/2028 às 17h53
(São Paulo). O acesso liberado foi conferido no painel e o prazo foi preservado
na preparação posterior da conta demonstrativa.

## Evidências e limites da validação

Validação integrada única, usando a base existente. Os cenários de banco criaram
empresas identificadas de teste e desabilitaram apenas suas próprias automações
no encerramento; não apagam registros. Foram usados ainda empresa 65, instância
`agm_86_alissonrosa` e contato 119, expressamente autorizados pelo usuário.
Serviço 96 e profissional 99 foram criados para identificar o cenário conversacional.
Ao final, a reserva 301 ficou cancelada e o profissional 99 foi desativado,
preservando todos os registros e o histórico.

As entradas de texto foram simuladas no webhook autenticado. Interpretação,
workflow, API, banco e envio de saída passaram pelas integrações reais. Isso
comprova aceitação do envio, não leitura do WhatsApp pelo destinatário. Não houve
teste de entrada pelo aparelho nem de áudio nesta rodada.

- Suíte integrada de API: 282 passaram; regressões posteriores do redator e da
  API passaram nos conjuntos pertinentes (23 e 125 casos).
- JavaScript dos nós reais: 185 casos passaram, incluindo data ISO, continuidade,
  correção parcial, escolha entre reservas e vínculo da confirmação.
- Painel: 36 testes passaram; build final do painel passou.
- Validador estrutural do workflow passou.
- Formulário administrativo conferido visualmente no painel publicado.

Migração: `scripts/piloto_comercial.sql` (aditiva e reaplicável).
Painel/API: `https://agenda-magnetica-painel.vercel.app`.
Deployment mais recente: `dpl_CzcYHaB56B2D3bTRBVArcXyhyxZU`.
Atendimento: `MUgz1gbRgpmFC3Oo`, versão com prefixo `002adab5`;
lembretes: `9CI8FbRZgIMfRGPH`. Ambos publicados. A exportação dos lembretes também
foi conferida e suas referências de credenciais sincronizadas no repositório.
Registro de execuções bem-sucedidas foi ativado só durante o diagnóstico e
restaurado para “Do not save”; execuções de falha continuam sendo salvas.

## Uso do primeiro piloto

Conduzir um piloto pequeno, acompanhado, com cadastro do negócio revisado:
serviços, expediente, apresentação e contato responsável.

### Conta demonstrativa de psicologia

A pedido do usuário, a empresa 65 foi preparada como **Marina Azevedo · Psicologia**,
consultório fictício com atendimento online para adultos. Assistente **Clara**,
tom acolhedor, psicóloga única, primeira sessão e acompanhamento individual de
50 minutos. Expediente e disponibilidade da profissional: segunda a sexta,
9h–12h e 14h–19h. Apresentação e lembrete foram reescritos para esse cenário.

`scripts/demo_psicologia.sql` foi aplicado na base compartilhada e reaplicado
para verificar que não duplica registros. Acrescenta 8 clientes fictícios sem
telefone/WhatsApp e 15 consultas na semana de 21–25/09/2026; futuras confirmadas,
3 concluídas e 1 cancelada no momento da aplicação. Os registros anteriores,
preços, prazo do piloto, instância e contato responsável foram preservados.
Backup dos registros anteriores salvo fora do repositório, em arquivo temporário.

Configurações → Automação agora permite editar nome e tom da assistente após
o cadastro inicial, usando as mesmas regras e o endpoint existente do onboarding.
Validação: 59 testes de onboarding/API, 36 testes do painel e build passaram.
Contexto publicado retornou Clara, dois serviços agendáveis de 50 minutos,
uma profissional e dez turnos; consulta de disponibilidade confirmou
22/09 às 16h40–17h30, sem criar reserva ou enviar mensagem.
No navegador publicado, o nome vazio foi recusado, o salvamento de Clara foi
confirmado pelo painel e os serviços, turnos e consultas da semana foram
conferidos. A agenda ficou aberta na conta modelo.

Acompanhar conclusão de agendamentos, repetições, correções manuais, pedidos de
humano, falhas/incertezas de envio e tempo até resposta. Nesta validação, respostas
com interpretação levaram em geral algumas dezenas de segundos, incluindo o
buffer de mensagens. Não há garantia de latência ou entrega instantânea.

Fora desta entrega: campanhas, novos agentes, prontuário, pagamentos integrados,
novos planos, central de atendimento e reformulação visual.
