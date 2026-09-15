# Automação de atendimento — homologação

> **Revisão de 14/09/2026:** corrigida a leitura da ação pendente e a execução
> da confirmação de presença. Redação separada e memória duradoura implementadas
> no repositório, com testes locais. Instalação e avaliação com modelos reais
> continuam pendentes. Veja a
> [revisão do atendimento com IA](../../docs/planning/REVISAO_ATENDIMENTO_IA_2026-09-14.md).

> **Infraestrutura:** o n8n já está no ar, em queue mode, com o webhook em
> processo separado. Antes de importar o fluxo ou configurar credencial, leia
> [`docs/INFRA-VPS.md`](../../docs/INFRA-VPS.md) — em especial que a credencial
> Redis precisa apontar para o **banco 1** (o banco 0 é a fila interna do n8n).

Cinco arquivos convivem nesta pasta:

| Arquivo | Papel |
| --- | --- |
| `AgendaMagnetica-v2.n8n.json` | **versão canônica** (Atendimento V2, 97 nós). Importe esta. |
| `AgendaMagnetica-erro.n8n.json` | workflow de erro (Error Trigger → alerta ao operador). Importe junto e cole o id dele em `settings.errorWorkflow` da V2. |
| `AgendaMagnetica-lembrete.n8n.json` | lembrete de confirmação na véspera (Schedule Trigger, 9 nós). Importe só quando for usar o lembrete. |
| `AgendaMagnetica-memoria.n8n.json` | consolidação de memória a cada 5 minutos (4 nós). Depende da migração e da chave OpenAI no backend. |
| `AgendaMagnetica.n8n.json` | **histórico**. Não é rollback e não roda: usa `$env` (bloqueado na VPS) e credencial Supabase. Não reimporte. |

Os cinco estão **inativos** (`active: false`) e continuam assim até a homologação
terminar. Nenhum deles deve ser ativado sem autorização explícita. Para desligar
o atendimento depois de ativo, veja "Rollback" mais abaixo — não é o JSON antigo.

## O que a V2 faz

A automação é a recepção do negócio no WhatsApp: entende o que o cliente quer,
responde dúvidas com o cadastro da empresa, mostra horários reais, e só marca,
remarca ou cancela depois de uma confirmação explícita.

Fluxo principal, sempre nesta ordem:

1. `Webhook` autenticado por header recebe o evento da Evolution API.
2. `normalizar entrada` desembrulha envelope (efêmera, visualização única,
   documento com legenda), resolve o telefone mesmo em `remoteJid` `@lid`,
   descarta reentrega com mais de 30 min e separa mensagem do cliente, mensagem
   do próprio negócio e evento a descartar.
3. `Redis - marcar mensagem` faz idempotência por id da mensagem (`INCR` + TTL de
   24 h): a mesma mensagem nunca gera duas operações.
4. Mensagem com `fromMe` passa por `Redis - envio próprio?` e
   `foi o próprio envio?` **antes** de pausar a IA. A Evolution reemite como
   `messages.upsert` a resposta que o próprio fluxo mandou; sem esse filtro o bot
   se autopausava por 30 min depois de cada resposta. Eco encerra em
   `fim - eco do próprio envio`; digitação real do dono pausa a IA. Reação,
   figurinha e mensagem de protocolo (apagada, editada) do dono são descartadas
   antes disso: não têm conteúdo, e pausar a IA por 30 min porque o dono mandou
   um emoji é errado. Vídeo, PDF, localização e cartão de contato do dono
   **pausam** — isso é intervenção humana de verdade.
5. `Redis - atendimento humano ativo?` interrompe a IA quando uma pessoa assumiu.
6. Buffer de 8 segundos agrupa mensagens seguidas do mesmo contato. Item fora da
   janela de 60 s é descartado: buffer órfão de ontem não entra na conversa de hoje.
7. Mídia é **buscada na Evolution** por `buscar áudio` / `buscar imagem`
   (`POST /chat/getBase64FromMediaMessage/{instancia}`) e só então `transcrever
   áudio` / `analisar imagem` rodam. O webhook é registrado com base64
   desligado, então sem essa busca todo áudio chegava vazio. Três detalhes que
   decidem se isso funciona:
   - O id pedido é o **da mensagem que carrega a mídia** (`midia_msg_id`, de
     `agrupar mensagens`), não o da última mensagem do buffer. Quem manda um
     áudio e emenda um texto agrupava os dois, e o fluxo pedia o arquivo do
     texto: 400 em todo áudio seguido de comentário.
   - Timeout de **10 s e sem repetição**. Quando o download falha, a Evolution
     ainda dorme 5 s antes de tentar de novo por dentro; com repetição, o
     cliente ficava perto de um minuto olhando para a tela antes de ler
     qualquer coisa. Quem não devolveu em 10 s não vai devolver.
   - `converter áudio` e `converter imagem` também degradam (`onError`). Sem
     isso, base64 vazio fazia o conversor lançar e a execução morrer: o cliente
     não recebia nada e a IA nem pausava.

   Mídia que não vem responde "Não consegui ouvir seu áudio por aqui. Pode me
   escrever, por favor?" — não vira "não entendi".
8. `contexto da empresa` chama `POST /api/ai/contexto`: a empresa é derivada da
   instância **no servidor**, o cliente é localizado ou criado dentro dela e o
   catálogo agendável vem junto. Nada disso passa pela IA nem pelo banco.
9. `IA interpretadora` usa um modelo econômico e devolve saída estruturada.
   O contexto inclui preferências declaradas e visitas anteriores por serviço.
10. `validar interpretação` valida fora da IA: enum fechado, tipos coeridos,
    `next_action` recalculado pelo sistema e `handoff_reason` preso a um enum de
    cinco valores. Erro de infraestrutura da OpenAI (timeout, 5xx, cota) sai
    como `falha_ia`.
11. `resolver e decidir` aplica as regras. **Crise, pedido do titular e
    contraindicação clínica são decididos antes do portão da IA**, porque leem
    só o texto do cliente e nunca a interpretação. Depois do portão, uma queda
    da OpenAI desligava as três: "não quero mais viver" recebia "pode mandar de
    novo", sem CVV, sem pausa e sem pessoa — e é justamente conteúdo de crise
    que mais faz o provedor recusar, então o gatilho da falha e o gatilho da
    guarda coincidem. Só depois vêm serviço, profissional, data, fuso, limiar
    de confiança e ação pendente, e daí sai o corpo exato de cada chamada.
    `falha_ia` pede a mensagem de novo apenas quando nenhuma das três guardas
    disparou.
