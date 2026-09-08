# Infraestrutura na VPS — o que já existe e o que este projeto ainda precisa

> **Leia antes de escrever qualquer coisa sobre hospedagem, Redis, Evolution
> API ou n8n neste repositório.** A infraestrutura foi montada em 22/08/2026 e
> as decisões abaixo já estão valendo em produção.

A VPS não pertence a este projeto: ela foi montada para a **FixWear**
(repositório `APP-FixWear`, pasta `infra/`, branch `infra/fixwear-vps`), e a
Agenda Magnética foi analisada durante a montagem para que o dimensionamento
já a comportasse. Os arquivos de stack, os scripts e a documentação de
operação moram lá — **este arquivo é só o recorte que interessa aqui.**

---

## O que já está no ar

| Stack | Contém | Serve a Agenda Magnética? |
|---|---|---|
| `caddy-proxy` | Caddy 2.11 — HTTPS automático | sim, quando houver subdomínio |
| `postgres` | PostgreSQL 17, 2 bancos isolados | **não** — este projeto usa Supabase |
| `redis-evolution` | Redis das chaves Signal do WhatsApp | não — é da Evolution, não dos fluxos |
| `evolution` | Evolution API v2.3.7 | **sim**, ver abaixo |
| `redis-n8n` | Redis: `db0` fila, `db1` dados de workflow | **sim**, ver abaixo |
| `n8n` | main + worker + webhook (queue mode) | **sim** |

Rede: `internal` (sem saída para a internet, onde ficam bancos e Redis) e
`proxy` (o Caddy e quem ele alcança).

---

## Decisões tomadas por causa deste projeto

### 1. O `redis-n8n` tem dois bancos, e o `db1` é seu

O workflow `automation/n8n/AgendaMagnetica-v2.n8n.json` usa **19 nós Redis** —
é o tipo de nó mais frequente do fluxo inteiro. Ele não usa o Redis como cache:
guarda oito famílias de chave com TTL (dedup de mensagem, handoff, buffer,
ação pendente, estado da conversa, trava de ação, id do próprio envio e
auditoria do atendimento), descritas em `automation/n8n/README.md`
§ "Chaves do Redis".

Por isso:

- **`db0`** é a fila do BullMQ (queue mode do n8n). Não use.
- **`db1`** é para os nós Redis dos workflows. **Configure a credencial Redis
  do n8n apontando para o banco 1.**
- **AOF está ligado** (`appendonly yes`) por causa deste projeto, não da fila.
  A fila é descartável; a chave `am:pendente:{instancia}:{telefone}` não é —
  um restart sem persistência apagaria a confirmação no meio da conversa, e o
  "sim" do cliente não criaria agendamento nenhum.
- **`noeviction`**: se encher, a escrita falha alto em vez de despejar chave em
  silêncio. `maxmemory` é 512 MB.

Se o `db1` crescer a ponto de pressionar a fila, a saída é subir um terceiro
Redis e trocar o host na credencial — não relaxar a política de eviction.

#### Duas chaves novas no `db1` (rodada de correções de 2026-09)

| Chave | Valor | TTL | Para que serve |
|---|---|---|---|
| `am:enviada:{instancia}:{msg_id}` | `1` | 300 s | reconhecer o eco do próprio envio |
| `am:auditoria:{instancia}:{msg_id}` | registro do atendimento em JSON | 30 dias | única evidência do que a IA decidiu |

**`am:enviada:`** existe porque a Evolution reemite como `messages.upsert`, com
`fromMe: true`, a mensagem que a própria API mandou. Sem essa chave o fluxo lia
o eco como "o dono respondeu pelo celular" e gravava `am:handoff:` por 30 min —
o bot se autopausava depois de cada resposta. É gravada uma por parte enviada
(no máximo três por resposta) e some em cinco minutos. Não é fonte de
crescimento: só existe o que foi enviado nos últimos 300 s, algumas dezenas de
chaves de `1` byte na hora do pico.

