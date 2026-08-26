# Automação de atendimento — homologação

> **Infraestrutura:** o n8n já está no ar, em queue mode, com o webhook em
> processo separado. Antes de importar o fluxo ou configurar credencial, leia
> [`docs/INFRA-VPS.md`](../../docs/INFRA-VPS.md) — em especial que a credencial
> Redis precisa apontar para o **banco 1** (o banco 0 é a fila interna do n8n).

Dois arquivos convivem nesta pasta:

| Arquivo | Papel |
| --- | --- |
| `AgendaMagnetica-v2.n8n.json` | **versão canônica** (Atendimento V2). Importe esta. |
| `AgendaMagnetica.n8n.json` | versão anterior, mantida só como referência e rollback. |

Os dois estão **inativos** (`active: false`) e continuam assim até a homologação
terminar. Nenhum deles deve ser ativado sem autorização explícita.

## O que a V2 faz

A automação é a recepção do negócio no WhatsApp: entende o que o cliente quer,
responde dúvidas com o cadastro da empresa, mostra horários reais, e só marca,
remarca ou cancela depois de uma confirmação explícita.

Fluxo principal, sempre nesta ordem:

1. `Webhook` autenticado por header recebe o evento da Evolution API.
2. `normalizar entrada` separa mensagem do cliente, mensagem do próprio negócio
   e evento a descartar.
3. `Redis - marcar mensagem` faz idempotência por id da mensagem (`INCR` + TTL de
   24 h): a mesma mensagem nunca gera duas operações.
4. `Redis - atendimento humano ativo?` interrompe a IA quando uma pessoa assumiu.
5. Buffer de 8 segundos agrupa mensagens seguidas do mesmo contato.
6. Áudio vira texto e imagem vira descrição administrativa, quando houver.
7. `contexto da empresa` chama `POST /api/ai/contexto`: a empresa é derivada da
   instância **no servidor**, o cliente é localizado ou criado dentro dela e o
   catálogo agendável vem junto. Nada disso passa pela IA nem pelo banco.
8. `IA interpretadora` é a **única** chamada de IA de conversa e devolve saída
   estruturada.
9. `validar interpretação` valida fora da IA: enum fechado, tipos coeridos,
   `next_action` recalculado pelo sistema.
10. `resolver e decidir` aplica as regras: serviço, profissional, data, fuso,
    limiar de confiança, ação pendente — e monta o corpo exato de cada chamada.
11. Os nós HTTP executam a operação em `/api/ai/*` com token de automação.
12. `montar resposta` escreve a mensagem por modelo fixo e `registrar decisão`
    guarda o motivo da rota.

Contagem de IA: **1 chamada** no atendimento normal. Áudio ou imagem somam 1
chamada de transcrição/descrição. Saída estruturada inválida gasta 1 correção; se
falhar de novo, a conversa vai para uma pessoa.

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
| `CONSULTA_NAO_ENCONTRADA`, `CONSULTA_NAO_REAGENDAVEL` | oferece listar os horários de novo |
| `FALHA_TEMPORARIA` (`retryable: true`) | repete **uma** vez com o mesmo pedido; persistindo, chama uma pessoa |
| qualquer outro código, ou resposta sem envelope | para, chama uma pessoa e **nunca** anuncia sucesso |

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

## Confirmação antes de qualquer escrita

Agendar, reagendar e cancelar passam por uma **ação pendente** guardada pelo
sistema no Redis:

```
am:pendente:{instancia}:{telefone}   TTL 20 min (a ação expira em 10 min)
```

A ação guarda tipo, horário, serviço, profissional, consulta e validade. O
cliente confirma; o sistema executa exatamente aquela ação; a chave é apagada.
Um "sim" sem ação pendente válida não cria, não altera e não cancela nada.

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
| `am:handoff:{instancia}:{telefone}` | IA pausada (pessoa atendendo) | 30 min (negócio respondeu) ou 1 h (transferência) |
| `am:buffer:{instancia}:{telefone}` | agrupamento de mensagens | apagada ao processar |
| `am:pendente:{instancia}:{telefone}` | ação aguardando confirmação | 20 min |
| `am:estado:{instancia}:{telefone}` | últimas 6 mensagens, horários oferecidos | 6 h |
| `am:trava:{instancia}:{acao_id}` | execução única da ação | 5 min |

Toda chave inclui a instância: o mesmo telefone falando com duas empresas nunca
compartilha buffer, estado nem pausa.

## Transferência para uma pessoa: o que acontece de verdade

Quando o fluxo transfere, **nenhum nó avisa o negócio**. O que acontece é que a
IA pausa (`am:handoff:...`) e a conversa continua no WhatsApp do próprio
negócio, onde o dono já a vê. O texto enviado ao cliente diz exatamente isso e
não afirma que alguém foi avisado.

