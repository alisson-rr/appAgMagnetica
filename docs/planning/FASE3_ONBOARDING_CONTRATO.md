# Fase 3 — Onboarding que não dá trabalho: contrato entre backend e frontend

> **Para quem:** o agente de backend (`services/api/**`) e o agente de frontend
> (`apps/dashboard/**`) que implementam a Fase 3 **em paralelo**. Este arquivo é
> a única fonte de verdade da interface entre os dois. Quem precisar mudar algo
> aqui **para** e pede ao coordenador; não altere o contrato por conta própria.
> **Estado:** contrato fechado em 2026-08-23. Nenhum código foi alterado para
> produzi-lo.
> **Base verificada:** `services/api/server.py` (rotas `/auth`, `/config`,
> `/whatsapp`), `services/api/ai_api.py` (`/api/ai/contexto`),
> `scripts/bootstrap_schema.sql` (`info_clinica`, `usuarios`),
> `apps/dashboard/src/App.jsx`, `pages/Onboarding.jsx`, `pages/Configuracoes.jsx`,
> `context/AuthContext.jsx`.

---

## 1. Objetivo e decisões de produto

Meta: o negócio configura o essencial e vê a própria atendente funcionando em
**cerca de 10 minutos**, sem ler manual.

| # | Decisão | Motivo |
|---|---|---|
| P1 | O onboarding vira um assistente de **6 passos**, retomável, guiado por um checklist calculado **no servidor** | hoje o estado vive só no React: recarregar a página perde o passo e o segundo `POST /config/info-clinica` devolve 409 |
| P2 | Passos: 1 Negócio · 2 Horários · 3 Serviços · 4 Equipe · 5 Atendente · 6 WhatsApp + teste + ativar | é a ordem em que cada passo desbloqueia o seguinte; "Continuar depois" é permitido a partir do passo 2 |
| P3 | Atalho **"Sou eu mesmo"** no passo Equipe: cria um profissional com o nome do usuário, vincula todos os serviços e copia os horários do negócio como disponibilidade | autônomo é o cliente inicial; sem disponibilidade do profissional, `fn_buscar_slots` nunca devolve horário |
| P4 | **Ativar atendimento** é uma flag por empresa (`info_clinica.automacao_ativa`), não o `active` do workflow n8n | o workflow é um só para todas as empresas; ligar/desligar precisa ser por tenant |
| P5 | Com a flag desligada, `/api/ai/contexto` responde erro `AUTOMACAO_DESATIVADA`; o workflow V2 já encerra **sem responder** quando o contexto falha (`contexto ok?` → `fim - contexto indisponível`) | zero mudança em `automation/**` nesta fase |
| P6 | Ativar exige o mínimo pronto: horários, ≥1 serviço, ≥1 profissional agendável, WhatsApp conectado. O servidor recusa com a lista do que falta | "avisos claros do que falta configurar" precisam ser verdade do servidor, não do navegador |
| P7 | A instância Evolution passa a ser criada **no passo WhatsApp**, não no cadastro | hoje o cadastro cria instância para quem nunca faz onboarding e, se falhar, deixa `instance_name` nulo sem rota de recriação |
| P8 | O teste da atendente é uma conversa real, de **outro telefone**, para o número conectado; o painel mostra o número e um link `wa.me` | não existe simulador; a conversa real é o único teste honesto |
| P9 | Nome e tom da atendente são validados no servidor (nome ≤ 40 caracteres, só letras e espaços; tom é enum fechado) | os dois campos entram no prompt de sistema da IA; texto livre do dono é vetor de injeção |
| P10 | `GET /auth/me` passa a existir e o painel o usa ao carregar | o gate de trial/onboarding não pode depender de um objeto gravado no `localStorage` no login |
| P11 | **Fora desta fase:** dados de demonstração, Central de Atendimento, notificação real na transferência, Stripe, `/auth/me` como gate de assinatura no backend | YAGNI; voltam nas Fases 4–6 |

---

## 2. Banco (agente backend)

`scripts/ajustes_onboarding.sql`, reexecutável, no padrão dos scripts existentes:

```sql
alter table public.info_clinica
  add column if not exists automacao_ativa boolean not null default false;

-- tom fechado; nulo continua permitido (padrão do fluxo)
alter table public.info_clinica
  drop constraint if exists info_clinica_assistente_tom_valido;
alter table public.info_clinica
  add constraint info_clinica_assistente_tom_valido
  check (assistente_tom is null or assistente_tom in ('acolhedor', 'objetivo', 'descontraido'));
```