**`am:auditoria:`** existe porque `saveDataSuccessExecution: none` apaga a
execução que deu certo. Sem ela, um atendimento correto não deixa rastro
nenhum. O registro é anônimo por construção — `registrar decisão` grava
instância, `msg_id`, intenção, confiança, rota, motivo, tipo de resposta, ação
pendente e um bloco `detalhe`; **não** grava telefone, nome nem o texto da
conversa.

Conta de crescimento (aritmética, não medição — confirme com
`MEMORY USAGE <chave>`): chave ≈ 60 bytes, registro na casa de 400 a 700 bytes,
sobrecarga do Redis somada dá **~1 KB por atendimento respondido**. Trinta
empresas a 40 atendimentos por dia são 1.200 chaves por dia; em 30 dias de TTL
o conjunto estaciona em **36.000 chaves ≈ 36 MB**, ou 7% dos 512 MB de
`maxmemory`. O regime é estacionário: a partir do dia 30 expira tanto quanto
entra. Se o número de empresas passar de ~300 nesse mesmo ritmo, a auditoria
sozinha come metade da memória — nessa hora a trilha sai do Redis e vai para o
banco, que é para onde ela deve ir de qualquer forma.

Para ler os registros de uma instância, de dentro do container do `redis-n8n`:

```bash
# lista as chaves de auditoria da instância (--scan, nunca KEYS: o db0 desta
# mesma instância é a fila do n8n e KEYS bloqueia o servidor inteiro)
docker exec <container-redis-n8n> redis-cli -n 1 --scan --pattern 'am:auditoria:studio-aurora:*'

# lê um registro
docker exec <container-redis-n8n> redis-cli -n 1 get 'am:auditoria:studio-aurora:<msg_id>'
```

Se o `redis-cli` pedir `AUTH`, use a variável de ambiente que já existe **dentro
do container** (`-a "$REDIS_PASSWORD"`, com `--no-auth-warning`). Não digite a
senha na linha de comando: ela fica no histórico do shell e no `ps`.

### 2. A Evolution API é compartilhada, e isso é uma decisão em aberto

Já existe uma Evolution v2.3.7 no ar, com a instância `fixwear`. Uma Evolution
atende **várias instâncias**, e este projeto deriva a empresa a partir do nome
da instância (`usuarios.instance_name → empresa`) — então as instâncias da
Agenda Magnética entram como instâncias novas, **sem stack nova**.

O custo dessa economia é raio de explosão compartilhado: **a Evolution cair
derruba os dois produtos.** Se a Agenda Magnética for para produção com
clientes reais, avalie subir uma segunda stack de Evolution, com seu próprio
Postgres schema e seu próprio Redis. A decisão ainda não foi tomada.

Detalhes operacionais (criar instância, ler QR, teste de aceitação de 9 passos,
o que fazer quando a sessão cai) estão em `infra/docs/EVOLUTION.md` no
repositório da FixWear.

Desde a rodada de setembro há **uma chamada a mais do worker para a Evolution
por áudio e por imagem**: `buscar áudio` e `buscar imagem` fazem
`POST /chat/getBase64FromMediaMessage/{instancia}` (timeout 10 s, sem
repetição) antes da transcrição, porque o webhook é registrado com
`base64: false` (`services/api/evolution_api.py`). Só mensagem de mídia paga
esse custo; texto não muda. Ligar `base64` no webhook eliminaria a chamada ao
preço de o payload retido crescer — decisão em aberto, ver
`docs/planning/CORRECOES_AUTOMACAO_2026-09.md`.

#### Pré-requisito: a instância precisa gravar as mensagens recebidas

**Confirme isto antes da homologação.** O corpo que o fluxo envia carrega só a
chave da mensagem (`{ message: { key: { id } } }`), sem o conteúdo. Nesse caso a
Evolution 2.3.7 não tem o que decodificar em memória e vai buscar a mensagem no
próprio banco (`SELECT ... FROM "Message" WHERE "key"->>'id' = ...`). Se a
instância roda com a gravação de mensagens recebidas desligada
(`DATABASE_SAVE_DATA_NEW_MESSAGE=false`), a consulta volta vazia e a rota
responde **400 `Message not found`** — em **todo** áudio e **toda** imagem, não
em caso de borda. O cliente recebe "não consegui ouvir seu áudio" sempre.