12. Os nós HTTP executam a operação em `/api/ai/*` com token de automação.
13. `montar resposta` monta o texto de reserva; `redigir resposta` chama a API
    com redação de qualidade e revisão semântica. `aplicar redação` conserva os
    parágrafos e usa a reserva se houver falha. A Evolution envia, o Redis marca
    o eco e o histórico final só é salvo depois de concluídos os envios.
14. `registrar decisão` monta o registro e `Redis - registrar auditoria`
    persiste em `am:auditoria:{instancia}:{msg_id}` por 30 dias. Com
    `saveDataSuccessExecution: none`, essa chave é a **única** evidência do que
    a IA decidiu num atendimento que deu certo.

Falha ao enviar pela Evolution não termina "com sucesso": `evo enviar mensagem`
tem `continueErrorOutput`, a saída de erro pausa a IA por 30 min
(`Redis - pausar IA (falha no envio)`) e `fim - falha no envio` **lança**. Sem
isso, um agendamento criado nesta execução ficava de pé com o cliente sem saber
e sem rastro no histórico.

Contagem de IA: **até 3 chamadas** no atendimento normal: interpretação,
redação e revisão semântica. Redação/revisão compartilham limite de 24 s, sem
repetição; falha usa a reserva, sem repetir a operação da agenda. Áudio ou imagem
somam uma chamada. Correção do interpretador pode somar outra. A memória usa
extração e revisão econômicas em segundo plano, até três clientes por rodada.

## Instalar redação e memória

1. Aplicar `scripts/memoria_atendimento.sql` depois de `chat_atendimento.sql` e
   dos ajustes de onboarding (a coluna `automacao_ativa` precisa existir).
2. Publicar o backend com `ai_language.py` e `ai_memory.py`. Configurar
   `OPENAI_API_KEY` no ambiente do backend, além do token de automação já usado.
   Não colar chaves no JSON do workflow. Os padrões estão em `.env.example`:
   `AI_WRITER_MODEL=gpt-5.4`, `AI_MEMORY_MODEL=gpt-5-mini-2025-08-07` e
   `AI_REVIEW_MODEL=gpt-5-mini-2025-08-07`. Sem chave, o texto de reserva funciona
   e o worker sinaliza `modelo_nao_configurado`; a memória não é consolidada.
3. Importar a V2 atualizada e `AgendaMagnetica-memoria.n8n.json`, selecionar a
   credencial do token da automação e vincular o workflow de erro nos dois.
   Confirmar a URL da API no nó `bases` do worker. Os JSONs saem inativos.
4. Homologar a retomada do corte com Gustavo, a troca para outra pessoa, a
   preferência de período e o agendamento visível no painel. Forçar falha do
   redator depois da gravação e conferir uma única reserva. Avaliar a redação
   real em português e acompanhar `redacao`/`motivo_redacao` na auditoria.
5. Ativar os fluxos após a homologação e autorização de publicação.

A fila é criada na transação da mensagem. Encerramento de uma operação ou
preferência explícita antecipa a próxima rodada; o restante espera 30 minutos de
inatividade. Preferências são consolidadas até a próxima rodada, não por uma
escrita síncrona a cada mensagem. A fala atual continua tendo prioridade.

`POST /api/ai/memoria/apagar` recebe `instance_name` e `telefone`, autenticados
pelo token de automação. Apaga o perfil e impede reaprendizado do histórico já
processável; preserva o histórico do chat e a agenda. Pedidos do titular no
WhatsApp continuam encaminhados à recepção humana. Não há nova tela de memória.

## A automação não fala com o banco

Toda leitura e escrita de agenda passa por `/api/ai/*`, no backend. O n8n não
tem `SUPABASE_SERVICE_ROLE_KEY`, não monta filtro de URL e não conhece id de
empresa nem de cliente — nenhuma rota da API aceita esses parâmetros.

| Nó | Rota |
| --- | --- |
| `contexto da empresa` | `POST /api/ai/contexto` |
| `buscar horários` | `POST /api/ai/disponibilidade` |
| `consultas do cliente` | `POST /api/ai/agendamentos/buscar` |
| `criar consulta` | `POST /api/ai/agendamentos` |
| `reagendar consulta` | `POST /api/ai/agendamentos/reagendar` |
| `cancelar consulta` | `POST /api/ai/agendamentos/cancelar` |
| `confirmar consulta` | `POST /api/ai/agendamentos/confirmar` |
| `atualizar cadastro` | `POST /api/ai/cliente` |
| `repetir escrita` | repete o pedido anterior, com o mesmo corpo |

O contrato completo está em `docs/planning/BACKEND_AI_API_HANDOFF.md`.

Todas as chamadas respondem no mesmo envelope:

```json
{ "ok": true,  "data": { }, "error": null }
{ "ok": false, "data": null, "error": { "code": "...", "message": "...", "retryable": false } }
```

Os nós HTTP estão configurados para **continuar em erro HTTP** e ler o corpo:
a API devolve 4xx e 5xx com envelope, e é o corpo — não o status — que decide a
rota. `verificar resultado` traduz cada código:

| Resposta | O que o fluxo faz |
| --- | --- |
| `ok: true` com `data.agendamento.id` | confirma ao cliente (`repetida: true` também é sucesso) |
| `HORARIO_INDISPONIVEL`, `CONFLITO_HORARIO` | reoferta horários, sem chamar uma pessoa |
| `PROCEDIMENTO_INVALIDO`, `PROFISSIONAL_INVALIDO` | reoferta o catálogo |
| `CONSULTA_NAO_ENCONTRADA`, `CONSULTA_NAO_REAGENDAVEL`, `CONSULTA_NAO_CANCELAVEL` | oferece listar os horários de novo |
| `FALHA_TEMPORARIA` (`retryable: true`) | repete **uma** vez com o mesmo pedido; persistindo, chama uma pessoa |
| qualquer outro código, ou resposta sem envelope | para, chama uma pessoa e **nunca** anuncia sucesso |

`CONSULTA_NAO_CANCELAVEL` trocou de linha nesta rodada. Ele é o que a API
responde quando a consulta já foi concluída, e antes caía no "qualquer outro
código": o cliente que tentava cancelar um horário de ontem ouvia "problema no
sistema" e a IA ficava pausada por uma hora. Consulta que já aconteceu não é
defeito — agora vira `consulta_nao_encontrada`, o fluxo lista de novo e a IA
continua atendendo.

### `contexto da empresa` é o único que pode encerrar calado — e só às vezes

`POST /api/ai/contexto` acontece antes de a IA existir na conversa, então não há
resposta a montar quando ele falha. Mas nem todo `ok: false` é igual, e tratar
os dois iguais foi o que fez uma mensagem de teste sumir sem rastro:

| `error.code` | O que o fluxo faz |
| --- | --- |
| `AUTOMACAO_DESATIVADA`, `INSTANCIA_DESCONHECIDA`, `EMPRESA_NAO_CONFIGURADA` | encerra **calado** — é a empresa dizendo não, não é defeito |
| qualquer outro código, ou resposta sem envelope | `fim - contexto indisponível` **lança erro**: a execução fica salva e visível |

A diferença importa por causa de `saveDataSuccessExecution: none`: execução que
termina bem não é guardada. Sem lançar, um `AUTOMACAO_INDISPONIVEL` (token
ausente na Vercel) some do histórico e o sintoma é "o bot não respondeu".

Falha de rede ou URL inválida também não é engolida: `contexto da empresa` é o
único nó de agenda **sem** `onError` — `neverError` já entrega o envelope de
4xx/5xx, que é o caso legítimo.

## O profissional de sempre

`/api/ai/contexto` devolve, junto do cliente, `profissional_habitual` — o
profissional que aquela pessoa costuma escolher. Sai da view
`v_cliente_preferencias`, que deduz do histórico: consultas não canceladas dos
últimos 12 meses, mínimo de 2 e ao menos 60% com a mesma pessoa. **Não é
preferência declarada** — ninguém cadastra isso; é observação, e some sozinha
quando o hábito muda.

`montar contexto` confere o habitual contra o catálogo vigente antes de pôr no
prompt: profissional que saiu entre a dedução e a conversa viraria nome de gente
que não atende mais, e o pedido de horário voltaria vazio depois de a recepção
já ter prometido a pessoa.

`resolver e decidir` usa o habitual **em um ponto só**: onde a conversa pararia
para perguntar "com quem?". Fora dali o hábito não se aplica — numa empresa que
não exige escolher profissional, fixar alguém estreitaria a agenda e faria a
pessoa ouvir "sem horário" por uma preferência que ela nunca declarou. Quem diz
um nome na hora, e quem está remarcando, continuam mandando.

O prompt também recebe `dia_semana_local`. Antes ia só um ISO e o modelo tinha
de deduzir sozinho se amanhã era sábado.

## O chat no painel

Duas chaves do Redis já faziam a recepção se calar quando o dono respondia pelo
celular. O chat usa **o mesmo mecanismo**, sem inventar outro: a mensagem
escrita no painel sai pela Evolution, volta pelo webhook como `fromMe` e, por
**não** existir `am:enviada` para ela, o fluxo a lê como "o negócio respondeu" e
pausa a IA por 30 minutos. Isso é o comportamento desejado, e é a razão de o
envio do painel sair pelo backend e não pelo n8n.

**A armadilha, escrita aqui para não se repetir:** quem for evitar a mensagem
duplicada na tela vai querer reusar `am:enviada`. Se gravar, a IA para de se
calar e passa a responder por cima do dono, sem erro e sem aviso. O dedupe de
tela é a chave única `(conversa, id do provedor)` na tabela `mensagem` — nunca a
chave do Redis.

Dois nós novos gravam o histórico, **em paralelo** ao caminho de responder: um
depois de `conteudo do cliente` (onde o áudio já está transcrito e a rajada já
foi juntada, ou seja, exatamente o que a recepção leu) e outro na saída de
sucesso de `evo enviar mensagem`. Os dois seguem adiante em erro: histórico não
derruba atendimento. O validador guarda as duas coisas — que os ramos são
paralelos e que a resposta da recepção entra como autor `ia`, nunca `painel`.

### Devolver a conversa para a recepção

O botão existe, e resolve um problema de rede: o backend na Vercel **não
alcança** o Redis da VPS, que fica em rede interna. Então ele não apaga a chave
`am:handoff` — grava `conversa.ia_liberada_em` no banco.

Quem decide é o fluxo, em dois nós novos no ramo da pausa: quando `am:handoff`
existe, `a pausa ainda vale?` chama `/api/ai/handoff/valido` levando o instante
em que a pausa começou, e a API responde comparando com a devolução. A regra é
uma só e mora lá:

    ainda pausado  ⇔  não existe devolução posterior ao início da pausa

Uma devolução antiga **não** libera uma pausa nova: sem comparar os instantes,
um clique valeria para sempre e a IA passaria por cima do dono em toda pausa
seguinte. Se a API não responder, a conversa continua com a pessoa — no máximo
a pausa expira sozinha em 30 minutos.

**O que o chat não faz:** não mostra conversa anterior à ativação (o histórico do
WhatsApp nunca esteve no nosso banco) e não envia áudio nem imagem.

## O lembrete de véspera

Fluxo **separado** (`AgendaMagnetica-lembrete.n8n.json`): um Schedule Trigger a
cada 15 minutos, nove nós, e nenhum toque nos 89 da V2. Os únicos pontos de
contato são duas chaves do Redis.

O dono liga em Configurações escolhendo a antecedência (12 h, 1, 2 ou 3 dias).
"Não enviar" é o padrão — lembrete que ninguém pediu chega como mensagem não
solicitada para o cliente dele. O valor mora em `info_clinica.lembrete_horas`;
nulo desliga.

`POST /api/ai/lembretes/pendentes` **pega e marca no mesmo comando**. Entre
listar e marcar cabe outra passada do relógio, e o resultado seria o mesmo
cliente recebendo o lembrete duas vezes — por isso a marca está dentro de
`fn_claim_lembretes`, com `for update skip locked`, e não em duas chamadas.

**A regra que não pode ser esquecida:** o lembrete grava `am:enviada` com o id
que a Evolution devolve. Sem ela, o próprio lembrete volta pelo webhook como
`fromMe`, `normalizar entrada` o lê como "o negócio respondeu", grava
`am:handoff` e **pausa a IA por 30 minutos** — o "confirmo" do cliente morre em
`fim - pessoa está atendendo`, sem sintoma nenhum. O validador guarda essa
ligação; quatro mutações de fiação foram usadas para prová-la, e três delas
deixavam a suíte de conversa verde.

A pendência gravada carrega `origem: 'lembrete'`. `resolver e decidir` isenta
essa pendência da guarda de "o último turno falou dela": quem anunciou foi a
mensagem da véspera, e a resposta chega no dia seguinte, quando `am:estado`
(6 h) já expirou.

**Credenciais do fluxo de lembrete:** a mesma do token da automação (`buscar
lembretes`), a da Evolution (`evo enviar lembrete`) e a do Redis **db1** (os
dois nós Redis). Cole também o id do fluxo de erro em
`settings.errorWorkflow` dele.

**O nono dígito, resolvido:** o telefone do cadastro e o que o WhatsApp entrega
podem diferir no nono dígito, e montar a chave `am:pendente` a partir do cadastro
faria o "sim" do cliente não achar a pendência. A chave sai do `key.remoteJid`
que a Evolution devolve no envio — o endereço por onde a mensagem realmente saiu
é o mesmo por onde a resposta volta. O JID montado do cadastro fica só como
reserva, para o caso de a Evolution não devolver a chave. O validador guarda
isso.

