# Automação V2 migrada para `/api/ai/*` — handoff

> **Para quem:** quem for homologar a automação ou continuar o trabalho dela.
> Este documento é **autossuficiente**: não presume nenhuma conversa anterior.
> **Estado:** workflow migrado, validado e testado em 2026-08-21. `active: false`.
> **Base:** `automation/n8n/AgendaMagnetica-v2.n8n.json` (78 nós).
> **Contrato da API:** `docs/planning/BACKEND_AI_API_HANDOFF.md`.
> **Nenhum arquivo fora de `automation/**` foi alterado.** Nenhum commit, nenhum push.

---

## 1. Objetivo

Tirar o acesso direto ao banco de dentro do n8n. Antes, o workflow falava com o
PostgREST usando `SUPABASE_SERVICE_ROLE_KEY`, montava filtros de URL, escolhia a
empresa por conta própria e tratava `HTTP 200` como prova de que o agendamento
existia. Depois desta entrega, toda leitura e escrita de agenda passa por
`/api/ai/*` com um token de automação, e a empresa é derivada da instância **no
servidor**.

---

## 2. Concluído

### 2.1 Contexto em uma chamada

Sete nós viraram um. `empresa pela instancia`, `buscar cliente`,
`cliente existe?`, `criar cliente`, `cliente da empresa`, `catalogo da empresa` e
`empresa configurada?` saíram; entraram `contexto da empresa`
(`POST /api/ai/contexto`) e `contexto ok?` (um `If` em `ok`).

`montar contexto` foi reescrito para ler
`data.{empresa, cliente, procedimentos, profissionais}`. **Não existe mais
`empresa_id` nem `cliente_id` em lugar nenhum do fluxo** — nem na ação pendente,
nem em `registrar decisão`, nem nas guardas. A guarda antiga
(`!ctx.empresa.id || !ctx.cliente.id`) virou `!ctx.tem_contexto`, que é verdadeiro
quando o envelope trouxe empresa e o telefone normalizado do cliente.

`procedimentos[].agendavel === false` (nenhum profissional ativo executa o
serviço) leva à rota `humano`, não a "sem vaga": não existe data em que aquele
serviço apareceria. Ele também sai das listas de oferta, mas continua no catálogo
para responder uma pergunta de preço.

### 2.2 Disponibilidade

`buscar horários` chama `POST /api/ai/disponibilidade`. `revalidar horário` e
`conferir revalidação` foram **removidos**: a API revalida o horário com a função
do banco imediatamente antes de gravar e relê o registro antes de responder.

Em `avaliar horários`: todo slot traz `id_profissional`, então o filtro que
aceitava `null` saiu (agora exige o id); `truncado` alimenta a oferta
("Se nenhum servir, tenho outras opções") e o log; e `slots: []` com `ok: true` é
resposta legítima — rota `sem_horarios`, sem registrar erro de ferramenta.

### 2.3 Escritas

| Nó | Rota | Chave |
| --- | --- | --- |
| `criar consulta` | `POST /api/ai/agendamentos` | `chave_idempotencia = pendente.acao_id` |
| `reagendar consulta` | `POST /api/ai/agendamentos/reagendar` | nenhuma (idempotente por estado) |
| `cancelar consulta` | `POST /api/ai/agendamentos/cancelar` | nenhuma; `motivo: 'cliente_solicitou'` |
| `consultas do cliente` | `POST /api/ai/agendamentos/buscar` | status só de `pendente\|agendado\|confirmado` |
| `atualizar cadastro` | `POST /api/ai/cliente` | só `nome\|email\|data_nascimento\|interesses` |

O `acao_id` é limitado a 120 caracteres na origem (`avaliar horários` e
`decidir sobre consultas`), que é o limite da API.

### 2.4 Leitura do resultado

`verificar resultado`, `confirmar cadastro` e `decidir sobre consultas` leem
`ok`, `data.agendamento.id`, `error.code` e `error.retryable`. O mapa:

| Resposta | Rota | Pausa a IA? |
| --- | --- | --- |
| `ok: true` + `data.agendamento.id` (inclusive `repetida: true`) | sucesso | não |
| `HORARIO_INDISPONIVEL`, `CONFLITO_HORARIO` | reoferta horários | não |
| `PROCEDIMENTO_INVALIDO`, `PROFISSIONAL_INVALIDO` | reoferta catálogo | não |
| `CONSULTA_NAO_ENCONTRADA`, `CONSULTA_NAO_REAGENDAVEL` | oferece listar de novo | não |
| `FALHA_TEMPORARIA` (`retryable: true`) | repete **1×** com o mesmo pedido | só se persistir |
| `CLIENTE_INVALIDO`, `CONSULTA_NAO_CANCELAVEL`, `AUTENTICACAO_INVALIDA`, `AUTOMACAO_INDISPONIVEL`, `INSTANCIA_*`, `EMPRESA_NAO_CONFIGURADA`, `ENTRADA_INVALIDA`, `CHAVE_IDEMPOTENCIA_CONFLITANTE`, `AGENDAMENTO_NAO_ESTA_ATIVO`, **código desconhecido** | para e chama uma pessoa | sim |
| resposta sem envelope (sem JSON, ou sem o campo `ok`) | para e chama uma pessoa | sim |

Todo nó de agenda usa `neverError: true`, timeout de 15 s e
`onError: continueRegularOutput`: a API devolve 4xx e 5xx **com** envelope, e é o
corpo — não o status HTTP — que decide a rota.

### 2.5 O que saiu do JSON

Zero ocorrências de `SUPABASE`, `rest/v1`, `id_info_clinica`, `cancelada`,
`status=neq`, `senha_hash`, `$fromAI` e de qualquer nó `n8n-nodes-base.supabase`.
`corpo_criar` e `corpo_reagendar` sumiram junto com `conferir revalidação`. O
vocabulário de status agora é só o da API.

### 2.6 Variáveis novas

`AGENDA_API_BASE_URL` (origem do backend) e `AGENDA_AUTOMATION_TOKEN` (header
`X-Automation-Token`). Só os nomes estão no repositório.

### 2.7 Texto honesto na transferência

Nenhum nó avisa o negócio. O que acontece é: a IA pausa (`am:handoff:...`) e a
conversa continua no WhatsApp do próprio negócio. Os textos de `humano`,
`falha_ferramenta` e `resultado_sem_id` passaram a dizer
*"Vou parar por aqui e deixar com a equipe do {empresa}, que continua com você
nesta conversa."* — em vez de "Já avisei a equipe" e "pedi para conferir".
`dividir resposta` teve o mesmo ajuste no texto de emergência.

### 2.8 Verificador determinístico de sucesso

Em `montar resposta`, se o texto de tipo `livre` ou `esclarecer` (o que a IA
escreveu) casar com `/agendad|confirmad|cancelad|remarcad|reservad|marcad/i` sem
efeito verificado na mesma execução, ele é substituído por um modelo neutro. É
regex, não IA. Só o modelo fixo pode usar esse vocabulário, e só depois de
`ok: true` com `data.agendamento.id`.

### 2.9 Validador e testes

