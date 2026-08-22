# API da automação — contrato fechado

> **Para quem:** o agente que vai adaptar `automation/n8n/AgendaMagnetica-v2.n8n.json`.
> Este documento é **autossuficiente**: não presume nenhuma conversa anterior.
> **Estado:** implementado, aplicado ao banco e testado em 2026-08-21.
> Revisado no mesmo dia — o que mudou está em **Errata e fechamento**, no fim
> deste arquivo. O contrato das rotas **não** mudou.
> **Base:** `services/api/ai_api.py`, `services/api/dominio.py`,
> `scripts/ajustes_ai_api.sql`, `scripts/integridade_tenant.sql`.
> **Fuso:** `America/Sao_Paulo`. **Moeda:** BRL. **Idioma:** pt-BR.
> **Nenhum arquivo em `automation/**` foi alterado.** O workflow segue `active: false`.

---

## 1. O que mudou e por quê

Antes, o workflow falava direto com o PostgREST usando `SUPABASE_SERVICE_ROLE_KEY`,
montava filtros de URL e escolhia a empresa por conta própria. Três consequências
reais: a chave administrativa do banco vivia dentro do n8n; um filtro errado
vazava dado entre empresas; e um `HTTP 200` era tratado como prova de que o
agendamento existia.

Agora existe `/api/ai/*`. Depois de migrar os nós:

- o n8n **não precisa mais** de `SUPABASE_SERVICE_ROLE_KEY` nem de `SUPABASE_URL`;
- a empresa é **derivada no servidor** a partir de `instance_name` — não existe
  parâmetro de empresa em nenhuma rota;
- toda escrita é **relida no banco** antes de a API responder `ok: true`;
- o vocabulário de status (`cancelado`, não `cancelada`) fica dentro da API.

---

## 2. Autenticação

| Item | Valor |
|---|---|
| Header | `X-Automation-Token` |
| Valor | conteúdo de `AUTOMATION_API_TOKEN` (variável do backend) |
| Comparação | tempo constante (`hmac.compare_digest`) |
| Tamanho mínimo | 32 caracteres |
| Token ausente ou errado | `401` + `AUTENTICACAO_INVALIDA`, sem detalhe |
| Token não configurado no servidor | `503` + `AUTOMACAO_INDISPONIVEL` |

**Não reutilize o JWT do painel.** Ele carrega usuário, empresa e papel; dá à
automação a identidade de uma pessoa. Um JWT do painel enviado neste header é
recusado com `401` — há teste para isso.

Todas as rotas são `POST` com corpo JSON. Nenhum dado pessoal vai em query
string. Campo desconhecido no corpo é **erro** (`extra=forbid`), não é ignorado:
é o que impede o fluxo de tentar enviar `id_info_clinica` ou um filtro.

---

## 3. Como o tenant é derivado

```
instance_name  ──▶  usuarios.instance_name  ──▶  usuarios.id_info_clinica  ──▶  empresa
```

- A consulta seleciona **apenas** `id_info_clinica`. `senha_hash` e e-mail de
  login nunca saem da tabela.
- Instância sem linha em `usuarios` → `INSTANCIA_DESCONHECIDA`.
- Instância com `id_info_clinica` nulo (cadastro sem onboarding) →
  `EMPRESA_NAO_CONFIGURADA`.
- Duas linhas com a mesma instância → `INSTANCIA_AMBIGUA`. Não acontece com o
  índice `ux_usuarios_instance_name` aplicado, mas a API recusa em vez de
  escolher uma empresa.
- Procedimento, profissional, cliente e consulta são **sempre** conferidos
  contra a empresa resolvida. "Não existe" e "é de outra empresa" devolvem a
  mesma resposta, para não confirmar a existência de cadastro alheio.

O `id_info_clinica` **não é devolvido** em nenhuma resposta: nenhuma rota o
aceita, então a automação não teria o que fazer com ele.

### Telefone

O número é normalizado no servidor para a forma `55` + DDD + número, só dígitos.
Aceita JID (`5551999990000@s.whatsapp.net`), formatado (`(51) 99999-0000`) e
internacional (`+55 51 ...`). A busca ainda cobre a forma sem código do país e a
forma sem o nono dígito, porque o painel e o WhatsApp gravam diferente.
Telefone irreconhecível → `CLIENTE_INVALIDO`.

O mesmo telefone em duas empresas gera **dois cadastros independentes**. É o
comportamento correto e está coberto por teste.

---

## 4. Rotas

Todas: `POST`, corpo JSON, header `X-Automation-Token`.

| Rota | Para quê |
|---|---|
| `/api/ai/contexto` | empresa + cliente (localiza ou cria) + catálogo |
| `/api/ai/disponibilidade` | horários livres |
| `/api/ai/agendamentos/buscar` | agendamentos do telefone |
| `/api/ai/agendamentos` | criar (idempotente por chave) |
| `/api/ai/agendamentos/reagendar` | remarcar (idempotente por estado) |
| `/api/ai/agendamentos/cancelar` | cancelar (idempotente por estado) |
| `/api/ai/cliente` | atualizar campos permitidos do cadastro |

### Envelope

Sucesso — sempre `HTTP 200`:

```json
{ "ok": true, "data": { }, "error": null }
```

Erro — o HTTP status também é significativo (401, 404, 409, 422, 503):

```json
{
  "ok": false,
  "data": null,
  "error": { "code": "HORARIO_INDISPONIVEL", "message": "Esse horário não está mais livre.", "retryable": false }
}
```

`message` é seguro para trafegar: não traz nome de tabela, SQLSTATE nem id de
outra empresa. Ainda assim **não é texto para o cliente** — a redação da
mensagem de WhatsApp continua sendo do fluxo.

---

### 4.1 `POST /api/ai/contexto`

Resolve a empresa, normaliza o telefone, **localiza ou cria** o cliente e
devolve o catálogo agendável.

```json
{
  "instance_name": "agm_12_studioaurora",
  "telefone": "5551988887777",
  "nome": "Marina Souza"
}
```

`nome` é opcional (use o `push_name` do WhatsApp) e só é usado na criação; não
sobrescreve um cadastro existente. Caracteres de controle são removidos.

