# Fase 3 — Onboarding: handoff do frontend

> Escrito pelo agente de frontend (`apps/dashboard/**`) ao terminar a §4 do
> contrato `docs/planning/FASE3_ONBOARDING_CONTRATO.md`. `services/api/**`,
> `scripts/**`, `automation/**` e o próprio contrato estão intactos. De
> `apps/site/**` só o `.gitignore` mudou, e por causa da publicação no Vercel
> que o proprietário pediu à parte — ver a seção "Publicação no Vercel".

---

## Objetivo

Entregar a §4 do contrato: sessão vinda do servidor, gate de rotas sem laço,
assistente de implantação em 6 passos retomável, um único componente de conexão
do WhatsApp, faixa de implantação no Dashboard, as correções da §4.5 e uma
verificação executável em `node --test`.

---

## Concluído

### 1. Sessão (§4.1)

`src/context/AuthContext.jsx`

- `GET /auth/me` ao carregar e logo depois do login. O objeto do `localStorage`
  virou só cache de primeira pintura, lido com `try/catch` (JSON corrompido
  limpa a chave em vez de derrubar o app).
- `401` → limpa e vai para `/login` (pelo interceptor que já existia em
  `services/api.js`). Falha de rede **não** desloga: mantém o cache, senão uma
  queda do backend expulsaria o dono no meio do onboarding.
- `refreshUser()` é exportado no contexto; o wizard o usa ao montar e ao
  concluir.

### 2. Rotas e gate (§4.2)

`src/App.jsx`, `src/pages/EscolherPlano.jsx`, `src/pages/Cadastro.jsx`

- `/planos` deixou de redirecionar quem está em trial. Antes,
  `user && !user.trial_expirado` mandava de volta para `/dashboard`, o que
  transformava o link "Ver planos" do `Layout` em ida-e-volta.
- `/planos` ganhou **Voltar ao painel** (durante o trial) e **Sair da conta**
  (sempre). Quem tem trial expirado é empurrado para `/planos` pelo
  `PrivateRoute` — sem o botão de sair, ficava trancado do lado de fora.
- Escolher um plano agora volta para `/dashboard` (nunca `/login` estando
  logado) com o aviso exato do contrato: *"Assinatura disponível em breve; seu
  teste segue até {trial_fim}"*.
- `?plano=` do cadastro é gravado em `localStorage` como `plano_escolhido` e
  mais nada é feito com ele. A página de planos grava o mesmo dado ao escolher.
- Sem `id_info_clinica` → `/onboarding` (inalterado). Com `id_info_clinica` o
  painel fica liberado mesmo com `onboarding_completo = false` (inalterado).

### 3. Onboarding em 6 passos (§4.3)

`src/pages/Onboarding.jsx` (reescrito), `src/lib/onboarding.js`

- Ao montar: `GET /auth/me` + `GET /config/implantacao` + `GET /config/info-clinica`
  + `GET /config/horarios-clinica` + `procedimentos` + `profissionais` +
  `areas-atuacao`, todos em `Promise.allSettled` — uma rota fora do ar não
  apaga a tela.
- Abre no **primeiro passo pendente** calculado do checklist do servidor, ou no
  `?passo=N` quando presente e entre 1 e 6. Cada navegação regrava `?passo=`,
  então recarregar volta ao mesmo lugar.
- Barra com os 6 passos: passo concluído mostra ✓ (do checklist do servidor,
  não de estado local), o atual tem `aria-current="step"`, e cada botão tem
  `aria-label` com o número, o título e "(concluído)".
- **"Continuar depois"** aparece a partir do passo 2, quando já existe empresa.
- Passo 3 e 4 usam os formulários compartilhados (item 4 abaixo).
- **"Sou eu mesmo"** (P3): cria o profissional com o nome do usuário, vincula
  **todos** os serviços e copia os turnos do negócio como disponibilidade. Sem
  horário do negócio ou sem serviço, avisa e leva ao passo que falta em vez de
  criar alguém inagendável.
- Passo 5: nome + tom + `exige_profissional`, com **prévia da primeira frase**
  no tom escolhido, atualizada enquanto o dono digita (`aria-live="polite"`).
- Passo 6: componente único de conexão (item 4).
- Concluir → `PUT /config/info-clinica/{id} {onboarding_completo: true}` →
  `refreshUser()` → `/dashboard`. O rótulo é "Concluir" quando a automação está
  ligada e "Concluir sem ativar" quando não está.