`v_clinica_detalhes` passa a expor `automacao_ativa` (editar
`scripts/v_clinica_detalhes.sql`, que é `create or replace`). Ordem de execução
documentada em `docs/DATABASE_SCHEMA.md`: depois de `integridade_tenant.sql`.

---

## 3. Rotas (agente backend implementa; agente frontend consome)

Todas as rotas abaixo exigem o JWT do painel (`Authorization: Bearer`), exceto
onde indicado. Erros seguem o padrão atual do painel: `HTTPException` com
`detail`.

### 3.1 `GET /auth/me` — novo

Devolve o usuário **recalculado** no servidor (mesma lógica de trial do login,
extraída para uma função compartilhada — uma única fonte de verdade).

```json
{
  "id": 12,
  "nome": "Marina Souza",
  "email": "marina@exemplo.com",
  "role": "owner",
  "id_info_clinica": 7,
  "onboarding_completo": false,
  "status_assinatura": "trial",
  "trial_fim": "2026-08-30T12:00:00+00:00",
  "trial_expirado": false,
  "dias_restantes": 6
}
```

`id_info_clinica` e `onboarding_completo` nulos quando o usuário ainda não criou
a empresa. `401` se o token for inválido.

### 3.2 `POST /auth/register` — alterado

**Deixa de criar a instância Evolution.** Resposta passa a ser
`{"message": "...", "id": 12}` (sem `instance_name`). O resto não muda.

### 3.3 `GET /config/implantacao` — novo

Checklist calculado no servidor para a empresa do usuário. `404` se o usuário
ainda não tem empresa.

```json
{
  "negocio": true,
  "horarios": true,
  "servicos": true,
  "equipe": false,
  "atendente": false,
  "whatsapp": false,
  "automacao_ativa": false,
  "pendencias": ["equipe", "atendente", "whatsapp"],
  "completo": false
}
```

Regras (cada item é um booleano independente):

| Item | Verdadeiro quando |
|---|---|
| `negocio` | `info_clinica.nome` preenchido |
| `horarios` | ≥ 1 linha em `horario_clinica` da empresa |
| `servicos` | ≥ 1 linha em `procedimento` da empresa |
| `equipe` | ≥ 1 `profissional` ativo da empresa com ≥ 1 vínculo em `profissional_procedimento` **e** ≥ 1 linha em `disponibilidade_profissional` |
| `atendente` | `assistente_nome` não nulo e não vazio |
| `whatsapp` | a instância do usuário existe e `connectionState` é `open` (consulta à Evolution; qualquer falha → `false`, nunca erro) |
| `automacao_ativa` | `info_clinica.automacao_ativa` |

`pendencias` lista, **nesta ordem fixa**, os itens falsos entre
`negocio, horarios, servicos, equipe, atendente, whatsapp`. `completo` é
verdadeiro quando `pendencias` está vazia (a flag de automação **não** entra).

### 3.4 `PUT /config/info-clinica/{id}` — alterado

`InfoClinicaUpdate` ganha três campos opcionais:

| Campo | Regra |
|---|---|
| `assistente_nome` | 2–40 caracteres, só letras (com acento) e espaços; `null` limpa |
| `assistente_tom` | `"acolhedor" \| "objetivo" \| "descontraido" \| null` |
| `exige_profissional` | booleano |

Valor fora da regra → `422`. `automacao_ativa` **não** entra aqui (tem rota
própria). `GET /config/info-clinica` devolve os três campos e `automacao_ativa`.

### 3.5 `PUT /config/automacao` — novo

Corpo `{"ativa": true}` ou `{"ativa": false}`.

- `ativa: false` → sempre aceita. Resposta `{"ativa": false}`.
- `ativa: true` → só aceita se `horarios`, `servicos`, `equipe` e `whatsapp`
  do checklist forem verdadeiros. Caso contrário `409` com
  `{"detail": "Falta configurar antes de ativar.", "pendencias": ["equipe", "whatsapp"]}`.
  Resposta de sucesso `{"ativa": true}`.

### 3.6 `POST /whatsapp/instancia` — novo, idempotente

Garante que o usuário tem uma instância na Evolution com o webhook registrado:

1. Se `usuarios.instance_name` é nulo: gera `agm_{user_id}_{slug}` (regra atual
   do cadastro), cria na Evolution, registra o webhook, grava em `usuarios`.
2. Se não é nulo mas a Evolution não conhece a instância (`fetchInstances`
   vazio): cria e registra o webhook com o mesmo nome.
3. Se existe: não faz nada.

Resposta `{"instance": "agm_12_marina", "criada": true}` (`criada: false` nos
casos 3). Falha da Evolution → `503` com `detail` genérico ("Não foi possível
preparar o WhatsApp agora."). Nunca devolve a chave da Evolution nem a URL.

### 3.7 `GET /whatsapp/qrcode` — alterado

Se não houver instância, chama internamente a mesma função de 3.6 em vez de
responder `400`. Resposta inalterada: `{"instance", "qrcode", "code"}`.

### 3.8 `GET /whatsapp/status` — alterado

Ganha `numero`: o número conectado (`ownerJid` de `fetchInstances`, só dígitos,
sem `@s.whatsapp.net`) quando `state` é `open`; `null` caso contrário.

```json
{ "connected": true, "instance": "agm_12_marina", "state": "open", "numero": "5551999990000" }
```

### 3.9 `POST /api/ai/contexto` — alterado (rota da automação, token de máquina)

Quando `automacao_ativa` da empresa resolvida é `false`, responde
`409` com o envelope padrão:

```json
{ "ok": false, "data": null,
  "error": { "code": "AUTOMACAO_DESATIVADA", "message": "O atendimento automático está desligado nesta empresa.", "retryable": false } }
```

A verificação acontece **depois** de resolver a empresa pela instância e
**antes** de localizar ou criar o cliente (empresa desligada não cadastra
ninguém). Incluir o código em `docs/planning/BACKEND_AI_API_HANDOFF.md` §4.1 e §5
(ação do fluxo: "parar; não responder ao cliente").

---

## 4. Frontend (agente frontend)

### 4.1 Sessão

`AuthContext` chama `GET /auth/me` ao carregar e após login; o objeto do
`localStorage` vira só cache inicial. `401` → limpa e vai para `/login`.
`JSON.parse` do cache em `try/catch`.

### 4.2 Rotas e gate

- Sem `id_info_clinica` → `/onboarding` (passo 1 é obrigatório).
- Com `id_info_clinica` → painel liberado mesmo com `onboarding_completo = false`;
  o Dashboard mostra a faixa de implantação (4.4).
- `/planos` acessível **durante** o trial; tem botão de sair; após escolher um
  plano, volta para `/dashboard` com aviso "Assinatura disponível em breve; seu
  teste segue até {trial_fim}". Nunca navega para `/login` estando logado.
- `?plano=` do cadastro é guardado em `localStorage` (`plano_escolhido`) para a
  Fase 4 ler; nada mais.

### 4.3 Onboarding (`/onboarding`, `/onboarding?passo=N`)

Ao montar: `GET /auth/me` + `GET /config/implantacao` (se houver empresa) +
`GET /config/info-clinica` + `GET /config/horarios-clinica`; abre no **primeiro
passo pendente** (ou no `?passo=`). Barra de progresso com 6 passos e
"Continuar depois" a partir do passo 2.

| Passo | Salva com | Pronto quando |
|---|---|---|
| 1 Negócio | `POST /config/info-clinica` (novo) ou `PUT` (existente) | nome preenchido |
| 2 Horários | `POST`/`PUT`/`DELETE /config/horarios-clinica` | ≥ 1 dia com `fim > início`; turnos meio-preenchidos são erro de validação, não silêncio |
| 3 Serviços | `POST /procedimentos` (formulário enxuto: nome, valor, duração) | ≥ 1 |
| 4 Equipe | `POST /profissionais` + `/profissionais/{id}/procedimentos` + `/profissionais/{id}/disponibilidade`; atalho "Sou eu mesmo" (P3) | checklist `equipe` |
| 5 Atendente | `PUT /config/info-clinica/{id}` com `assistente_nome`, `assistente_tom`, `exige_profissional`; prévia de uma frase no tom escolhido | `atendente` |
| 6 WhatsApp | `POST /whatsapp/instancia` → `GET /whatsapp/qrcode` → `GET /whatsapp/status` a cada 5 s enquanto o passo estiver aberto; QR **regenerado a cada 45 s** enquanto não conectar, com contagem visível; conectado → mostra `numero`, instrução "mande 'oi' de outro telefone" e link `https://wa.me/{numero}`; botão **Ativar atendimento** → `PUT /config/automacao {ativa: true}`; `409` → mostra `pendencias` com link para o passo | `whatsapp` e `automacao_ativa` |

Concluir (depois de ativar, ou "Concluir sem ativar") → `PUT /config/info-clinica/{id}` com `onboarding_completo: true` → `/dashboard`.

Os formulários de serviço e profissional **reaproveitam** os de `Servicos.jsx`
e `Profissionais.jsx` (extrair o mínimo para componente compartilhado; não
duplicar). `zod` e `react-hook-form` já estão instalados: use-os nas fronteiras
dos passos 1, 2, 3, 5.

O componente de conexão do WhatsApp (QR + status + número + ativar) é **um só**,
usado no passo 6 e em Configurações > Automação. Não exibir `instance` (contém o
id do usuário).

### 4.4 Dashboard

Faixa no topo enquanto `completo = false` ou `automacao_ativa = false`:
"Implantação: N de 6 · falta: Equipe, WhatsApp" com link para
`/onboarding?passo=N`. Chip de estado do WhatsApp (conectado / desconectado /
não configurado) e de atendimento (ativo / desligado), a partir de
`GET /config/implantacao`.

### 4.5 Correções na mesma passada (mesmas telas, mesmo agente)

- `Pagamentos.jsx`: recibo com `document.write` sem escape — escapar todo valor
  interpolado (nome de cliente vem do WhatsApp, é controlado por terceiro).
- `Configuracoes.jsx`: `label` com `htmlFor`; `aria-label` nos botões de ícone e
  nos selects; abas com `tabpanel`/`aria-controls`; `className` duplicado;
  `PUT` envia só campos editáveis; máscara e validação de telefone.
- `Cadastro.jsx`: senha mínima de 8 caracteres.
- `config.js`/`appUrl.ts`: sem fallback silencioso para `localhost` em build de
  produção — `import.meta.env.PROD` sem a variável → erro visível no console.

### 4.6 Verificação executável

`apps/dashboard/src/lib/onboarding.js` concentra a lógica pura (esquemas `zod`,
"primeiro passo pendente" a partir do checklist, cálculo de "N de 6",
normalização de número para `wa.me`). `apps/dashboard/tests/onboarding.test.mjs`
cobre isso com `node --test` (sem dependência nova). `package.json` do dashboard
ganha `"test": "node --test tests/"`; o job `web` de `.github/workflows/ci.yml`
ganha `npm test --workspaces --if-present`.

---

## 5. Divisão de arquivos (disjunta; edição cruzada é proibida)

| Agente | Pode editar | Cria |
|---|---|---|
| Backend | `services/api/**`, `scripts/**`, `docs/DATABASE_SCHEMA.md`, `docs/planning/BACKEND_AI_API_HANDOFF.md` | `scripts/ajustes_onboarding.sql`, `docs/planning/ONBOARDING_BACKEND_HANDOFF.md` |
| Frontend | `apps/dashboard/**`, `.github/workflows/ci.yml` (só o job `web`) | `apps/dashboard/src/lib/onboarding.js`, `apps/dashboard/tests/onboarding.test.mjs`, `docs/planning/ONBOARDING_FRONTEND_HANDOFF.md` |
| Ninguém | `automation/**`, `apps/site/**`, `docs/product/**`, este arquivo, qualquer `.env` | — |

---

## 6. Aceite da fase

1. Backend: `services/api/.venv/Scripts/python -m pytest services/api/tests` verde sem opt-in; com `PERMITIR_TESTES_DE_BANCO=1` verde; `scripts/ajustes_onboarding.sql` aplicado em homologação e reexecutável.
2. Frontend: `npm run build`, `npm run lint --if-present`, `npm test --workspace=agenda-magnetica-app` verdes.
3. Integração (coordenador + proprietário): conta nova → onboarding completo → WhatsApp conectado → "oi" de outro telefone respondido pela atendente → atendimento ativado, **em até 10 minutos**, sem consultar documentação. Recarregar a página em qualquer passo não perde nada. Com a automação desligada, a mensagem não recebe resposta e nenhum cliente é criado.