```json
{
  "ok": true,
  "data": {
    "empresa": {
      "nome": "Studio Aurora",
      "telefone": "(51) 3333-0000",
      "email": "contato@studioaurora.example",
      "endereco": "Av. Ipiranga, 100 - Porto Alegre",
      "assistente_nome": "Aurora",
      "assistente_tom": "acolhedor",
      "exige_profissional": false,
      "fuso": "America/Sao_Paulo",
      "horarios": [{ "dia_semana": 5, "hora_inicio": "09:00", "hora_fim": "18:00" }]
    },
    "cliente": {
      "nome": "Marina Souza",
      "telefone": "5551988887777",
      "email": null,
      "data_nascimento": null,
      "interesses": null,
      "novo": true
    },
    "procedimentos": [
      { "id": 29, "nome": "Limpeza de pele", "valor": 180.0, "duracao_minutos": 60, "agendavel": true }
    ],
    "profissionais": [{ "id": 26, "nome": "Ana Beatriz", "area": "" }]
  },
  "error": null
}
```

- `agendavel: false` significa que **nenhum profissional ativo** executa aquele
  serviço. Ele tem preço e duração para responder a uma pergunta, mas
  `disponibilidade` devolveria zero horário para sempre. Trate como
  transferência para uma pessoa, não como "sem vaga hoje".
- `dia_semana`: 1 = segunda … 7 = domingo.
- Os únicos ids devolvidos são os que as próximas chamadas precisam:
  `procedimentos[].id` e `profissionais[].id`.

Erros: `AUTENTICACAO_INVALIDA`, `INSTANCIA_DESCONHECIDA`,
`EMPRESA_NAO_CONFIGURADA`, `CLIENTE_INVALIDO`, `FALHA_TEMPORARIA`.

---

### 4.2 `POST /api/ai/disponibilidade`

```json
{
  "instance_name": "agm_12_studioaurora",
  "id_procedimento": 29,
  "id_profissional": 26,
  "inicio": "2026-08-28T09:00:00-03:00",
  "fim": "2026-08-28T18:00:00-03:00",
  "passo_minutos": 30,
  "limite": 3
}
```

`id_profissional` é opcional (nulo = qualquer profissional apto).
`passo_minutos`: 5 a 240, padrão 30. `limite`: 1 a 50, padrão 20.
Janela máxima: **30 dias**.

```json
{
  "ok": true,
  "data": {
    "procedimento": { "id": 29, "nome": "Limpeza de pele", "duracao_minutos": 60, "valor": 180.0 },
    "slots": [
      { "inicio": "2026-08-28T09:00:00-03:00", "fim": "2026-08-28T10:00:00-03:00",
        "id_profissional": 26, "profissional_nome": "Ana Beatriz" }
    ],
    "total": 17,
    "truncado": true,
    "fuso": "America/Sao_Paulo"
  },
  "error": null
}
```

- **Lista vazia não é erro.** `slots: []` com `total: 0` é resposta legítima e
  chega com `ok: true`. Entrada inválida vem como `ENTRADA_INVALIDA`; falha de
  infraestrutura vem como `FALHA_TEMPORARIA` com `retryable: true`. São três
  situações distintas e distinguíveis.
- **Todo slot traz `id_profissional`.** Slot sem profissional não existe e é
  descartado pela API mesmo que apareça. Não é preciso testar por nulo.
- `truncado: true` significa que há mais horários do que o `limite` pedido.
- Os horários já vêm em `-03:00`. Não converta.

Erros: `PROCEDIMENTO_INVALIDO`, `PROFISSIONAL_INVALIDO`, `ENTRADA_INVALIDA`,
`FALHA_TEMPORARIA`.

---

### 4.3 `POST /api/ai/agendamentos/buscar`

```json
{
  "instance_name": "agm_12_studioaurora",
  "telefone": "5551988887777",
  "status": ["pendente", "agendado", "confirmado"],
  "limite": 10
}
```

`status` é opcional; omitido usa os três status vivos. **Só aceita valores da
lista fechada** `pendente | agendado | confirmado | cancelado | concluido`.
Filtro do PostgREST (`status=neq.cancelada`) é recusado com `ENTRADA_INVALIDA`.
`limite`: 1 a 50, padrão 10.

```json
{
  "ok": true,
  "data": {
    "agendamentos": [
      {
        "id": 59,
        "status": "pendente",
        "inicio": "2026-08-28T14:00:00-03:00",
        "fim": "2026-08-28T15:00:00-03:00",
        "valor_cobrado": 180.0,
        "confirmado_em": null,
        "cancelado_em": null,
        "procedimento": { "id": 29, "nome": "Limpeza de pele", "duracao_minutos": 60 },
        "profissional": { "id": 26, "nome": "Ana Beatriz" }
      }
    ],
    "total": 1,
    "status_consultados": ["pendente", "agendado", "confirmado"]
  },
  "error": null
}
```

`agendamentos[].id` é o que `reagendar` e `cancelar` recebem.
Cliente sem cadastro na empresa → `CLIENTE_INVALIDO` (404).

---

### 4.4 `POST /api/ai/agendamentos`

```json
{
  "instance_name": "agm_12_studioaurora",
  "telefone": "5551988887777",
  "nome": "Marina Souza",
  "id_procedimento": 29,
  "id_profissional": 26,
  "inicio": "2026-08-28T14:00:00-03:00",
  "chave_idempotencia": "acao-9f21c4"
}
```

- `chave_idempotencia` é **obrigatória**, 8 a 120 caracteres. Use o
  identificador de ação que o fluxo já gera (`pendente.acao_id`).
- `id_profissional` é **obrigatório**: agendamento sem profissional não existe.
- `inicio` precisa começar em **minuto exato** (segundo e microssegundo zero) e
  estar no futuro.
- A duração vem do cadastro do serviço. O corpo não define duração nem preço.

```json
{
  "ok": true,
  "data": {
    "agendamento": {
      "id": 59, "status": "pendente",
      "inicio": "2026-08-28T14:00:00-03:00", "fim": "2026-08-28T15:00:00-03:00",
      "valor_cobrado": 180.0, "confirmado_em": null, "cancelado_em": null,
      "procedimento": { "id": 29, "nome": "Limpeza de pele", "duracao_minutos": 60 },
      "profissional": { "id": 26, "nome": "Ana Beatriz" }
    },
    "repetida": false
  },
  "error": null
}
```