- Foco vai para o painel do passo a cada troca, para quem navega por teclado.

### 4. Um único componente de conexão do WhatsApp (§4.3)

`src/components/ConexaoWhatsApp.jsx` — usado no **passo 6** e em
**Configurações > Automação**.

- Ao abrir: `POST /whatsapp/instancia` (idempotente) → `GET /whatsapp/status` →
  `GET /whatsapp/qrcode` se não estiver conectado.
- `GET /whatsapp/status` a cada 5 s enquanto a tela estiver aberta.
- QR **regenerado a cada 45 s** enquanto não conectar, com a contagem visível
  ("Novo código em 39s").
- Conectado: mostra o número formatado, a instrução de mandar "oi" **de outro
  telefone** e o link `https://wa.me/{numero}` (só o número na URL,
  `rel="noopener noreferrer"`).
- **Ativar atendimento** → `PUT /config/automacao {ativa: true}`. `409` mostra
  as `pendencias` como links para `/onboarding?passo=N`. Quando já está ativo,
  o botão vira **Desligar atendimento**.
- Reiniciar e Desconectar só aparecem quando há conexão.
- **O `instance` nunca é renderizado** — conferido no navegador nas duas telas.

### 5. Dashboard (§4.4)

`src/pages/Dashboard.jsx`

- Faixa no topo enquanto `completo = false` **ou** `automacao_ativa = false`:
  "Implantação: 5 de 6 · falta: Equipe", com link para `/onboarding?passo=4`.
- Chips de WhatsApp e de atendimento, a partir de `GET /config/implantacao`.
- Se o checklist falhar, a faixa simplesmente não aparece; a agenda continua.

### 6. Correções da §4.5

| Item | O que foi feito |
|---|---|
| `Pagamentos.jsx` | `escaparHtml` (novo em `utils/formatters.js`) em **todos** os 6 valores interpolados no HTML do recibo — nome de cliente e de serviço chegam pelo WhatsApp. Também guardei `window.open` retornando `null` (pop-up bloqueado quebrava a tela com `TypeError`). |
| `Configuracoes.jsx` | Reescrito: todo campo com `label htmlFor`/`id`, abas com `role="tabpanel"`/`aria-controls`/`aria-labelledby`/roving `tabIndex`, `aria-label` nos controles de ícone e nos selects (via `HorariosEditor`), os dois `className` duplicados eliminados, `PUT` enviando **só** campos editáveis, e máscara + validação de telefone com `zod`. |
| `Cadastro.jsx` | Senha mínima de **8** caracteres (validação, `minLength` e o texto do campo). |
| `config.js` | Sem fallback silencioso para `localhost` em produção: `import.meta.env.PROD` sem `VITE_BACKEND_URL` escreve um erro no console e usa a própria origem do painel. Em dev, o `localhost:8000` continua. |

### 7. Verificação executável (§4.6)

- `src/lib/onboarding.js`: esquemas `zod`, primeiro passo pendente, "N de 6",
  normalização de número para `wa.me`, validação/agrupamento de horários,
  disponibilidade do "Sou eu mesmo". Nada de React, rede ou `window`.
- `tests/onboarding.test.mjs`: **35 testes** com `node --test`, sem dependência
  nova.
- `apps/dashboard/package.json` ganhou `"test": "node --test tests/"`.
- `.github/workflows/ci.yml`, job `web`: `npm test --workspaces --if-present`.

---

## Decisões e motivos

1. **`"type": "module"` no `apps/dashboard/package.json`.** `node --test` só
   consegue importar `src/lib/onboarding.js` (que importa `zod`) se o pacote for
   ESM. Junto vieram `postcss.config.js` e `tailwind.config.js` convertidos de
   `module.exports` para `export default` — é o mesmo formato que
   `apps/site` já usa. Sem isso, o teste que o contrato pede não roda.

2. **`HorariosEditor` também foi extraído.** O contrato só exige compartilhar os
   formulários de serviço e profissional, mas a grade de horários estava
   duplicada em `Onboarding.jsx` e `Configuracoes.jsx` — e só uma das duas tinha
   validação. Compartilhar deixou "fim depois do início" com uma fonte só e
   reduziu o diff em vez de aumentá-lo.