## Confirmação antes de qualquer escrita

Agendar, reagendar e cancelar passam por uma **ação pendente** guardada pelo
sistema no Redis:

```
am:pendente:{instancia}:{telefone}   TTL 30 min (o mesmo da expiração lógica)
```

A ação guarda tipo, horário, serviço, profissional, consulta e validade. O
cliente confirma; o sistema executa exatamente aquela ação; a chave é apagada.
Um "sim" sem ação pendente válida não cria, não altera e não cancela nada.

`montar contexto` lê a pendência pela referência explícita ao nó
`Redis - ler ação pendente`. O GET seguinte, `Redis - ler estado`, devolve
somente `{ estado }`, sem preservar a pendência na entrada. Ler ambos de
`$input` fazia a confirmação perder a ação antes de chegar à API. T147 reproduz
as duas saídas separadas, incluindo pendência ausente ou corrompida.

A confirmação de presença do lembrete tem saída própria em `tipo da ação`,
ligada a `confirmar consulta`. Ela usa `/api/ai/agendamentos/confirmar` e o mesmo
caminho de repetição e verificação das demais operações. T148 cobre as quatro
rotas completas até URL e corpo HTTP. Ao importar, selecione nesse novo nó a
credencial Header Auth `Agenda Magnetica - token da automacao`.

No WhatsApp o cliente lê no ônibus e responde depois: com 10 min, quem voltava
em 20 ouvia "esse horário já expirou" sobre um horário que ninguém tinha pegado.
Alongar não duplica agendamento — a API revalida na escrita e devolve
`CONFLITO_HORARIO`, que o fluxo trata como `horario_ocupado` com reoferta.

O TTL do Redis e a validade lógica eram 20 e 10 min. Nos 10 minutos do meio a
chave existia mas já estava vencida, e todo "sim" ouvia "esse horário já
expirou" sem que nada limpasse a pendência. Agora os dois valem 30 min **e** a
pendência vencida é apagada no mesmo turno (rota `descartar_pendente`), então o
turno seguinte começa limpo.

Escolha nova vence pendência velha: se o cliente responder com um horário
diferente do que está pendente ("não, o das 16"), o fluxo segue o horário novo
em vez de confirmar o antigo. Sem isso, "o das 10" depois de uma segunda oferta
marcava o dia errado.

**Oferta nova invalida pendência antiga.** Nem toda oferta gera pendência: dois
horários e "esse não está livre" só perguntam. A pendência anterior continuava
viva no Redis por até 30 min, e um "sim" seco marcava exatamente o horário que
o cliente acabou de recusar — resposta a uma pergunta que o fluxo não fez de
novo. Hoje, se há horários no estado e nenhum deles bate com a pendência, a
pendência está obsoleta e não é executada.