O que a API faz, nesta ordem:

1. resolve a empresa pela instância;
2. resolve serviço e profissional, conferindo que são da empresa;
3. normaliza o telefone e **procura** o cliente — sem criar ainda;
4. **consulta a chave de idempotência**; se ela já existe, responde a repetição
   e para por aqui;
5. só então confere se o profissional está ativo;
6. valida o horário (minuto exato e no futuro);
7. cria o cadastro do cliente, se ele ainda não existir;
8. **revalida o horário com a função do banco imediatamente antes de gravar**;
9. grava com `valor_cobrado` e `chave_idempotencia`;
10. **relê o registro** e confere id, chave e status. Só então responde `ok: true`.

**A ordem dos passos 4 a 6 é deliberada: a repetição vence qualquer outra
validação.** Uma retentativa da mesma chave devolve o mesmo resultado mesmo que
o horário já tenha começado ou que o profissional tenha sido desativado desde a
primeira chamada — o efeito já está no banco, e recusar agora faria o fluxo
anunciar falha para uma operação que deu certo. O cadastro do cliente continua
sendo criado depois das validações (passo 7): um pedido inválido não deixa
cliente novo para trás.

Status gravado: **`pendente`**. É o mesmo que o painel usa para "aguardando
confirmação" e cabe no `CHECK` do banco.

`CONFLITO_HORARIO` só aparece quando a corrida foi mesmo com **outra** escrita:
antes de devolvê-lo a API confere a chave de idempotência, porque na retentativa
concorrente da mesma chave é a constraint de sobreposição que dispara primeiro.

Erros: `HORARIO_INDISPONIVEL` (revalidação recusou), `CONFLITO_HORARIO`
(outra escrita ocupou o horário na corrida), `CHAVE_IDEMPOTENCIA_CONFLITANTE`,
`AGENDAMENTO_NAO_ESTA_ATIVO`, `PROCEDIMENTO_INVALIDO`, `PROFISSIONAL_INVALIDO`,
`CLIENTE_INVALIDO`, `ENTRADA_INVALIDA`, `FALHA_TEMPORARIA`.

---

### 4.5 `POST /api/ai/agendamentos/reagendar`

```json
{
  "instance_name": "agm_12_studioaurora",
  "telefone": "5551988887777",
  "id_consulta": 59,
  "novo_inicio": "2026-08-28T15:00:00-03:00",
  "id_profissional": 26
}
```

`id_profissional` é opcional; omitido mantém o profissional atual.
**Não envie `chave_idempotencia`** — o corpo a recusa. A idempotência é por
estado: repetir a mesma remarcação depois de ela já ter acontecido devolve
`ok: true` com `repetida: true` e nenhuma segunda escrita.

Resposta: mesma forma de 4.4, com `repetida`.

Preço (`valor_cobrado`), cliente e serviço são preservados: remarcar muda o
horário, não o preço acertado nem o vínculo.

**O fim do atendimento é recalculado com a duração ATUAL do serviço**, lida do
cadastro no momento da remarcação — não com a duração que valia quando o
agendamento foi criado. Se o serviço passou de 60 para 90 minutos, a consulta
remarcada passa a ocupar 90. É o comportamento implementado hoje; está
registrado aqui porque não é óbvio pela chamada.

Como na criação, **estado e repetição são avaliados antes do horário**: repetir
a mesma remarcação depois de ela já ter acontecido devolve `repetida: true`
mesmo que o novo horário já tenha começado.

Erros: `CONSULTA_NAO_ENCONTRADA` (id de outra empresa ou de outro cliente),
`CONSULTA_NAO_REAGENDAVEL` (já cancelada ou concluída), `HORARIO_INDISPONIVEL`,
`CONFLITO_HORARIO`, `PROFISSIONAL_INVALIDO`, `PROCEDIMENTO_INVALIDO` (o serviço
do agendamento perdeu a duração no cadastro), `CLIENTE_INVALIDO` (telefone
irreconhecível ou sem cadastro nesta empresa), `ENTRADA_INVALIDA`,
`FALHA_TEMPORARIA`.

---

### 4.6 `POST /api/ai/agendamentos/cancelar`

```json
{
  "instance_name": "agm_12_studioaurora",
  "telefone": "5551988887777",
  "id_consulta": 59,
  "motivo": "cliente_solicitou"
}
```

`motivo` é enum fechado: `cliente_solicitou` (padrão) | `remarcacao` |
`ausencia` | `outro`. Texto livre é recusado — a API monta o
`motivo_cancelamento` gravado.

Grava `status = "cancelado"` (masculino, o único aceito pelo `CHECK`) e
`cancelado_em` com o instante e o fuso. Relê antes de responder.

Cancelar algo já cancelado devolve `ok: true` com `repetida: true`.

Erros: `CONSULTA_NAO_ENCONTRADA`, `CONSULTA_NAO_CANCELAVEL` (já concluída),
`CLIENTE_INVALIDO` (telefone irreconhecível ou sem cadastro nesta empresa),
`ENTRADA_INVALIDA`, `FALHA_TEMPORARIA`.

---

### 4.7 `POST /api/ai/cliente`

```json
{
  "instance_name": "agm_12_studioaurora",
  "telefone": "5551988887777",
  "nome": "Marina Souza",
  "email": "marina.souza@example.com",
  "data_nascimento": "1994-03-12",
  "interesses": "estética facial"
}
```

**Campos permitidos: só estes quatro**, todos opcionais (pelo menos um é
obrigatório). `whats`, `status`, `id_info_clinica` e qualquer outro nome de
coluna são recusados com `ENTRADA_INVALIDA` — mudariam a identidade ou a empresa
do cadastro.

`data_nascimento` é uma **data**, no formato `AAAA-MM-DD`. Uma data impossível
(`1994-13-45`) é recusada com `ENTRADA_INVALIDA` na fronteira, não repassada ao
banco: como texto ela virava `FALHA_TEMPORARIA` com `retryable: true`, e o fluxo
repetiria para sempre um pedido que nunca vai funcionar.