Esta é uma configuração da Evolution, **compartilhada com a FixWear**: não está
sob controle deste repositório, e `validar_workflow.py` não tem como verificá-la.

Como conferir, na ordem mais barata:

```bash
docker exec <container-evolution> printenv | grep -E 'DATABASE_SAVE_DATA'
```

O teste que decide, porém, é o de ponta a ponta: mande um **áudio real** para a
instância de homologação e confira no histórico do n8n que `buscar áudio`
respondeu `200` com o base64 preenchido. É o passo 9 de "Antes de ativar" no
`automation/n8n/README.md`.

Se a flag não puder ser garantida, o plano B já está mapeado: ligar
`"base64": True` no registro do webhook (`services/api/evolution_api.py`) e
voltar a consumir o base64 que chega no próprio payload, removendo os dois nós
de busca. É a mesma decisão em aberto do parágrafo anterior, vista pelo outro
lado.

#### Risco aceito: o alerta de erro depende da Evolution que ele deveria vigiar

O `AgendaMagnetica-erro.n8n.json` avisa o operador por
`POST /message/sendText` — na mesma Evolution, com a mesma credencial. E o modo
de falha mais provável do fluxo é justamente a Evolution recusar o envio
(`fim - falha no envio` só existe por causa disso). Se a instância cair, perder
a sessão do WhatsApp ou tiver a apikey trocada, o alerta cai junto: o detector
falha exatamente no cenário em que ele mais importa.

Foi aceito porque não há segundo canal disponível nesta fase — não existe
Central de Atendimento, e-mail transacional nem push. A mitigação que existe
hoje: `fim - alerta não enviado` **lança**, e o fluxo de erro grava execução em
todos os casos (`saveDataSuccessExecution: all`), então a tentativa frustrada
fica registrada no histórico do n8n. O rastro existe; o aviso, não. Quem opera
precisa olhar o histórico de execuções do fluxo de erro periodicamente enquanto
esse canal for único. Um segundo canal independente da Evolution (e-mail ou
webhook externo) é o que fecha esse buraco, e depende de decisão do dono.

### 3. O n8n roda em queue mode — o webhook tem processo próprio

São três containers: `n8n` (editor), `n8n-worker` (executa) e `n8n-webhook`
(recebe e enfileira). O Caddy roteia por caminho:

```
/webhook/*          →  n8n-webhook
/webhook-waiting/*  →  n8n-webhook
todo o resto        →  n8n (main), inclusive /webhook-test/*
```

Consequências para este projeto:

- O webhook de produção do fluxo (`path: agenda-magnetica-v2`) é atendido pelo
  container `n8n-webhook`. A URL pública não muda.
- **`/webhook-test/*` continua no main de propósito** — a execução de teste
  está amarrada à sessão aberta do editor. Se alguém "otimizar" o Caddy
  mandando esse caminho para o webhook, o botão *Test workflow* fica girando
  para sempre, sem erro no log.
- Execução manual também roda no worker
  (`OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS=true`).
- Concorrência do worker limitada a **5** execuções simultâneas — a VPS tem 2
  núcleos. Ao ampliar CPU, suba esse número
  (`N8N_CONCURRENCY_PRODUCTION_LIMIT`).

### 4. Retenção de execuções: a execução com erro guarda a conversa inteira

O fluxo da Agenda Magnética sai do repositório com
`saveDataSuccessExecution: none` e **`saveDataErrorExecution: all`**. Guardar o
erro inteiro é deliberado — é o que permite descobrir por que um cliente ficou
sem resposta —, mas o "inteiro" inclui o payload da Evolution: telefone do
cliente, texto da mensagem, transcrição do áudio e a descrição da imagem. Isso é
dado pessoal parado no Postgres do n8n, que é compartilhado com a FixWear.

Sem expurgo, esse acervo só cresce. A instância precisa de:

| Variável | Valor | Por quê |
|---|---|---|
| `EXECUTIONS_DATA_PRUNE` | `true` | sem isso as outras duas não fazem nada |
| `EXECUTIONS_DATA_MAX_AGE` | `168` | horas, ou seja 7 dias — prazo para investigar um erro relatado, e não mais que isso |
| `EXECUTIONS_DATA_MAX_COUNT` | um teto (comece em `5000`, ajuste pelo volume real) | idade não protege contra um pico: uma noite de falha em massa enche o banco antes de qualquer expurgo por data |

