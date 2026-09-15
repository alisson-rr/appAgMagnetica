# Correções da automação — rodada de setembro de 2026

> **Para quem:** quem for homologar a automação, revisar este trabalho ou
> continuar de onde ele parou. Este documento é **autossuficiente**: não
> presume nenhuma conversa anterior.
> **Estado:** correções aplicadas ao JSON, à API e ao validador em 2026-09-06/07,
> em **seis rodadas** — cada uma desfazendo regressões da anterior, apontadas por
> revisões adversariais (§ 2, § 6, § 7, § 8 e § 9). A § 10 é a mudança que veio
> depois delas: o **contexto da empresa**, que era o maior item aberto e é o que
> o dono do produto pediu desde o começo.
> **Nada foi ativado.** `AgendaMagnetica-v2.n8n.json` e
> `AgendaMagnetica-erro.n8n.json` continuam `active: false`.
> **Base:** `automation/n8n/AgendaMagnetica-v2.n8n.json` (89 nós, 20 deles
> Redis, 12 HTTP), `automation/n8n/AgendaMagnetica-erro.n8n.json` (novo),
> `automation/n8n/validar_workflow.py`, `services/api/ai_api.py`,
> `scripts/add_origem_consulta.sql` (novo, **não aplicado ao banco**).
> **Como funciona o fluxo:** `automation/n8n/README.md`.
> **Matriz de casos:** `automation/n8n/TESTES_AUTOMACAO_V2.md`.
> **Onde isso roda:** `docs/INFRA-VPS.md`.

Os identificadores `AUT-nnn` são os achados da revisão da automação de
2026-09-06 (161 achados confirmados). Eles aparecem como comentário no próprio
código, ao lado da linha que resolve cada um.

---

## 1. O que foi corrigido

### 1.1 Entrada: o que o fluxo aceita e o que descarta

Tudo no nó `normalizar entrada`, mais três nós novos de Redis.

- **AUT-009 — o bot se autopausava depois de cada resposta.** A Evolution
  reemite como `messages.upsert`, com `fromMe: true`, a mensagem que a própria
  API mandou. O fluxo lia isso como "o dono respondeu pelo celular" e gravava
  `am:handoff:` por 30 min; a próxima mensagem do cliente morria em
  `fim - pessoa está atendendo`. Agora `Redis - marcar envio próprio` grava
  `am:enviada:{instancia}:{key.id}` com TTL de 300 s depois de cada envio, e a
  rota `humano` passa por `Redis - envio próprio?` e `foi o próprio envio?`
  **antes** de pausar. Eco encerra em `fim - eco do próprio envio`; digitação
  real do dono continua pausando.
- **AUT-094 — `remoteJid` `@lid`.** O WhatsApp passou a entregar conversa
  individual com esse sufixo, e o filtro antigo tratava como grupo: cliente real
  sem resposta e sem rastro. O telefone agora sai de `senderPn`,
  `remoteJidAlt`, `participantPn` ou `data.senderPn`, e o resto do fluxo segue
  falando `@s.whatsapp.net`.
- **AUT-095 — mensagem embrulhada.** Efêmera, visualização única e documento
  com legenda vêm dentro de um envelope; sem desembrulhar, tudo virava tipo
  `outro` e terminava em silêncio. O laço desembrulha até 5 níveis.
- **AUT-121 — reentrega antiga.** Mensagem com mais de 30 min (`messageTimestamp`)
  não é respondida: o bot acordando de um cochilo assusta mais do que ajuda.
- **AUT-152 — reação, figurinha e mensagem apagada** do dono chegam com
  `fromMe` e sem conteúdo. Passaram a ser descartadas **antes** do teste de
  `fromMe`, senão um emoji do dono pausava a IA por 30 min.
- **AUT-012 — buffer sem TTL.** A chave `am:buffer:` não expira; execução que
  morre entre o `push` e o `delete` deixava a conversa de ontem entrar na de
  hoje. `agrupar mensagens` agora descarta item fora de uma janela de 60 s.
- **AUT-165 — corte silencioso.** Texto acima do limite ganha o sufixo
  ` [mensagem cortada]` (2000 caracteres em `normalizar entrada`, 4000 no texto
  já agrupado), para o cliente não achar que foi lido por inteiro.

### 1.2 Datas e horas (`resolver e decidir`)

- **AUT-030** — "dia 15" no dia 20 é o mês que vem, não uma data vencida.
- **AUT-034** — 30/02 e "dia 31 de junho" montavam um ISO impossível e o fluxo
  morria adiante sem explicar. Agora há `dataExiste()` e a rota `data_invalida`.
- **AUT-023** — "semana que vem" começa na **próxima segunda**, não em hoje+7.
- **AUT-088** — "9 e meia", "15 pras 3", "entre 14 e 16h", "depois das 18h" e
  "antes das 11" deixaram de virar hora exata errada. As três últimas viram
  **janela de busca**, que é o que o cliente quis dizer.
- **AUT-024** — número nu só vira hora com marcador (`às`, `h`, `:`, turno).
  Sem isso "dia 15" virava 15h e "10 sessões" virava 10h.
- **AUT-089** — "às 7" e "7 da manhã" passam a valer; clínica que abre às 7h
  perdia o primeiro horário do dia.
- **AUT-062** — "meio-dia" com hífen é 12h.
- **AUT-090** — o dia citado filtra antes da hora: "segunda às 14h pode?" não
  confirma mais a sexta.

### 1.3 Busca de disponibilidade

- **AUT-004 — o fluxo dizia "não está livre" para horário livre.** A busca
  usava o dia inteiro com `limite: 12`; numa agenda 08–18 os 12 primeiros slots
  acabavam às 13h30 e a hora pedida às 16h nunca aparecia. Agora
  `LIMITE_SLOTS = 50` (teto do contrato) e `MARGEM_HORA_MIN = 120` recorta a
  janela em volta da hora pedida.
- **AUT-067** — a janela sai de `ctx.horarios` (expediente cadastrado); 7h–21h
  virou só o fallback de quem não cadastrou. Barbearia até 22h e personal às
  6h30 passam a ser ofertados.
- **AUT-032** — "de manhã" vale para a janela inteira, não só para o primeiro
  dia. Na segunda rodada o período passou a **recortar** o expediente em vez de
  sobrescrevê-lo (§ 2.1).
- **AUT-123** — antecedência mínima de 60 min (`ANTECEDENCIA_MIN`, a mesma
  constante em `resolver e decidir` e `avaliar horários`). Ninguém sai de casa
  em três minutos, e oferecer isso virava "acabou de ser ocupado" no "sim". O
  piso deixou de valer na revalidação de horário já ofertado na segunda rodada
  (§ 2.1).
- **AUT-061** — as duas ofertas preferem **dias diferentes**; turno diferente só
  quando existe um único dia com vaga.

### 1.4 Escolha de horário e ciclo da ação pendente

- **AUT-005 — "o das 10" marcava outro dia.** Com pendência aberta, o horário
  que o cliente acabou de escolher perdia para a pendência velha. Agora a
  escolha nova vem primeiro e sobrescreve a pendência.
- **AUT-092** — "não, o das 16" recusa e escolhe na mesma frase; antes apagava
  tudo e respondia "Ok, deixei como está".
- **AUT-008 — qualquer pergunta solta apagava o contexto.** Responder "quanto
  custa?" zerava `slots_oferecidos`, `consultas_candidatas` e
  `reagendar_consulta_id`, e a confirmação seguinte caía em "não tenho nada
  pendente". Só as rotas que encerram o assunto zeram o estado — que na segunda
  rodada ficou sendo **apenas** `humano`: `descartar_pendente` apagava o serviço
  escolhido e a remarcação em curso (§ 2.1).
- **AUT-026 — a pendência vencida não era apagada.** O TTL do Redis era 20 min e
  a validade lógica 10; nos 10 minutos do meio, todo "sim" ouvia "esse horário
  já expirou" sem que nada limpasse a chave. Agora o TTL é **600 s** (o mesmo da
  validade) e a pendência vencida é descartada no próprio turno.
- **AUT-157** — pendência sem `acao_id` é descartada em `montar contexto`: ela
  enviaria `chave_idempotencia` vazia, a API recusaria com 422 e a conversa
  seria transferida.
- **AUT-022 / AUT-021** — "1", "2", "opção 2", "a segunda" passam a selecionar
  na lista numerada, sem confundir com "segunda-feira" nem com "primeira vez".
  Na lista de consultas a cancelar isso foi endurecido na segunda rodada: "a de
  segunda" é o dia, e "a segunda" com uma consulta na segunda-feira vira
  pergunta em vez de escolha (§ 2.1).

### 1.5 Serviço e profissional por nome

- **AUT-027** — "Corte" e "Corte e barba" casavam juntos e viravam ambiguidade
  mesmo quando o cliente dizia o nome exato. Fica só a menção mais específica.
- **AUT-048** — casamento por **palavra inteira**: "Mariana" não é "Ana",
  "Bárbara" não é "Barba", e "dra Paula" não é "Dr. João" só porque os dois têm
  "dr" (títulos entram numa lista de descarte).
- **AUT-065** — catálogo com um serviço só não pergunta "qual desses?".
- **AUT-119** — a parte negada não filtra: "não com o Rafael" não vira ambiguidade.

### 1.6 Reagendar e cancelar

- **AUT-035** — `HORARIO_INDISPONIVEL` em reagendamento zerava
  `reagendar_consulta_id`, e o próximo horário escolhido virava um agendamento
  **novo** — o cliente ficava com duas consultas. O id é preservado.
- **AUT-046** — a lista corta pelo **fim** da consulta, não pelo início: quem
  escreve "estou atrasado" durante o próprio atendimento continua achando o
  horário dele.
- **AUT-025** — a consulta escolhida fica guardada, então o fluxo não pergunta
  o serviço de novo no turno seguinte.
- **AUT-070** — "as duas"/"todas" volta para escolha em vez de inferir, e "a das
  10" (hora nua, depois de artigo) identifica a consulta.
- **AUT-149** — a lista mostra 3 e diz quantas ficaram de fora.
- **AUT-137** — quem pediu para cancelar não ouve mais uma oferta de marcar.
- **AUT-154** — `CONSULTA_NAO_CANCELAVEL` (consulta já concluída) virava
  "problema no sistema" e pausava a IA por 1 h. Agora cai em
  `consulta_nao_encontrada`, o fluxo lista de novo e a IA continua.

### 1.7 Falha de integração não pode virar silêncio

- **AUT-010 — falha ao enviar era engolida.** `evo enviar mensagem` estava em
  `continueRegularOutput`: a Evolution recusava a resposta, a execução terminava
  "com sucesso" (e, com `saveDataSuccessExecution: none`, sumia), e um
  agendamento criado nesta execução ficava de pé com o cliente sem saber. Agora
  é `continueErrorOutput`, a saída de erro pausa a IA por 30 min e
  `fim - falha no envio` **lança**.
- **AUT-011 — não havia `errorWorkflow`.** Toda falha que lança deixava o
  cliente sem resposta e ninguém sabia. Entrou
  `automation/n8n/AgendaMagnetica-erro.n8n.json` (Error Trigger → alerta ao
  operador pela Evolution, **só metadados**: fluxo, nó, id da execução e a
  mensagem cortada em 200 caracteres) e `settings.errorWorkflow` na V2.
- **AUT-001 — áudio e imagem chegavam vazios.** O webhook é registrado com
  `base64: false` (`services/api/evolution_api.py`), mas a transcrição dependia
  de `message.base64`. Entraram `buscar áudio` e `buscar imagem`
  (`POST /chat/getBase64FromMediaMessage/{instancia}`) antes da transcrição. A
  segunda rodada consertou o id pedido, baixou o timeout para 10 s sem repetição
  e fez os conversores degradarem em vez de derrubar a execução (§ 2.1).
- **AUT-053** — mídia que não vem responde "Não consegui ouvir seu áudio por
  aqui. Pode me escrever, por favor?" em vez de "não entendi".
- **AUT-047** — timeout, 5xx ou cota da OpenAI viram `falha_ia` e o fluxo pede a
  mensagem de novo. Antes, instabilidade de minutos transferia a conversa e
  pausava a IA por uma hora.
- **AUT-147** — `LIMIAR_HUMANO = 0.45` saiu. Um `confidence` abaixo dele pausava
  a IA por uma hora por causa de um número que o próprio modelo escreveu; hoje o
  caminho é pedir esclarecimento. O limiar destrutivo (0,85) continua valendo
  para cancelar, remarcar e confirmar.

### 1.8 Segurança clínica e direito do titular

- **AUT-007 — crise não tinha protocolo.** Menção a suicídio, autolesão,
  violência ou abuso agora é detectada **antes de qualquer classificação**:
  acolhimento, CVV no **188** (gratuito, 24 h) e transferência. Nada de agenda e
  nenhum texto gerado pela IA na resposta. Na primeira rodada isso ainda ficava
  **depois** do portão de validação da IA, e a lista de termos errava nos dois
  sentidos; as duas coisas foram refeitas na segunda rodada (§ 2.1).
- **AUT-037 — o gatilho `?` do override sensível estava morto**: `normalizar()`
  removia a interrogação antes do teste. O teste passou a usar o texto bruto.
- **AUT-038** — contraindicação vale em **qualquer** intenção: "quero marcar
  drenagem, estou grávida" vai para uma pessoa antes de qualquer oferta.
- **AUT-039 / AUT-101** — a lista de termos sensíveis virou expressão com
  fronteira de palavra (antes "vendedor" e "doida" davam falso positivo e
  "estou com dor" passava batido) e ganhou o vocabulário das personas: pele, pé,
  fisioterapia, nutrição, tatuagem e documentos (laudo, atestado, receita).