3. **Chip do WhatsApp com dois estados, não três.** O contrato pede o chip "a
   partir de `GET /config/implantacao`", e o checklist devolve `whatsapp` como um
   booleano: "desconectado" e "não configurado" são indistinguíveis ali. Como os
   dois pedem exatamente a mesma ação (ir ao passo 6), o chip diz "WhatsApp
   conectado" / "WhatsApp não conectado". Distinguir exigiria um
   `GET /whatsapp/status` extra em toda abertura do Dashboard, batendo na
   Evolution uma segunda vez. Se a distinção importar, o lugar certo é o
   checklist do servidor, não o navegador.

4. **Falha de rede não desloga.** O contrato manda limpar a sessão no `401`.
   Estendi só isso: erro que **não** é `401` mantém o cache. Um backend fora do
   ar não deveria expulsar quem está no passo 4.

5. **Formulário de serviço tem modo `enxuto`.** No onboarding o contrato pede
   "nome, valor, duração"; na tela de Serviços, descrição e orientações
   continuam. Uma prop em vez de dois componentes.

6. **`POST /profissionais/{id}/procedimentos` agora é sempre chamado** na tela
   de Profissionais, inclusive com lista vazia. Antes, o `if (length > 0)` fazia
   "desmarquei todos os serviços" não gravar nada — o endpoint substitui a lista
   inteira, então enviar vazio é o que faz a remoção valer.

7. **O wizard segue aberto depois de concluído.** A faixa do Dashboard leva a
   `/onboarding?passo=N` mesmo com `onboarding_completo = true`; é assim que o
   dono volta para ativar o atendimento ou corrigir um item.

---

## Pendente ou bloqueado

- **`apps/site/src/lib/appUrl.ts`** — a §4.5 cita `config.js`/`appUrl.ts`, mas
  o `appUrl.ts` vive em `apps/site/**`, que a §5 marca como "ninguém edita".
  **Não toquei.** Fica para o coordenador decidir quem corrige o mesmo fallback
  de `localhost` lá.
- **Sem `lint` no dashboard.** `npm run lint --if-present` só executa o ESLint
  do `apps/site`; o `apps/dashboard` nunca teve script de lint. Não adicionei um
  (seria uma dependência nova e uma varredura fora do escopo desta fase).
- **Nada foi commitado nem enviado**, conforme instruído. `graphify` não foi
  executado.
- **Chip do WhatsApp**: ver decisão 3 acima.

---

## Validação executada

```
### npm run build:dashboard
dist/assets/CampoErro-DKDr9bJ0.js          31.96 kB │ gzip: 11.59 kB
dist/assets/select-DSOSOPfO.js             55.05 kB │ gzip: 19.04 kB
dist/assets/onboarding-wZVNXMDA.js         61.99 kB │ gzip: 15.21 kB
dist/assets/index-L1TDNnJy.js             274.12 kB │ gzip: 90.19 kB

✓ built in 1.44s

### npm run lint --if-present

> agenda-magnetica@0.2.0 lint
> npm run lint --workspaces --if-present

> agenda-magnetica-site@0.1.0 lint
> eslint .

### npm test --workspace=agenda-magnetica-app
1..35
# tests 35
# suites 0
# pass 35
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 139.0936
```

`npm run build` (os dois workspaces) e `npm test --workspaces --if-present`
— o que o job `web` do CI roda — também passaram.

### Conferência no navegador

O backend real não estava no ar (a porta 8000 desta máquina é de outro
projeto). Para conferir o fluxo inteiro **contra o contrato**, subi um stub
descartável de `services/api` que implementa exatamente a §3 (fora do
repositório, em pasta temporária) e naveguei o painel com o Chrome:

| Verificação | Resultado |
|---|---|
| Passo 1 sem nome | erro ao lado do campo, `aria-invalid` e `aria-describedby` corretos, não avança |
| Máscara de telefone | `51999990000` → `(51) 99999-0000` |
| Passo 1 salvo | grava, guarda o novo `access_token`, vai para `?passo=2` |
| Turno pela metade | "Preencha o início e o fim deste turno.", **não** salva em silêncio |
| Recarregar `/onboarding` sem `?passo=` | abre no primeiro pendente do checklist (`?passo=3`) |
| Recarregar `/onboarding?passo=2` | volta ao passo 2 **com os horários salvos carregados** |
| Passos 1 e 2 na barra | marcados "(concluído)" pelo checklist do servidor |
| "Continuar" no passo 3 sem serviço | desabilitado, com o aviso do que falta |
| Serviço criado | aparece na lista, formulário limpa, "Continuar" libera |
| "Sou eu mesmo" | criou `Marina Souza`, vinculou o serviço e copiou os **dois** turnos do negócio; checklist `equipe` virou `true` |
| Prévia do passo 5 | muda com o nome digitado e com o tom escolhido |
| Passo 6 | QR renderizado, "Novo código em 39s", `instance` **não** aparece |
| Ativar com WhatsApp fora | `409` → "Falta configurar antes de ativar: WhatsApp" com link `/onboarding?passo=6` |
| Conectado | `+55 (51) 99999-0000`, instrução "de outro telefone", `https://wa.me/5551999990000` |
| Ativar com tudo pronto | sucesso; botão vira "Desligar atendimento"; "Concluir sem ativar" vira "Concluir" |
| Concluir | vai para `/dashboard`; faixa some (completo + ativo) |
| Automação desligada | faixa "Implantação: 6 de 6" + chips "WhatsApp conectado" / "Atendimento desligado" + link "Ativar atendimento" |
| Equipe quebrada | faixa "Implantação: 5 de 6 · falta: Equipe" → `/onboarding?passo=4` |
| `/planos` em trial | abre, com "Voltar ao painel" e "Sair da conta" |
| Escolher plano logado | vai para `/dashboard` com o aviso do contrato; grava `plano_escolhido` |
| Configurações | 4 abas com `aria-controls`/`tabpanel`; **nenhum** campo sem label |
| Configurações > Automação | mesmo componente do passo 6, número certo, `instance` não vaza |
| `PUT /config/info-clinica` | corpo com **só** campos editáveis (sem `id`, `created_at`, `automacao_ativa`) |
| Profissionais > Editar | carrega nome, serviços marcados e horários; nenhum campo sem label |
| Console | nenhum erro de React; só o `409` proposital do teste de ativação |

---

## Arquivos e comandos

### Criados

```
apps/dashboard/src/lib/onboarding.js
apps/dashboard/src/components/ConexaoWhatsApp.jsx
apps/dashboard/src/components/HorariosEditor.jsx
apps/dashboard/src/components/ServicoForm.jsx
apps/dashboard/src/components/ProfissionalForm.jsx
apps/dashboard/src/components/CampoErro.jsx
apps/dashboard/tests/onboarding.test.mjs
docs/planning/ONBOARDING_FRONTEND_HANDOFF.md
```

### Alterados

```
.github/workflows/ci.yml                       (só o job `web`)
apps/dashboard/.gitignore                      (Vercel CLI + `!.env.example`)
api/index.py                                   (ponte para o Vercel; NÃO altera services/api)
api/requirements.txt
vercel.json                                    (raiz — build do painel + função da API)
.vercelignore
apps/site/.gitignore                           (idem — efeito colateral do deploy)
apps/dashboard/package.json                    ("type": "module", script "test")
apps/dashboard/postcss.config.js               (CJS → ESM)
apps/dashboard/tailwind.config.js              (CJS → ESM)
apps/dashboard/src/App.jsx
apps/dashboard/src/config.js
apps/dashboard/src/context/AuthContext.jsx
apps/dashboard/src/utils/formatters.js         (+ escaparHtml)
apps/dashboard/src/pages/Onboarding.jsx        (reescrito)
apps/dashboard/src/pages/Configuracoes.jsx     (reescrito)
apps/dashboard/src/pages/Dashboard.jsx
apps/dashboard/src/pages/Servicos.jsx
apps/dashboard/src/pages/Profissionais.jsx
apps/dashboard/src/pages/Pagamentos.jsx
apps/dashboard/src/pages/Cadastro.jsx
apps/dashboard/src/pages/EscolherPlano.jsx
```

### Comandos

```bash
npm install
npm run build:dashboard
npm run lint --if-present
npm test --workspace=agenda-magnetica-app
npm run dev:dashboard
```

---

## Publicação no Vercel (tarefa adicional, fora do contrato)

Feita a pedido do proprietário, **direto em produção**, com a conta
`devalissonrosa-6549` / time `alissons-projects-b1faee75`.

| Projeto | Origem | URL de produção |
|---|---|---|
| `agenda-magnetica-painel` | `apps/dashboard` | https://agenda-magnetica-painel.vercel.app |
| `agenda-magnetica-site` | `apps/site` | https://agenda-magnetica-site.vercel.app |