Notificação real (push, e-mail, painel) depende da Central de Atendimento, que
não existe nesta fase.

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
const EVOLUTION_BASE = 'CONFIGURAR_NO_N8N';
```

Elas saem no item como `api_base` e `evolution_base` (já sem barra no fim), e
os 10 nós HTTP montam a URL com `$('normalizar entrada').first().json.api_base`.
Não são segredo: são origem pública de serviço.

### Credenciais a religar após importar

Segredo só entra como **credencial** do n8n, cifrada no banco pela
`N8N_ENCRYPTION_KEY`. O JSON traz apenas a referência `CONFIGURAR_NO_N8N`.

| Credencial | Tipo | Onde | Conteúdo |
| --- | --- | --- | --- |
| `Agenda Magnetica - webhook Evolution` | Header Auth | `Webhook` | o mesmo header configurado na Evolution API |
| `Agenda Magnetica - token da automacao` | Header Auth | os 8 nós de `/api/ai/*` | nome `X-Automation-Token`, valor igual ao `AUTOMATION_API_TOKEN` do backend |
| `Agenda Magnetica - Evolution API` | Header Auth | `evo digitando`, `evo enviar mensagem` | nome `apikey`, valor da chave da Evolution |
| Redis | Redis | todos os nós `Redis - ...` | **banco 1** (o 0 é a fila do n8n) |
| OpenAI | OpenAI | `modelo interpretador`, `transcrever áudio`, `analisar imagem` | — |

Uma credencial Header Auth serve os oito nós de agenda ao mesmo tempo: crie uma
só e selecione nos oito. Não há mais credencial Supabase no workflow.

### Webhook

Path: `agenda-magnetica-v2`. Aponte `EVOLUTION_WEBHOOK_URL` para ele durante a
homologação (o `.env.example` do backend ainda cita o path antigo).

## Ajustes rápidos

Constantes no topo dos nós Code, sem mexer no resto do fluxo:

| Onde | Constante | Padrão |
| --- | --- | --- |
| `resolver e decidir` | `LIMIAR_PADRAO` | `0.75` |
| `resolver e decidir` | `LIMIAR_DESTRUTIVO` (cancelar, remarcar, confirmar) | `0.85` |
| `resolver e decidir` | `LIMIAR_HUMANO` | `0.45` |
| `resolver e decidir` | `JANELA_PADRAO_DIAS` | `14` |
| `resolver e decidir` | `LIMITE_SLOTS` (horários pedidos por busca) | `12` |
| `avaliar horários` | `PENDENTE_MINUTOS` | `10` |
| `montar contexto` | `HISTORICO_MAX` | `6` |
| `dividir resposta` | `MAX_PARTES` | `3` |
| `aguardar agrupamento` | espera do buffer | `8s` |

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

Os testes executam o **JavaScript real dos nós Code extraído do JSON** contra os
casos de `TESTES_AUTOMACAO_V2.md`. Mudou o workflow, o teste acusa.

## Antes de ativar

1. Revogue as credenciais que existiam nas versões antigas do JSON, inclusive a
   credencial Supabase que a V2 não usa mais.
2. Configure credenciais novas e o header do webhook.
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
8. Rode a matriz de testes conversacionais com a instância de homologação.
9. Ative primeiro com revisão humana e auditoria ligada.

## Limitações conhecidas

- **Sem notificação real na transferência.** A IA pausa e o texto diz que a
  equipe continua na conversa; ninguém é avisado por push ou e-mail. Depende da
  Central de Atendimento.
- **Falha de leitura não pausa a IA.** `buscar horários`, `consultas do cliente`
  e `atualizar cadastro` respondem "não consegui concluir agora" e deixam o
  cliente tentar de novo. Só falha de **escrita** pausa e transfere.
- **Janela de 24 h do WhatsApp** não é verificada: uma confirmação pode ser
  gerada e não ser entregue. O agendamento existe mesmo assim.
- **Lembretes e follow-up não estão neste workflow.** Precisam de gatilho próprio.
- **Buffer órfão**: se a execução morrer entre o `push` e o `delete`, a chave de
  buffer fica sem TTL até a próxima mensagem do contato.
- **`AgendaMagnetica.n8n.json` (V1) contém um e-mail pessoal** nos quatro nós
  órfãos do Google Calendar. O arquivo foi preservado como rollback; remova esse
  dado antes de qualquer publicação do repositório.
- **Fuso fixo em `-03:00`** nos nós Code. Vale para `America/Sao_Paulo` desde o
  fim do horário de verão em 2019. Se o horário de verão voltar, revise-os.
- **Sem limite de taxa na API.** Quem tiver o token pode chamar à vontade;
  avalie antes de expor o backend na internet.

## O que mudou da V1 para a V2

| Tema | V1 | V2 |
| --- | --- | --- |
| Chamadas de IA por mensagem | 3 ou mais | 1 |
| Agentes / modelos / memórias | 7 / 7 / 7 | 1 / 1 / 0 |
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