Resposta ao corpo do exemplo acima:

```json
{
  "ok": true,
  "data": {
    "cliente": { "nome": "Marina Souza", "telefone": "5551988887777",
                 "email": "marina.souza@example.com", "data_nascimento": "1994-03-12",
                 "interesses": "estética facial", "novo": false },
    "campos_atualizados": ["data_nascimento", "email", "interesses", "nome"]
  },
  "error": null
}
```

`campos_atualizados` traz, em ordem alfabética, só os campos que a requisição
enviou. `novo` é sempre `false` aqui: esta rota **não cria** cadastro — cliente
sem cadastro na empresa devolve `CLIENTE_INVALIDO`. Quem cria é `/api/ai/contexto`.

Erros: `CLIENTE_INVALIDO` (telefone irreconhecível ou sem cadastro nesta
empresa), `ENTRADA_INVALIDA` (campo fora da lista, e-mail ou data inválidos,
ou nenhum dos quatro campos enviado), `INSTANCIA_DESCONHECIDA`,
`EMPRESA_NAO_CONFIGURADA`, `FALHA_TEMPORARIA`.

---

## 5. Códigos de erro

| Código | HTTP | `retryable` | Situação | O que o fluxo deve fazer |
|---|---|---|---|---|
| `AUTENTICACAO_INVALIDA` | 401 | não | token ausente ou errado | parar e alertar; nunca responder ao cliente |
| `AUTOMACAO_INDISPONIVEL` | 503 | sim | `AUTOMATION_API_TOKEN` não configurado no backend | parar e alertar |
| `INSTANCIA_DESCONHECIDA` | 404 | não | instância sem usuário | parar e alertar; **não** tentar por telefone |
| `INSTANCIA_AMBIGUA` | 409 | não | mesma instância em dois usuários | parar e alertar |
| `EMPRESA_NAO_CONFIGURADA` | 409 | não | usuário sem onboarding | parar e alertar |
| `CLIENTE_INVALIDO` | 404/422 | não | telefone irreconhecível ou sem cadastro | transferir para pessoa |
| `PROCEDIMENTO_INVALIDO` | 404 | não | serviço inexistente ou de outra empresa | reofertar catálogo |
| `PROFISSIONAL_INVALIDO` | 404/409 | não | profissional inexistente, de outra empresa ou inativo | reofertar profissionais |
| `CONSULTA_NAO_ENCONTRADA` | 404 | não | agendamento não é deste cliente nesta empresa | listar agendamentos de novo |
| `CONSULTA_NAO_REAGENDAVEL` | 409 | não | já cancelada ou concluída | listar agendamentos de novo |
| `CONSULTA_NAO_CANCELAVEL` | 409 | não | já concluída | transferir para pessoa |
| `HORARIO_INDISPONIVEL` | 409 | não | horário ocupado, fora do expediente ou no passado | reofertar horários |
| `CONFLITO_HORARIO` | 409 | não | outra escrita ocupou o horário na corrida | reofertar horários |
| `CHAVE_IDEMPOTENCIA_CONFLITANTE` | 409 | não | mesma chave com pedido diferente | erro de fluxo: gerar chave nova |
| `AGENDAMENTO_NAO_ESTA_ATIVO` | 409 | não | chave repetida, mas o agendamento foi cancelado | gerar chave nova |
| `ENTRADA_INVALIDA` | 422 | não | campo faltando, fora do formato ou desconhecido | erro de fluxo: corrigir o nó |
| `FALHA_TEMPORARIA` | 503 | **sim** | banco indisponível ou releitura não confirmou | repetir com a MESMA chave; se persistir, transferir |

**`retryable: true` é o único caso em que repetir faz sentido.** Nas escritas,
repita sempre com a mesma `chave_idempotencia`: a API devolve o mesmo resultado
em vez de criar um segundo agendamento.

**Nunca anuncie sucesso sem `ok: true` E `data.agendamento.id` presentes.**

---

## 6. Idempotência

| Operação | Como é idempotente | Chave |
|---|---|---|
| Criar | chave gravada em `consulta.chave_idempotencia` | **obrigatória** |
| Reagendar | por estado: já está no horário pedido → sucesso repetido | não aceita |
| Cancelar | por estado: já está `cancelado` → sucesso repetido | não aceita |
| Contexto | localiza antes de criar; colisão de corrida vira releitura | não aceita |

A chave é prefixada com a empresa no servidor (`emp<id>:<chave>`), porque o
índice único é global: sem o prefixo, duas empresas que usassem o mesmo
identificador de ação colidiriam entre si.

Repetir a criação com a mesma chave e **payload idêntico** devolve o mesmo
agendamento com `repetida: true`. Com payload diferente devolve
`CHAVE_IDEMPOTENCIA_CONFLITANTE`. Se o agendamento daquela chave já tiver sido
cancelado, devolve `AGENDAMENTO_NAO_ESTA_ATIVO` — repetir não pode fazer o fluxo
anunciar como ativo algo que não está.

**A repetição é decidida antes das demais validações de escrita** (ver a ordem
em 4.4). Isso vale nos dois caminhos: no normal, a chave é consultada antes de
o horário e o profissional serem validados; e na corrida, quando a constraint
de sobreposição recusa o INSERT, a chave é consultada de novo antes de o erro
virar `CONFLITO_HORARIO`. Sem isso, uma retentativa que chegasse depois do
horário de início, ou junto com a primeira, receberia `HORARIO_INDISPONIVEL` ou
`CONFLITO_HORARIO` para um agendamento que já existia.

Reagendar e cancelar não usam chave de propósito: o estado desejado é observável
no próprio registro, e gravar uma chave por cima apagaria a chave da criação.

---

## 7. Mapa de migração do workflow V2

Nós de `automation/n8n/AgendaMagnetica-v2.n8n.json` e a rota que os substitui.