- Os dois foram publicados pela CLI a partir do diretório de trabalho, então
  **o código desta fase já está no ar** mesmo sem commit.
- Painel: `vercel.json` do próprio app cuida do rewrite de SPA. Conferido:
  `/` e `/login` respondem `200`.
- Site: recebeu a variável `VITE_APP_URL = https://agenda-magnetica-painel.vercel.app`
  em Production. **Sem ela os CTAs do site apontariam para `http://localhost:3000`**
  (é o `appUrl.ts` que a §4.5 cita e que eu não podia editar). Conferido no
  bundle publicado: nenhuma ocorrência de `localhost:3000`.
- A CLI criou `.vercel/` e `.env.local` (com `VERCEL_OIDC_TOKEN`) nos dois apps
  e acrescentou `.vercel` e `.env*` aos respectivos `.gitignore`. Como `.env*`
  passaria a ignorar também o `.env.example` — contra a regra do projeto de que
  só o exemplo entra no Git — adicionei `!.env.example` nos dois arquivos.
  Isso encostou em `apps/site/.gitignore`, fora do meu escopo: foi para
  desfazer um efeito colateral da própria publicação.

### A API vai junto, como função do mesmo projeto

O primeiro deploy subiu só o front, e cadastrar usuário devolvia `405` com
corpo vazio (o rewrite de SPA respondia por `/api/*`, e `POST` em arquivo
estático é 405). Não era variável faltando: **não havia API nenhuma.**

`services/api` é stateless — sem `on_event`/`lifespan`, sem tarefa de fundo,
sem thread, sem cache em memória, sem escrita em disco, sem Redis; tudo é HTTP
para o Supabase e para a Evolution. Ou seja, cabe em função serverless. Como
ela sobe **no mesmo projeto do painel**, o front chama a própria origem: não há
CORS e a `VITE_BACKEND_URL` deixa de ser necessária (o `config.js` já trata
variável vazia em produção usando a origem do painel).

Arquivos criados para isso, **sem tocar em `services/api/**`**:

| Arquivo | Papel |
|---|---|
| `api/index.py` | põe `services/api` no `sys.path` e reexporta o `app` do FastAPI |
| `api/requirements.txt` | o mesmo do backend, sem `pytest` |
| `vercel.json` (raiz) | build do painel + `/api/*` para a função, resto para o SPA |
| `.vercelignore` | tira `.venv` (44 MB), `__pycache__` e **todo `.env`** do upload |

Conferido localmente: o shim importa o `app` e expõe as **41 rotas**, incluindo
`/api/auth/register`, `/api/auth/me`, `/api/config/implantacao` e
`/api/whatsapp/instancia`. Bundle de 138 KB.

### Estado: no ar e verificado em produção

Projeto `agenda-magnetica-painel`, raiz do monorepo, produção em
**https://agenda-magnetica-painel.vercel.app** — front e API na mesma origem.

Variáveis cadastradas (Production): `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`. As três bastam para cadastro, login
e os passos 1 a 5.

Conferido contra o Supabase real, depois do deploy:

| Chamada | Resultado |
|---|---|
| `GET /` e `GET /login` | `200` (rewrite de SPA intacto) |
| `POST /api/auth/register` | `200` — usuário criado |
| `POST /api/auth/register` com e-mail inválido | `422` com o motivo por campo |
| `POST /api/auth/login` | `200` com `access_token` e trial de 6 dias |
| `GET /api/auth/me` sem token | `403 {"detail":"Not authenticated"}` |
| `GET /api/auth/me` com token | `200`, sessão recalculada no servidor |
| `GET /api/config/implantacao` sem empresa | `404 "Empresa não encontrada"` |
| `POST /api/config/info-clinica` | `200`; repetido, `409` |
| `GET /api/config/implantacao` com empresa | `200`, `pendencias` na ordem fixa |
| `POST /api/config/horarios-clinica` | `200`; `horarios` sai de `pendencias` |
| `PUT /api/config/automacao {ativa:true}` | `409` com `["servicos","equipe","whatsapp"]` |
| `GET /api/whatsapp/status` | `200 not_configured` — não estoura sem as variáveis da Evolution |

Pelo navegador, na URL de produção: cadastro cria a conta e volta ao login;
login leva a `/onboarding?passo=1` (1,7 s para o redirecionamento, 2,7 s para o
passo pintado). Nenhum erro de JS no console.