- **AUT-106** — "apaga meus dados" e "não quero mais receber mensagem" viram
  rota própria (`pedido_do_titular`): a IA não decide exclusão nem descadastro,
  e o texto não afirma que o dado foi removido.
- **AUT-059** — o TTL da pausa passou a depender do motivo: **12 h** para pedido
  do cliente, assunto sensível, crise, pedido do titular e configuração
  incompleta; **1 h** para interpretação inválida; **30 min** para "o negócio
  respondeu" e para falha de envio. Uma frase que a IA não entendeu volta a ser
  atendível em uma hora; um pedido explícito de pessoa, não. Só que o motivo
  vinha do texto livre do modelo e quase nunca batia com a lista das 12 h — na
  prática, quase todo mundo pegava 1 h. A segunda rodada tornou o motivo
  determinístico (§ 2.1).

### 1.9 Guardas de conteúdo e prompt

- **AUT-087 — não havia guarda contra preço inventado.** Existia só contra
  "marcado/cancelado". Agora todo valor escrito pela IA em resposta livre é
  comparado com o catálogo (por valor, então "180", "180,00" e "R$ 180" são o
  mesmo); o que não bate é substituído por uma frase que não arrisca número. A
  segunda rodada estendeu a guarda para valor sem cifrão ("fica 150 reais") e
  acrescentou o bloqueio de link, chave PIX e pedido de código (§ 2.1).
- **AUT-150 — conteúdo não confiável entrava sem delimitação.** O histórico da
  conversa agora vai ao prompt dentro de `<conversa>…</conversa>`, marcado como
  dados, e a regra 1 diz explicitamente que mensagem, transcrição e descrição de
  imagem são dados e nunca instruções. Como o delimitador sozinho não segura
  nada — uma mensagem contendo `</conversa>` fechava a tag e injetava regras no
  system prompt —, a segunda rodada passou a higienizar o histórico na gravação
  (§ 2.1).

### 1.10 Textos ao cliente (`montar resposta`)

- **AUT-073 / AUT-058** — "deixar com a equipe do {empresa}" virou "deixar com
  quem atende. *Empresa* continua com você nesta conversa": não supõe equipe
  nem gênero do nome. E cada motivo de transferência tem a sua frase — quem
  pediu uma pessoa não quer desculpa, e quem esbarrou numa falha nossa não pode
  achar que errou alguma coisa.
- **AUT-019** — a apresentação usa o nome da assistente cadastrado e diz que é
  automação.
- **AUT-141** — o fallback de `dividir resposta` prometia transferência sem
  pausar a IA nem avisar ninguém. Agora só admite que a resposta não saiu.
- **AUT-122** — `MARCAS_DE_NEGOCIO` casava por substring e derrubava nomes de
  gente: "mei" em "Rosimeire", "me " em "Guilherme". Virou palavra inteira sobre
  o nome sem acento.

### 1.11 Rastro, validador e documentação

- **AUT-002 — nenhum atendimento bem-sucedido deixava rastro.** Com
  `saveDataSuccessExecution: none` e um NoOp no fim, não havia como auditar nem
  medir. Entrou `Redis - registrar auditoria`, alimentado por
  `registrar decisão`, gravando `am:auditoria:{instancia}:{msg_id}` por 30 dias.
  O registro é anônimo: instância, `msg_id`, intenção, confiança, rota, motivo,
  tipo de resposta e ação pendente — sem telefone, sem nome, sem texto.
- **AUT-116** — `scripts/add_origem_consulta.sql` adiciona
  `consulta.origem` (`painel` | `automacao`) com check, índice e default. **O
  script não foi aplicado e nenhum código grava a coluna ainda** (ver § 4).
- **AUT-103** (parcial) — `services/api/ai_api.py` passou a validar data de
  nascimento: futura ou de mais de 120 anos atrás é `ENTRADA_INVALIDA`. Uma data
  lida errado de um áudio some do radar depois de gravada.
- **AUT-153** — `validar_workflow.py` ganhou cinco invariantes novos, para que
  nada disso volte em silêncio: `settings.errorWorkflow` preenchido;
  `evo enviar mensagem` com `continueErrorOutput` **e** destino na saída de
  erro; a rota `humano` passando pelo teste de eco antes de pausar;
  `registrar decisão` entregando o registro ao nó de auditoria; e
  `buscar áudio`/`buscar imagem` chamando `getBase64FromMediaMessage`. Estão
  documentados como E09 a E13 em `TESTES_AUTOMACAO_V2.md`. A segunda rodada
  acrescentou os nós de mídia às checagens de credencial e origem, e duas
  próprias: `midia_msg_id` no corpo e `onError` nos conversores (§ 2.1).
- **AUT-042** — `README.md` ganhou a seção **Rollback** com três níveis (botão
  do painel por empresa, desativar o workflow, rotacionar o token) e diz por que
  o JSON da V1 **não** é rollback.
- **AUT-156 / AUT-113** — a documentação mandava usar `$env.AGENDA_API_BASE_URL`
  e `$env.AGENDA_AUTOMATION_TOKEN`, que o validador **proíbe** desde que a VPS
  passou a rodar com `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`. Corrigido no E07;
  README e `docs/INFRA-VPS.md` alinhados com o código.
- **AUT-049** — a retenção de execuções (`saveDataErrorExecution: all` guarda
  telefone e texto do cliente) está documentada em `docs/INFRA-VPS.md` § 4, com
  as variáveis necessárias e como conferir o valor efetivo dentro do container.
  **Nada foi configurado na VPS** — é uma tarefa de infraestrutura (ver § 5).

### Uma etiqueta errada, para não confundir quem for conferir

O comentário no nó `dividir resposta` cita **AUT-143**, mas o achado do fallback
que prometia equipe é o **AUT-141**; AUT-143 é outro (e-mail da empresa não
chega ao prompt), e continua **aberto**. A correção está certa, só o número do
comentário está trocado. Não foi mexido porque isto é uma rodada de
documentação e o JSON não deveria mudar por causa de um comentário.

---

## 2. Segunda rodada: a revisão adversarial e o que ela obrigou a refazer

Terminada a primeira rodada, o diff inteiro foi submetido a uma **revisão
adversarial**: seis lentes independentes — regressão, contrato com a API, estado
da conversa, qualidade do atendimento, segurança e privacidade, operação e
homologação — e cada achado passado por **dois revisores independentes que
executaram o código real dos nós** contra cenários montados, não por leitura.

O resultado desmonta a impressão que a §1 dá:

- **44 problemas confirmados**, sendo **19 bloqueando a homologação**.
- Por severidade: 9 críticos, 13 altos, 15 médios, 7 baixos.
- Por natureza: 17 correções incompletas, 11 regressões, 11 riscos, 3 defeitos
  novos, 2 melhorias.
- **Quase todos foram introduzidos pela própria rodada de correções** — não
  eram defeitos antigos que sobraram.
- Outros **11 achados foram refutados** pela dupla verificação (§ 2.3).

Os quatro bloqueios que decidiram o veredito:

1. **Escrita errada na agenda.** Pendência antiga sobrevivia a uma nova oferta e
   o "sim" marcava o horário que o cliente acabou de recusar. E
   `descartar_pendente` apagava `reagendar_consulta_id`, transformando
   remarcação em consulta nova — cliente com **duas** consultas.
2. **Guarda de crise quebrada nas duas pontas.** Com a OpenAI fora do ar,
   "quero me matar" recebia "pode mandar de novo": sem CVV, sem pausa, sem
   pessoa. E a regex errava nos dois sentidos — disparava com "apanhei um
   resfriado" e não disparava com "não quero mais viver".
3. **Mídia não funcionava e a falha morria calada.** A busca usava o `msg_id`
   errado quando o buffer juntava mídia e texto (400 garantido), e os
   conversores sem `onError` abortavam a execução: o cliente não recebia nada, a
   IA não pausava, e a guarda "não consegui ouvir seu áudio" era código
   inalcançável.
4. **Antecedência de 60 min aplicada na revalidação**: o bot afirmava "esse
   horário não está livre" sobre um horário que ele mesmo tinha oferecido.

Boa parte dos 44 tem a mesma origem: cada agente da primeira rodada olhou só o
próprio pedaço. Por isso os defeitos mais graves apareceram **entre** os nós —
um nó degrada e o seguinte não; um nó grava estado e o outro apaga — e por isso
as 41 asserções da suíte passavam mesmo assim: nenhuma delas cruzava dois nós.

### 2.1 O que a segunda rodada corrigiu

Tudo o que era prioridade 1 e 2 foi corrigido. Por tema:

**Ordem das guardas de segurança.** Crise, pedido do titular e contraindicação
clínica passaram a ser decididos **antes** do portão de validação da IA — leem
só o texto do cliente e nunca a interpretação. Antes, uma queda da OpenAI
desligava as três, e é justamente conteúdo de crise que mais faz o provedor
recusar: o gatilho da falha e o gatilho da guarda coincidem.

**A regex de crise foi refeita nos dois sentidos.** Saíram os termos de uso
banal em salão que mandavam o CVV para quem só queria remarcar — "apanhei",
"ameaça de chuva", "abuso de sol". Entraram as formas correntes da fala que
caíam no handoff genérico: "não quero mais viver", "meu marido me bate", "me
automutilei". Autolesão ("me cortei") passou a exigir um sinal de sofrimento ou
de repetição por perto, porque dentro de um salão a frase é ambígua.

**Ciclo da ação pendente.** Pendência antiga não sobrevive mais a uma oferta
nova: se há horários no estado e nenhum bate com a pendência, ela está obsoleta
e não é executada. E recusar uma oferta deixou de apagar o assunto — serviço
escolhido, horários oferecidos e remarcação em curso sobrevivem ao
`descartar_pendente`. Só a rota `humano` encerra o assunto.

**Antecedência e expediente.** O piso de 60 minutos deixou de valer na
revalidação de um horário que o próprio fluxo ofereceu (por flag explícita, não
por `horario_desejado`, que também carrega hora digitada pelo cliente). E o
período pedido passou a ser **interseccionado** com o expediente cadastrado em
vez de sobrescrevê-lo: "à noite" numa empresa que fecha às 18 h agora cai em
`fora_do_expediente` sem chamar a API, em vez de gerar busca vazia e "não achei
horário livre".

**"a de segunda" é o dia da semana.** A preposição desfaz o empate — em
português ninguém chama o segundo item de "o de segunda". Já "a segunda" com
lista aberta e uma consulta na segunda-feira virou **pergunta**, não escolha:
cancelar é destrutivo e o custo de errar não é simétrico.

**Autopausa por mensagem do dono.** Vídeo, PDF, localização e cartão de contato
do dono voltaram a pausar a IA — são intervenção humana de verdade. Figurinha,
reação e mensagem de protocolo continuam não pausando, que era o ponto da
correção original.

**Mídia.** A busca passou a usar o id da mensagem que **carrega a mídia** (o
buffer agrupa áudio e texto, e o id da entrada era o do texto); timeout caiu
para 10 s sem repetição, porque a Evolution ainda dorme 5 s por dentro antes de
desistir e o cliente ficava perto de um minuto sem nada na tela; e os dois
conversores ganharam `onError`, para que a falha degrade em vez de derrubar a
execução.