`validar_workflow.py` inverteu as regras: agora é **erro** conter
`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `rest/v1`, `id_info_clinica`,
`cancelada`, `status=neq`, `senha_hash`, `$fromAI` ou um nó Supabase; e é
**obrigatório** que cada nó de agenda use `$env.AGENDA_API_BASE_URL`, o header
`X-Automation-Token` vindo de `$env.AGENDA_AUTOMATION_TOKEN`, `neverError` e
timeout. `revalidar horário` e `conferir revalidação` saíram dos obrigatórios;
`contexto da empresa` e `repetir escrita` entraram. Continuam valendo: inativo,
`pinData` vazio, `saveDataSuccessExecution: none`, um único agente, chaves do
Redis com instância, saídas de switch com destino, referências e órfãos.

`tests/test_regras.mjs` foi para 40 casos, todos com fixtures no envelope da API.
Os novos: `repetida: true` é sucesso (T25); `CONFLITO_HORARIO` reoferta (T26);
`FALHA_TEMPORARIA` repete 1× com o mesmo corpo e depois transfere (T27); resposta
sem envelope vira handoff (T28); `agendavel: false` vira humano (T29);
`AUTENTICACAO_INVALIDA` e os demais bloqueantes param sem responder sucesso
(T30); catálogo/consulta inválidos reofertam (T31); o verificador determinístico
troca texto que afirma efeito (T32); janela fora do expediente não vira chamada
(T33); e E07 conta os literais proibidos.

---

## 3. Decisões e motivos

| # | Decisão | Motivo |
| --- | --- | --- |
| D1 | `executar ação` também foi removido, além de `revalidar horário` e `conferir revalidação` | ele decidia pelo campo `acao`, que só existia em `conferir revalidação`. Sem esse nó, nada seria criado. `tipo da ação` virou um switch de três saídas (`cancelar`/`agendar`/`reagendar`) mais um fallback que não executa. |
| D2 | O corpo das escritas é montado uma única vez, em `resolver e decidir` (`escrita.caminho` + `escrita.corpo`) | a repetição precisa mandar **o mesmo pedido**. Se cada nó montasse o seu, a chave de idempotência poderia mudar entre a tentativa e a repetição. |
| D3 | A repetição virou dois nós no grafo (`repetir escrita?` + `repetir escrita`), em vez de `maxTries` | com `neverError: true` — necessário para ler o envelope — um `503` não é mais erro de nó, então `retryOnFail` nunca dispararia nele. `maxTries: 2` continua nos nós de escrita, mas só cobre falha de rede. `repetir escrita` tem `retryOnFail: false`: uma repetição, não um laço. |
| D4 | `operação concluída?` virou `pode seguir sem pessoa?`, decidindo por `precisa_humano` | horário ocupado, catálogo mudado e consulta não encontrada não são motivo para pausar a IA: o cliente pode escolher outro horário na mesma conversa. Só falha de escrita sem resultado confiável pausa. Nos dois casos a pendência morta é apagada. |
| D5 | Falha de **leitura** virou um tipo próprio, `falha_temporaria` | as rotas de leitura (`buscar horários`, `consultas do cliente`, `atualizar cadastro`) não passam por nenhum nó de pausa. Usar o texto de `falha_ferramenta` ali afirmaria uma transferência que não aconteceu. `falha_temporaria` diz "não consegui concluir, nada foi alterado, quer tentar de novo?". |
| D6 | `decidir sobre consultas` passou a distinguir falha de agenda vazia | antes, um erro do Supabase caía no filtro e virava `sem_consultas` — ou seja, o fluxo dizia "você não tem nenhum horário marcado" quando na verdade não sabia. Agora falha é falha. |
| D7 | `resolver e decidir` recusa janela vazia antes de chamar a API | "hoje à tarde" perguntado às 20h produzia `inicio > fim`. O PostgREST devolvia lista vazia; a API devolve `ENTRADA_INVALIDA`, que é código bloqueante e viraria transferência por engano. Agora responde `sem_horarios` sem chamar ninguém (T33). |
| D8 | Telefone e instância dos testes são sintéticos (`000000000000`, `instancia-de-teste`) | o arquivo de teste é versionado; nenhum dado real entra nele. |
| D9 | O nó de fim do contexto foi renomeado para `fim - contexto indisponível` | ele cobre agora token inválido, instância desconhecida, empresa sem onboarding, telefone irreconhecível e falha temporária — não só "instância sem empresa". Continua encerrando **sem responder ao cliente**, como manda o contrato. |
| D10 | O `nome` (push name) é enviado só em `/api/ai/contexto` | ele só é usado na criação do cadastro e não sobrescreve nome existente. Mandá-lo na criação do agendamento seria ruído. |

---

## 4. Pendente ou bloqueado

| # | Item | Natureza |
| --- | --- | --- |
| P1 | `AUTOMATION_API_TOKEN` ainda não existe no `.env` do backend. Sem ele, toda rota responde `AUTOMACAO_INDISPONIVEL` e a automação transfere tudo | operacional — gerar e preencher antes de qualquer teste manual |
| P2 | `AGENDA_API_BASE_URL` e `AGENDA_AUTOMATION_TOKEN` precisam ser criadas no ambiente do n8n. Remova de lá `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`, que a automação não usa mais | operacional |
| P3 | O backend precisa de **URL pública alcançável pelo n8n**. Em máquina local isso exige túnel ou deploy | operacional |
| P4 | `services/api/.env.example` ainda cita o path antigo do webhook. `EVOLUTION_WEBHOOK_URL` precisa apontar para `.../webhook/agenda-magnetica-v2` | fora do escopo deste agente (`services/api/**` é de outro escopo) |
| P5 | **Ninguém é avisado na transferência.** A IA pausa e o texto diz que a equipe continua na conversa — o que é verdade, porque a conversa é no WhatsApp do próprio negócio. Notificação real (push, e-mail, painel) fica para a Central de Atendimento | produto — fase futura |
| P6 | Falha de leitura não pausa a IA (D5). Se um cliente insistir com o backend fora do ar, ele receberá "não consegui concluir" várias vezes sem transferência | aceito; revisar junto com a Central de Atendimento |
| P7 | A automação nunca foi executada contra o backend real. Todos os testes são de lógica, com envelopes sintéticos | homologação |
| P8 | A credencial Supabase antiga do n8n deve ser **revogada**, não só removida do JSON | segurança — a chave viveu dentro do n8n e vale como comprometida |
| P9 | Workflow segue `active: false` e não foi importado em servidor nenhum | por decisão explícita |

---

## 5. Próximo passo exato

1. Gerar o token no backend e colocá-lo em `AUTOMATION_API_TOKEN`:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

2. Subir o backend e confirmar que ele responde:

```bash
services/api/.venv/Scripts/python services/api/server.py
```

3. Fumaça da API antes de tocar no n8n (substitua host, token e instância):

```bash
curl -sS -X POST http://localhost:8000/api/ai/contexto -H "Content-Type: application/json" -H "X-Automation-Token: $AUTOMATION_API_TOKEN" -d '{"instance_name":"<instancia_de_homologacao>","telefone":"<telefone_de_teste>"}'
```

4. No n8n: criar `AGENDA_API_BASE_URL` e `AGENDA_AUTOMATION_TOKEN`, importar
   `automation/n8n/AgendaMagnetica-v2.n8n.json`, religar as credenciais de
   Webhook, Redis e OpenAI, e apontar `EVOLUTION_WEBHOOK_URL` para o path
   `agenda-magnetica-v2`.
5. Rodar a matriz de `TESTES_AUTOMACAO_V2.md` em **duas** empresas de
   homologação, com o **mesmo telefone** nas duas, cobrindo criar, consultar,
   remarcar, cancelar e pedido de atendimento humano.
6. Só depois disso discutir ativação, com revisão humana e auditoria ligadas.

---

## 6. Arquivos e comandos

Alterados nesta entrega:

- `automation/n8n/AgendaMagnetica-v2.n8n.json` — 84 → 78 nós
- `automation/n8n/validar_workflow.py`
- `automation/n8n/tests/test_regras.mjs` — 30 → 40 casos
- `automation/n8n/README.md`
- `automation/n8n/TESTES_AUTOMACAO_V2.md`
- `docs/planning/AUTOMATION_V2_API_HANDOFF.md` (este arquivo)

Não tocados: `automation/n8n/AgendaMagnetica.n8n.json` (V1), `services/api/**`,
`scripts/**`, `apps/**`, `.github/**`.

Validação:

```bash
python automation/n8n/validar_workflow.py
```

```bash
node automation/n8n/tests/test_regras.mjs
```

Contagem de literais que precisam continuar em zero:

```bash
grep -o -E 'SUPABASE|rest/v1|id_info_clinica|cancelada|[$]fromAI' automation/n8n/AgendaMagnetica-v2.n8n.json | sort | uniq -c
```

*Entrega de 2026-08-21. Nenhum commit, nenhum push, workflow inativo.*