**Desempenho:** ~220 ms por chamada com a função quente. A primeira invocação
depois de cada deploy é um cold start de Python e leva alguns segundos — foi o
que fez um teste intermediário parecer tela em branco. É característica de
serverless, não defeito.

### Bug de backend encontrado e corrigido: `fetchInstances` 404

O passo 6 respondia `503` mesmo com as variáveis certas. Não era configuração.

`garantir_instancia` decide criar a instância a partir de
`fetch_instances(nome)` devolver vazio. Mas a Evolution v2.3.7 responde **404**
quando o filtro `instanceName` não casa com nada — reproduzido direto contra a
VPS:

```
GET /instance/fetchInstances                             -> 200  [fixwear]
GET /instance/fetchInstances?instanceName=agm_84_teste   -> 404  Instance ... not found
GET /instance/fetchInstances?instanceName=fixwear        -> 200  [fixwear]
```

`_request` faz `raise_for_status()`, a exceção subia e `garantir_instancia`
convertia em `503`. Como esse é o caminho de **todo usuário novo**, o passo 6
nunca funcionou para ninguém — não era um caso de borda.

Corrigido na causa compartilhada (`evolution_api.fetch_instances`), não nos
chamadores: para uma consulta, "não existe" é resultado, não falha. Só o 404 é
absorvido; qualquer outro status continua subindo, senão um `500` do provedor
viraria "instância não existe" e o painel tentaria criar uma que já existe.

Isso encostou em `services/api/evolution_api.py` e
`services/api/tests/test_webhook_config.py`, **fora do escopo combinado** — o
proprietário autorizou. `estado_da_conexao` e `numero_conectado` já engoliam
exceção, então não precisaram de nada.

Três testes de regressão foram para a suíte que já existia (404 → lista vazia;
200 → lista; 500 → continua erro), no estilo `asyncio.run` do repositório, sem
dependência nova. `pytest services/api/tests`: **195 passando, 25 skipped**.

### Passo 6 verificado em produção

| Chamada | Resultado |
|---|---|
| `POST /api/whatsapp/instancia` | `200`, `criada: true` |
| repetido | `200`, `criada: false` (idempotente) |
| `GET /api/whatsapp/qrcode` | `200`, PNG base64 de 13 KB |
| `GET /api/whatsapp/status` | `200`, `state: connecting` |

Na tela: QR renderizado em 348×348, contagem "Novo código em 36s" correndo, e o
nome da instância não aparece em lugar nenhum.

### `.env` reorganizado

Sobraram as **15 variáveis que este repositório realmente lê** (confirmado por
varredura em `services`, `scripts`, `automation`, `apps` e `.github`), em
seções comentadas. Saíram as 15 da stack da VPS (`EVOLUTION_DB_*`, `REDIS_*`,
`N8N_*`, `INFRA_DIR`, `TZ`, `EVOLUTION_HOST`) — pertencem ao repositório da
FixWear, como o próprio `INFRA-VPS.md` diz.

Dois problemas achados no caminho:

- **`EVOLUTION_API_KEY` estava duplicada**: a primeira ocorrência vazia, a
  segunda com a chave real. Como o `dotenv` deixa a última vencer, o backend
  funcionava — mas qualquer leitura ingênua pegava a vazia. Ficou uma só.
- **`EVOLUTION_BASE_URL` e `EVOLUTION_WEBHOOK_URL` estavam vazias**; os valores
  existiam só como `EVOLUTION_HOST` e `N8N_HOST`. Agora estão preenchidas com o
  que o código de fato lê.

Backup em `.env.backup-*` (ignorado pelo Git). Conferido item a item: todo valor
mantido é idêntico ao do backup.

### O que ainda falta

- **`AUTOMATION_API_TOKEN`** (mínimo 32 caracteres), quando o n8n for chamar
  `/api/ai/*`. Vazio, essas rotas recusam tudo — padrão seguro.
- **O workflow do n8n está `active: false`.** O WhatsApp conecta e o QR
  funciona, mas ninguém responde o "oi" até ativarem — e ativar não estava
  autorizado.
- **`JWT_SECRET` tem 19 caracteres.** Para HS256 é curto; vale trocar por 48
  bytes aleatórios aqui e no Vercel (invalida as sessões abertas).
