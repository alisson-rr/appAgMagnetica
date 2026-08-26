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

O workflow `automation/n8n/AgendaMagnetica-v2.n8n.json` usa **15 nós Redis** —
é o tipo de nó mais frequente do fluxo inteiro. Ele não usa o Redis como cache:
guarda seis famílias de chave com TTL (dedup de mensagem, handoff, buffer,
ação pendente, estado da conversa, trava de ação), descritas em
`automation/n8n/README.md` § "Chaves do Redis".

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

O `automation/n8n/README.md` § "Antes de ativar" continua valendo inteiro (9
itens). Este arquivo não substitui aquele — só garante que a infraestrutura por
baixo existe e está configurada do jeito que o fluxo espera.

Os dois workflows continuam `active: false`. Nada aqui autoriza ativar.