**Descartar a pendência não encerra o assunto.** `descartar_pendente` apaga só a
ação aguardando confirmação. Serviço já escolhido, horários oferecidos e
`reagendar_consulta_id` continuam no estado: quem recusa uma oferta ("não, tem
mais cedo?") não precisa repetir o serviço, e uma remarcação em curso não vira
agendamento novo — o que deixava o cliente com **duas** consultas. Só a rota
`humano` encerra o assunto e zera o estado.

Quem revalida o horário é a **API**, com a função do banco, imediatamente antes
de gravar — e ela relê o registro antes de responder `ok: true`. O fluxo não
repete essa consulta.

O `acao_id` da pendência vira a `chave_idempotencia` da criação: repetir a mesma
ação devolve o mesmo agendamento em vez de criar um segundo. Reagendar e
cancelar são idempotentes por estado e não aceitam chave.

`Redis - trava da ação` garante execução única por ação. `verificar resultado`
só anuncia sucesso com `ok: true` **e** `data.agendamento.id`; sem isso a
conversa vai para uma pessoa e nada é afirmado ao cliente.

## Chaves do Redis

| Chave | Uso | TTL |
| --- | --- | --- |
| `am:dedup:{instancia}:{msg_id}` | idempotência da mensagem | 24 h |
| `am:enviada:{instancia}:{msg_id}` | id que o fluxo acabou de enviar, para reconhecer o eco da Evolution | 5 min |
| `am:handoff:{instancia}:{telefone}` | IA pausada (pessoa atendendo) | 30 min (negócio respondeu ou falha no envio), 1 h (falha de escrita, interpretação inválida, contexto incompleto) ou 12 h (ver tabela abaixo) |
| `am:buffer:{instancia}:{telefone}` | agrupamento de mensagens | **sem TTL** — apagada ao processar (item fora da janela de 60 s é ignorado). Ver "Limitações conhecidas" |
| `am:pendente:{instancia}:{telefone}` | ação aguardando confirmação | 30 min |
| `am:estado:{instancia}:{telefone}` | últimas 6 mensagens, horários oferecidos | 6 h |
| `am:trava:{instancia}:{acao_id}` | execução única da ação | 5 min |
| `am:auditoria:{instancia}:{msg_id}` | o que a IA decidiu no atendimento respondido | 30 dias |

`am:enviada:` e `am:auditoria:` são as duas chaves novas. A primeira é escrita
com o `key.id` que a Evolution devolve no envio e lida na entrada da próxima
mensagem `fromMe`. A segunda existe porque `saveDataSuccessExecution: none`
apaga a execução bem-sucedida: sem ela, um atendimento correto não deixa
nenhuma evidência do que foi decidido.

Toda chave inclui a instância: o mesmo telefone falando com duas empresas nunca
compartilha buffer, estado nem pausa.

## Transferência para uma pessoa: o que acontece de verdade

Quando o fluxo transfere, **nenhum nó avisa o negócio**. O que acontece é que a
IA pausa (`am:handoff:...`) e a conversa continua no WhatsApp do próprio
negócio, onde o dono já a vê. O texto enviado ao cliente diz exatamente isso e
não afirma que alguém foi avisado.

O TTL da pausa depende do motivo, porque os motivos não têm a mesma urgência:
uma frase que a IA não entendeu volta a ser atendível em uma hora; um pedido
explícito de pessoa, não. Todos gravam a mesma chave `am:handoff:`.

**Quem escolhe o motivo é o fluxo, não o modelo.** `handoff_motivo` era o texto
livre que a IA escrevia em `handoff_reason` ("cliente pediu atendimento
humano"), que nunca batia com `pedido_do_cliente`: quem pedia uma pessoa ouvia o
texto genérico de "problema do meu lado" e a pausa caía de 12 h para 1 h. Hoje o
motivo sai de uma decisão determinística, e `handoff_reason` — que pode conter
nome, telefone ou condição de saúde escritos pelo modelo — ficou preso a um enum
de cinco valores e fora da chave do Redis e do log.

| Motivo (`handoff_motivo`) | Quando acontece | TTL | O que o cliente lê |
| --- | --- | --- | --- |
| `crise` | menção a suicídio, autolesão com sinal de sofrimento, violência doméstica ou abuso. Decidido **antes** do portão da IA: vale mesmo com a OpenAI fora do ar | 12 h | "Sinto muito que você esteja passando por isso. Falar sobre isso já é importante.", depois "*Empresa* continua com você nesta conversa — a partir daqui quem responde não sou eu." e, por último, o CVV no **188** (gratuito, 24 h). Nada de agenda, nada de texto gerado pela IA, nenhuma promessa de que alguém foi avisado |
| `pedido_do_titular` | apagar dados, sair da lista, parar de receber mensagem. Também **antes** do portão da IA | 12 h | "Entendi seu pedido e ele vai ser tratado." + a frase de continuidade. Não afirma que o dado foi apagado, porque quem decide isso é uma pessoa |
| `assunto_sensivel` | termo clínico em pergunta aberta, **ou** contraindicação em qualquer intenção (gestante, anticoagulante, marca-passo, pós-operatório…). A contraindicação também roda antes do portão da IA | 12 h | "Isso é melhor uma pessoa te responder com calma." + a frase de continuidade |
| `pedido_do_cliente` | "quero falar com alguém", ou `requires_human` da IA | 12 h | "Claro. Vou parar por aqui e deixar com quem atende. *Empresa* continua com você nesta conversa." |
| `configuracao_incompleta` | catálogo vazio, serviço sem id | 12 h | "Tive um problema aqui do meu lado e não quero te dar uma informação errada." + continuidade |
| `interpretacao_invalida`, `contexto_incompleto` | saída da IA fora do formato depois da correção; contexto da empresa incompleto | 1 h | mesma frase de problema do nosso lado |
| falha de **escrita** (`Redis - pausar IA (falha na operação)`) | criar/remarcar/cancelar sem resultado confiável | 1 h | "Nada foi alterado na sua agenda." + continuidade |
| falha de **envio** (`Redis - pausar IA (falha no envio)`) | a Evolution recusou a resposta | 30 min | nada: o cliente não recebeu mensagem nenhuma. A execução fica salva e o workflow de erro dispara |

Confiança baixa **não** transfere mais. Um `confidence` abaixo de 0,45 pausava a
IA por uma hora por um número que o próprio modelo escreveu; hoje o caminho é
pedir esclarecimento. O limiar destrutivo (0,85) continua valendo para cancelar,
remarcar e confirmar. Quem não é entendido não fica em laço: a regra 8 do prompt
manda `requires_human = true` depois de duas tentativas sem entender, e o
histórico das respostas anteriores vai no mesmo prompt. `requires_human` é
testado **antes** do limiar de confiança, então vale mesmo com confiança baixa.
Não há contador determinístico fora do modelo — é o ponto fraco conhecido deste
caminho.

Notificação real ao dono (push, e-mail, painel) continua dependendo da Central
de Atendimento, que não existe nesta fase. O `AgendaMagnetica-erro.n8n.json`
avisa o **operador** quando uma execução falha — é outra coisa, e não cobre
transferência.

## Configuração

### O fluxo não lê variável de ambiente

A VPS roda com `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`
(`APP-FixWear/infra/stacks/06-n8n.yml`), e isso vale para **expressão** também,
não só para Code node: `{{ $env.QUALQUER_COISA }}` lança
`access to env vars denied` dentro do `n8n-worker`. Como os nós HTTP estão em
`onError: continueRegularOutput`, o erro não aparecia — o item de entrada
passava adiante e a execução terminava "com sucesso" sem responder nada.

A flag continua `true` de propósito: com ela em `false`, qualquer expressão de
qualquer workflow da instância lê `N8N_ENCRYPTION_KEY`, `N8N_DB_PASSWORD` e
`REDIS_N8N_PASSWORD`. O fluxo é que deixou de depender do ambiente.

**Origem dos serviços** — duas constantes no topo de `normalizar entrada`, o
único nó que roda antes de todos os outros. É o único lugar a trocar:

```js
const API_BASE = 'https://agenda-magnetica-painel.vercel.app';
const EVOLUTION_BASE = 'https://evo.fixwear.com.br';
```

Elas saem no item como `api_base` e `evolution_base` (já sem barra no fim). Os
nós HTTP montam a URL a partir de uma das duas: os de `/api/ai/*` usam
`$('normalizar entrada').first().json.api_base`, e `evo digitando`,
`evo enviar mensagem`, `buscar áudio` e `buscar imagem` usam
`...json.evolution_base`. Não são segredo: são origem pública de serviço — e o
validador recusa `$env.` em qualquer lugar do JSON, porque no worker a
expressão lança `access to env vars denied` e o nó morre calado.

### Credenciais a religar após importar

Segredo só entra como **credencial** do n8n, cifrada no banco pela
`N8N_ENCRYPTION_KEY`. O JSON traz apenas a referência `CONFIGURAR_NO_N8N`.

| Credencial | Tipo | Onde | Conteúdo |
| --- | --- | --- | --- |
| `Agenda Magnetica - webhook Evolution` | Header Auth | `Webhook` | o mesmo header configurado na Evolution API |
| `Agenda Magnetica - token da automacao` | Header Auth | todos os nós de `/api/ai/*`, incluindo `confirmar consulta` | nome `X-Automation-Token`, valor igual ao `AUTOMATION_API_TOKEN` do backend |
| `Agenda Magnetica - Evolution API` | Header Auth | `evo digitando`, `evo enviar mensagem`, `buscar áudio`, `buscar imagem` — e `avisar operador`, no workflow de erro | nome `apikey`, valor da chave da Evolution |
| Redis | Redis | os **20** nós `Redis - ...` | **banco 1** (o 0 é a fila do n8n) |
| OpenAI | OpenAI | `modelo interpretador`, `transcrever áudio`, `analisar imagem` | — |

Uma credencial Header Auth serve todos os nós de agenda ao mesmo tempo: crie uma
só e selecione em todos eles. Não há mais credencial Supabase no workflow.

Quatro nós novos entram nessa conta: `buscar áudio` e `buscar imagem` usam a
credencial da Evolution; `Redis - envio próprio?`, `Redis - marcar envio
próprio`, `Redis - registrar auditoria` e `Redis - pausar IA (falha no envio)`
usam o Redis do `db1`. Nó Redis sem credencial não falha alto: ele para a
execução no meio, depois de a mensagem já ter sido enviada.

### `settings.errorWorkflow` precisa do id

A V2 traz `"errorWorkflow": "RcPiPwpM0sNMKkhcERRO"`. Isso é um marcador, não
um id: importe `AgendaMagnetica-erro.n8n.json`, copie o id que o n8n atribuir
(está na URL do editor) e cole em *Settings → Error workflow* da V2. Com o
marcador no lugar do id, o alerta simplesmente não dispara — e o n8n não
reclama. No workflow de erro, preencha as três constantes do topo de
`montar alerta` (telefone do operador, base da Evolution, instância de alerta);
sem elas ele termina em `fim - alerta não configurado`, que **lança**.

Importe o fluxo de erro no **mesmo projeto/owner** da V2: ele sai do repositório
com `callerPolicy: workflowsFromSameOwner`, e em projeto diferente — plausível
numa instância compartilhada — a chamada é bloqueada e o alerta não sai.

O alerta manda só metadados: nome do fluxo, nó, id da execução e a mensagem de
erro cortada em 200 caracteres. Telefone do cliente, conversa e transcrição não
saem de dentro do n8n.

O fluxo de erro grava execução também em sucesso (`saveDataSuccessExecution:
all`) e os dois fins de falha lançam: alerta não configurado e alerta recusado
pela Evolution. Antes, um alerta engolido não deixava rastro nenhum — o pior
lugar possível para o silêncio, porque é o detector de todos os outros
silêncios. São seis nós e um disparo raro: o custo de guardar tudo é
desprezível.

### Webhook

Path: `agenda-magnetica-v2`. Aponte `EVOLUTION_WEBHOOK_URL` para ele durante a
homologação (o `.env.example` do backend ainda cita o path antigo).

## Ajustes rápidos

Constantes no topo dos nós Code, sem mexer no resto do fluxo:

| Onde | Constante | Padrão |
| --- | --- | --- |
| `resolver e decidir` | `LIMIAR_PADRAO` | `0.75` |
| `resolver e decidir` | `LIMIAR_DESTRUTIVO` (cancelar, remarcar, confirmar) | `0.85` |
| `resolver e decidir` | `JANELA_PADRAO_DIAS` | `14` |
| `resolver e decidir` | `JANELA_MAXIMA_DIAS` (teto de `/api/ai/disponibilidade`) | `30` |
| `resolver e decidir` | `LIMITE_SLOTS` (horários pedidos por busca; ofertamos 2) | `50` |
| `resolver e decidir` | `MARGEM_HORA_MIN` (recorte em volta da hora pedida) | `120` |
| `resolver e decidir` e `avaliar horários` | `ANTECEDENCIA_MIN` (piso para oferecer um horário) | `60` — **mude nos dois juntos** |
| `avaliar horários` | `PENDENTE_MINUTOS` | `10` |
| `montar contexto` | `HISTORICO_MAX` | `6` |
| `dividir resposta` | `MAX_PARTES` | `3` |
| `aguardar agrupamento` | espera do buffer | `8s` |

`DIA_INICIO` (7) e `DIA_FIM` (21) são só o fallback de quem não tem expediente
cadastrado: a janela de busca sai de `ctx.horarios`, então barbearia que fecha
às 22 h passa a oferecer 21h30 e personal que abre 6h30 passa a oferecer 6h30.
O período pedido ("de manhã") vale para a janela inteira, não só para o primeiro
dia, e as duas ofertas preferem **dias diferentes** — turno diferente só quando
existe um único dia com vaga.

O período **recorta** o expediente, nunca o substitui. Sobrescrevendo,
"à noite" numa empresa que fecha às 18 h gerava uma busca de 18 h às 21 h
inteiramente fora do expediente: a API devolvia lista vazia e o cliente ouvia
"não achei horário livre", quando a resposta honesta é que o negócio não atende
à noite. Interseção vazia cai em `fora_do_expediente` sem nem chamar a API. No
outro extremo, `DIA_FIM` (21) não recorta nada: ele é a borda de quem não tem
expediente cadastrado, e usá-lo como fechamento esconderia o 21h30 de quem
fecha às 22 h.

O piso de antecedência (`ANTECEDENCIA_MIN`) vale para horário **novo**, não para
revalidar o que o próprio fluxo acabou de oferecer. Aplicado na revalidação, o
cliente que respondia 20 minutos depois ouvia "esse horário não está livre"
sobre o horário que ele mesmo tinha recebido. A exceção é uma flag explícita, e
não `horario_desejado`: esse campo também carrega hora digitada pelo cliente
("quero hoje às 14h10"), e aí o piso precisa valer.

O texto que o cliente recebe nas operações está inteiro em `montar resposta`.

## Validação

```bash
python automation/n8n/validar_workflow.py
```

```bash
node automation/n8n/tests/test_regras.mjs
```

O validador confere JSON válido, workflow inativo, nós obrigatórios, rotas sem
destino, referências quebradas, chaves do Redis com instância, ausência de
segredos e de dados pessoais, autenticação do webhook — e que **nenhum literal
de acesso direto ao banco** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`rest/v1`, `id_info_clinica`, `cancelada`) voltou ao arquivo. Cada nó de agenda
precisa montar a URL a partir de `api_base`, autenticar por credencial
`Header Auth` (nunca token literal, nunca variável de ambiente) e ler o corpo em
erro HTTP. `contexto da empresa` não pode ter `onError`.

O validador também exige o que esta rodada corrigiu, para que não volte em
silêncio: `settings.errorWorkflow` preenchido, `evo enviar mensagem` com
`continueErrorOutput` **e** destino para a saída de erro, a rota `humano` sem
pausar a IA antes de checar o eco do próprio envio, um nó gravando
`am:auditoria:` alimentado por `registrar decisão`, e `buscar áudio` /
`buscar imagem` apontando para `getBase64FromMediaMessage`.

Os dois nós de mídia entraram também nas verificações que já existiam para
`evo digitando` e `evo enviar mensagem` (URL a partir de `evolution_base`,
credencial `Header Auth`, sem `apikey` literal) e ganharam duas próprias: o
corpo precisa usar `midia_msg_id`, e `converter áudio` / `converter imagem`
precisam declarar `onError`. As duas nasceram de regressões desta rodada — pedir
o arquivo pela mensagem errada e derrubar a execução com base64 vazio — e são
invisíveis em leitura de diff.

Os testes executam o **JavaScript real dos nós Code extraído do JSON** contra os
casos de `TESTES_AUTOMACAO_V2.md`. Mudou o workflow, o teste acusa.

## Antes de ativar

**Pré-requisito de banco:** rode `scripts/v_cliente_preferencias.sql` (profissional
de sempre) e, se for usar o lembrete, `scripts/lembrete_confirmacao.sql`. Os dois
são reexecutáveis e podem rodar com a automação no ar.

Se for usar o chat do painel, rode também `scripts/chat_atendimento.sql` e
`scripts/chat_devolver_ia.sql`.

Rode também `scripts/v_clinica_detalhes.sql` (v3). É
`create or replace view`, sem migração de tabela, e pode rodar com a automação
no ar. Sem ele, `/api/ai/contexto` devolve `descricao: null` e a recepção volta
a responder "não consegui confirmar" para forma de pagamento, convênio,
estacionamento e o que levar na primeira sessão — o texto que o assinante
escreve no campo "Sobre o negócio" simplesmente não chega ao prompt.

1. Revogue as credenciais que existiam nas versões antigas do JSON, inclusive a
   credencial Supabase que a V2 não usa mais.
2. Configure credenciais novas e o header do webhook. Importe também
   `AgendaMagnetica-erro.n8n.json`, preencha as constantes de `montar alerta` e
   cole o id dele em `settings.errorWorkflow` da V2.
3. Gere `AUTOMATION_API_TOKEN` (mínimo 32 caracteres) e cadastre-o **nas
   variáveis de ambiente do projeto na Vercel**, não só no `.env` local — sem
   ele toda rota `/api/ai/*` responde `503 AUTOMACAO_INDISPONIVEL`. O mesmo
   valor vai na credencial `Agenda Magnetica - token da automacao` no n8n.
4. Confirme que o backend responde. **Não use `GET /health`**: o rewrite
   `/((?!api/).*)` do `vercel.json` devolve o HTML do painel para esse caminho.
   O teste que vale é uma chamada sem token, que precisa responder
   `401 AUTENTICACAO_INVALIDA` — `503` significa token ausente no servidor:

   ```bash
   curl -s -X POST https://agenda-magnetica-painel.vercel.app/api/ai/contexto -H "Content-Type: application/json" -d '{"instance_name":"x","telefone":"5551999999999"}'
   ```
5. Valide o vínculo `instância WhatsApp → usuarios.instance_name → empresa` com
   uma chamada a `/api/ai/contexto`.
6. Teste criar, consultar, remarcar e cancelar em **duas** empresas de
   homologação, com o mesmo telefone nas duas.
7. Teste pedido de atendimento humano e a pausa da IA.
8. **Force uma falha e confirme que o alerta chega.** Desligue a credencial da
   Evolution por um minuto, mande uma mensagem e confirme que o operador recebe
   a mensagem no telefone dele. Sem esta prova, não há como afirmar que
   qualquer falha crítica é notificada — e o modo de falha mais provável do
   fluxo é justamente a Evolution, que é também o canal do alerta.
9. **Mande um áudio real e uma imagem real** e confirme que `buscar áudio` e
   `buscar imagem` voltam `200` com o base64 preenchido. `400 Message not
   found` significa que a instância não grava as mensagens recebidas no banco
   da Evolution — pré-requisito descrito em `docs/INFRA-VPS.md` § 2, fora do
   controle deste repositório.
10. Rode a matriz de testes conversacionais com a instância de homologação.
11. Ative primeiro com revisão humana e auditoria ligada.

## Rollback

Três níveis, do mais estreito para o mais largo. Escolha o menor que resolve: o
primeiro atinge uma empresa, o último derruba todas as integrações da chave.

### 1. Por empresa — o botão do painel

*Configurações → Conexão do WhatsApp → desligar o atendimento automático.* O
painel grava `info_clinica.automacao_ativa = false`, e `/api/ai/contexto` passa
a responder `409 AUTOMACAO_DESATIVADA` **antes de localizar ou criar o
cliente**. O fluxo trata esse código como recusa de negócio: encerra calado, sem
mensagem ao cliente e sem erro no histórico.

- **Efeito:** só naquela empresa. As outras continuam atendendo.
- **Em quanto tempo:** na mensagem seguinte. A flag é lida a cada chamada de
  contexto, não há cache.
- **O que fica de pé:** conversas já pausadas e chaves do Redis expiram sozinhas
  pelo TTL. Nada é apagado.

Este é o rollback do dia a dia. Nada precisa ser feito no n8n.

### 2. Por workflow — desativar no n8n

*Workflow → toggle Active → off.* O webhook para de aceitar o evento da
Evolution; a instância continua conectada e o número volta ao atendimento
manual, no WhatsApp do próprio negócio.

- **Efeito:** todas as empresas ligadas a esta instância do n8n.
- **Em quanto tempo:** imediato para mensagens novas. Execuções em andamento
  terminam (`executionTimeout: 300`).
- **Cuidado:** uma ação pendente aberta morre no TTL de 30 min sem ninguém
  confirmar. Quem já ouviu "posso marcar?" e responder "sim" depois do desligar
  não recebe resposta — a mensagem é vista pelo dono no WhatsApp, como qualquer
  outra.

### 3. Por token — rotacionar a credencial

Gere um `AUTOMATION_API_TOKEN` novo (mínimo 32 caracteres) nas variáveis do
projeto na Vercel **sem** atualizar a credencial `Agenda Magnetica - token da
automacao` no n8n. Toda rota `/api/ai/*` passa a responder
`401 AUTENTICACAO_INVALIDA`.

- **Efeito:** corta o acesso de qualquer cliente que tenha o token antigo,
  inclusive o n8n. É a saída para token vazado, não para "desligar o bot".
- **Em quanto tempo:** no próximo deploy/propagação da variável na Vercel.
- **O que o cliente vê:** `contexto da empresa` recebe `AUTENTICACAO_INVALIDA`,
  que **não** é recusa de negócio — `fim - contexto indisponível` lança e a
  execução fica salva. O cliente fica sem resposta. Combine com o nível 2.

### O JSON da V1 não é rollback

`AgendaMagnetica.n8n.json` está aqui como **histórico**. Ele não roda nesta
infraestrutura: usa `{{ $env.* }}`, que a VPS bloqueia com
`N8N_BLOCK_ENV_ACCESS_IN_NODE=true`, e depende de uma credencial Supabase que a
V2 eliminou de propósito. Importá-lo em uma emergência custa tempo e devolve o
acesso direto ao banco de dentro do n8n. Não reimporte.

## Limitações conhecidas

- **Sem notificação real na transferência.** A IA pausa e o texto diz que quem
  atende continua na conversa; ninguém é avisado por push ou e-mail. Depende da
  Central de Atendimento. O workflow de erro avisa o operador quando uma
  **execução falha**, não quando uma conversa é transferida.
- **Falha de leitura não pausa a IA.** `buscar horários`, `consultas do cliente`
  e `atualizar cadastro` respondem "não consegui concluir agora" e deixam o
  cliente tentar de novo. Só falha de **escrita** e de **envio** pausa.
- **Cada áudio e cada imagem custam uma chamada HTTP a mais.** `buscar áudio` e
  `buscar imagem` batem na Evolution antes da transcrição, porque o webhook é
  registrado com base64 desligado (timeout de 10 s, sem repetição,
  `continueRegularOutput`). Se a Evolution não devolver a mídia, o cliente é
  convidado a escrever — mas o áudio não é atendido. Essa busca depende de a
  instância gravar as mensagens recebidas no banco da Evolution, que é
  compartilhada e não está sob controle deste projeto: veja o pré-requisito em
  `docs/INFRA-VPS.md` § 2. Ligar base64 no webhook eliminaria a chamada e a
  dependência; hoje não está ligado.
- **`settings.errorWorkflow` sai do repositório como marcador.** Enquanto o id
  do workflow de erro não for colado depois do import, nenhum alerta dispara e o
  n8n não avisa que o campo é inválido.
- **Janela de 24 h do WhatsApp** não é verificada: uma confirmação pode ser
  gerada e não ser entregue. Desde a saída de erro de `evo enviar mensagem`, a
  recusa da Evolution ao menos aparece — a execução fica salva e a IA pausa.
- **Lembretes e follow-up não estão neste workflow.** Precisam de gatilho próprio.
- ~~**Chave de buffer sem TTL.**~~ Fechado: `am:buffer:{instancia}:{telefone}`
  deixou de ser lista do Redis e virou chave `set` com **TTL de 300 s** — o nó
  Redis do n8n só expõe expiração em `set` e `incr`, nunca em `push`, então a
  lista guardava telefone, texto e base64 no `db1` por tempo indeterminado.
  A migração custou um par de nós novo (`Redis - ler buffer atual` →
  `montar buffer`, que serializa o array) e **deixou um defeito atrás**: a
  leitura em `agrupar mensagens` continuou esperando lista e o agrupamento de
  rajada ficou morto por uma rodada inteira, com a suíte verde. Hoje as duas
  pontas são exercitadas pelo mesmo teste (T134).
- **Pendência obsoleta quando a busca anterior não achou nada — resíduo
  assumido.** A regra que invalida a pendência antiga compara os horários
  oferecidos com o horário pendente. Uma busca que termina em "não achei
  horário livre" grava lista vazia, e lista vazia é lida como "não sei", não
  como "a oferta mudou": um "sim" no turno seguinte ainda pode executar a
  pendência anterior. Distinguir as duas exige o instante do último turno, que
  `montar contexto` não repassa hoje. O efeito é estreito — precisa de
  pendência viva, uma busca sem resultado no meio e um "sim" seco em até 30 min
  — e a correção limpa é a pendência ser apagada pelo próprio `avaliar
  horários`.
- **`AgendaMagnetica.n8n.json` (V1) contém um e-mail pessoal** nos quatro nós
  órfãos do Google Calendar. O arquivo é histórico, não rollback; remova esse
  dado antes de qualquer publicação do repositório.
- **Fuso fixo em `-03:00`** nos nós Code. Vale para `America/Sao_Paulo` desde o
  fim do horário de verão em 2019. Se o horário de verão voltar, revise-os.
- **Sem limite de taxa na API.** Quem tiver o token pode chamar à vontade;
  avalie antes de expor o backend na internet.
- **`procedimento.orientacoes` continua fora do prompt.** "O que levar na
  primeira sessão" é coletado por serviço no painel e não chega à IA: dez
  serviços com 500 caracteres cada dobrariam o prompt. Hoje o caminho é escrever
  a orientação no campo "Sobre o negócio", que é da empresa inteira. Entra
  quando houver como incluir só o serviço da conversa.
- **Não há triagem de emergência clínica.** "Estou com dor no peito, posso
  remarcar?" é atendida como pedido de remarcação — a guarda de texto impede
  qualquer palavra sobre o quadro, mas ninguém é acionado. A única guarda que
  interrompe o atendimento por conteúdo é a de crise (regra 8.1 do prompt:
  suicídio, autolesão, violência sofrida, abuso).
- **A guarda clínica é de sintoma, não de anatomia.** `RE_SENSIVEL` lista
  sintoma e condição (`dor`, `hérnia`, `tendinite`), não parte do corpo: "o que
  eu tenho no joelho?" não casa nada e é respondida pela IA. Ampliar para
  anatomia muda o comportamento do fluxo inteiro e não cabia numa rodada de
  correção do contexto da empresa.
- **`precoInventado` confere se o número existe, não a que ele pertence.** Com a
  tabela de preços escrita no campo "Sobre o negócio" e nenhum serviço resolvido
  na conversa, qualquer valor da tabela é aceito como resposta. Com o serviço
  resolvido vale a pergunta inversa: **se nenhum número da frase é o preço dele,
  é troca e a resposta é barrada** — mas com o preço certo presente, os outros
  valores da frase podem vir do cadastro, e "a sessão é R$ 150 e a taxa de
  deslocamento é R$ 30" sai. Trocar dois preços entre dois serviços citados
  continua passando: parear valor com assunto pede um parser de frase.
- **`info_clinica.descricao` não tem `CHECK` de tamanho no banco.** O teto de
  2000 é da API (`LIMITE_DESCRICAO`) e o corte é do fluxo (`NEGOCIO_MAX` em
  `montar contexto`). Linha antiga, gravada quando não havia teto nenhum, é
  cortada na renderização em vez de derrubar o atendimento — mas correção manual
  no banco ou rota futura não esbarra em nada do lado do Postgres.

## O que mudou da V1 para a V2

| Tema | V1 | V2 |
| --- | --- | --- |
| Chamadas de IA por mensagem | 3 ou mais | até 3, com funções separadas |
| IA e memória | agentes e memórias misturados | interpretador n8n, redator/revisor backend, perfil no banco |
| Saída do classificador | texto livre + `JSON.parse` | saída estruturada validada fora da IA |
| Empresa | derivada do telefone do cliente | derivada da instância, **no servidor** |
| Acesso a dados | PostgREST com `service_role` dentro do n8n | `/api/ai/*` com token de automação |
| Escritas | id escolhido pelo modelo | id e filtros impostos pelo servidor |
| Confirmação | frase no prompt | ação pendente com TTL e trava |
| Sucesso | anunciado pelo modelo | só com `ok: true` e `data.agendamento.id` |
| Repetição de escrita | podia duplicar | idempotente por chave ou por estado |
| Cancelamento | gravava `cancelada`, recusado pelo banco | `POST /agendamentos/cancelar` com motivo do enum |
| Reagendamento | rota morta | funcional de ponta a ponta |
| Zero/um horário | prompt exigia sempre dois | tratados como casos distintos |
| Transferência humana | sem resposta, pausa eterna | responde com texto honesto e pausa com TTL |
| Nome da assistente | "Andressa" fixo | vem do cadastro da empresa |
| Execuções salvas | `all` (dados pessoais) | só erro |