- **Deploys de preview falham**: as variáveis existem só em Production.
- **Sujeira de teste, criada nesta verificação:**
  - instância `agm_84_*` na Evolution compartilhada — apague pelo manager ou
    com `DELETE /instance/delete/{nome}`;
  - usuários e empresa de teste no Supabase — SQL abaixo.

  ```sql
  delete from public.horario_clinica
   where id_info_clinica in (select id_info_clinica from public.usuarios
                             where email like 'teste-deploy-%@example.com');
  delete from public.info_clinica
   where id in (select id_info_clinica from public.usuarios
                where email like 'teste-deploy-%@example.com');
  delete from public.usuarios
   where email like 'teste-deploy-%@example.com'
      or email like 'ui-teste-%@example.com';
  ```

---

## Próximo passo exato

1. Aplicar `scripts/ajustes_onboarding.sql` em homologação (agente de backend).
2. Subir a API com a Evolution acessível e o painel apontando para ela
   (`VITE_BACKEND_URL`).
3. Executar o **teste de 10 minutos** abaixo (contrato §6.3).
4. Revisar o diff com o agente `code-reviewer` e só então commitar. Depois de
   commitar, rodar `graphify update .` — houve mudança estrutural
   (`src/components/*` e `src/lib/*` novos).

---

## Roteiro do teste de 10 minutos (contrato §6.3)

Para o coordenador executar **com o backend no ar**, em uma conta nova, sem
consultar documentação. Cronometre.

**Antes de começar:** tenha um segundo telefone com WhatsApp (não pode ser o
número que vai conectar) e um celular com a câmera livre para o QR.

| # | Passo | O que precisa acontecer |
|---|---|---|
| 0 | Abra `/cadastro`, crie uma conta com senha de 8+ caracteres | Recusa senha com 7 caracteres. Cadastro conclui e leva ao login. |
| 1 | Faça login | Vai direto para `/onboarding`, passo 1, sem passar pelo painel. |
| 2 | Tente "Salvar e continuar" com o nome vazio | Erro ao lado do campo, não avança. |
| 3 | Preencha nome e telefone; salve | Vai ao passo 2. **Recarregue a página (F5): tem que voltar ao passo 2.** |
| 4 | Marque só o *início* de segunda-feira; salve | "Preencha o início e o fim deste turno." Nada é gravado. |
| 5 | Complete segunda a sexta (ex.: 08:00–18:00); salve | Vai ao passo 3. **F5: volta ao passo 3.** |
| 6 | Cadastre 1 serviço (nome, duração, valor); Continuar | O serviço aparece na lista; o botão libera. |
| 7 | Clique **"Sou eu mesmo"** | Cria o profissional com o seu nome. Confira em `/profissionais` (outra aba) que ele tem o serviço marcado e os horários de segunda a sexta. |
| 8 | Continuar → passo 5. Dê um nome à atendente e escolha um tom | A prévia muda enquanto você digita e ao trocar o tom. Tente um nome com número ("Bot 3000"): tem que recusar. |
| 9 | Salvar → passo 6 | QR aparece; a contagem "Novo código em Ns" desce; espere passar de 45 s e confirme que o QR troca sozinho. |
| 10 | **Antes de conectar**, clique "Ativar atendimento" | `409`: "Falta configurar antes de ativar: WhatsApp", com link para o passo 6. |
| 11 | Leia o QR no WhatsApp (Aparelhos conectados) | Em até ~10 s o painel mostra o número conectado e o link `wa.me`. Confira que **o nome da instância não aparece em lugar nenhum**. |
| 12 | Clique "Ativar atendimento" | Sucesso; o botão vira "Desligar atendimento". |
| 13 | **Do outro telefone**, mande "oi" para o número conectado | A atendente responde, com o nome e o tom escolhidos no passo 8. |
| 14 | Clique "Concluir" | Vai para `/dashboard`; a faixa de implantação **não** aparece. |
| 15 | Vá em Configurações > Automação, clique "Desligar atendimento" | Confirma o desligamento. Volte ao `/dashboard`: a faixa reaparece com "Atendimento desligado". |
| 16 | **Do outro telefone**, mande "oi" de novo | **Nenhuma resposta.** Confirme no banco que nenhum cliente novo foi criado (contrato P5/§6.3). |
| 17 | Religue em Configurações > Automação | Volta a responder. |

**Falhou se:** algum F5 perdeu o passo; o nome da instância apareceu na tela;
ativar passou sem o WhatsApp conectado; com a automação desligada houve
resposta ou cliente novo; ou o percurso 1→14 passou de 10 minutos.