**Guardas de conteúdo.** O guard de preço passou a pegar valor sem cifrão ("fica
150 reais", "sai por 800"), e a exigir o preço **daquele** serviço quando o
texto cita um nome do catálogo. Link, chave PIX e pedido de código de seis
dígitos passaram a ser bloqueados, assim como telefone que não é o da empresa. E
o histórico é higienizado **na gravação**: uma mensagem contendo `</conversa>`
fechava o delimitador e injetava regras dentro do system prompt.

**Transferência determinística.** `handoff_reason` virou enum fechado, no schema
e no prompt. O motivo da transferência deixou de vir do texto livre do modelo:
antes ele escrevia "cliente pediu atendimento humano", que nunca batia com
`pedido_do_cliente`, então quem pedia uma pessoa ouvia o texto genérico de falha
e a pausa caía de 12 h para 1 h. Assunto sensível agora recebe pausa longa de
verdade. Como bônus, o texto livre do modelo — que pode conter nome, telefone ou
condição de saúde — saiu da chave do Redis e do log.

**Prompt.** Parou de mandar oferecer "a equipe": do outro lado pode haver uma
pessoa sozinha. O `pedido_do_titular` passou a usar o texto escrito para ele
("Entendi seu pedido e ele vai ser tratado"), que era código morto, e a
apresentação passou a aparecer também em conversa que começa com "oi".

**Workflow de erro.** Passou a salvar execuções (`saveDataSuccessExecution:
all`) e a **lançar** quando o alerta não pode ser enviado — alerta configurado
com marcador ou recusado pela Evolution. Antes, o detector de todos os silêncios
falhava em silêncio.

**Validador.** `buscar áudio` e `buscar imagem` entraram nas verificações de
credencial e origem que já existiam para os nós da Evolution, e ganharam duas
próprias: o corpo tem de usar `midia_msg_id`, e os conversores têm de declarar
`onError`. As duas nasceram de regressões desta rodada.

### 2.2 O que a segunda rodada deixou aberto, e por quê

**Resíduos assumidos** (documentados em `automation/n8n/README.md`
§ "Limitações conhecidas"):

- **`am:buffer` sem TTL.** A chave guarda payload cru — telefone, texto e o
  base64 do áudio ou da imagem — e sobrevive à execução que morre entre o
  `push` e o `delete`. Não foi corrigido porque o nó Redis do n8n **só expõe
  expiração nas operações `set` e `incr`, não em `push`**: dar TTL exige um
  passo extra no caminho de toda mensagem ou trocar a lista por chave string com
  o array JSON. Mudança estrutural, fora do escopo de uma rodada de correção.
- **Pendência obsoleta quando a busca anterior não achou nada.** A regra que
  invalida a pendência antiga compara os horários oferecidos com o horário
  pendente; uma busca que termina em "não achei horário livre" grava lista
  vazia, e lista vazia é lida como "não sei", não como "a oferta mudou".
  Distinguir as duas exige o instante do último turno, que `montar contexto` não
  repassa. O caso é estreito (pendência viva + busca sem resultado + "sim" seco
  em até 10 min) e a correção limpa é a pendência ser apagada pelo próprio
  `avaliar horários`.

**Prioridade 3, não corrigido:**

- **O nome padrão da assistente duplica no prompt.** `montar contexto` usa
  `'assistente virtual'` como default de `assistente_nome`, e a primeira linha
  do prompt vira "Você é assistente virtual, assistente virtual do negócio…".
  Só afeta empresa que não preencheu o campo.
- **O arquivo do fluxo de erro não é validável pelo `validar_workflow.py`.**
  Rodar o validador nele é inútil: ele exige os 41 nós obrigatórios da V2. Um
  erro de digitação no `errorTrigger`, uma conexão solta ou um JSON quebrado só
  apareceriam na primeira falha real — o pior momento possível. Nenhum teste
  carrega esse arquivo hoje (verificado em 2026-09-07): `E12` confere só que a
  V2 aponta **algum** fluxo de erro, não que o arquivo apontado seja válido. O
  caminho barato é meia dúzia de asserções em `test_regras.mjs`, que já lê JSON
  do disco: JSON válido, nó `errorTrigger` presente, toda conexão apontando para
  nó existente e nenhum telefone real fora de placeholder.
- **O validador não checa a cadeia de degradação inteira.** A asserção que teria
  pegado o conversor sem `onError` no CI — "todo nó imediatamente depois de um
  nó com `continueRegularOutput` também declara `onError`" — foi escrita para os
  dois casos conhecidos, não como regra geral.

### 2.3 Achados **refutados** — não recrie estes

Os 11 abaixo foram levantados por uma lente e derrubados pela verificação. Estão
aqui para ninguém "corrigir" de novo o que já está certo.

| Achado | O que se alegou | Por que caiu |
|---|---|---|
| `regressao-04` | remarcação em curso descarta o serviço que o cliente pediu | O comportamento é real, mas a consequência não: `POST /agendamentos/reagendar` nunca troca o procedimento (`services/api/ai_api.py` monta a atualização só com intervalo e profissional). A escrita que sai do fluxo é **idêntica** nas duas versões; muda só o nome citado no texto. A correção proposta era pior que o defeito. |
| `regressao-06` | confiança baixa e `falha_ia` não escalam mais para pessoa | Existe saída: a regra 8 do prompt manda `requires_human = true` depois de duas tentativas sem entender, o histórico das respostas anteriores vai no mesmo prompt, e `requires_human` é testado **antes** do limiar de confiança. Executado: rodadas 1 e 2 esclarecem, a 3 transfere. O ponto fraco (não há contador determinístico fora do modelo) está registrado no README. |
| `regressao-10` | preço de pacote e de sinal deixa de ser respondido | É o comportamento correto. Quando o serviço não tem `valor`, o prompt também não recebe preço nenhum — então qualquer `R$` que o modelo escreva é literalmente inventado, e bloquear é o certo. |
| `regressao-12` | conversa pausada pelo dono pode voltar a ser respondida no deploy, por causa do sufixo de aparelho no JID | Não há estado anterior para ficar órfão: o fluxo nunca rodou em produção (`active: false` desde sempre), então não existe chave `am:handoff:` no formato antigo. |
| `contrato-06` | `fim - falha no envio` lança contando com um `errorWorkflow` que é marcador | A correção pedida já está implementada em quatro lugares: o arquivo do fluxo de erro existe, o README tem seção dedicada, é passo obrigatório de "Antes de ativar" e é o item E12 da matriz. O id real é por instância e não pode entrar no Git. |
| `contrato-05` | `nome` sai com até 200 caracteres e a API aceita 120 | Divergência **pré-existente**, idêntica no HEAD anterior: o `slice(0, 200)` e o `max_length=120` já eram assim. Não é regressão desta rodada. |
| `seguranca-08` | o `throw` novo em falha de envio passa a persistir a conversa inteira no banco do n8n | O mecanismo é real, mas não é classe nova de exposição: `saveDataErrorExecution: all` é idêntico antes e depois, e todo o resto das falhas já gravava o mesmo conteúdo. O expurgo de execuções (§ 5) é a mitigação, e já estava na lista. |
| `seguranca-09` | o alerta de erro leva nome de variável de ambiente e de credencial para o WhatsApp do operador | Verdadeiro e inofensivo: o destinatário é o próprio dono, e os dois nomes já estão versionados no README, no `INFRA-VPS.md` e no `.env.example`. Valor de reconhecimento zero. |
| `persona-12` | a regra 7 do prompt assume gênero feminino da assistente | Pré-existente (idêntica no HEAD) e correta em pt-BR: "uma assistente virtual" concorda com o papel, não com a pessoa. Backlog, não regressão. |
| `persona-13` | o texto de crise termina com o robô saindo, e a pausa de 12 h deixa a pessoa sozinha | Todo o bloco de crise é novo — antes desta mudança não havia CVV, não havia 188 e não havia TTL por motivo. Julgar uma melhoria nova como falha inverte a comparação. O texto foi reordenado assim mesmo: o 188 ficou por último, que é a linha que sobra na tela. |
| `operacao-10` | os ids `T**` da matriz e os do suíte automatizado colidem | Premissa factualmente errada: os conjuntos batem 1:1 (`T42` é o mesmo caso nos dois arquivos). A matriz continua sendo derivada do arquivo de teste, não o contrário. |

---

## 3. O que **não** foi corrigido e continua aberto

Nada abaixo foi tocado nesta rodada. São as tarefas de prioridade 2 e 3 da
revisão, e nenhuma delas impede a homologação técnica — mas as três primeiras
mudam o que o piloto consegue provar.

| Tema | Achados | Por que ficou de fora |
|---|---|---|
| **Contexto da empresa no prompt** | AUT-003, AUT-014, AUT-015, AUT-016, AUT-054, AUT-055, AUT-056 | A IA conhece 7 fatos do negócio. Descrição da empresa, descrição e orientações do serviço, área do profissional e horário por profissional já são coletados no onboarding e não chegam ao prompt. Mexe em `/api/ai/contexto` e no prompt ao mesmo tempo. |
| **Central de Atendimento** | AUT-109, AUT-020 | Não existe tela nem tabela de conversas. É o que falta para a transferência avisar alguém de verdade e para o piloto assistido ("revisão humana de toda ação") ter onde acontecer. Hoje a IA pausa e a conversa continua no WhatsApp do próprio negócio — o texto ao cliente diz exatamente isso e não promete aviso. |
| **Pausa por conversa no painel** | AUT-108 | Só existe pausa por empresa (botão do painel) e a de 30 min quando o dono responde pelo celular. Não há "devolver à automação" nem "pausar esta conversa por hoje". |
| **Lembretes e confirmação D-1** | AUT-044 | Precisam de gatilho próprio (cron), que não existe neste workflow. O onboarding já coleta `mensagem_lembrete` e o MVP promete "confirmação de agendamentos". |
| **Limite de taxa na API** | AUT-050, AUT-127 | Quem tiver o token chama à vontade; qualquer número gera cliente no banco, chamada de OpenAI e áudio sem teto. Avalie antes de expor o backend. |
| **Trilha de auditoria no banco** | AUT-002 (segunda metade), AUT-116, AUT-086, AUT-111 | O `am:auditoria:` no Redis é um paliativo com 30 dias de vida e sem consulta agregada. A trilha definitiva é tabela no Postgres, junto com a coluna `origem` e a métrica de "resolvido sem interromper o profissional". |
| **LGPD operacional** | AUT-105, AUT-049, AUT-106 (metade), AUT-043 | Áudio e imagem vão para a OpenAI sem base documentada, sem política de privacidade citável e sem aceite do assinante. O expurgo de execuções está documentado mas **não configurado**. E `AgendaMagnetica.n8n.json` (V1, histórico) ainda tem um e-mail pessoal nos nós órfãos do Google Calendar. |

Fora da lista acima, continuam abertos os refinamentos de compreensão de menor
frequência (AUT-063, AUT-076, AUT-125, AUT-145 e outros), recorrência e pacotes
(AUT-028, AUT-083), feriados e bloqueio por empresa (AUT-081, AUT-104), e custo
e latência do modelo (AUT-110). Todos foram classificados como pós-piloto.

---

## 4. Decisões que ficaram para o dono

Nenhuma destas pode ser tomada por um agente. As seis bloqueiam a ativação, e as
duas últimas nasceram da revisão adversarial: são fatos do mundo real que
nenhuma leitura de código resolve.

1. **Ligar ou não `base64` no webhook da Evolution.** A busca de mídia
   (`getBase64FromMediaMessage`) foi implementada como alternativa e funciona
   sem mexer no webhook, ao custo de **uma chamada HTTP a mais por áudio e por
   imagem**, do worker para a Evolution. Ligar `base64: true` elimina a chamada
   e engorda o payload retido — que, em execução com erro, fica guardado no
   Postgres do n8n. A escolha é entre latência e retenção de dado pessoal.
   Se `base64` for ligado, os nós de busca continuam corretos (a chave
   `message.base64` é lida antes) e podem ficar como estão.
2. **O id do workflow de erro.** A V2 sai do repositório com
   `"errorWorkflow": "RcPiPwpM0sNMKkhcERRO"`, que é um marcador e não um id.
   Importe `AgendaMagnetica-erro.n8n.json`, copie o id que o n8n atribuir (está
   na URL do editor) e cole em *Settings → Error workflow* da V2. Com o marcador
   no lugar, **o alerta simplesmente não dispara e o n8n não reclama**.
3. **O telefone do operador que recebe o alerta.** As três constantes do topo de
   `montar alerta`, no workflow de erro, são `CONFIGURAR_NO_N8N`: telefone do
   operador (formato `5551999999999`), base da Evolution e instância de alerta.
   Sem as três, o workflow encerra em `fim - alerta não configurado`, de
   propósito. É um dado pessoal e não entra no Git.
4. **Aplicar `scripts/add_origem_consulta.sql` antes de qualquer código que
   grave a coluna `origem`.** A ordem importa: deploy primeiro e coluna depois
   quebra **toda** escrita de agenda com `column origem does not exist`. O
   script é idempotente e o default `painel` mantém o histórico correto. Como
   nenhum código grava a coluna hoje, aplicá-lo agora é seguro e desbloqueia a
   métrica de origem depois.
5. **Confirmar o comportamento de eco da Evolution na instância real, antes de
   confiar na guarda de autopausa.** Toda a lógica de `am:enviada:` parte de que
   a Evolution reemite como `messages.upsert`, com `fromMe: true`, a mensagem
   que a própria API mandou, **com o mesmo `key.id` que o `sendText` devolveu**.
   Isso não foi verificado nesta versão da instância. Teste de cinco minutos:
   mandar um texto pela API e observar (a) se chega um webhook `fromMe: true` e
   (b) se o `key.id` do eco é igual ao devolvido pelo envio. Se **não** reemitir,
   os três nós de eco viram peso morto e o comentário do código fica errado. Se
   reemitir com id diferente, a guarda não funciona e o bot volta a se
   autopausar 30 min depois de cada resposta — e o marcador é gravado **depois**
   do envio, então existe corrida: um envio lento pode deixar o eco chegar
   antes.
6. **Confirmar que a instância grava as mensagens recebidas no banco da
   Evolution.** A busca de mídia manda só a chave da mensagem, então a Evolution
   vai buscar o conteúdo no próprio banco. Com a gravação desligada
   (`DATABASE_SAVE_DATA_NEW_MESSAGE=false`), a rota responde `400 Message not
   found` em **todo** áudio e **toda** imagem. A Evolution é compartilhada com a
   FixWear: essa configuração não está sob controle deste repositório, e
   `validar_workflow.py` não tem como verificá-la. Como conferir e qual é o plano
   B estão em `docs/INFRA-VPS.md` § 2.

Há ainda um **risco aceito** que não é decisão, mas precisa ser conhecido por
quem operar: o alerta de erro usa a mesma Evolution cuja queda ele deveria
reportar, com a mesma credencial. Se ela cair, o alerta cai junto. A mitigação
que existe é o rastro (`fim - alerta não enviado` lança e o fluxo de erro grava
execução em todos os casos); o aviso, não. Detalhes em `docs/INFRA-VPS.md` § 2.

---

## 5. Próximo passo, na ordem

1. **Revisar este diff.** Ele é grande: 9 nós novos, 14 alterados, o validador,
   a API e a documentação — e passou por duas rodadas, a segunda inteiramente
   dedicada a desfazer regressões da primeira (§ 2). `git diff` no repositório;
   `automation/n8n/README.md` explica o comportamento resultante. Ao revisar,
   olhe **entre** os nós: é onde a revisão adversarial achou os piores defeitos,
   e é o que a leitura nó a nó não pega.
2. **Aplicar `scripts/add_origem_consulta.sql`** no banco de homologação
   (decisão 4.4). Nada depende dele ainda, e é a ordem segura.
3. **Configurar o expurgo de execuções na VPS** — `EXECUTIONS_DATA_PRUNE`,
   `EXECUTIONS_DATA_MAX_AGE=168` e um teto por contagem, nos três containers do
   n8n. Instruções e como conferir o valor efetivo em `docs/INFRA-VPS.md` § 4.
   Isto vem **antes** de qualquer execução real, porque é o que limita quanto
   tempo o telefone e o texto do cliente ficam guardados.
4. **Importar os dois workflows** na instância de homologação, religar as
   credenciais (README § "Credenciais a religar após importar") e preencher as
   três constantes de `montar alerta` (decisão 4.3).
5. **Colar o id do workflow de erro** em *Settings → Error workflow* da V2
   (decisão 4.2). Confirme com uma execução que falha de propósito: desligue a
   credencial da Evolution por um minuto e verifique que o alerta chega no
   telefone do operador. Sem essa prova, nenhuma falha crítica tem notificação
   comprovada.
6. **Confirmar o backend** com a chamada sem token, que precisa responder
   `401 AUTENTICACAO_INVALIDA` — `503` significa `AUTOMATION_API_TOKEN` ausente
   nas variáveis do projeto na Vercel. Não use `GET /health`: o rewrite do
   `vercel.json` devolve o HTML do painel.
7. **Observar o eco da Evolution** (decisão 4.5): mande um texto pela API e veja
   se volta webhook `fromMe: true` com o mesmo `key.id`. Cinco minutos, e decide
   se a guarda de autopausa é necessária, suficiente ou inútil.
8. **Mandar um áudio real e uma imagem real** (decisão 4.6) e confirmar que
   `buscar áudio` e `buscar imagem` respondem `200` com base64 preenchido.
   `400 Message not found` = a instância não grava as mensagens recebidas.
9. **Rodar a matriz de `TESTES_AUTOMACAO_V2.md`** contra a instância de
   homologação, com **duas** empresas e o mesmo telefone nas duas.
10. **Só então** decidir sobre `base64` no webhook (decisão 4.1), com o número de
    áudios reais do piloto na mão.

Ativar continua exigindo autorização explícita do dono. Nada neste documento
autoriza.

---

## 6. Terceira rodada: o que a segunda revisão obrigou a refazer

O diff da segunda rodada passou pela mesma revisão adversarial, com o mesmo
método: lentes independentes achando, dois verificadores executando o código
real de cada nó contra cenários montados, e um desempate quando divergiam.

- **43 problemas confirmados**, sendo **17 bloqueando a homologação**.
- O veredito foi outra vez *"não pode ir para homologação como está"*.
- E um recado que vale mais do que a lista: **"dos 19 diffs da rodada, 9 podem
  ser revertidos sem que o validador ou os 107 testes mudem de cor"**.

Esse recado organizou o trabalho desta rodada em duas metades.

### 6.1 As correções

**Guardas de crise e de dado pessoal.** A regex de crise tinha mecanismos que
nunca disparavam e mecanismos que disparavam errado. Nenhuma forma de "morrer"
casava — *"quero morrer"* estava no arquivo, mas dentro de uma regex que nunca é
consultada sozinha; `me machuc(?:ei)` gerava *"me machucei"*, forma que não
existe em português (o pretérito é *"me machuquei"*); *"apanhei do meu marido"*,
o relato mais comum de violência doméstica, tinha deixado de ser crise. Do outro
lado, `abusad\w*` mandava o CVV para quem reclamou que *"esse preço tá abusado"*
— gíria corrente no RS. As formas correntes da fala entraram, os termos de uso
banal saíram com complemento obrigatório, e o espanhol de fronteira
(`matarme`, `quiero morir`, `borrar mis datos`) entrou junto.

**A rede do modelo, que faltava.** Como a regex é a primeira linha e não a
única, `crise` entrou no enum de `handoff_reason` e virou regra explícita do
prompt. O modelo só consegue **escalar**: a guarda determinística roda antes e
descarta o texto dele. E17 e E20 prendem as duas pontas.

**Contraindicação clínica.** `RE_CONDICAO` tinha virado incondicional e
sequestrava cancelamento, negação e terceira pessoa: a cliente grávida perdia até
o direito de desmarcar pelo bot. A regra foi invertida — a lista passou a ser dos
intents em que a condição **não** contraindica nada (cancelar, confirmar,
recusar), e não dos que ofertam horário.

**Ciclo da pendência.** Um "sim" podia executar uma pendência que o turno
anterior nem mencionou: bastava o turno novo terminar sem oferta (sem horários,
fora do expediente, falha temporária). O estado passou a carregar
`pendente_falada` — o que **este** turno realmente falou — e a obsolescência é
decidida por isso. Junto: recusa com contraproposta (*"pode ser 9h"*) deixou de
ser lida como aceite do horário recusado.

**Perguntas do sistema sem resposta.** Vários textos terminavam em pergunta de
sim/não e o "sim" morria em `sem_pendente` — que devolvia outra pergunta de
sim/não, byte a byte, sem saída. E *"Quer que eu chame quem atende para
conferir?"* não tinha rota nenhuma que a honrasse. As duas foram fechadas: a
primeira pelo estado, a segunda tirando a pergunta e oferecendo a frase-gatilho
que a rota determinística atende de verdade (T66).

**Janela de busca.** O recorte pela hora pedida escapava do expediente:
*"melhor sábado às 20h"* numa empresa que fecha 13h no sábado virava uma busca
das 18h às 20h30, a API devolvia lista vazia e o cliente ouvia *"não achei
horário livre"* — uma afirmação sobre uma agenda que ninguém consultou. Agora a
faixa fora do expediente nem chama a API e tem texto próprio. Na outra ponta, o
piso de "manhã" era 7h fixo e escondia os primeiros horários de quem abre 6h30.
E o piso de antecedência fazia o bot dizer *"esse horário não está livre"* sobre
um horário livre demais perto — agora ele diz o motivo real.

**Guards de saída.** O de preço só examinava o primeiro valor de cada marcador,
não via preço sem cifrão nem valor por extenso, e derrubava a checagem quando o
serviço era citado pelo apelido; o de link não via domínio nu
(`pagamentos-aurora.com.br/sinal`), que o WhatsApp transforma em link clicável.
Todos fechados, com os falsos positivos medidos (*"o tratamento fica 6 sessões"*
não é preço).

**Topologia e privacidade.** `am:buffer` era lista sem TTL: uma execução
interrompida entre a escrita e a limpeza deixava telefone e texto do cliente no
Redis para sempre — virou chave com 300 s. Áudio agrupado com texto descartava o
que o cliente digitou. E `evo enviar mensagem` ainda repetia: repetir um POST de
envio não é idempotente, e o cliente recebia a mesma mensagem duas vezes.

### 6.2 A outra metade: verificação executável

O recado da revisão era que as correções não estavam presas por nada. O fluxo de
erro inteiro não era lido por **nenhum** teste; `systemMessage`, TTLs e timeouts
não tinham asserção. Esta rodada fechou isso:

- **E18 e E19 executam `AgendaMagnetica-erro.n8n.json`** — o nó `montar alerta`
  roda de verdade, com um item em trânsito carregando telefone e conversa, e o
  teste exige que nada disso apareça no alerta.
- **E20 lê o `systemMessage`** e exige a regra de crise que dá sentido ao enum.
- **O validador ganhou invariantes de forma**, que valem para qualquer nó novo:
  escrita no Redis sem `expire` ou com TTL acima de 30 dias falha; nó HTTP sem
  `timeout` ou acima de 30 s falha; `evo enviar mensagem` com repetição falha; o
  primeiro nó do ramo do próprio envio sem `onError` falha.
- **T92 a T99** prendem as correções de agenda, texto e estado.

Cada uma dessas asserções foi provada por reversão: a correção é desfeita no
JSON, a suíte roda, e o teste que a prende tem de ficar vermelho. Uma asserção
que continua verde com a correção desfeita não protege nada — foi exatamente
assim que a rodada anterior fechou com 9 diffs soltos.

As 21 reversões executadas nesta rodada:

| Correção desfeita | Quem pega |
| --- | --- |
| `am:buffer` volta a ser lista sem TTL | validador: "escreve no Redis sem expiração" |
| TTL de estado sobe para 60 dias | validador: "guarda dado por mais de 30 dias" |
| `criar consulta` perde o `timeout` | validador: "sem timeout" |
| `evo enviar mensagem` volta a repetir | validador: "o cliente receberia a mensagem duas vezes" |
| `Redis - envio próprio?` perde o `onError` | validador: "abre o ramo do próprio envio sem onError" |
| O alerta de erro volta a levar o item em trânsito | E18 |
| ~~O erro deixa de ser cortado em 200 caracteres~~ (a rodada 4 trocou a mensagem pela classe; ver § 7.4) | — |
| O placeholder passa por configuração válida | E19 |
| `fim - alerta não enviado` para de lançar | E19 |
| O fluxo de erro é ativado (`active: true`) | E19 |
| Um telefone real entra no fluxo de erro | E19 |
| A regra 8.1 sai do `systemMessage` | E20 |
| O piso do período volta a ser 7h fixo | T92 |
| O recorte pela hora volta a estourar o expediente | T93 |
| A revalidação volta a ser recortada pelo expediente | T94 |
| O motivo do piso some da resposta | T95 |
| O preço por extenso sai da conta | T96 |
| O rótulo forjado volta ao histórico | T97 |
| O conflito volta a apagar a consulta candidata | T98 |
| O texto volta a prometer que guarda o serviço | T99 |
| A frase-gatilho vira de novo pergunta de sim/não | T66 |

### 6.3 Teto conhecido que ficou de pé

`Redis - marcar envio próprio` continua com `onError: continueRegularOutput`,
contra a recomendação da revisão. O motivo é a topologia: o nó roda **dentro** do
laço `enviar em ordem`, e lançar ali abortaria o laço — o cliente receberia só
parte da resposta. Falhar em gravar o marcador custa uma autopausa indevida de
30 min; truncar a resposta custa a conversa. Ficou o lado barato, e fica aqui
registrado que a falha é silenciosa.

O outro teto documentado: nada guarda o serviço entre turnos. O texto de agenda
vazia parou de **prometer** que guarda (T99); guardar de verdade
(`estado.ultimo_servico_id`) continua aberto e é mudança em outro nó.

---

## 7. Quarta rodada: a revisão que olhou a conversa, não só o código

A terceira rodada foi submetida a três revisões independentes e simultâneas:
**regressão** (o que a rodada quebrou), **qualidade da verificação** (o que a
suíte deixa passar) e **qualidade do atendimento** (conversas de verdade, com
estado carregado de um turno para o outro). As três reprovaram.

O resumo de cada uma:

- **Regressão:** 8 achados, 3 bloqueando. Dois eram regressões novas da própria
  terceira rodada.
- **Verificação:** a tabela de 21 reversões da § 6.2 se sustentou inteira — mas
  **6 correções da § 6.1 não tinham linha nenhuma** e eram revertíveis com a
  suíte verde. Entre elas, a guarda de crise.
- **Atendimento:** veredito direto — *"não está pronta para atender o público de
  um autônomo"*. A máquina de agenda estava sólida; o que quebrava era a conversa
  em volta.

### 7.1 O defeito mais caro: a automação calava por 12 horas

Qualquer palavra de saúde seguida de `?` transferia a conversa e pausava a IA por
**12 horas**, sem avisar ninguém. Para fisioterapeuta, psicóloga e esteticista —
o público-alvo declarado do produto — isso é a **primeira mensagem da maioria dos
clientes**:

```
CLIENTE > oi, tenho uma dor na lombar há uns dias. vocês atendem?
BOT     < Isso é melhor uma pessoa te responder com calma.
          Vou parar por aqui e deixar com quem atende.
CLIENTE > quero marcar então
BOT     < (nada, por 12 horas)
```

A regra do projeto é *"a IA não dá orientação clínica"* — não *"a IA para de
atender quem menciona saúde"*. As duas coisas foram separadas:

1. **A transferência ficou para quem pede orientação** (*"posso fazer massagem com
   hérnia?"*, *"serve pra mancha?"*, *"dói?"*). Pergunta sobre o que a empresa faz
   voltou a ser atendida.
2. **A afirmação clínica do modelo passou a ser barrada na saída** — que é onde o
   risco mora de verdade. *"Não se preocupe, isso passa."* não chega ao cliente,
   transferindo ou não. Isso é mais forte do que a regra antiga: antes, o texto
   clínico só era contido nos casos que a rota larga pegava.

### 7.2 O resto do que a conversa cobrava

- **O serviço não sobrevivia a um turno.** "Quanto custa a limpeza?" seguido de
  "então quero marcar" caía em "Qual desses você quer?" — o bot cita o serviço
  numa frase e esquece na seguinte. Em empresa de um serviço só não aparece; em
  qualquer empresa real, aparece o tempo todo. O estado passou a guardar o
  serviço, com a mesma mecânica do `pendente_falada`.
- **"Quero cortar o cabelo e fazer a barba" agendava só a Barba** — 30 min
  reservados para um trabalho de 60, em silêncio, no caminho feliz. "cortar" não
  contém "corte": o casamento por frase exata não sobrevive à conjugação em
  catálogo de palavra curta.
- **Toda pergunta de sim/não que o bot fazia terminava em "Qual desses você
  quer?"** *"Quer que eu chame quem atende?"* era a frase mais repetida do fluxo
  e a menos honrada — o "sim" a ela ia parar na disponibilidade. Cinco textos e a
  regra 3 do prompt passaram a oferecer a frase-gatilho, que a rota
  determinística atende de verdade.
- **Dia fechado era reportado como agenda cheia.** Sábado numa empresa que abre
  de segunda a sexta recebia "Não achei horário livre até 22/08" — o bot tem o
  expediente no contexto e mentia com ele na mão.
- **Recusar uma oferta encerrava a conversa.** "não, prefiro mais tarde" recebia
  "Ok, deixei como está". Agora vira busca nova, sem repetir o horário recusado.
- **As duas ofertas eram 9h e 9h30.** Quem não pode às 9h também não pode às
  9h30: a escolha não era escolha.
- **10 minutos de pendência** é curto para WhatsApp — quem respondia do ônibus
  ouvia "esse horário já expirou" sobre um horário que ninguém tinha pegado. São
  30 minutos, e a API continua revalidando na escrita.
- **Cliente irritado ouvia "Claro."** O motivo que o modelo classificou passou a
  escolher a abertura do texto (nunca a rota, nem o TTL, nem a chave do Redis).
- **O prompt não sabia duração nem área.** "Quanto tempo dura?" e "quem faz RPG?"
  eram impossíveis de responder, com o dado no contexto. E a pendência ia em UTC
  enquanto o "agora" ia no fuso local: o cliente lia 10h e o modelo lia 13h.

### 7.3 As regressões que a própria terceira rodada tinha criado

- **Preservar a consulta candidata** fez a remarcação em curso vencer um serviço
  pedido explicitamente: o cliente pedia drenagem e o fluxo **remarcava a limpeza
  dele** — escrita destrutiva sobre um recurso diferente do pedido.
- **A âncora do expediente** tratava a borda 7h–21h (o *fallback* de quem não
  cadastrou horário) como fechamento real: empresa sem expediente perdia 22h e
  6h30, e empresa que atende 20h–02h perdia o horário inteiro.
- **A isenção do piso de período** descartava junto o limite que o cliente
  digitou: "entre 7 e 9" virava busca das 6h.
- **A flag de fora do expediente** era calculada e jogada fora em janela de vários
  dias: "semana que vem às 20h" seguia chamando a API e ignorando o "às 20h".
- **`crise` no enum era código morto**: nenhum nó lia `handoff_reason`. A segunda
  linha de defesa anunciada na § 6.1 não existia — quem escrevia ideação com
  fraseado fora da regex recebia "Claro." e nenhum canal de ajuda.

### 7.4 O alerta de falha vazava dado do cliente

O fluxo de erro copiava `error.message` verbatim para o WhatsApp do operador. Esse
campo carrega o que estava em trânsito quando a execução caiu — a saída do modelo,
o corpo que a Evolution recusou:

```
Erro: Bad request: {"number":"5551988887777","text":"Ana Paula, sua limpeza de
sexta 14h está confirmada","obs":"disse que está grávida de 3 meses"}
```

Telefone, nome e dado de saúde saindo por WhatsApp para um número externo — com
E18 verde, porque o teste protegia `execution.data`, campo que o Error Trigger do
n8n **nunca emite**. Agora só a classe do erro sai; o detalhe fica na execução,
que só quem tem acesso ao n8n abre.

### 7.5 A verificação, de novo

22 reversões executadas nesta rodada, todas vermelhas quando a correção é
desfeita — incluindo os dois furos que a revisão encontrou nos invariantes da
rodada anterior (TTL calculado por expressão e regra de repetição presa ao nome
do nó). Uma delas só existiu porque a reversão foi feita: o filtro do horário
recusado comparava **texto**, e a oferta é guardada em UTC enquanto a API responde
no fuso do negócio — o mesmo instante com duas grafias. O teste passava com o
filtro removido.

| Correção desfeita | Quem pega |
| --- | --- |
| O serviço deixa de sobreviver ao turno | T100 |
| Catálogo curto perde a conjugação | T101 |
| A crise escalada pelo modelo volta a ser ignorada | T102 |
| A remarcação volta a vencer o serviço pedido | T103 |
| Dia fechado volta a virar chamada à API | T104 |
| O limite do cliente igual a 7h é descartado | T104 |
| A borda 7h–21h volta a ser tratada como fechamento | T104 |
| A promessa sem rota volta aos textos | T105 |
| Número de horário volta a virar preço | T106 |
| Dois-pontos de largura inteira volta a escapar | T107 |
| Recusa com pedido volta a encerrar a conversa | T108 |
| O horário recusado volta na oferta seguinte | T108 |
| As duas ofertas voltam a ser vizinhas | T109 |
| "hoje ou amanhã" perde o amanhã | T110 |
| Serviço sem agenda volta a transferir | T29 |
| O vencimento volta a falar de "horário expirado" no cancelamento | T111 |
| A reclamação volta a ouvir "Claro." | T111 |
| "?" volta a receber "não entendi" | T111 |
| Cliente conhecido perde o nome na saudação | T111 |
| Cliente novo entra na agenda sem nome | T111 |
| TTL calculado (`{{ 60 * 60 * 24 * 365 }}`) | validador |
| Segundo nó de envio, com outro nome, repetindo | validador |

### 7.6 O que continua aberto

- **Terceiro e menor de idade** entram na agenda como quem digitou. Marcar para
  outra pessoa precisa de um campo que a API não tem. O que dava para fazer sem
  isso foi feito: cliente sem cadastro é perguntado o nome depois de marcar.
- **Sinônimo do serviço** ("quero fazer o cabelo" para um catálogo com "Corte")
  continua sem casar. Precisa de um mapa por negócio, não de uma regra geral.
- **Valor por extenso** já é conferido, mas o `systemMessage` ainda não proíbe o
  modelo de escrever preço — a barreira é só de saída.
- **Contexto do negócio no onboarding**: estacionamento, convênio, formas de
  pagamento e política de cancelamento não são coletados. Enquanto não forem, a
  resposta do bot para quem ainda não decidiu vai continuar sendo "não sei".
- **A pausa de 12 h para assunto sensível** continua sem ninguém do outro lado
  sendo avisado (§ 3, "Central de Atendimento").

---

## 8. Quinta rodada: catálogo de verdade e a guarda clínica pela raiz

As mesmas três lentes revisaram a quarta rodada. Resultado: **12 achados de
regressão (5 bloqueando), 13 de verificação (2 bloqueando) e 14 de atendimento
(5 bloqueando)** — e um diagnóstico de causa raiz que vale mais do que a lista:

> *"A suíte só verifica nó por nó. Os quatro achados que bloqueiam nasceram de
> conversa com catálogo realista (5 serviços, nomes que se contêm) — a suíte roda
> com `Corte`/`Barba`, duas palavras que não colidem, e por isso eles são
> invisíveis para ela."*

### 8.1 O casamento por raiz agendava o serviço errado

A rodada anterior corrigiu "quero cortar o cabelo e fazer a barba agenda só a
Barba" com casamento por raiz de 4 letras. Isso criou o erro oposto, pior:

```
Catálogo: Corte (30 min, R$ 60) | Barba (30 min, R$ 40) | Corte e barba (60 min, R$ 90)

CLIENTE > quero um corte
BOT     < Confirmo então: Corte e barba, sexta às 10h. Posso marcar?
          *** ESCRITA {"id_procedimento": 3}
```

"corte" casava também o combo, e o desempate por nome mais longo ficava com ele:
30 minutos a mais de agenda bloqueada e R$ 30 a mais por atendimento, em todo
pedido de barbearia com combo no catálogo — o arranjo padrão do nicho.

O desempate certo não é o nome mais longo, é **quem a mensagem explicou melhor**:
"corte" explica 1/1 de `Corte` e 1/2 de `Corte e barba`. A mesma regra resolve o
outro travamento: num consultório com "Terapia individual" e "Terapia de casal",
dizer o nome exato entrava em laço — "terapia" casava os dois e nada desempatava,
e responder pelo número aumentava a lista de 2 para 4.

E a memória de serviço, que agenda sozinha até 6 h depois, passou a exigir o nome
dito **por inteiro**: "oi, me indicaram vocês" — a abertura mais comum do WhatsApp
brasileiro — virava `Terapia individual` e fechava horário 45 minutos depois sem
perguntar.

### 8.2 A guarda clínica, pela terceira vez — e agora pela raiz

A rodada 4 trocou "qualquer `?` perto de palavra de saúde" por uma lista de
palavras que reconheceria o *pedido* de orientação. Medição da revisão: **8 de 8
pedidos reais escapavam** e **5 de 5 perguntas de recepção transferiam**, com 12 h
de silêncio em cada falso positivo.

```
ESCAPA     "a hérnia atrapalha o pilates?"
ESCAPA     "meu joelho inflamou, preciso parar de treinar?"
ESCAPA     "minha ferida ainda está sangrando, devo trocar o curativo?"
TRANSFERE  "posso pagar no cartão? tô com uma dor de cabeça hoje mas vou"
TRANSFERE  "vocês emitem atestado? posso pegar depois da sessão"
```

Pedido de orientação não tem vocabulário próprio — lista nenhuma fecha. A regra
foi invertida: **pergunta que fala do corpo do cliente vai para uma pessoa,
exceto quando o assunto é o nosso** (serviço, agenda, pagamento, documento,
endereço). Essa lista de exceções é enumerável porque é o vocabulário do próprio
negócio. Medido depois: 18 de 18 casos na direção certa.

A barreira de saída também era lista de frases, e a revisão mostrou que ela não
segurava a forma afirmativa que uma recepção escreve de verdade:

```
saiu ao cliente: "Pode fazer sim, a massagem ajuda muito na hérnia."
saiu ao cliente: "Atendemos sim, diabetes não impede o procedimento."
saiu ao cliente: "Não precisa parar, só pegue mais leve nos próximos dias."
```

O critério passou a ser estrutural: **se o texto do modelo fala do quadro do
cliente, ele não sai** — a lista de termos de saúde já existe num nó só e a marca
viaja de lá. Em troca, os termos genéricos saíram da lista de frases: "É só chegar
na Rua das Flores, 100" virava recusa de opinar porque o cliente escreveu "dor" na
mesma conversa.

E a pausa: `assunto_sensivel` saiu do patamar de 12 h. Nenhum nó avisa o negócio,
então 12 h ali é a conversa morta por um turno de trabalho. O patamar longo ficou
para os casos em que **a IA voltar** é o problema — o cliente pediu uma pessoa, ou
o assunto é crise ou dado pessoal.

### 8.3 O resto

- **A remarcação morria por uma palavra inocente.** Com remarcação aberta, "terça
  às 15h, ainda estou avaliando o trânsito" resolvia para `Avaliação
  fisioterapêutica`, encerrava a remarcação e criava um agendamento **novo** — o
  horário antigo continuava na agenda, e o cliente terminava com duas consultas.
- **"A segunda fica melhor pra mim" trocava o dia.** O ordinal só era lido quando
  fechava a mensagem; fora disso "segunda" caía no resolvedor de data e virava
  segunda-feira, sem uma palavra.
- **Aceitar citando o dia reabria a busca.** "O de sexta tá ótimo" devolvia a
  mesma pergunta com uma opção que o cliente nunca tinha visto.
- **"Esse horário não está livre" sobre um horário que apenas passou** — e a outra
  opção, que continuava de pé, sumia, porque a revalidação recortava ±2 h.
- **Preço de outro serviço passava.** "Quanto custa a drenagem?" seguido de "Fica
  R$ 150." era aceito, porque 150 é o preço da massagem; e "a partir de 350",
  "entre 300 e 400" e "são 350" atravessavam o portão do marcador.
- **A automação prometia avisar alguém.** "Já aviso a Paula, ela te espera" e "te
  aviso quando abrir vaga" saíam inteiras — e nenhum nó deste fluxo fala com o
  dono. Havia guard de efeito, de preço, de contato e de saúde; faltava o de
  promessa.
- **O alerta de erro do gatilho** prendia `trigger.name`, campo que o n8n não
  emite: o teste passava sobre um payload que o workflow não produz.

### 8.4 A verificação, pela quarta vez

A revisão executou 32 reversões contra a rodada 4 e **9 ficaram verdes** — entre
elas a janela da pendência (nos dois lugares onde ela vive), a regra 3 do prompt e
o fuso da pendência, além de dois furos nos invariantes do validador e duas
asserções que não podiam falhar.

Esta rodada executou **21 reversões, todas vermelhas**, e a fixture mudou: a suíte
passou a rodar com catálogos de nicho (combo, nomes que começam igual, raiz que
aparece em conversa comum). Uma das reversões só ficou vermelha depois de o teste
ser reescrito: T117 aceitava "transferiu" como sucesso, então era a **rota** que o
satisfazia e a barreira de saída podia ser desligada sem ninguém notar.

| Correção desfeita | Quem pega |
| --- | --- |
| O combo volta a sequestrar o componente | T113 |
| A memória de 6 h volta a nascer de raiz | T114 |
| Palavra inocente volta a matar a remarcação | T115 |
| Pergunta de recepção volta a transferir por 12 h | T116 |
| "machuquei" sai do vocabulário de saúde | T116 |
| O portão clínico é desligado | T116 |
| A barreira de saída vira lista de frases | T117 |
| Aceite citando o dia volta a ser recusado | T118 |
| Preço de outro serviço volta a passar | T119 |
| Preço sem marcador colado volta a passar | T119 |
| A promessa que ninguém cumpre volta a sair | T120 |
| Pendência vencida volta a ser reperguntada | T121 |
| A memória sobrevive à transferência | T121 |
| O ordinal fora do fecho da mensagem some | T122 |
| O alerta do gatilho volta a não dizer nada | E18b |
| O nome da classe volta a sair sem validação | E18b |
| TTL em notação científica (`{{ 60e6 }}`) | validador |
| Lista com `expire` que o n8n ignora | validador |
| URL de envio partida na concatenação, com repetição | validador |
| TTL de `am:pendente` divergindo de `PENDENTE_MINUTOS` | validador |
| Fluxo de erro com repetição no envio | validador |

**Como reproduzir:** os dois scripts de reversão ficaram no diretório de trabalho
da sessão (`_reverter_r4.py` e `_reverter_r5.py`). Eles guardam os bytes originais
dos dois JSON, aplicam uma reversão por vez, rodam a suíte e o validador, e
restauram no `finally`. Quem for refazer isto noutra sessão: escreva o script em
arquivo (não em heredoc) — âncora com barra invertida perde o escape no caminho e
a mutação passa a não casar nada, o que faz a reversão parecer protegida.

### 8.5 O que continua aberto

Da revisão de atendimento, não corrigido nesta rodada:

- **O dia e a hora somem no turno ambíguo.** "Quero corte e barba amanhã às 10h" →
  "Qual desses?" → "corte" → a busca volta a ser genérica de 14 dias. O estado
  guarda o serviço, não a data.
- **Hora por extenso é descartada** ("às dez", "às duas da tarde", "dez e meia") —
  a forma dominante em transcrição de áudio.
- **Mensagem com várias perguntas** perde tudo menos o agendamento: "queria marcar
  uma limpeza pra sexta de manhã, quanto fica? aceita pix?" responde só o horário.
- **"Mais tarde" e "mais cedo" não viram restrição** de faixa horária.
- **Profissional inexistente é ignorado** quando o serviço não foi dito junto.
- **Feriado é oferecido como dia normal** — não existe fonte de feriado no
  contexto. Operacionalmente: bloquear o feriado na agenda antes do dia.
- **Terceiro e menor de idade** entram na agenda como quem digitou.
- **A pausa por transferência continua sem avisar o dono** (§ 3, Central de
  Atendimento). Baixar `assunto_sensivel` para 1 h reduz o custo; não o elimina.

---

## 9. Sexta rodada: os itens que a § 8.5 tinha deixado abertos

Dois agentes trabalharam em arquivos disjuntos (`resolver e decidir` e `montar
resposta`) e cada correção passou por um revisor adversarial independente. **As
duas revisões reprovaram**, com 15 achados. O mais importante:

> Um item declarado como feito **não tinha efeito nenhum no fluxo real**. A
> emissão (`pedido_de_data`) e a leitura (`quandoLembrado`) foram implementadas,
> mas ninguém *gravava*: `montar resposta` monta o estado com forma fixa e nunca
> escreveu `data_ultima`. A prova verde dependia de um shim escrito no próprio
> teste; na cadeia real o sintoma continuava idêntico ao bug.

### 9.1 O que a rodada fechou

- **A data e a hora sobrevivem ao turno ambíguo.** "Quero corte e barba amanhã às
  10h" → "Qual desses?" → "corte" voltava à janela genérica de 14 dias e oferecia
  HOJE. Agora o pedido é guardado (`data_ultima`), atravessa o Redis e ancora a
  busca do turno seguinte — e a data dita agora continua vencendo a lembrada.
- **Hora por extenso** ("às dez", "às duas da tarde", "dez e meia") era descartada
  em silêncio. É a forma dominante em transcrição de áudio: o cliente pedia "às
  dez", ouvia "9h ou 12h" e concluía que não havia vaga.
- **"Mais tarde" e "mais cedo"** viraram faixa de horário. Antes devolviam a
  janela padrão — e, na revisão, "mais tarde" repetido virava uma parede que
  respondia a mesma frase byte a byte, para sempre. Também deixaram de apagar o
  dia de hoje e de afirmar que uma data que o cliente não citou já passou.
- **Profissional inexistente** deixou de sumir sem uma palavra — mas com
  `profissionais` vazio (o autônomo que atende sozinho, a persona principal) a
  guarda trocava uma pergunta útil por um aviso sem saída, e isso foi corrigido
  junto.
- **Preço junto do pedido de horário**: "quanto fica?" sumia da resposta. Agora a
  oferta é prefixada com preço e duração **do catálogo** — nunca do modelo — e não
  em remarcação, que não gera cobrança nova; pergunta de pacote sai "por sessão".
- **O convite de agenda vazia** propunha "22/08" para quem fecha sábado, e no
  turno seguinte recusava o próprio convite. Passa a cair no próximo dia aberto.
- **Dia fechado** responde sobre o DIA, com os dias em que há atendimento — e
  linha de expediente inválida (00:00–00:00) parou de contar como dia aberto,
  contradição que aparecia dentro da mesma frase.
- **Endereço mandado como cadastro** recebia "não entendi", e a primeira correção
  trocou por uma frase que **negava uma capacidade que o produto tem** (o fluxo
  grava cadastro). O texto final diz o que faltou e ensina o formato.
- **Cliente novo que cita um parente** ("minha amiga me indicou") deixava de ser
  perguntado o nome e entrava na agenda sem nome nenhum. As duas linhas passaram a
  conviver, e a detecção de terceiro exige a colocação de agendamento — incluindo
  "pra", a contração dominante, que a primeira versão não cobria.
- **"Obrigado por todos os atendimentos, quero cancelar o de sexta"** virava
  "cancelar todas". O quantificador agora exige o verbo colado.

### 9.2 O que foi recusado

O aviso de transcrição incerta tinha sido estendido a `fora_do_expediente`, que
não nomeia hora nenhuma: prometer "confirmo com você" e não dizer o que foi
entendido é pior do que não avisar. Esse tipo saiu da lista; em
`horario_indisponivel`, que tem o pedido em mãos, o texto passou a nomear a hora.

### 9.3 A verificação

15 reversões, todas vermelhas. Duas asserções foram reescritas porque passavam
sem exercitar o caminho: uma testava a ausência de "R$" numa resposta que, por
construção, nunca teria preço; a outra nunca juntava "cliente sem cadastro" com
"citou um parente", que é a única combinação em que a supressão aparecia.

Um guard ficou marcado como **inerte**: o filtro que evita responder o preço de
outro serviço não é alcançável hoje — o portão de ambiguidade dispara antes. Ele
fica como segunda linha, com comentário dizendo isso, e não conta como cobertura.

### 9.4 O que continua aberto

- ~~**Forma de pagamento não tem fonte no contexto.**~~ Fechado pela § 10: o
  campo "Sobre o negócio" passou a ser essa fonte. Mensagem com várias perguntas
  continua respondendo uma pergunta por vez, por causa da regra 5 do prompt —
  isso é decisão de produto, não falta de dado.
- **Feriado** é oferecido como dia normal: não existe fonte de feriado no
  contexto. Operacionalmente, bloquear na agenda antes do dia.
- **Terceiro e menor de idade** continuam entrando na agenda como quem digitou; a
  API não tem campo de paciente. O que dá para fazer sem isso foi feito.
- **A pausa por transferência** segue sem avisar o dono (§ 3, Central de
  Atendimento).

---

## 10. O contexto da empresa: o que o dono escreve e a recepção responde

O pedido original era este: *"ela precisa entender o contexto da empresa, no caso
o assinante tem que preencher informações sobre a empresa pra IA poder ter esse
entendimento"*. Até aqui não existia caminho nenhum — e o sintoma era o pior
possível para o público-alvo: **"aceita convênio?", "tem estacionamento?", "o que
levo na primeira sessão?" recebiam sempre a mesma resposta de quem não sabe.**

### 10.1 O campo já existia; o fio é que estava cortado

`info_clinica.descricao` é coletada no onboarding desde sempre, é salva pelas
duas telas do painel e é devolvida pelo `GET /config/info-clinica`. O que ela não
era é **lida**: a view `v_clinica_detalhes` a excluía com um comentário explícito
— *"`mensagem_lembrete` e `descricao` ficam de fora: nenhum consumidor os lê"*.

Então não houve coluna nova, nem tela nova, nem campo novo no payload. O que
mudou:

| Ponta | Antes | Agora |
|---|---|---|
| Painel | rótulo "Descrição", exemplo "Em uma frase, o que o seu negócio faz", 500 caracteres, 3 linhas | rótulo "Sobre o negócio", exemplo com pagamento/convênio/estacionamento/o que levar, 2000 caracteres, 6 linhas |
| API (escrita) | `descricao` **sem teto nenhum** no servidor | `LIMITE_DESCRICAO = 2000` em `InfoClinicaCreate` e `InfoClinicaUpdate` |
| Banco | `descricao` fora da view | `v_clinica_detalhes` v3 expõe `clinica_descricao` |
| API (leitura) | `empresa` com 9 chaves | `empresa.descricao` na resposta de `/api/ai/contexto` |
| Fluxo | — | `montar contexto` higieniza e corta em 2000 |
| Prompt | — | bloco `<negocio>` dentro de `# Contexto`, e uma frase na regra 2 |
| Checklist | passo "Negócio" pronto com o **nome** | pronto com nome **e** o texto do negócio |

O teto de 500 era o obstáculo real: uma frase de apresentação **mais** forma de
pagamento, convênio e estacionamento não cabia — e o exemplo antigo ensinava o
assinante a escrever um slogan, não a operação.

E o campo continua **opcional**: sem o checklist apontando, ele nasceria morto,
porque está no primeiro passo e ninguém revisita o primeiro passo por conta
própria. O passo "Negócio" só fica pronto com os dois. **Isso não trava a
ativação**: `negocio` não está em `ITENS_PARA_ATIVAR`, e uma recepção sem esse
texto ainda consulta agenda, marca, remarca e cancela — ela só não sabe
responder o que está fora do catálogo. Travar quem já está pronto para atender
seria pior do que a lacuna.

### 10.2 A parte que quase passou em branco: o filtro engolia a resposta certa

Ligar o dado não bastava. `montar resposta` tem dois guards contra invenção da
IA — `precoInventado`, que barra qualquer valor fora do catálogo, e
`contatoInventado`, que barra link, domínio, sequência de 11+ dígitos e a
palavra `pix`. Eles existem por uma razão boa: **a IA não escolhe chave de
pagamento nem canal de contato.**

Com o campo ligado e sem mais nada, o resultado seria pior do que o silêncio: o
dono cadastra "aceitamos pix", o cliente pergunta, o modelo responde certo, e o
filtro troca a frase por *"esse tipo de informação eu prefiro não passar por
aqui"* — a recepção **negando o que a empresa faz**.

A regra que resolve é uma só, e é a mesma que o guard já usava para endereço e
telefone: **o que está escrito no cadastro não foi inventado pela IA.**

- `contatoInventado` passou a **tirar do texto o que o cadastro autoriza e rodar
  o exame de sempre no que sobrou**. Como efeito colateral desejável, o site do
  próprio negócio também passou a poder ser dito.

  A primeira versão disso conferia **achado por achado**, e era mais fraca do
  que o `test()` que substituía: o regex de domínio exigia espaço antes do
  rótulo, então `clinicaboa.com.br,promo-falsa.com` produzia **um** achado só —
  com o primeiro autorizado pelo cadastro, o segundo nunca era examinado. A
  forma que ficou tira do texto o que o cadastro autoriza e roda o exame no que
  sobrou; **o que o cadastro autoriza é o destino inteiro** (a URL completa, o
  domínio completo), nunca o marcador `https://` ou `www.` — ver § 10.4 e
  § 10.5, onde essa distinção custou duas rodadas.
- `precoInventado` passou a aceitar os valores escritos no cadastro. "Taxa de
  deslocamento R$ 30" não está no catálogo de serviços, mas foi o dono quem
  escreveu. Qualquer outro valor continua barrado.
- E abriu-se uma trava nova, `CHAVE_SUSPEITA`: sequência de 12+ caracteres que
  mistura letra e dígito, e que ninguém escreveu, é chave de pagamento ou token —
  nunca resposta. Fecha um buraco que já existia antes desta mudança:
  `chave f4a2c8d1e9b7` passava inteira desde que a frase não dissesse "pix".
  **A § 10.5 refez a forma dela**: a primeira versão só valia perto da palavra
  "pix" liberada pelo cadastro, e isso a deixava morta na maioria dos casos.
- E duas arestas do próprio texto: o sinal de maior e menor de **largura
  inteira** fecha o bloco aos olhos do modelo e não era retirado; e o corte em
  2000 podia cair no meio de um par surrogate e deixar meia letra no prompt —
  texto de dono termina em emoji com frequência.

### 10.3 O texto entra no prompt, então é fronteira

O valor é escrito por uma pessoa e vai para dentro do system prompt. Tratamento:

- **Tamanho na API** (`LIMITE_DESCRICAO`), porque o `zod` do painel não é
  fronteira: qualquer cliente HTTP fala direto com a rota. Sem teto, um texto
  grande empurraria o prompt inteiro para fora da janela do modelo e a recepção
  pararia de responder **para aquela empresa**.
- **Corte também no fluxo**, porque linha antiga foi gravada quando não havia
  teto nenhum.
- **Higienização na renderização**, em `montar contexto`: sem `<` `>` o texto não
  fecha o delimitador `<negocio>`; sem invisíveis e bidi não esconde instrução no
  meio da linha; sem dois-pontos de largura inteira não forja `assistente：`. É o
  mesmo tratamento do histórico, e pela mesma razão. A limpeza é na saída, e não
  na gravação, porque quem grava é o painel — devolver o texto mutilado no
  formulário do assinante seria pior do que limpar na renderização.
- **Ordem das seções**: o bloco fica dentro de `# Contexto`, **antes** de
  `# Regras`. O texto é do dono, mas não revoga a regra 6 (nunca ofereça
  horário) nem a 8.1 (crise) — e a seção que o modelo lê por último é a das
  regras.

Nove ataques foram escritos no campo e o prompt renderizado foi conferido um a
um: fechar o bloco (`</negocio>`), fechá-lo com o sinal de largura inteira,
forjar turno (`assistente:`), forjar com dois-pontos largo, esconder o rótulo com
caractere invisível, cerca de código, separador `---`, ordem direta, e cabeçalho
markdown. Em todos, **o bloco continua fechando uma vez só e as regras de verdade
continuam depois dele**. O único que sobrevivia com forma de comando era o
cabeçalho: `# Regras` escrito no cadastro criava uma segunda seção de regras
numeradas dentro do texto do dono. Agora vira item de lista — o conteúdo fica, a
marca de seção não. É a mesma classe do rótulo de papel, que o nó já
neutralizava.

E uma contradição que só apareceu **renderizando o prompt** com um cadastro de
verdade, e não olhando o template: a regra 3 dizia *"nunca diga que o negócio
não faz aquilo"*. Ela nasceu para impedir que a IA concluísse a ausência pelo
silêncio do contexto — mas a linha mais útil do cadastro de um fisioterapeuta ou
de uma psicóloga é justamente **"não atendemos convênio, mas damos recibo pro
reembolso"**. Do jeito que estava, a pergunta mais comum do público voltava ao
"não consegui confirmar" com a resposta escrita na frente do modelo. A regra 3
passou a separar os dois casos: continua proibido concluir pela ausência, e
passou a ser permitido dizer a negativa que o dono escreveu, com as palavras
dele.

### 10.4 A sétima revisão adversarial: 20 achados, e o pior era meu

Quatro lentes independentes (regressão, qualidade da verificação, qualidade da
conversa, segurança), 23 achados verificados um a um por um revisor adversarial
que tinha de **reproduzir na bancada**: 20 confirmados, 3 descartados. O padrão
das seis rodadas anteriores se repetiu — quase tudo o que apareceu tinha sido
introduzido pela própria correção.

**O pior deles foi uma "melhoria" que eu tinha feito uma hora antes.** Ao trocar
`contatoInventado` por um exame achado a achado, notei sozinho que a forma nova
era mais fraca que o `test()` que substituía e "endureci" com um regex de
domínio sem âncora. Esse regex passou a casar o domínio **dentro de um endereço
de e-mail**: toda resposta que repetisse o e-mail ditado pelo cliente virava
*"esse tipo de informação eu prefiro não passar por aqui"* — **inclusive nas
empresas que nunca escreveram nada no campo novo**. Uma correção defensiva,
verde na suíte inteira, quebrando o cadastro de e-mail de todo mundo.

Os grupos de causa, e o que ficou:

**1. O guard autorizava o marcador, não o destino.** `doCadastro('https://')` e
`doCadastro('www.')` são verdadeiros para qualquer dono que tenha qualquer link,
e o laço removia **todo** `www.` do texto — inclusive o do link inventado. Quem
tinha um Instagram no cadastro liberava qualquer URL que o modelo escrevesse.
Agora `CONTATO_PROIBIDO` captura a **URL inteira** e ela é comparada inteira;
domínio nu é comparado **com os domínios do cadastro**, e não por substring
(`lucianafisio.com.br` contém `fisio.com`, e por substring autorizava
`fisio.com/checkout`, que é outro site).

**2. `CHAVE_SUSPEITA` ligada sempre cobrava o preço de todo mundo.** Ela nasceu
como contrapeso de ter liberado a palavra "pix"; ligada incondicionalmente,
derrubava `AG-2026-0820-11` — o código de agendamento que o próprio comentário
do nó promete liberar. Voltou a valer só **colada** na palavra liberada. A
primeira tentativa de janela truncava o próprio token que procurava (20
caracteres não cabem uma chave de 12 depois de "na chave"), então o que decide é
o índice em que o token **começa**, não onde a janela termina.

**3. O valor do cadastro valia como preço de qualquer serviço.** Com "taxa de
R$ 30" escrito, *"a limpeza de pele custa R$ 30"* saía para o cliente. Numa
barbearia com a tabela de preços no campo — que é o caso de uso que a mudança
anuncia — qualquer preço valia para qualquer corte. O valor do cadastro passou a
entrar **só quando a conversa não resolveu um serviço do catálogo**.

**4. O número da rua derrubava a resposta certa.** "Quanto custa e onde fica" é
primeira mensagem comum; `semDadosDaEmpresa` tira o endereço por substring
exata e o modelo escreve "Bento Gonçalves, 1180" com vírgula. O 1180 virava
preço inventado.

**5. A higienização apagava informação e não neutralizava estrutura.** `<`
virando espaço transformava *"atendo a partir de <12 anos"* em "12 anos", que
diz o contrário — agora vira aspa angular, que não fecha o delimitador e não
mente. `U+2800` (braille em branco), `U+180E` e `U+3164` são espaço de mentira:
não casam `\s`, não estavam na lista de invisíveis, e `assistente⠀:` atravessava
inteiro. E `# Regras`, cerca de código e `---` sobreviviam: o texto do dono
conseguia **montar uma seção com a cara das nossas**. Cada linha do bloco passou
a entrar marcada com `| `, o que desarma os quatro de uma vez sem uma lista de
padrões para alguém manter.

**6. A proteção de um campo era contornável pelo campo do lado.** Só `descricao`
era higienizada; `nome`, `telefone`, `email` e `endereco` iam crus para o
**mesmo** prompt e conseguem escrever o fechamento do delimitador. Os quatro
passaram pela mesma limpeza.

**7. O público-alvo nunca chegava ao campo novo.** Cliente de fisioterapeuta não
escreve "tem estacionamento?" — escreve *"to com dor nas costas, o que levar na
primeira sessão?"*. A guarda de assunto sensível via a dor, não achava nada em
`ASSUNTO_NOSSO` e transferia, **com a resposta escrita no cadastro**. O
vocabulário de `ASSUNTO_NOSSO` passou a ser o mesmo que o placeholder do painel
pede ao dono. Por colocação, e não por verbo solto: `\blevar\b` faria *"isso
pode levar a uma lesão?"* virar assunto nosso, e essa é exatamente a pergunta que
tem de ir para uma pessoa. Conferindo isso apareceu um buraco anterior:
`RE_SENSIVEL` tem `dor|dores|doi|doendo` e **não tinha `doer`** — *"é normal doer
depois?"* nunca chegava à guarda.

**8. Quem não preencheu nada perdia a saída.** Estado de 100% dos assinantes no
dia do deploy. Com o campo vazio a regra 3 manda dizer que não conseguiu
confirmar e pedir "quero falar com uma pessoa" — e o guard de `AFIRMA_EFEITO`
casava "confirmada" nessa própria frase e trocava o texto por uma oferta de
horário, que muda de assunto e tira a única porta.

**9. O que era só documentação.** A dica do campo passou a dizer que qualquer
pessoa que escrever no WhatsApp pode receber aquele texto de volta — o autônomo
usa uma caixa de 6 linhas como bloco de notas, e o placeholder anterior não
avisava nada sobre nome de paciente.

Os **3 descartados**: a coluna da view *tem* verificação executável (foi este
diff que a acrescentou); a divergência entre `Pydantic` contando code points e
`.slice` contando unidades UTF-16 é conservadora por construção e nunca corta
mais do que devia; e a ausência de `CHECK` no banco descreve a arquitetura
escolhida, não um defeito.

### 10.5 A oitava revisão: parar de empilhar e separar as perguntas

A revisão das correções da § 10.4 confirmou **15 de 15** achados, nenhum
descartado — e o diagnóstico foi o mesmo em quase todos: eu estava resolvendo
**três perguntas diferentes com um mecanismo só** e, a cada correção, empilhando
mais uma âncora ou janela sobre o mecanismo errado.

O caso mais claro. Para impedir que a recepção barrasse o e-mail que o próprio
cliente acabara de ditar, eu tinha ancorado o regex de domínio para não casar
depois de `@`. A classe negativa incluía `.` — então nenhum **subdomínio**
passava a ser visto, e subdomínio é exatamente onde mora
`pagamento.golpe.com.br`. A mesma âncora esvaziava a lista de domínios do dono
quando ele cadastrava com `www.`, e aí o site dele era barrado. Uma linha,
três defeitos, todos com a suíte verde.

A reescrita separa as três perguntas, e cada uma fica óbvia:

1. **E-mail é destino como os outros.** Não sai do exame por âncora nem por
   subtração cega: é comparado como URL e domínio já eram. O do cliente e o do
   dono passam; `a chave é o e-mail pagamentos@…` continua barrado, que é a
   mesma fraude do link escrita com arroba.
2. **A palavra "pix" não é destino nenhum.** Barrá-la sozinha fazia a recepção
   recusar *"aceitamos pix, cartão e dinheiro"* em **toda** empresa que ainda não
   escreveu nada no campo — que no dia do deploy são todas. Ela saiu do guard;
   quem vê a chave é a varredura de sequência longa e a de 11+ dígitos. Com isso
   sumiram também a palavra liberável, a lista de liberadas e a janela de
   proximidade: máquina inteira que só existia para compensar essa decisão.
3. **Identificador se separa por origem, não por distância.** O código que o
   cliente citou e a recepção repete é leitura; o que ninguém deu é invenção.
   A janela de 20 caracteres nunca distinguiu os dois — o modelo escreve *"a
   chave nova é X"* tão naturalmente quanto *"na chave X"*.

O resto da rodada:

- **`doNegocio` voltou para a lista de preços reais.** Tirá-lo quando havia
  serviço de referência impedia a troca (*"a limpeza custa R$ 30"*) e junto a
  **soma** (*"a sessão é R$ 150 e a taxa de deslocamento é R$ 30"*), que é a
  resposta mais completa que o campo permite. O que separa as duas é **quantos
  valores distintos a frase tem**: um só, com o serviço resolvido, tem de ser o
  daquele serviço.
- **O número do endereço deixou de lavar preço.** Filtrar pelo valor em qualquer
  posição fazia *"a limpeza são 200"* passar em quem mora no número 200. Agora
  só vale em contexto de rua.
- **`laudo`, `atestado` e `receita` saíram de `RE_SENSIVEL`.** Estavam lá **e**
  em `ASSUNTO_NOSSO` ao mesmo tempo, e a contradição só ficou visível agora: o
  placeholder do campo pede "o que levar na primeira sessão", o dono escreve
  "traga exames e o laudo do médico", e a guarda clínica derrubava a resposta que
  veio do próprio cadastro. Papelada não é quadro clínico; diagnóstico continua
  proibido pela regra 4.
- **A ampliação de `ASSUNTO_NOSSO` virou colocação.** `desmarc\w*` e `remarc\w*`
  soltos capturavam a frase inteira: *"minha hérnia dói, remarcamos?"* deixava de
  ir para uma pessoa por causa da última palavra. O substantivo `cancelamento`
  ficou (nomeia a política); os verbos exigem o pedido explícito.
- **Apagar o texto no painel não apagava nada.** `model_dump(exclude_none=True)`
  descartava `descricao=None`: a tela dizia "salvo", o campo voltava vazio no
  formulário e o texto antigo continuava sendo respondido no WhatsApp — uma
  chave PIX que o dono acabou de decidir tirar do ar, inclusive. É o único campo
  que alguém pode querer **tirar do ar** depois de escrito.
- E dois pedaços de código morto foram removidos em vez de testados: o regex de
  domínio que exigia espaço antes do rótulo, e a limpeza do ponto solto, que só
  existia para compensar a âncora que saiu.

**Sobre os testes.** T131 virou uma matriz de 30 pares, cada linha com o seu
contrário. T132 media mal: usava um OR entre "foi para uma pessoa" e "o texto foi
barrado", e em 4 de 5 linhas quem satisfazia era a rota — desligar a guarda de
texto inteira deixava o teste verde. Agora as duas redes são medidas separadas,
e cada grupo nomeia qual delas tem de pegar: **núcleo da pergunta é o corpo** →
rota; **núcleo é operacional e a queixa vem como motivo** → a rota responde (é o
certo: o cliente pediu para desmarcar) e a guarda de texto impede que a resposta
fale do corpo dele.

### 10.6 A nona revisão: o que cada simplificação da § 10.5 tinha levado junto

14 achados confirmados, 1 descartado. A rodada 8 separou as perguntas, o que era
certo — e cada simplificação levou junto uma proteção que ninguém tinha medido.

- **Tirar `pix` do guard abriu a chave PIX de CNPJ.** Sem a palavra, a única
  rede que resta para uma chave feita só de dígitos é a varredura de 11+ — e a
  classe não tinha `/`, então `12.345.678/0001-95` partia em 8 e 7 dígitos.
  Uma barra na classe fecha. *(Tirar `pix` continua certo: com ele, "aceitamos
  pix, cartão e dinheiro" era recusado em toda empresa sem cadastro.)*
- **A exceção de origem estava valendo para destino de pagamento.** "O que o
  cliente escreveu não foi inventado" é certo para IDENTIFICADOR e errado para
  CHAVE: o golpe do PIX tem um passo em que a vítima cola a chave que recebeu por
  fora e pergunta ao negócio se é aquela — e a recepção respondia **endossando**.
  Agora a origem deixa de isentar quando a frase é sobre pagamento.
- **Tirar `laudo|atestado|receita` de `RE_SENSIVEL` desarmou junto
  `assunto_clinico`.** O falso positivo era real (a resposta que vem do cadastro,
  "traga exames e o laudo do médico", era engolida), mas quem a engolia era
  `reply_clinico`, que dispara sozinho. As três voltaram para a guarda e saem só
  do exame do **texto do modelo**: responder o que o cadastro diz sobre papelada
  é atendimento; opinar sobre ela é orientação clínica.
- **A regra do valor único não era uma aproximação, era um caso especial.** Ela
  sumia assim que a frase somava duas coisas — que é a construção mais comum de
  resposta de preço —, e aí os dois preços trocados passavam juntos. A pergunta
  certa é a inversa: *citou serviço do catálogo e **nenhum** número da frase é o
  preço dele?* Então é troca. Com o preço certo presente, o resto pode vir do
  cadastro, que é a soma legítima.
- **O gate de endereço exigia a palavra de logradouro colada ao número**, e
  "Rua Mariante 450, quase esquina com a Mostardeiro" já passa disso. Passou a
  valer a frase inteira, e a fonte de números inclui o texto livre — o dono
  escreve o endereço nos dois campos.
- **`AFIRMA_EFEITO` casava `marcad` solto** e matava *"atendemos só com hora
  marcada"*, que é a linha mais comum do campo novo. Efeito é o particípio sobre
  a agenda **deste** cliente, dito como fato; "hora marcada" é substantivo de
  política.
- **O site que o dono cadastrou "nu" era recusado** quando o modelo escrevia
  `https://…` — o mesmo destino, só com enfeite. Link sem caminho passou a ser
  reconhecido pelo domínio; com caminho, continua exigindo o texto inteiro.
- **`ASSUNTO_NOSSO` ficou estreito demais**: "vou ter que remarcar" e "queria
  desmarcar" são as formas mais comuns de quem avisa, e voltavam para a
  transferência de 12 h. E `reembolso` voltou — o campo pede essa informação e
  nenhuma pergunta sobre reembolso é sobre o corpo do cliente.

**E três achados eram sobre os testes, não sobre o código.** O grupo `DO_TEXTO`
do T132 usava uma reply com "lesão", que casa `RE_SENSIVEL`: quem barrava era
`reply_clinico` sozinho, e o grupo media a primeira rede de novo em vez da
segunda. Duas linhas novas do grupo `NOSSAS` não eram **perguntas** — e sem
pergunta a guarda de assunto sensível nem roda, então elas ficavam verdes por um
motivo que não era o do teste. E a metade de `veioDoCliente` que lê o histórico
não tinha asserção nenhuma.

**T132 foi renomeado.** Ele fica verde com o campo vazio — e isso não é defeito:
`resolver e decidir` nunca lê `empresa.descricao`, quem decide a rota é o
vocabulário da mensagem do cliente. O campo chegar ao prompt é o T130; os guards
não o engolirem é o T131. O nome antigo prometia o que ele não media.

### 10.7 A auditoria de estado: o agrupamento estava morto, e a fiação não tinha rede

Depois das três revisões, uma auditoria diferente — não do diff, mas do **estado
do fluxo inteiro**: mapear o caminho de uma mensagem, a rede de proteção e o
estado, e conferir a documentação contra o código. 18 pendências confirmadas.

**O defeito mais caro não estava em lista nenhuma, e era meu.** A correção de
privacidade da § 6 tirou o buffer de mensagens da lista do Redis e o pôs numa
chave `set` com TTL — o nó Redis do n8n só expõe expiração em `set` e `incr`,
nunca em `push`, e a lista guardava telefone, texto e base64 no `db1` por tempo
indeterminado. **A escrita foi reescrita; a leitura não.** `agrupar mensagens`
recebia a string do array inteiro e a tratava como um item só; o parse devolvia
um array, que não tem `msg_id`, e caía fora do filtro. A lista efetiva ficava
sempre vazia e a guarda "sou a última mensagem?" nunca disparava.

Na prática: quem escreve *"oi"* / *"quero marcar"* / *"limpeza de pele"* em três
balões — o jeito normal de usar WhatsApp — disparava três execuções, três
chamadas do modelo e três respostas, que podem se contradizer. Áudio seguido de
texto perdia o `midia_msg_id`, então a Evolution recebia o id do texto e devolvia
400: o áudio não era atendido. **Nove rodadas de prova por reversão não
alcançavam isso**, porque o único teste do agrupamento montava a lista à mão — na
forma que o fluxo tinha parado de gravar. O T134 agora grava pelo nó que grava e
lê pelo nó que lê.

**E a fiação não tinha rede nenhuma.** A prova por reversão deste projeto roda
sobre lógica de texto; qual saída do switch vai para qual nó não é lógica de
texto. Executei as mutações: trocar `cancelar` e `agendar` nas saídas de
`tipo da ação`, inverter o IF do dedupe de entrada, afrouxar o comparador,
inverter a trava da escrita, quebrar a forma da chave de eco — **quatro das cinco
deixavam as duas suítes verdes**. São invariantes de forma, então foram para o
validador:

- cada saída de `tipo da ação` tem de chegar no nó daquela ação (com as saídas
  trocadas, o corpo de agendar vai para `/cancelar`, a API recusa com 422 e o
  fluxo transfere — ninguém agenda errado, mas ninguém agenda);
- as duas travas de idempotência (`am:dedup` na entrada, `am:trava` na escrita)
  têm de comparar o `INCR` com o operador certo e encerrar no nó terminal;
- a chave de eco escrita depois de enviar e a lida quando a mensagem volta têm
  de concordar na forma — se divergirem, nenhum eco é reconhecido, a própria
  resposta do robô chega como se o dono tivesse digitado e **a IA se pausa
  sozinha por 30 minutos em toda conversa**.

**Duas lacunas de cobertura fecharam junto.** `/api/ai/agendamentos/buscar` — a
rota que abre todo cancelamento e reagendamento — era a única de `/api/ai/*` sem
asserção de isolamento; os 12 testes que existiam eram todos do lado de quem lê o
que ela devolveu. E `dividir resposta`, que decide o que o cliente **realmente**
recebe, era o último nó Code sem teste.

**Sete frases da documentação descreviam mecânica revogada** pelas rodadas 8 e 9
— entre elas a linha do T131 na matriz de testes, que teria feito o homologador
abrir um bug em cima de uma correção. Corrigidas, com as contagens conferidas por
script em vez de memória.

### 10.8 A verificação

`T130` atravessa a cadeia inteira a partir do envelope real de
`/api/ai/contexto` — um teste que montasse `empresa.descricao` à mão provaria só
que o objeto do teste tem a chave. `T131` compara, na mesma conversa, o caso com
cadastro e o caso sem: sem essa segunda metade, o teste passaria mesmo se o guard
tivesse sido simplesmente desligado.

**51 reversões, todas vermelhas** — 43 no fluxo, 7 na API e 1 no painel, mais
**5 mutações de fiação** pegas pelo validador (quatro delas deixavam as duas
suítes verdes). A única
mudança sem prova por reversão é a coluna da view: o teste de contrato
(`test_view_de_atendimento_cumpre_o_contrato`) só roda com `DATABASE_URL`
configurada, então ele entra na homologação, não aqui.

Três reversões não ficaram vermelhas na primeira tentativa, e cada uma ensinou
alguma coisa: duas apontavam código que tinha virado morto — removido em vez de
testado — e a terceira mostrou que o caso escolhido não era uma **pergunta**, e
sem pergunta a guarda de assunto sensível nem roda: o teste media outra coisa.

### 10.9 O que continua de fora

- **`procedimento.orientacoes`** ("o que levar na primeira sessão", por serviço)
  existe no banco, é preenchido no painel e continua fora da view. Dez serviços
  com 500 caracteres cada dobrariam o prompt; o campo "Sobre o negócio" cobre o
  caso do autônomo, que é a persona principal. Entra quando houver uma forma de
  incluir só o serviço da conversa.
- **Feriado e exceção de data** continuam sem fonte: `agenda_bloqueio` é por
  profissional e não aparece na view.
- **Terceiro e menor de idade** continuam entrando na agenda como quem digitou.
- **A guarda clínica é de sintoma, não de anatomia.** *"O que eu tenho no
  joelho?"* não casa nada em `RE_SENSIVEL` e é respondida. Encontrado ao conferir
  a ampliação de `ASSUNTO_NOSSO`; ampliar para partes do corpo é decisão de
  vocabulário que muda o comportamento do fluxo inteiro, e não cabia nesta rodada.
- **`precoInventado` confere se o número existe, não a que ele pertence.** Com a
  tabela de preços no campo e nenhum serviço resolvido na conversa, qualquer
  valor da tabela é aceito. Com o serviço resolvido, a pergunta inversa da
  § 10.6 fecha a troca — mas dois serviços citados com os preços trocados entre
  si continuam passando, porque um deles é o preço certo de *algum* dos dois.
  Parear valor com assunto pede um parser de frase.
- **`AFIRMA_CLINICO` é lista de frases.** "Cobre sim, esse atestado vale para o
  seu caso" não casa nenhuma delas e sai. A lista pega as formas afirmativas que
  uma recepção escreve de verdade; fechar o resto exige classificar a frase, não
  enumerá-la. Anotado no próprio T132.
- **O texto "Sobre o negócio" não alcança nenhuma resposta determinística.** Ele
  entra no prompt e vale para conversa; no momento em que uma escrita real
  acontece — confirmar um agendamento, cancelar, oferecer horário — os textos são
  fixos e não leem o cadastro. Na prática: a recepção confirma um cancelamento em
  cima da hora sem citar a multa que o dono cadastrou, e oferece horário em dia
  que o texto do dono diz que ele não atende. É a maior lacuna aberta da feature
  e é decisão de produto: cada texto determinístico que passar a citar o cadastro
  precisa decidir o que fazer quando o cadastro contradiz a agenda.
- **Pergunta que anda junto de um pedido de horário desaparece.** "Tem sexta? e
  aceita convênio?" responde só o horário. A regra 5 do prompt manda uma pergunta
  por resposta, e a rota de disponibilidade só deixa passar preço e duração.
- **Não há triagem de emergência clínica.** "Estou com dor no peito, posso
  remarcar?" é respondida como pedido de remarcação, com a guarda de texto
  impedindo qualquer palavra sobre o quadro. A única guarda que interrompe o
  atendimento por conteúdo é a de crise (regra 8.1: suicídio, autolesão,
  violência). Sintoma de urgência é teto conhecido e está anotado no T132.

---

## 11. Validação executada

Rodada em 2026-09-07, neste repositório, na branch `fix/automacao-homologacao`,
**depois do contexto da empresa (§ 10)**.

```
node automation/n8n/tests/test_regras.mjs
  157/157 testes passaram        (T01 a T135, E01 a E20)
  T131 sozinho traz 39 pares; T132, 11 + 6 + 5 + 3

node --test apps/dashboard/tests/
  36/36 testes passaram

python automation/n8n/validar_workflow.py
  OK: AgendaMagnetica-v2.n8n.json passou em todas as verificações

services/api/.venv/Scripts/python -m pytest services/api/tests -q
  172 passed, 25 skipped, 50 warnings, 30 errors

npm run lint && npm run build
  eslint sem apontamento; dashboard e site compilam
```

A suíte cresceu **durante** esta atualização: 84/84 na primeira execução do dia,
107/107 na segunda rodada, 119/119 na terceira, 134/134 na quarta, 144/144 na
quinta, 151/151 na sexta, 153/153 com o contexto da empresa, 155/155 depois das
revisões da § 10 e 156/156 com o agrupamento de rajada (§ 10.9). Se o número que você medir for maior, é porque a suíte continuou
crescendo — não porque este documento está errado.

**Verde aqui não quer dizer pouco risco.** A primeira revisão adversarial
encontrou 19 bloqueios com as 41 asserções da época todas passando, porque
nenhuma delas cruzava dois nós; a segunda encontrou mais 17 com 107 passando; a
terceira encontrou o defeito mais caro do produto (§ 7.1) com 119 passando,
porque nenhuma asserção lia uma conversa inteira; a quarta encontrou três
agendamentos errados com 134 passando, porque o catálogo da fixture tinha duas
palavras que não colidem; a sétima encontrou 20 com 153 passando, e o mais grave
deles — toda resposta com e-mail sendo barrada, para todo assinante — tinha
entrado no repositório como *endurecimento defensivo* meia hora antes; a oitava
encontrou 15 com 155 passando, e a correção da sétima para aquele mesmo defeito
tinha aberto três outros na mesma linha. A suíte protege contra a volta de uma regressão
conhecida, não contra a próxima — e cada rodada mostrou que a fixture importa
tanto quanto a asserção.

**Os 30 erros são pré-existentes e não têm relação com esta mudança.** Todos
estão em `services/api/tests/test_schema_compatibilidade.py` e todos são erro de
*setup*, não de asserção: a fixture `cur` tenta abrir conexão com o banco e
recebe `psycopg2.OperationalError ... FATAL: (ENOTFOUND) tenant/user ... not
found` do pooler do Supabase. São testes que comparam os modelos da API com o
schema real e só rodam com o banco alcançável.

Esta rodada **toca** esse arquivo e o schema, ao contrário das anteriores:
`CONTRATO_VIEW` ganhou `clinica_descricao` e `scripts/v_clinica_detalhes.sql`
subiu para a v3. As duas mudanças só são exercitadas com `DATABASE_URL`
configurada — então elas entram na homologação, e não nesta lista. Rodar
`scripts/v_clinica_detalhes.sql` é pré-requisito do contexto da empresa: sem
ele, `/api/ai/contexto` devolve `descricao: null` e a recepção continua sem
saber responder o que não está no catálogo. É `create or replace view`, sem
migração de tabela, e pode rodar com a automação no ar.

Sobre a numeração dos casos: a matriz de `TESTES_AUTOMACAO_V2.md` segue os ids
do **arquivo de teste**, que é a fonte executável — e não o contrário. Uma versão
intermediária desta documentação numerou os casos de setembro de `T34` a `T47`
com outro conteúdo; se você encontrar essa numeração em algum lugar, ela está
velha. O intervalo válido é o que o `test_regras.mjs` imprime.