| Nó atual | O que faz hoje | Passa a usar |
|---|---|---|
| `empresa pela instancia` | Supabase `get usuarios` — traz a linha inteira, **inclusive `senha_hash`** | `POST /api/ai/contexto` |
| `buscar cliente` | Supabase `getAll cliente` por `whats=eq.<remote_jid>` | `POST /api/ai/contexto` |
| `cliente existe?` / `criar cliente` / `cliente da empresa` | ramo de decisão + insert em `cliente` | `POST /api/ai/contexto` (localiza ou cria; devolve `cliente.novo`) |
| `catalogo da empresa` | Supabase `get v_clinica_detalhes` | `POST /api/ai/contexto` |
| `buscar horários` | `httpRequest` na RPC `fn_buscar_slots` com `service_role` | `POST /api/ai/disponibilidade` |
| `revalidar horário` | mesma RPC, de novo | **remover**: a API revalida internamente antes de gravar |
| `conferir revalidação` | compara o slot devolvido | simplificar: basta ler `ok` e `error.code` |
| `consultas do cliente` | Supabase `getAll consulta` com `status=neq.cancelada` | `POST /api/ai/agendamentos/buscar` |
| `criar consulta` | `POST /rest/v1/consulta` com `service_role` | `POST /api/ai/agendamentos` |
| `reagendar consulta` | `PATCH /rest/v1/consulta?...` com filtros na URL | `POST /api/ai/agendamentos/reagendar` |
| `cancelar consulta` | `PATCH` com `status: 'cancelada'` — **o banco recusa** | `POST /api/ai/agendamentos/cancelar` |
| `atualizar cadastro` | `PATCH /rest/v1/cliente` com `$json.atualizacoes` livre | `POST /api/ai/cliente` |
| `verificar resultado` | inspeciona a resposta do PostgREST | ler `ok`, `data.agendamento.id`, `error.code`, `error.retryable` |

Quatro nós montam corpo ou filtro em `resolver e decidir` / `conferir
revalidação` — `corpo_criar`, `corpo_reagendar`, `atualizacoes` e as URLs com
`id_info_clinica=eq...`. **Todos podem sair**: a API monta o corpo e o filtro.

### Acessos diretos ao PostgREST que podem ser removidos

Depois da migração, nada no workflow precisa de:

- `$env.SUPABASE_SERVICE_ROLE_KEY` (12 referências hoje);
- `$env.SUPABASE_URL`;
- o credential do nó Supabase;
- qualquer literal `id_info_clinica=eq.` ou `status=neq.`;
- o literal `'cancelada'`.

O que **continua** no n8n: Evolution API (envio de mensagem e presença), Redis
(debounce, pausa, ação pendente) e os agentes de IA. Nada disso passa pelo
backend.

### Variáveis novas no n8n

| Nome sugerido | Conteúdo | Segredo |
|---|---|---|
| `AGENDA_API_BASE_URL` | origem do backend, ex.: `https://api.seudominio.com.br` | não |
| `AGENDA_AUTOMATION_TOKEN` | mesmo valor de `AUTOMATION_API_TOKEN` no backend | **sim** |

Chamada típica: `POST {{ $env.AGENDA_API_BASE_URL }}/api/ai/contexto`, header
`X-Automation-Token: {{ $env.AGENDA_AUTOMATION_TOKEN }}`, `Content-Type:
application/json`. Sugestão de timeout: 15 s, igual ao que os nós já usam.

---

## 8. Variáveis de ambiente do backend

Somente nomes. Valores ficam no `.env`, que não é versionado.

| Variável | Papel | Obrigatória para subir |
|---|---|---|
| `SUPABASE_URL` | projeto Supabase | sim |
| `SUPABASE_SERVICE_ROLE_KEY` | chave administrativa, **só no backend** | sim |
| `JWT_SECRET` | sessão do painel | sim |
| `JWT_ALGORITHM`, `JWT_EXPIRATION_HOURS`, `CORS_ORIGINS` | padrões do painel | não |
| `AUTOMATION_API_TOKEN` | token de máquina de `/api/ai/*`, mínimo 32 caracteres | não para subir; **sim para a automação funcionar** |
| `DATABASE_URL` | usada só pelos testes de banco | não |
| `PERMITIR_TESTES_DE_BANCO` | autoriza os testes que **escrevem** no banco; **não** vai no `.env`, só no ambiente de quem roda | não |
| `EVOLUTION_*` | integração do WhatsApp | não |

`AUTOMATION_API_TOKEN` não derruba o servidor quando falta: o painel e o webhook
continuam funcionando, e `/api/ai/*` recusa tudo com `AUTOMACAO_INDISPONIVEL`.
Fechado, não aberto.

Gerar:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Nomes e placeholders estão em `services/api/.env.example`.

---

## 9. Mudanças de banco que acompanham esta API

Aplicadas por `scripts/ajustes_ai_api.sql` e `scripts/fn_buscar_slots.sql` (v2).
Detalhe completo em `docs/DATABASE_SCHEMA.md`.

| # | Mudança | Efeito para a automação |
|---|---|---|
| A1/A2 | `consulta.confirmado_em` e `cancelado_em` viram `timestamptz` | o instante do cancelamento é preservado, não só o dia |
| A3 | `consulta.valor_cobrado numeric(10,2)` | o preço do atendimento não muda quando o serviço é reajustado |
| A4 | `cliente.whats_normalizado` (coluna gerada) + único por empresa | busca por telefone deixou de depender de formatação |
| A5 | `area_atuacao` com unicidade e 24 rótulos | catálogo global fechado; `POST /areas-atuacao` foi removido |
| — | `fn_buscar_slots` v2 com `p_ignorar_consulta_id` | revalidação de reagendamento não é bloqueada pela própria consulta |
| I1–I4 | integridade entre empresas: FKs compostas e limites finitos de intervalo | o banco passa a recusar consulta que misture empresas |

Ordem de execução dos scripts: `bootstrap_schema` → `travas_corte_vertical` →
`v_clinica_detalhes` → `fn_buscar_slots` → `ajustes_ai_api` →
`integridade_tenant`. Todos reexecutáveis.

### `scripts/integridade_tenant.sql`

Até aqui as chaves estrangeiras provavam que o id **existia**, não que ele era
da mesma empresa: nada no banco impedia uma `consulta` da empresa A apontar para
um cliente da empresa B. O isolamento vivia inteiro na aplicação. Agora:

| # | Trava | Efeito |
|---|---|---|
| I1 | `UNIQUE (id, id_info_clinica)` em `cliente`, `profissional`, `procedimento` | alvo das FKs compostas |
| I2 | `consulta`: FKs compostas de cliente, profissional e procedimento | consulta não liga cadastro de outra empresa |
| I3 | `agenda_bloqueio`: FK composta de profissional (mantém `on delete cascade`) | bloqueio não aponta profissional de outra empresa |
| I4 | `CHECK` de `lower`/`upper` não nulos em `consulta` e `agenda_bloqueio` | intervalo sem fim deixa de bloquear a agenda inteira |

As FKs de uma coluna foram **substituídas**, não duplicadas: a composta já
garante existência e empresa, e manter as duas quebraria o join embutido do
PostgREST (`PGRST201`, duas relações entre as mesmas tabelas). Nada muda para o
n8n — nenhuma rota nova, nenhum campo novo. O que muda é que uma mistura de
empresas agora falha no banco em vez de passar despercebida.

Encontrando linha que viola, o script **para**, lista os ids e não aplica nada.
Nenhuma linha é apagada ou reatribuída.

---

## 10. Comandos de teste

Suíte completa do backend — **173 testes**, dos quais 119 rodam sem rede.
Os 54 que falam com o banco são 30 de compatibilidade de schema (**somente
leitura**, `SET TRANSACTION READ ONLY` + `ROLLBACK`) e 24 de integração, que
**escrevem** com commit real. Quem não tem `DATABASE_URL` vê os 54 ignorados;
quem tem, vê os 30 de leitura rodarem e os 24 de escrita **ignorados até
autorizar**:

```bash
services/api/.venv/Scripts/python -m pytest services/api/tests
```

Os 24 de escrita só rodam com autorização explícita de quem executa. A variável
é lida do **ambiente do processo**, nunca do `.env`: ter a credencial no arquivo
não é o mesmo que consentir com escrita: quem clonar o repositório com um `.env`
apontando para produção não pode ver a suíte gravar sozinha.

```bash
PERMITIR_TESTES_DE_BANCO=1 services/api/.venv/Scripts/python -m pytest services/api/tests
```

Só as regras e contratos, sem rede (103 testes):

```bash
services/api/.venv/Scripts/python -m pytest services/api/tests/test_ai_api.py
```

Prova das garantias no banco, terminando em `ROLLBACK` (24 verificações, sem
persistir nada):

```bash
psql "$DATABASE_URL" -f scripts/teste_transacional.sql
```

Aplicar a integridade entre empresas (reexecutável; para e lista se houver
linha violando):

```bash
psql "$DATABASE_URL" -f scripts/integridade_tenant.sql
```

Subir o backend local:

```bash
services/api/.venv/Scripts/python services/api/server.py
```

Fumaça manual (substitua host e token):

```bash
curl -sS -X POST http://localhost:8000/api/ai/contexto -H "Content-Type: application/json" -H "X-Automation-Token: $AUTOMATION_API_TOKEN" -d '{"instance_name":"agm_12_studioaurora","telefone":"5551988887777"}'
```

---

## 11. Riscos e pendências reais

| # | Item | Natureza |
|---|---|---|
| R1 | `AUTOMATION_API_TOKEN` ainda **não existe no `.env`**. Sem ele `/api/ai/*` responde `AUTOMACAO_INDISPONIVEL` a tudo | operacional — gerar e preencher |
| R2 | O workflow V2 **não foi alterado** e continua falando direto com o PostgREST. Enquanto isso, `service_role` segue dentro do n8n e o cancelamento pelo WhatsApp continua sendo recusado pelo banco | automação — é o trabalho deste handoff |
| R3 | A API não tem limite de taxa. Quem tiver o token pode chamar à vontade | avaliar antes de expor o backend na internet |
| R4 | O fuso é offset fixo `-03:00` no Python (`dominio.SAO_PAULO_TZ`). Correto desde que o Brasil não volte ao horário de verão. O cálculo que depende de regra de fuso é feito no banco | limitação conhecida e documentada |
| R5 | A equivalência do nono dígito é heurística: cobre o celular com e sem o `9`, não uma base de numeração | aceito; teste cobre o caso real |
| R6 | `Pagamentos.jsx` ainda soma `procedimento.valor` no cliente. `valor_cobrado` já vem em `GET /api/consultas` e `/api/dashboard/stats` já o prefere | frontend — fora do escopo desta entrega |
| R7 | Não implementados de propósito: expediente cruzando meia-noite, bloqueio de faixas sobrepostas de `horario_clinica`, Stripe e sincronização de planos | decisão de escopo |
| R8 | `/api/ai/*` não grava trilha de auditoria própria. O que existe é o log do backend, sem dado pessoal | avaliar junto com a Central de Atendimento |

Riscos abertos pela revisão de fechamento estão em **Errata e fechamento**, no
fim deste arquivo (E1–E8). R1 e R2 continuam válidos como estão.

---

## 12. Checklist para o agente da automação

1. Confirmar que o backend responde: `GET /health`.
2. Definir `AGENDA_API_BASE_URL` e `AGENDA_AUTOMATION_TOKEN` no n8n (R1 primeiro).
3. Trocar os quatro nós de contexto (`empresa pela instancia`, `buscar cliente`,
   `criar cliente`, `catalogo da empresa`) por **uma** chamada a `/api/ai/contexto`.
4. Trocar `buscar horários` por `/api/ai/disponibilidade` e **remover**
   `revalidar horário`.
5. Trocar `criar consulta`, `reagendar consulta` e `cancelar consulta` pelas três
   rotas de agendamento, enviando `chave_idempotencia` só na criação.
6. Trocar `consultas do cliente` e `atualizar cadastro`.
7. Reescrever `verificar resultado` para ler `ok`, `data.agendamento.id`,
   `error.code` e `error.retryable`.
8. Remover do workflow: credential do Supabase, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, filtros com `id_info_clinica` e o literal
   `'cancelada'`.
9. Atualizar `automation/n8n/tests/test_regras.mjs` e
   `automation/n8n/TESTES_AUTOMACAO_V2.md`.
10. Manter `active: false` até homologação explícita do proprietário.