Os dois tetos convivem: vale o que estourar primeiro.

**Conferir o valor efetivo** — o que vale é o que está *dentro* do container,
não o que está no arquivo de stack:

```bash
docker exec <container-n8n> printenv | grep -E '^EXECUTIONS_DATA_'
```

Filtre sempre com o `grep`: `printenv` sozinho despeja `N8N_ENCRYPTION_KEY`,
`N8N_DB_PASSWORD` e `REDIS_N8N_PASSWORD` na tela.

Confira nos **três** containers (`n8n`, `n8n-worker`, `n8n-webhook`). Eles
compartilham o bloco `x-n8n-env` de `infra/stacks/06-n8n.yml`, mas basta um
ficar de fora para o valor efetivo divergir do arquivo — e quem escreve os
dados de execução é o worker, enquanto quem faz o expurgo é o main. Se o `grep`
não devolver nada, o padrão do n8n está valendo e **não há expurgo**.

---

## O que este projeto NÃO usa da VPS

### O backend FastAPI não roda aqui — ele está na Vercel

> **Corrigido em 26/08/2026.** A versão anterior dizia que o backend não tinha
> endereço. Ele tem: `api/index.py` reexporta o app de `services/api` como
> função Python da Vercel, e o `vercel.json` manda `/api/(.*)` para lá. Origem:
> `https://agenda-magnetica-painel.vercel.app` — a mesma do painel.

Consequências para quem mexe na automação:

- **Não suba stack de API nesta VPS** para atender o fluxo. O `n8n-worker` sai
  pela rede `proxy`, então alcança a Vercel pela internet normalmente.
- **`GET /health` não serve de teste de vida.** O rewrite
  `/((?!api/).*)` → `/index.html` devolve o HTML do painel com `200`, mesmo com
  o backend quebrado. O teste que vale é uma chamada sem token a
  `POST /api/ai/contexto`: `401 AUTENTICACAO_INVALIDA` = vivo e configurado;
  `503 AUTOMACAO_INDISPONIVEL` = `AUTOMATION_API_TOKEN` ausente ou com menos de
  32 caracteres **nas variáveis do projeto na Vercel**.
- O `.env` local não chega na Vercel. Cadastrar o token só ali derruba toda
  rota `/api/ai/*` em produção — e o fluxo encerra sem responder ao cliente.

### O fluxo não usa variável de ambiente do n8n

`N8N_BLOCK_ENV_ACCESS_IN_NODE=true` (bloco `x-n8n-env` de
`infra/stacks/06-n8n.yml`) vale para **expressão**, não só para Code node:
`{{ $env.X }}` lança `access to env vars denied` dentro do `n8n-worker`. Com os
nós HTTP em `onError: continueRegularOutput`, isso não aparecia como erro — a
execução terminava "com sucesso" sem responder nada.

A flag fica `true`. Baixá-la entregaria `N8N_ENCRYPTION_KEY`,
`N8N_DB_PASSWORD` e `REDIS_N8N_PASSWORD` a qualquer expressão de qualquer
workflow da instância — inclusive os da FixWear. Quem mudou foi o fluxo:

- **origem de serviço** (não é segredo) → constante no topo de
  `normalizar entrada`, publicada como `api_base` e `evolution_base`;
- **segredo** → *Credential* Header Auth do n8n, cifrada pela
  `N8N_ENCRYPTION_KEY`.

Não há nada a cadastrar em `x-n8n-env` para este projeto.

---

## Antes de ativar o workflow

O `automation/n8n/README.md` § "Antes de ativar" continua valendo inteiro (11
itens). Este arquivo não substitui aquele — só garante que a infraestrutura por
baixo existe e está configurada do jeito que o fluxo espera. Dois dos itens de
lá dependem desta seção 2: a prova de que o alerta de erro chega ao operador e a
prova de que a busca de mídia devolve `200`.

Os dois workflows continuam `active: false`. Nada aqui autoriza ativar.
