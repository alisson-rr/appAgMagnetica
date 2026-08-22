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

## O que este projeto ainda não tem na VPS

### O backend FastAPI não tem endereço

O workflow chama `AGENDA_API_BASE_URL` em **10 nós** (`/api/ai/contexto`,
`/api/ai/disponibilidade`, `/api/ai/agendamentos*`, `/api/ai/cliente`).
`services/api` não está hospedado em lugar nenhum desta VPS.

Se for rodar aqui, o que falta é:

1. uma stack nova (ex.: `api-agenda`) com a imagem do FastAPI;
2. um registro `A` para um subdomínio (ex.: `api.` do domínio escolhido),
   **DNS only** se estiver na Cloudflare;
3. uma entrada no `Caddyfile` da stack `caddy-proxy` apontando para ela;
4. a rede `proxy` (para o Caddy alcançar) e, se precisar do Redis, `internal`.

Enquanto isso não existir, `AGENDA_API_BASE_URL` tem que apontar para onde o
backend realmente estiver, e essa origem precisa ser alcançável pela internet —
o `n8n-worker` sai pela rede `proxy`, então tem saída.

### Variáveis de ambiente do n8n

O `automation/n8n/README.md` lista quatro variáveis que o fluxo espera
(`EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY`, `AGENDA_API_BASE_URL`,
`AGENDA_AUTOMATION_TOKEN`). Elas **ainda não foram cadastradas** nas stacks —
entram no bloco `x-n8n-env` de `infra/stacks/06-n8n.yml` (para valerem nos três
containers) e nas *Environment variables* da stack `n8n` no Portainer.

Nunca no nó, nunca no prompt — e lembre que
`N8N_BLOCK_ENV_ACCESS_IN_NODE=true` está ligado, então um Code node **não**
consegue ler o ambiente. Segredo de verdade vai como *Credential* do n8n.

---

## Antes de ativar o workflow

O `automation/n8n/README.md` § "Antes de ativar" continua valendo inteiro (9
itens). Este arquivo não substitui aquele — só garante que a infraestrutura por
baixo existe e está configurada do jeito que o fluxo espera.

Os dois workflows continuam `active: false`. Nada aqui autoriza ativar.