*Entrega de 2026-08-21. Nenhum commit, nenhum push. Nenhum arquivo de
`automation/**`, `apps/**` ou `graphify-out/**` foi tocado.*

---

## Errata e fechamento — 2026-08-21

Segunda passada sobre a mesma entrega, fechando sete defeitos encontrados na
revisão. **Nenhuma rota nova, nenhum campo novo, nenhuma quebra de contrato**:
o mapa de migração do §7 e o checklist do §12 continuam válidos como estão.

### D1 — a repetição idempotente passou a vencer as outras validações

`services/api/ai_api.py:762-790` — em `criar_agendamento`, a consulta pela chave
de idempotência subiu para **antes** de `exigir_inicio_valido` e do teste de
profissional ativo. A busca do cliente virou `buscar_cliente` (que **não** cria);
o cadastro novo continua sendo criado só depois de todas as validações, em
`ai_api.py:788`.

`services/api/ai_api.py:817-832` — no ramo de `23P01`, a chave é consultada antes
de o erro virar `CONFLITO_HORARIO`. `consulta_sem_sobreposicao` tem OID menor que
`ux_consulta_chave_idempotencia` e é avaliada primeiro: numa retentativa
concorrente é ela quem dispara, não a violação de unicidade.

`services/api/ai_api.py:895-910` — mesma ordem em `reagendar_agendamento`: estado
e repetição antes de validar o horário; o teste de profissional ativo passou para
depois da repetição.

Sem isso, três situações reais devolviam erro para operações que tinham dado
certo: retentativa que chega depois do horário de início, retentativa depois de o
profissional ser desativado, e retentativa concorrente com a primeira chamada.

### D2 — tratador genérico no envelope da automação

`services/api/ai_api.py:126-144` — `registrar_tratadores` ganhou um
`@app.exception_handler(Exception)`. Dentro de `/api/ai` devolve
`503 FALHA_TEMPORARIA` com `retryable: true`; fora do prefixo devolve o mesmo
`500 Internal Server Error` em texto puro que o FastAPI já devolvia, para não
mudar nada no painel. O log registra **só o tipo** da exceção e o caminho —
a mensagem pode carregar o corpo da requisição.

Antes, qualquer exceção não prevista virava 500 em texto puro e o n8n não achava
`ok` nem `error.code`: a falha não era classificável como retentável.

### D3 — `data_nascimento` é data, não texto

`services/api/ai_api.py:582` e `:1021` — `Optional[date]` em vez de `str` com
regex. `1994-13-45` casava com `^\d{4}-\d{2}-\d{2}$`, chegava ao banco e voltava
como `FALHA_TEMPORARIA retryable` — o fluxo repetiria para sempre um pedido que
nunca ia funcionar. Agora é `ENTRADA_INVALIDA` 422 na fronteira.

### D4 — escrever no banco exige autorização explícita

`services/api/tests/test_ai_api_integracao.py:53-74` — o `skipif` passou a exigir
`PERMITIR_TESTES_DE_BANCO=1` **além** das credenciais, com mensagem de skip que
diz o que fazer. A variável é lida do ambiente do processo, nunca do `.env`: ter
a credencial no arquivo não é consentir com escrita.

`services/api/tests/test_schema_compatibilidade.py` foi conferido linha a linha e
**não recebeu a guarda**: as 30 consultas dele são todas `select`, sob
`SET TRANSACTION READ ONLY` com `rollback` no teardown. Fechá-lo atrás de uma
autorização só esconderia a detecção de divergência de schema, que é justamente
o que ele existe para pegar.

Documentado em `services/api/.env.example:20-26` (comentário, sem valor) e no §10.

### D5 — integridade entre empresas dentro do banco

`scripts/integridade_tenant.sql` (novo, reexecutável, guardado, com bloco de
rollback comentado). Detalhe em §9. Em resumo: as FKs de uma coluna provavam que
o id existia, não que era da mesma empresa — `consulta` aceitava ligar cliente da
empresa A a profissional da B. As quatro FKs simples de `consulta` e
`agenda_bloqueio` foram substituídas por compostas com `id_info_clinica`, e
`intervalo` passou a exigir as duas pontas finitas.

`scripts/teste_transacional.sql:557-644` — verificações **12** (mistura de
empresas recusada nas três pontas) e **12b** (intervalo sem limite recusado em
`consulta` e em `agenda_bloqueio`). O arquivo passou de 22 para **24**
verificações; §10 e `HOMOLOGATION_DATABASE_FACTS.md` §9 foram atualizados para 24.

Aplicado no banco de homologação apontado pelo `.env`, autorizado pelo
proprietário. O banco estava **vazio** — zero linhas em `info_clinica`,
`cliente`, `consulta`, `profissional`, `procedimento` e `agenda_bloqueio`
antes e depois.

### D6 — cobertura unitária

`services/api/tests/test_ai_api.py` foi de 62 para **103** testes, todos sem rede.
O banco falso ganhou o que faltava para exercitar os ramos de escrita:
`ErroDeBanco` com SQLSTATE (`:87`), fila de `corridas` por tabela que grava a
linha da requisição concorrente e **depois** levanta o erro (`:96-142`), `UPDATE`
que de fato altera a linha, e os joins embutidos que o PostgREST devolve.

Cobertos: `INSTANCIA_AMBIGUA`; corrida `23505` na criação de consulta e de
cliente; corrida `23P01` com e sem chave gravada; `CONSULTA_NAO_REAGENDAVEL`;
`CONSULTA_NAO_CANCELAVEL`; `PROFISSIONAL_INVALIDO` por inativo (disponibilidade e
criação); reagendar com troca de profissional, com `chave_idempotencia` no corpo
(422), com `HORARIO_INDISPONIVEL` e com `CONFLITO_HORARIO`; `motivo_cancelamento`
por enum e o instante gravado; `/api/ai/cliente` com `data_nascimento` válida e
impossível, e-mail inválido e corpo vazio; contexto que não sobrescreve nome
existente e remove caracteres de controle; `agendavel: false`; `truncado` e os
limites de `passo_minutos` e `limite`; e `FALHA_TEMPORARIA` atravessando uma rota
inteira. Entrou também o caminho feliz da criação, que nenhum teste sem rede
cobria: preço congelado, chave gravada e releitura.

Os sete testes que provam D1, D2 e D3 foram rodados **contra o código anterior à
correção** e falharam; contra o código corrigido, passam.

### D7 — documentação alinhada ao código

Neste arquivo: ordem real dos dez passos de 4.4; listas de erro de 4.5, 4.6 e 4.7
com `PROCEDIMENTO_INVALIDO` e `CLIENTE_INVALIDO` onde o código os devolve;
exemplo de 4.7 coerente com o corpo enviado; nota de que **reagendar usa a
duração ATUAL do serviço** (comportamento não alterado, só registrado —
`ai_api.py:875`); §9 com a ordem nova de scripts; §10 com as contagens reais.

`services/api/.env.example:16` — `EVOLUTION_WEBHOOK_URL` passou a apontar para
`/webhook/agenda-magnetica-v2`, que é o `path` do nó de webhook em
`automation/n8n/AgendaMagnetica-v2.n8n.json`.

`docs/DATABASE_SCHEMA.md` — FKs compostas e CHECK de limites finitos nas tabelas
10 e 11, seção nova de integridade entre empresas, script 6 na ordem de execução
e linha no histórico.

`docs/planning/HOMOLOGATION_DATABASE_FACTS.md` — §6 com a assinatura v2 de 8
parâmetros; §9 com 173 testes, 24 verificações transacionais e a separação entre
os 30 de leitura e os 24 de escrita; §12 com P3, P4 e P5 marcadas como resolvidas
e P11 registrada e fechada; §13 sem a afirmação vencida de que `/api/ai/*` não
existia.

---

### Comandos executados e saídas

```
services/api/.venv/Scripts/python -m pytest services/api/tests
  -> 149 passed, 24 skipped
     (os 24 de integração ignorados por falta de PERMITIR_TESTES_DE_BANCO;
      os 30 de compatibilidade rodaram, porque são somente leitura)

PERMITIR_TESTES_DE_BANCO=1 services/api/.venv/Scripts/python -m pytest services/api/tests
  -> 173 passed

psql "$DATABASE_URL" -f scripts/integridade_tenant.sql
  -> 1a passada: I1 x3, I2 x3 (+3 FKs simples removidas), I3, I4 x2 APLICADAS; COMMIT
  -> 2a passada: tudo "JA EXISTIA", nenhum objeto novo; COMMIT

psql "$DATABASE_URL" -f scripts/teste_transacional.sql
  -> OK 0, 1, 2, 3, 3b, 4, 4b, 5, 6, 7, 7b, 7c, 8, 8b, 8c, 9, 9b, 9c, 9d,
     10, 10b, 11, 12, 12b  = 24 verificações, 0 falhas
  -> ROLLBACK
```

Três verificações extras, fora da lista obrigatória:

- **O defeito de D5 era real.** Numa transação desfeita ao fim, com a FK composta
  de cliente removida, o banco **aceitou** uma consulta da empresa A apontando
  para um cliente da empresa B. Nada persistiu.
- **O caminho de parada do script funciona.** Com uma linha violadora presente,
  o bloco I2 (copiado verbatim do arquivo) parou com
  `I2 PARADO: 1 consulta(s) apontam cliente de outra empresa (...) ids (ate 20): 107`
  e não aplicou nada. Transação desfeita, nada persistiu.
- **O PostgREST continua resolvendo os joins embutidos** depois da troca de FKs:
  `consulta?select=*,cliente(*),profissional(*),procedimento(*)` (painel),
  `CAMPOS_CONSULTA` (`/api/ai/*`) e `agenda_bloqueio?select=*,profissional(*)`
  responderam sem erro contra o projeto real. Era o risco de a troca criar
  ambiguidade (`PGRST201`); não criou, porque as FKs simples foram substituídas
  e não somadas.

---

### Riscos restantes

| # | Item | Natureza |
|---|---|---|
| E1 | R1 continua aberta: `AUTOMATION_API_TOKEN` **ainda não tem valor no `.env`**. Conferida a presença da variável, sem ler o conteúdo. Sem ela, `/api/ai/*` responde `AUTOMACAO_INDISPONIVEL` a tudo | operacional |
| E2 | R2 continua aberta: o workflow V2 não foi alterado e segue falando direto com o PostgREST | automação |
| E3 | A troca de FKs simples por compostas foi validada no banco de **homologação, vazio**. Num banco com dados, o script pode parar listando ids — é o comportamento desejado, mas alguém precisa decidir de quem é cada linha cruzada antes de reaplicar | operacional, ao promover |
| E4 | Um `deploy` que rode `integridade_tenant.sql` **sem** o `notify pgrst, 'reload schema'` chegar ao PostgREST deixa o cache de relações desatualizado até o próximo reinício. O script emite o `notify`; o risco é o ambiente que o ignora | operacional |
| E5 | Reagendar recalcula o fim com a duração **atual** do serviço. Se o cadastro mudar entre a criação e a remarcação, a consulta remarcada muda de tamanho. Documentado em 4.5, não alterado — mudar exigiria congelar a duração como se fez com o preço | decisão de produto |
| E6 | R3 continua aberta: `/api/ai/*` não tem limite de taxa | avaliar antes de expor na internet |
| E7 | `data_nascimento` agora é `date` do pydantic, que em modo permissivo também aceita número (tempo Unix). O contrato pede `AAAA-MM-DD` e a automação envia texto; um número viraria uma data plausível em vez de ser recusado | baixo |
| E8 | O tratador de `Exception` devolve a resposta, mas o Starlette **relança** a exceção depois para o log do servidor. É o comportamento desejado (o cliente recebe o envelope, o operador recebe o traceback); vale saber ao ler o log | informativo |

*Errata de 2026-08-21. Nenhum commit, nenhum push. Nenhum arquivo de
`automation/**`, `apps/**`, `docs/product/**`, `.github/**` ou `graphify-out/**`
foi tocado. `.env` não foi lido nem alterado: `DATABASE_URL` foi carregada para
variável de ambiente sem ser exibida, e nenhuma saída deste trabalho contém
telefone, nome, corpo de requisição ou resposta completa de provedor.*
