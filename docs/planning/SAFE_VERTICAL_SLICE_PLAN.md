# Corte vertical seguro — Agenda Magnética

> **Status:** plano de entrega. Nenhum código, workflow, SQL ou configuração foi
> alterado para produzir este documento. O único arquivo criado é este.
> **Base verificada:** `automation/n8n/AgendaMagnetica.n8n.json` (90 nós, `active: false`),
> `automation/n8n/AgendaMagnetica-v2.n8n.json` (84 nós, `active: false`, **não versionado**),
> `services/api/`, `services/api/tests/`, `scripts/*.sql`, `docs/DATABASE_SCHEMA.md`,
> `docs/planning/AI_AUTOMATION_BLUEPRINT.md`, `docs/Evolution API - v2.3.-.postman_collection.json`.
> **Fuso:** `America/Sao_Paulo`. **Moeda:** BRL. **Idioma:** pt-BR.

---

## 0. Resultado

**Começar.** O caminho crítico cabe em oito entregas pequenas e reversíveis, e boa
parte do trabalho pesado de automação **já existe** em `AgendaMagnetica-v2.n8n.json`
(arquivo novo, ainda não versionado, produzido pelo agente que está desenvolvendo).
O corte proposto não reescreve esse trabalho: ele fecha as lacunas que faltam para o
fluxo ser seguro e o coloca em uma ordem em que cada passo pode ser demonstrado e
desfeito sozinho.

Três diferenças em relação ao blueprint:

1. **Menos infraestrutura nova.** Nenhuma tabela nova é necessária para este corte.
   Quatro travas no banco (índice único por instância, constraint de exclusão de
   horário, coluna de idempotência, CHECK de status) substituem `whatsapp_instancia`,
   `acao_idempotente`, `conversa` e `conversa_evento`.
2. **Menos alarme sem evidência.** Não há chave literal, bloco `credentials` ou URL de
   projeto dentro do JSON do workflow. Rotação de credenciais passa a ser condicional
   (§2, E1–E4).
3. **Escrita por último.** O corte chega ao piloto com valor real antes de a IA
   escrever no banco: V6 entrega proposta congelada e confirmação explícita com
   fechamento humano; V7 troca o fechamento humano pela escrita idempotente.

**Não entram neste corte:** `/api/ai/*` completo, IDs opacos, `slot_id` assinado,
máquina de estados em tabela, Central de Atendimento, dashboard novo, campanhas,
lembretes, lista de espera, pagamentos, RAG e métricas sofisticadas. Lista completa
do que foi adiado em §9.

---

## 1. Estado real verificado

Evidências colhidas diretamente dos arquivos, para separar fato de leitura.

| Fato | Evidência |
|---|---|
| O workflow antigo está inativo | `AgendaMagnetica.n8n.json` → `"active": false` |
| O webhook antigo não tem autenticação | `AgendaMagnetica.n8n.json:23,33` → `path: "sync-magnetic"`, `options: {}` |
| Nenhuma credencial embutida no JSON antigo | `"credentials"` aparece **0 vez**; nenhum `eyJ…`, nenhum `sk-…`, nenhuma URL `*.supabase.co` |
| A `service_role` é referência de ambiente, não valor | 8 ocorrências de `$env.SUPABASE_SERVICE_ROLE_KEY` em 4 nós (`fn_buscar_slots:1213`, `criar_consulta:1861`, `atualizar_consulta`, `patch_cancelar:2060`) |
| A IA monta o corpo inteiro da busca de horários | `fn_buscar_slots` → `jsonBody: $fromAI('JSON', '', 'json')` |
| A empresa vem da linha do cliente | `Get_data_client:1749` → `SELECT cliente WHERE whats = remoteJid`, sem filtro de empresa |
| Chaves Redis e memória sem empresa | 8 nós Redis com `…_{remoteJid}`; 7 memórias com `chat_memory_{remoteJid}` |
| Reagendar é silêncio | `connections.Switch2.main[4] = []` (`Switch2:1715`) |
| Payload pessoal retido | `AgendaMagnetica.n8n.json:3168` → `saveDataSuccessExecution: "all"`; webhook registrado com `base64: true` em [`evolution_api.py:48`](services/api/evolution_api.py:48) |
| Agenda pessoal versionada | `[e-mail pessoal redigido]` nas linhas 996, 1021, 1044, 1067 — **sem** bloco `credentials`, e os 4 nós estão desconectados (`ai_tool: [[]]`) |
| Existe uma v2 muito mais segura, ainda não versionada | `AgendaMagnetica-v2.n8n.json`: `authentication: headerAuth`, `saveDataSuccessExecution: "none"`, **0 ocorrências de `$fromAI`**, chaves Redis com prefixo `am:{tipo}:{instance}:…`, dedup por `msg_id`, `Prefer: return=representation` nas escritas, saída estruturada com parser, `empresa pela instancia` resolvendo por `usuarios.instance_name` |
| A v2 ainda fala direto com o Supabase | 12 referências a `SUPABASE_SERVICE_ROLE_KEY` |
| A v2 ainda grava um status que a tela não conhece | `cancelar consulta:1582` grava `status: 'cancelada'`; o dashboard entende `pendente/agendado/cancelado/concluido` ([`Agenda.jsx:54`](apps/dashboard/src/pages/Agenda.jsx:54), [`Agenda.jsx:457`](apps/dashboard/src/pages/Agenda.jsx:457)) |
| A Evolution v2.3 aceita header no webhook | `docs/Evolution API - v2.3.-.postman_collection.json` → `POST /webhook/set/{instance}` com `{"webhook": {"enabled", "url", "headers": {…}, "byEvents", "base64", "events"}}` |
| O backend registra o webhook no formato antigo | [`evolution_api.py:48`](services/api/evolution_api.py:48) envia o corpo **sem** o invólucro `webhook` e **sem** `headers` |
| A resolução por instância é por usuário, sem unicidade | `usuarios.instance_name` (`docs/DATABASE_SCHEMA.md`), sem índice único em `scripts/*.sql` |
| O backend já valida empresa e recurso nas rotas do dashboard | [`server.py:200`](services/api/server.py:200) (`get_user_clinica_id`), [`server.py:211`](services/api/server.py:211) (`assert_owned_record`), testes em `services/api/tests/test_tenant_guards.py` |

---

## 2. Errata do blueprint

Correções a conclusões exageradas, incorretas ou sem evidência suficiente. Nada aqui
reduz um risco real: o objetivo é impedir que trabalho seja gasto onde não há dano.

| # | Conclusão do blueprint | O que os arquivos mostram | Correção |
|---|---|---|---|
| E1 | §9.1-1: revogar e regerar Supabase, JWT, Evolution e a conta Google, "tratando as antigas como comprometidas" | O JSON não contém nenhum bloco `credentials`, nenhum JWT literal, nenhuma chave `sk-…`. As 4 ferramentas HTTP usam `$env.SUPABASE_SERVICE_ROLE_KEY` — **referência**, não valor | Rotação vira **condicional**: rotacione se a chave já circulou em export antigo, print, chat ou repositório público; se houver indício de acesso indevido; se a procedência for desconhecida; ou se ela apareceu em log. Sem um desses, não há evidência de comprometimento e a rotação é higiene opcional |
| E2 | S14: "a URL real do projeto Supabase está publicada", classificada como risco | `docs/DATABASE_SCHEMA.md:3` publica a URL. URL de projeto Supabase é endpoint público por definição — o que protege os dados é RLS mais chave | Rebaixar para informativo. O risco relevante é *URL somada a chave `anon` sem RLS*, que é o item H5 (estado do RLS), não a URL em si |
| E3 | Tratamento uniforme das "chaves do Supabase" como segredo | `anon`/`publishable` são públicas por design; `scripts/enable_rls.sql` revoga `anon` e `authenticated` em todas as tabelas | Segredo real: `service_role`/`secret` (ignoram RLS) e `JWT_SECRET`. Só esses exigem custódia, rotação e ausência total do lado do cliente |
| E4 | S13: quatro nós de Google Calendar "com credencial Google associada" | Os quatro nós existem e apontam para `[e-mail pessoal redigido]` (linhas 996–1069), mas **nenhum tem bloco `credentials`** e os quatro estão desconectados | É dado pessoal versionado e integração morta — não credencial exposta. Remover os nós (a v2 já não os tem) e o e-mail. Se existe credencial Google ativa, isso é estado do **servidor** n8n e precisa ser verificado lá (D9); não pode ser afirmado a partir do JSON |
| E5 | S1 (webhook aberto) apresentado como exposição atual | Verdadeiro no arquivo, mas `active: false`, e a v2 já usa `headerAuth` | Reclassificar para **crítico na ativação**. Enquanto o workflow estiver inativo não há superfície exposta |
| E6 | §3.4/§9.2-1: criar `whatsapp_instancia` | O vínculo já existe em `usuarios.instance_name`; o defeito é falta de **unicidade** (H6), não falta de tabela | Trocar a tabela nova por um índice único parcial — uma linha de SQL. A tabela nova arrasta migração de dados, mudança em `/api/whatsapp/*` e no onboarding. Reavaliar quando existir empresa com dois usuários operando instâncias distintas |
| E7 | §3.7: construir uma camada que "relê do banco depois da transação" | PostgREST com `Prefer: return=representation` já devolve a linha efetivamente gravada, e um `PATCH` que não casa devolve `[]` — distinguível de sucesso. A v2 já usa isso | Não construir camada nova. Basta `Prefer` em toda escrita mais **uma** releitura independente por `id` depois do `INSERT` (V7) |
| E8 | §6: IDs públicos opacos (`srv_*`, `agd_*`) e `slot_id` assinado com HMAC | Controles necessários quando o modelo manipula IDs. Na v2 o modelo não escolhe nenhum ID: `$fromAI` aparece **0 vez** | Adiar HMAC e IDs opacos. Substituir por revalidação do horário imediatamente antes da escrita — nó `revalidar horário`, que a v2 já tem |
| E9 | §9.2-7: "0 nós com `SUPABASE_SERVICE_ROLE_KEY`" como critério de aceite do MVP | Alvo correto no longo prazo, mas não é o que separa seguro de inseguro neste corte. O que separa é a IA não escolher tenant nem filtro (já verdadeiro na v2) mais as travas no banco (V1) | Adiar para depois do piloto. Registrar como risco aceito, com compensações e gatilho de revisão (R6) |
| E10 | F10: `Wait1` "vale 1 hora" | `parameters: {}` confirmado (linha 228). O padrão depende da versão instalada do n8n, que não está no repositório | Manter como **provável**, não como fato. Na v2 o nó equivalente já é explícito — conferir na importação (D1) |
| E11 | S9: "janela de 24 h do WhatsApp" como requisito técnico | Janela de 24 h e templates aprovados são regras da **Cloud API oficial**. A Evolution opera por Baileys, que não impõe janela nem template | Manter o requisito de **consentimento** e de não enviar mensagem não solicitada (LGPD e risco de banimento), sem modelar a janela como validação técnica. Neste corte a IA só responde a quem escreveu primeiro, o que torna o ponto inaplicável |
| E12 | H2/H3 (`fn_buscar_slots` e `v_clinica_detalhes`) listados como hipóteses no fim do documento | São a fonte do passo "ofertar horários reais". Sem a definição, nenhuma entrega de disponibilidade pode ser projetada | Promover de hipótese a **bloqueador** (D4 e D5). É a primeira coisa a resolver |

---

## 3. Riscos validados

Somente riscos críticos ou altos que **permanecem** depois da errata. Classificação:
**confirmado** (visível no arquivo), **provável** (inferência forte com dependência
externa), **não verificável** (depende de estado de servidor ou de banco).

| # | Risco | Evidência | Classe | Impacto real | Correção mínima | Teste que prova a correção |
|---|---|---|---|---|---|---|
| R1 | Webhook sem autenticidade | `AgendaMagnetica.n8n.json:23,33` (`options: {}`) | confirmado | POST forjado escolhe `instance`, `remoteJid` e texto: personifica cliente de qualquer empresa, usa o nó de envio como relay para números arbitrários e liga ou desliga a IA de terceiros | `authentication: headerAuth` no nó Webhook (a v2 já tem) **e** o header sendo realmente enviado pela Evolution (V2) | `curl` sem header → recusado; com header errado → recusado; com header correto → 200. Evidência anexada de `GET /webhook/find/{instance}` |
| R2 | Empresa deduzida do cliente; instância ambígua | `Get_data_client:1749`; `usuarios.instance_name` sem índice único | confirmado (v1) + provável (ambiguidade) | Telefone cadastrado na empresa A escrevendo para a empresa B carrega `id_info_clinica` de A — e esse valor vira "a empresa correta" na escrita | Índice único parcial em `usuarios(instance_name)` (V1) e resolução só pela instância, falhando fechado com 0 ou 2 linhas (V3) | Teste de isolamento com duas empresas: telefone cadastrado em B escreve na instância de A → tratado como cliente de A, sem ler nenhuma linha de B |
| R3 | Chaves de estado e memória sem empresa | 8 nós Redis mais 7 memórias com `…_{remoteJid}` | confirmado (v1); **corrigido na v2** (`am:{tipo}:{instance}:{remoteJid}`) | Mesmo telefone falando com duas empresas compartilha buffer, pausa e histórico completo | Manter o padrão `am:` da v2 e proibir chave sem `{instance}` | `validar_workflow.py` reprova qualquer nó Redis com chave sem a instância |
| R4 | IA escolhe corpo, filtro e ID | `fn_buscar_slots` (`$fromAI('JSON')`), `criar_consulta`, `atualizar_consulta`, `patch_cancelar` | confirmado (v1); **corrigido na v2** (0 `$fromAI`) | O modelo monta a consulta e a escrita inteiras, incluindo `p_procedimento_id`, `p_profissional_id` e o literal `intervalo` | Manter 0 `$fromAI` e resolver todo ID por código a partir do catálogo já filtrado por empresa | `validar_workflow.py` reprova `$fromAI` em nó de leitura ou escrita; `test_regras.mjs` prova que ID fora do catálogo vira handoff |
| R5 | Escrita sem idempotência | `retryOnFail: true` em `AI_step1`, `AI_agenda`, `AI_cancelar`, `AI_updade_cliente` (v1); `maxTries: 2` nas escritas da v2, sem chave | confirmado | Uma nova tentativa cria o segundo agendamento; reentrega da Evolution cria o terceiro | Coluna `consulta.chave_idempotencia` com índice único (V1); n8n envia chave determinística e trata conflito como sucesso repetido (V7) | Disparar duas vezes o mesmo `msg_id` e a mesma confirmação → uma única linha em `consulta`, segundo retorno marcado como repetido |
| R6 | `service_role` dentro do n8n | 12 referências na v2 | confirmado — **risco aceito neste corte** | Um erro de expressão em qualquer nó vira leitura ou escrita irrestrita, sem RLS para conter | Compensações: 0 `$fromAI`; empresa sempre presente na URL; travas de banco (V1); `validar_workflow.py` rodando a cada mudança; segredo somente no cofre do n8n. Gatilho de revisão: segunda empresa em produção **ou** primeiro incidente de filtro | Teste negativo automatizado: URL de escrita sem `id_info_clinica=eq.` reprova a validação |
| R7 | Sucesso comunicado sem efeito verificado | `criar_consulta`/`patch_cancelar` sem `Prefer` (v1); prompt de `AI_agenda` exige devolver `consulta_id` que não existe na resposta | confirmado (v1); **parcialmente corrigido na v2** | O cliente recebe "agendado" para um agendamento que pode não existir | `Prefer: return=representation` em toda escrita, releitura por `id` após o `INSERT` e verificador determinístico que bloqueia palavra de sucesso sem efeito confirmado (V6/V7) | Simular resposta vazia da escrita → a mensagem enviada é o template de falha; teste unitário do verificador com as seis palavras de sucesso |
| R8 | Ação sem confirmação explícita | prompt de `AI_cancelar` encadeia `get_consulta` → `patch_cancelar` no mesmo turno | confirmado (v1) | "Não vou poder ir amanhã" cancela sozinho | Proposta congelada em `am:pendente:…` com TTL, e execução só com afirmação clara sobre a proposta ativa (V6) | `test_regras.mjs`: "pode ser", "acho que sim", silêncio e nova pergunta não executam; só a afirmação clara executa |
| R9 | Reagendar e pedido de humano em silêncio | `connections.Switch2.main[4] = []`; `talk_humano` → `No Operation` | confirmado (v1) | Quem pede para remarcar ou falar com uma pessoa não recebe nada | Toda saída de switch precisa de destino, e o destino de falha é sempre handoff com mensagem ao cliente (V3) | `validar_workflow.py` já reprova saída de `switch`/`if` sem destino; teste manual de handoff |
| R10 | Vocabulário de status divergente | v1 e v2 gravam `cancelada`; [`Agenda.jsx:54`](apps/dashboard/src/pages/Agenda.jsx:54) conhece `pendente/agendado/cancelado/concluido`; [`server.py:375`](services/api/server.py:375) aceita os dois gêneros | confirmado | Cancelamento feito pela IA não aparece como cancelado na tela, e o horário parece ocupado | Backfill `cancelada → cancelado` e `CHECK` na coluna (V1), com um único literal no workflow (V7) | O `CHECK` rejeita `cancelada`; depois de um cancelamento pelo WhatsApp o card muda de estado no dashboard |
| R11 | Retenção de payload, base64 e dado pessoal | `saveDataSuccessExecution: "all"` (v1:3168); `base64: true` em [`evolution_api.py:48`](services/api/evolution_api.py:48) | confirmado | Telefone, nome, texto, transcrição e mídia inteira guardados a cada execução, sem prazo declarado | `saveDataSuccessExecution: "none"` (a v2 já tem) e `base64: false` no registro do webhook, já que este corte é só texto (V2) | `GET /webhook/find/{instance}` mostra `base64: false`; execução de sucesso no n8n não guarda corpo |
| R12 | Sem trava de conflito de horário no banco | Nenhuma constraint de exclusão em `docs/DATABASE_SCHEMA.md` nem em `scripts/*.sql` | provável (não verificável sem o banco) | Dois clientes recebem e aceitam o mesmo horário dentro da janela de agrupamento | `EXCLUDE USING gist (id_profissional WITH =, intervalo WITH &&) WHERE (status IN ('pendente','agendado'))` (V1) | Duas inserções sobrepostas para o mesmo profissional: a segunda falha no banco, não na aplicação |
| R13 | Cliente duplicado por corrida | `Cria_cliente` em ramo paralelo sem verificação (v1); na v2 o ramo é sequencial, mas sem unicidade no banco | confirmado (v1) / provável (v2) | Duas mensagens quase simultâneas de um cliente novo criam duas linhas e dois históricos | Índice único em `cliente(id_info_clinica, whats)` (V1) | Duas mensagens no mesmo segundo vindas de um número novo → uma única linha em `cliente` |
| R14 | Registro do webhook no formato antigo | [`evolution_api.py:48`](services/api/evolution_api.py:48) envia corpo sem o invólucro `webhook` e sem `headers`; a coleção v2.3 exige o invólucro | provável (depende da versão implantada) | O webhook pode ser registrado sem o header de autenticidade — ou não ser registrado — e R1 continua aberto mesmo com `headerAuth` ligado no n8n | Ajustar o corpo para o formato v2.3 e ler o header de variável de ambiente (V2) | `GET /webhook/find/{instance}` devolve URL e nome do header; `curl` sem header é recusado pelo n8n |

Riscos do blueprint deliberadamente **fora deste corte**, ainda válidos e sem prazo
aqui: S10 (exclusão e exportação de dados), S11 (injeção por imagem), S12 (áudio),
F9 (lembretes), F13/F14 (retomada da pausa pela tela), M1–M6 (memória de LLM — a v2
não usa memória de LLM; o estado vive no Redis).

---

## 4. O corte vertical

Oito entregas. Cada uma é demonstrável sozinha e pode ser desfeita sem tocar nas
outras. **Regra fixa em todas:** qualquer falha, ambiguidade ou resultado não
verificado termina em transferência para humano, com mensagem ao cliente — nunca em
silêncio e nunca em confirmação otimista.

Arquivos que **nenhuma** entrega pode alterar: `apps/**`, `docs/brand/**`,
`docs/research-private/**`, `docs/product/**`, qualquer `.env`,
`docs/planning/AI_AUTOMATION_BLUEPRINT.md`, `automation/n8n/AgendaMagnetica.n8n.json`
(o workflow antigo fica intacto como referência até a ativação da v2).

### V1 — Travas no banco

- **Objetivo:** garantir no banco aquilo que a aplicação não consegue garantir
  sozinha: uma empresa por instância, um horário por profissional, uma escrita por
  chave, um cliente por telefone e empresa, um vocabulário de status.
- **Arquivos alterados:** `scripts/travas_corte_vertical.sql` (novo),
  `scripts/travas_corte_vertical_verificacao.sql` (novo), `docs/DATABASE_SCHEMA.md`
  (apenas colunas novas e histórico).
- **Não pode alterar:** `services/api/**`, `automation/**`, `scripts/enable_rls.sql`.
- **Dependências:** D3, D4, D5, D6 e D11 respondidas; backup do banco de homologação.
- **Mudança mínima:** cinco comandos.
  1. `CREATE UNIQUE INDEX ux_usuarios_instance_name ON usuarios (instance_name) WHERE instance_name IS NOT NULL;`
  2. `ALTER TABLE consulta ADD COLUMN IF NOT EXISTS chave_idempotencia text;` mais índice único parcial sobre ela.
  3. `CREATE EXTENSION IF NOT EXISTS btree_gist;` mais `ALTER TABLE consulta ADD CONSTRAINT consulta_sem_sobreposicao EXCLUDE USING gist (id_profissional WITH =, intervalo WITH &&) WHERE (status IN ('pendente','agendado'));`
  4. `UPDATE consulta SET status = 'cancelado' WHERE status = 'cancelada';` mais `ALTER TABLE consulta ADD CONSTRAINT consulta_status_valido CHECK (status IN ('pendente','agendado','cancelado','concluido'));`
  5. `CREATE UNIQUE INDEX ux_cliente_empresa_whats ON cliente (id_info_clinica, whats) WHERE whats IS NOT NULL;`

  O script **para e lista** se já existir duplicidade em (1) ou (5), sobreposição em
  (3) ou status fora da lista em (4). Limpar dado existente é decisão do
  proprietário, não do script.
- **Testes automatizados:** `travas_corte_vertical_verificacao.sql` com cinco blocos
  `DO ... EXCEPTION` que tentam cada operação proibida e falham se ela passar;
  `services/api/.venv/Scripts/python -m pytest services/api/tests` continua verde.
- **Teste manual em homologação:** criar dois agendamentos sobrepostos para o mesmo
  profissional pelo dashboard — o segundo precisa ser recusado; criar e cancelar um
  agendamento pela tela — o fluxo normal do dashboard não pode quebrar.
- **Aceite:** as cinco tentativas proibidas falham no banco; nenhuma rota do
  dashboard passa a devolver erro em uso normal; `pytest` verde.
- **Rollback:** bloco de `DROP INDEX` e `DROP CONSTRAINT` comentado no fim do próprio
  arquivo. A coluna `chave_idempotencia` pode permanecer (nula e sem uso).
- **Riscos restantes:** RLS continua não provado (D3); a constraint de exclusão
  recusa sobreposição legítima se a empresa atender dois clientes ao mesmo tempo com
  o mesmo profissional — confirmar com a empresa de homologação antes de aplicar;
  `intervalo` mal formado pelo backend continua possível.

### V2 — Registro autêntico do webhook

- **Objetivo:** fazer a Evolution enviar um header secreto em toda entrega e parar de
  mandar mídia em base64, para que a autenticidade do webhook seja verificável e o
  payload retido encolha.
- **Arquivos alterados:** `services/api/evolution_api.py`, `services/api/.env.example`,
  `services/api/tests/test_webhook_config.py` (novo).
- **Não pode alterar:** `automation/**`, `scripts/**`, `services/api/server.py`.
- **Dependências:** D2 (versão da Evolution implantada). Não depende de V1.
- **Mudança mínima:** em `set_webhook`, enviar o corpo no formato v2.3
  (`{"webhook": {"enabled": true, "url": …, "headers": {<nome>: <valor>}, "byEvents": false, "base64": false, "events": ["MESSAGES_UPSERT", "SEND_MESSAGE"]}}`),
  lendo nome e valor do header de duas variáveis novas
  (`EVOLUTION_WEBHOOK_HEADER_NAME`, `EVOLUTION_WEBHOOK_SECRET`) pela função
  `require_env` que já existe em `settings.py`. Nenhum valor entra no repositório:
  só nomes em `.env.example`.
- **Testes automatizados:** teste que monta o corpo e verifica invólucro `webhook`,
  `base64: false`, presença do header e **ausência do valor do segredo em qualquer
  log ou retorno**; teste que a falta da variável levanta erro na inicialização, e
  não silenciosamente em produção.
- **Teste manual em homologação:** registrar o webhook pela rota existente e
  conferir `GET /webhook/find/{instance}` mostrando URL, `base64: false` e o **nome**
  do header (nunca o valor) no relatório.
- **Aceite:** `find` devolve a configuração esperada; uma mensagem real do WhatsApp
  chega ao n8n com o header; `pytest` verde.
- **Rollback:** reverter o arquivo e reexecutar `set_webhook` — o webhook volta ao
  formato anterior em uma chamada.
- **Riscos restantes:** se a Evolution implantada for anterior à 2.2, `headers` pode
  ser ignorado (D2). O caminho alternativo é caminho secreto no webhook mais
  allowlist de IP no proxy, com risco residual maior e registrado antes de ativar.

### V3 — Canal autêntico e empresa correta, sem IA

- **Objetivo:** provar a espinha do fluxo sem nenhuma inteligência: mensagem
  autêntica entra, é deduplicada, a empresa é resolvida pela instância, o cliente é
  resolvido dentro da empresa e recebe uma resposta fixa. Qualquer desvio vira
  handoff.
- **Arquivos alterados:** `automation/n8n/AgendaMagnetica-v2.n8n.json` (nós de
  entrada até `cliente da empresa`), `automation/n8n/validar_workflow.py`,
  `automation/n8n/tests/test_regras.mjs`, `automation/n8n/README.md`.
- **Não pode alterar:** `services/api/**`, `scripts/**`, `AgendaMagnetica.n8n.json`.
- **Dependências:** V1 aplicada — o índice único é o que torna a resolução por
  instância confiável. A edição do JSON pode começar antes de V2; o **teste manual**
  exige V2 mergeada.
- **Mudança mínima:** confirmar ou ajustar na v2: `headerAuth` apontando para a
  credencial do n8n; dedup por `am:dedup:{instance}:{msg_id}`; resolução da empresa
  **apenas** por `usuarios.instance_name`, tratando 0 **ou mais de 1** linha como
  falha fechada; cliente sempre buscado com `id_info_clinica` **e** `whats`; nenhuma
  saída de `switch`/`if` sem destino; toda falha caindo em pausa mais mensagem ao
  cliente. O roteamento de IA fica desligado nesta entrega (resposta fixa).
- **Testes automatizados:** `node automation/n8n/tests/test_regras.mjs` cobrindo
  normalização, dedup e resolução de empresa; `python automation/n8n/validar_workflow.py`
  cobrindo webhook autenticado, chaves Redis com instância, saídas sem destino e
  ausência de segredo literal.
- **Teste manual em homologação:** (a) `curl` sem header → recusado; (b) mensagem
  real no número de homologação → resposta fixa em até 10 s; (c) reenviar o mesmo
  `msg_id` → nenhuma segunda resposta; (d) telefone cadastrado na **segunda empresa
  de teste** escrevendo para a instância da primeira → tratado como cliente da
  primeira, sem ler nada da segunda.
- **Aceite:** os quatro testes manuais passam, os dois automatizados ficam verdes e
  nenhuma execução termina sem resposta ou sem handoff.
- **Rollback:** desativar o workflow no n8n — o número volta ao atendimento manual
  imediatamente.
- **Riscos restantes:** a empresa de homologação precisa ter exatamente um usuário
  com `instance_name` (garantido por V1); o handoff pausa a automação e avisa o
  cliente, mas ainda não notifica o profissional em canal próprio.

### V4 — Catálogo e uma única chamada de IA

- **Objetivo:** responder dúvidas de serviço, preço, duração e horário de
  funcionamento usando **apenas** o catálogo da empresa, com uma chamada de modelo
  por turno e saída estruturada validada. Sem escrita e sem disponibilidade.
- **Arquivos alterados:** os mesmos de V3 (nós `catalogo da empresa`, `montar
  contexto`, `IA interpretadora`, `validar interpretação`, `resolver e decidir`,
  `montar resposta`).
- **Não pode alterar:** `services/api/**`, `scripts/**`.
- **Dependências:** V3 aceita; D5 respondida. Se `v_clinica_detalhes` não expuser
  `id_info_clinica`, o catálogo é montado por consultas diretas a `procedimento`,
  `profissional` e `horario_clinica`, todas filtradas por empresa.
- **Mudança mínima:** o contexto injetado contém somente dados da empresa resolvida;
  o modelo devolve JSON validado por parser estruturado e, se o parser falhar duas
  vezes, o turno vira handoff; nenhuma resposta com preço, duração ou horário pode
  sair sem o campo correspondente presente no catálogo; o conteúdo do cliente entra
  delimitado e marcado como dado, nunca como instrução; nada de orientação clínica,
  parcelamento, desconto ou política inventada — esses assuntos viram handoff.
- **Testes automatizados:** `test_regras.mjs` — serviço inexistente vira "não temos
  esse serviço" mais oferta de humano, nunca invenção; preço só sai igual ao do
  catálogo; JSON inválido do modelo vira handoff; `validar_workflow.py` reprova mais
  de um nó `agent` no fluxo e agente sem `hasOutputParser`.
- **Teste manual em homologação:** perguntar o preço de um serviço existente, o de um
  inexistente, o horário de funcionamento e uma pergunta de política de cancelamento;
  os três primeiros batem com o cadastro e o quarto vira handoff.
- **Aceite:** quatro perguntas respondidas conforme acima, nenhuma resposta com dado
  ausente do catálogo, uma única chamada de modelo por turno.
- **Rollback:** voltar o roteamento à resposta fixa de V3 (uma aresta no JSON).
- **Riscos restantes:** não existe tabela de políticas (cancelamento, pagamento,
  preparo); enquanto não existir, esse assunto precisa cair em handoff.

### V5 — Disponibilidade real

- **Objetivo:** oferecer até dois horários que existem de verdade, calculados no
  servidor, com todos os parâmetros escolhidos por código.
- **Arquivos alterados:** os mesmos de V3 (nós `buscar horários`, `avaliar horários`).
- **Não pode alterar:** `services/api/**`, `scripts/**`.
- **Dependências:** **D4 respondida** — assinatura de `fn_buscar_slots`, se filtra
  por empresa e se respeita `agenda_bloqueio`. Esta entrega não começa sem isso.
- **Mudança mínima:** corpo da RPC montado por código a partir do catálogo já
  filtrado por empresa; se a RPC **não** filtrar por empresa, o resultado é
  conferido no nó seguinte contra a lista de profissionais da empresa e qualquer
  slot fora dessa lista invalida a resposta inteira (handoff); nunca completar
  quantidade — um slot devolvido é um slot oferecido, zero slot é uma resposta
  honesta mais oferta de humano; datas sempre com offset `-03:00`.
- **Testes automatizados:** `test_regras.mjs` — zero slots não vira sugestão; slot de
  profissional fora da empresa invalida a resposta; data relativa ("amanhã", "terça
  que vem") resolvida em `America/Sao_Paulo`, não no fuso do servidor.
- **Teste manual em homologação:** pedir horário para um serviço real e conferir cada
  horário oferecido contra a agenda no dashboard; bloquear a agenda do profissional e
  repetir — o horário bloqueado não pode ser oferecido.
- **Aceite:** todo horário oferecido existe no dashboard e respeita bloqueio; zero
  horários produz mensagem honesta; nenhum horário inventado em dez conversas de
  teste.
- **Rollback:** desligar a rota de disponibilidade e voltar ao comportamento de V4.
- **Riscos restantes:** se `fn_buscar_slots` ignorar `agenda_bloqueio`, o filtro fica
  na camada de automação — mais frágil, e registrado como risco até a RPC ser
  corrigida (fora deste corte).

### V6 — Proposta congelada e confirmação explícita, com fechamento humano

- **Objetivo:** transformar interesse em proposta congelada e obter confirmação
  explícita **sem ainda escrever no banco**: ao confirmar, o atendimento passa para
  uma pessoa. É um estado de piloto já vendável e sem risco de escrita errada.
- **Arquivos alterados:** os mesmos de V3 (nós `Redis - salvar/ler/descartar ação
  pendente`, `resolver e decidir`, `montar resposta`, `registrar decisão`).
- **Não pode alterar:** `services/api/**`, `scripts/**`.
- **Dependências:** V5 aceita.
- **Mudança mínima:** a proposta (serviço, profissional, início, fim, valor) é
  congelada em `am:pendente:{instance}:{remoteJid}` com TTL de 15 minutos e um
  `acao_id` determinístico; a mensagem de confirmação é montada **apenas** com os
  campos congelados e termina em pergunta fechada; só uma afirmação clara sobre a
  proposta ativa avança — ambiguidade, nova pergunta, troca de assunto ou expiração
  descartam a proposta e perguntam de novo; ao confirmar, handoff com resumo
  estruturado e mensagem ao cliente dizendo que uma pessoa vai fechar. **O
  verificador determinístico de saída entra aqui:** nenhuma mensagem pode conter
  "agendado", "confirmado", "marcado", "cancelado", "remarcado" ou "reservado"
  enquanto não houver efeito verificado.
- **Testes automatizados:** `test_regras.mjs` — "pode ser", "acho que sim", silêncio,
  nova pergunta e proposta expirada não avançam; a mensagem de confirmação só contém
  campos congelados; o verificador bloqueia as seis palavras de sucesso e as
  substitui pelo template.
- **Teste manual em homologação:** conversa completa até a confirmação; conferir que
  o profissional recebe o resumo, que o cliente é avisado e que a IA para de
  responder naquele contato até a pausa expirar.
- **Aceite:** nenhuma execução avança sem confirmação clara; nenhuma mensagem afirma
  ação concluída; handoff visível em menos de 5 s.
- **Rollback:** desligar a rota de confirmação e voltar ao comportamento de V5.
- **Riscos restantes:** o horário fica prometido por 15 minutos sem reserva no banco —
  aceitável no piloto de uma empresa, precisa de reserva real antes de escalar.

### V7 — Escrita idempotente e verificada

- **Objetivo:** substituir o fechamento humano de V6 pela criação do agendamento —
  idempotente, com o efeito relido do banco antes de qualquer mensagem de sucesso.
- **Arquivos alterados:** os mesmos de V3 (nós `Redis - trava da ação`, `revalidar
  horário`, `conferir revalidação`, `criar consulta`, `verificar resultado`, `montar
  resposta`).
- **Não pode alterar:** `services/api/**`, `scripts/**`.
- **Dependências:** V1 e V6 aceitas.
- **Mudança mínima:** revalidar o horário imediatamente antes de escrever; enviar
  `chave_idempotencia` determinística (empresa, cliente, ação, proposta, janela) e
  `Prefer: return=representation`; conflito de chave devolve o registro existente e é
  tratado como sucesso repetido, não como erro; conflito de horário no banco vira
  reoferta, não falha genérica; **uma releitura por `id` e `id_info_clinica`** depois
  do `INSERT`, e só então a confirmação; status gravado exatamente como `pendente`;
  timeout na escrita nunca vira "não deu certo" — consulta pela chave antes de
  responder; qualquer resultado ausente ou divergente vira handoff.
- **Testes automatizados:** `test_regras.mjs` — resposta vazia da escrita não vira
  confirmação; conflito de chave vira sucesso repetido sem segunda linha; conflito de
  horário vira reoferta; timeout vira consulta pela chave. `validar_workflow.py` —
  toda escrita com `Prefer` e com `id_info_clinica` na URL.
- **Teste manual em homologação:** agendar pelo WhatsApp e ver o card aparecer no
  dashboard com serviço, profissional, horário e status corretos; repetir a mesma
  confirmação duas vezes e conferir que existe uma única linha; ocupar o horário pelo
  dashboard entre a oferta e a confirmação e conferir que a IA reoferta em vez de
  duplicar.
- **Aceite:** todo agendamento anunciado existe no banco; nenhuma duplicidade em 20
  tentativas, incluindo reenvios; zero mensagens de sucesso sem efeito verificado.
- **Rollback:** apontar a aresta de confirmação de volta para o handoff de V6 — a
  automação deixa de escrever e o piloto continua funcionando.
- **Riscos restantes:** reagendar e cancelar continuam fora do caminho ativo deste
  corte, mesmo já existindo nós para eles na v2; a escrita continua saindo do n8n com
  `service_role` (R6).

### V8 — Homologação e decisão de ativar

- **Objetivo:** provar o corte inteiro em uma sequência única, com evidência, e
  decidir a ativação.
- **Arquivos alterados:** `docs/planning/HOMOLOGACAO_CORTE_VERTICAL.md` (novo, **do
  coordenador**, não dos agentes de implementação).
- **Não pode alterar:** nada de código.
- **Dependências:** V1 a V7 aceitas.
- **Mudança mínima:** rodar as suítes automatizadas, executar a bateria manual de §8
  e registrar horário e resultado de cada passo, o `id` de cada agendamento criado, o
  que falhou e o que ficou como risco aceito.
- **Testes automatizados:** `node automation/n8n/tests/test_regras.mjs`;
  `python automation/n8n/validar_workflow.py`;
  `services/api/.venv/Scripts/python -m pytest services/api/tests`; os blocos de
  verificação SQL de V1.
- **Teste manual:** a checklist de demonstração de §8, executada de ponta a ponta em
  uma sessão, com o dashboard aberto ao lado.
- **Aceite:** 100% dos itens da checklist de segurança de §7 verdes; a demonstração
  de §8 completa sem intervenção; zero mensagens de sucesso sem efeito.
- **Rollback:** não ativar. O workflow permanece `active: false`.
- **Riscos restantes:** os declarados em R6 e nos "riscos restantes" de cada entrega,
  mais os itens adiados de §9.

---

## 5. Decisões que precisam do proprietário

Nenhum item abaixo pede valor de credencial. Todos pedem **estado, origem ou
decisão**. As respostas devem ser coladas neste documento ou em
`docs/planning/HOMOLOGACAO_CORTE_VERTICAL.md`.

| # | Decisão ou informação | Por que trava | Quem depende |
|---|---|---|---|
| D1 | Versão exata do n8n instalado | Define o padrão do nó `Wait`, o comportamento de `headerAuth` e a validade das expressões da v2 (E10) | V3 |
| D2 | Versão da Evolution API implantada e se o `POST /webhook/set` aceita `webhook.headers` (a coleção local documenta v2.3 com suporte) | Se não aceitar, a autenticidade do webhook muda de estratégia e o risco residual sobe (R1, R14) | V2, V3 |
| D3 | `scripts/enable_rls.sql` foi executado? Em homologação, em produção, nos dois ou em nenhum? | Define se a `service_role` no n8n é a única barreira ou a segunda (R6, H5) | V1, decisão de ativar |
| D4 | Definição real de `fn_buscar_slots`: assinatura, se filtra por empresa, se respeita `agenda_bloqueio` | Sem isso não dá para projetar a oferta de horários nem saber se o filtro precisa ficar na automação (E12) | V5, V7 |
| D5 | Estrutura real de `v_clinica_detalhes`: colunas e presença de `id_info_clinica` | Define se o catálogo vem da view ou de três consultas filtradas (E12) | V4 |
| D6 | Qual é o ambiente de homologação: projeto Supabase, instância n8n, Redis e número de WhatsApp **separados de produção**? Quem executa os testes manuais? | Todo o corte roda em homologação; sem separação, qualquer teste vira mudança em produção | V1 a V8 |
| D7 | O Redis do n8n é dedicado à Agenda Magnética ou compartilhado com outra aplicação? | O prefixo `am:` evita colisão, mas política de `FLUSHALL` de terceiros derruba dedup, pausa e proposta congelada (H11) | V3, V6 |
| D8 | Política de retenção: por quanto tempo guardar execuções de erro no n8n, por quanto tempo manter as chaves `am:*` e se transcrição ou descrição de mídia pode ser persistida | Define o que fica gravado com dado pessoal e por quanto tempo (R11) | V2, V3 |
| D9 | Quais credenciais estão **ativas hoje** no servidor n8n (Supabase, OpenAI, Postgres de memória, Google) — apenas nomes e estado. Autoriza desativar ou remover a credencial Google, se existir? | O JSON não prova nada sobre credenciais; isso é estado do servidor (E1, E4) | Antes de ativar |
| D10 | Aceita manter `service_role` dentro do n8n durante o piloto, com as compensações de R6 e revisão na segunda empresa? Ou exige `/api/ai/*` antes de qualquer ativação? | É a maior decisão de arquitetura do corte. **Recomendação: aceitar**, com gatilho de revisão escrito (E9) | Escopo de V7 e de tudo depois |
| D11 | Confirma `pendente / agendado / cancelado / concluido` como vocabulário oficial e autoriza o `UPDATE` de backfill de `cancelada` para `cancelado`? | É alteração de dado existente; precisa de autorização e backup (R10) | V1 |
| D12 | Existe uma segunda empresa de teste no banco de homologação (sem instância conectada), só para provar isolamento? Se não, autoriza criar? | Sem duas empresas o teste de isolamento não prova nada (R2) | V3 |

---

## 6. Coordenação entre agentes

Apenas dois agentes de implementação, com conjuntos de arquivos disjuntos. Os prompts
completos serão escritos pelo coordenador depois da aprovação deste plano.

### Agente Backend/API

- **Escopo:** V1 (travas no banco) e V2 (registro autêntico do webhook).
- **Arquivos exclusivos:** `scripts/**`, `docs/DATABASE_SCHEMA.md`, `services/api/**`
  (incluindo `services/api/tests/`).
- **Não toca:** `automation/**`, `apps/**`, `docs/planning/**`, `docs/product/**`.
- **Entrega considerada pronta quando:** o SQL de verificação falha nas cinco
  operações proibidas, `pytest` está verde e `GET /webhook/find/{instance}` devolve a
  configuração esperada em homologação.

### Agente Automação n8n

- **Escopo:** V3 a V7.
- **Arquivos exclusivos:** `automation/n8n/AgendaMagnetica-v2.n8n.json`,
  `automation/n8n/validar_workflow.py`, `automation/n8n/tests/**`,
  `automation/n8n/README.md`.
- **Não toca:** `services/api/**`, `scripts/**`, `apps/**`, `docs/**`,
  `automation/n8n/AgendaMagnetica.n8n.json` (o workflow antigo fica intacto).
- **Entrega considerada pronta quando:** `test_regras.mjs` e `validar_workflow.py`
  estão verdes e o teste manual da entrega passa no número de homologação.

### Ordem e ponto exato de início

1. O agente Backend/API começa por **V1** assim que D3, D6, D11 e D12 estiverem
   respondidas e o backup do banco estiver feito.
2. O agente Automação n8n **pode começar a editar o JSON em paralelo a V2** — os
   conjuntos de arquivos não se cruzam — mas só pode **executar o teste manual de V3**
   depois que V2 estiver mergeada e o webhook de homologação estiver registrado com o
   header. Antes disso, roda apenas os testes automatizados.
3. V4 a V7 são sequenciais dentro do agente de automação; cada uma só começa com a
   anterior aceita.
4. Nenhum dos dois abre `docs/planning/**`. Este plano e o relatório de homologação
   pertencem ao coordenador.
5. Se uma entrega precisar de arquivo do outro agente, ela **para** e vira pedido ao
   coordenador. Edição cruzada não é permitida em nenhuma hipótese.

---

## 7. Checklist de segurança antes de ativar

Todos os itens precisam estar verdes. Qualquer vermelho impede a ativação.

- [ ] O workflow antigo (`AgendaMagnetica.n8n.json`) continua inativo e não foi importado.
- [ ] O webhook recusa requisição sem o header secreto (evidência: dois `curl`, um com e um sem).
- [ ] `GET /webhook/find/{instance}` mostra `base64: false` e o nome do header combinado.
- [ ] `saveDataSuccessExecution` está em `none` no workflow ativo.
- [ ] Nenhum segredo literal no JSON: `validar_workflow.py` verde para JWT, `sk-`, URL de projeto, telefone e e-mail.
- [ ] Nenhum nó de Google Calendar no workflow, e o e-mail pessoal removido.
- [ ] Nenhuma ocorrência de `$fromAI` em nó de leitura ou escrita.
- [ ] Toda URL de escrita contém `id_info_clinica=eq.` e `Prefer: return=representation`.
- [ ] Toda chave Redis começa com `am:` e contém a instância.
- [ ] A empresa é resolvida somente pela instância; 0 ou 2 linhas em `usuarios.instance_name` derrubam o atendimento em vez de adivinhar.
- [ ] Índice único de `instance_name`, índice único de `cliente(id_info_clinica, whats)`, constraint de exclusão de horário, índice de idempotência e CHECK de status aplicados e verificados.
- [ ] Nenhuma saída de `switch`/`if` sem destino, e todo destino de falha leva a handoff com mensagem ao cliente.
- [ ] Verificador de saída ativo: nenhuma mensagem com palavra de sucesso sai sem efeito verificado.
- [ ] Estado do RLS conhecido e registrado (D3), com a decisão de D10 escrita e datada.
- [ ] Backup do banco de homologação feito, e plano de rollback testado ao menos uma vez (desativar o workflow e confirmar que o número volta ao atendimento manual).
- [ ] Credenciais ativas no n8n conferidas e as desnecessárias desativadas (D9).
- [ ] Nenhum `.env` versionado; apenas `.env.example` com nomes.

## 8. Checklist de demonstração do corte vertical

Executar em uma sessão única, com o dashboard aberto, no número de homologação.

1. Enviar uma mensagem real do WhatsApp para o número da empresa de homologação e receber resposta.
2. Confirmar no log do n8n que a empresa foi resolvida **pela instância**, não pelo telefone.
3. Perguntar quais serviços existem e conferir a resposta contra a tela de Procedimentos.
4. Perguntar o preço de um serviço e conferir o valor exato do cadastro.
5. Pedir um horário e conferir cada horário oferecido contra a Agenda no dashboard.
6. Responder de forma ambígua ("pode ser") e confirmar que a IA **não** agenda e pergunta de novo.
7. Confirmar de forma clara e ver o agendamento aparecer no dashboard com serviço, profissional, horário e status corretos.
8. Repetir a mesma confirmação e conferir que continua existindo **um único** agendamento.
9. Pedir "quero falar com uma pessoa" e confirmar que o cliente recebe aviso, a automação pausa e o profissional recebe o resumo.
10. Simular falha (derrubar a chamada de escrita) e confirmar que a mensagem enviada é o template de falha mais handoff, nunca uma confirmação.
11. Enviar mensagem de um telefone cadastrado na segunda empresa de teste e confirmar que nenhum dado dela aparece.
12. Desativar o workflow e confirmar que o número volta ao atendimento manual imediatamente.

## 9. O que foi adiado

Explicitamente fora deste corte. Nada aqui é "esquecido": cada item volta com gatilho
próprio.

- **Reagendar e cancelar pela IA** — os nós já existem na v2, mas ficam fora do caminho ativo. Voltam quando V7 acumular duas semanas sem incidente.
- **`/api/ai/*` no backend, com token de máquina, IDs opacos e `slot_id` assinado** — volta quando houver segunda empresa em produção ou no primeiro incidente de filtro (R6, D10).
- **Tabelas novas** (`whatsapp_instancia`, `empresa_politica`, `empresa_faq`, `acao_idempotente`, `conversa`, `conversa_evento`) — substituídas neste corte por cinco travas. `empresa_politica` volta assim que houver a primeira pergunta recorrente de política; `whatsapp_instancia`, quando uma empresa precisar de duas instâncias.
- **Central de Atendimento no dashboard** — o handoff neste corte pausa e notifica; a tela de assumir e devolver fica para a fase seguinte.
- **Áudio e imagem** — o corte é só texto. `base64: false` no webhook reforça isso.
- **Lembrete, confirmação de presença, follow-up, lista de espera, reativação** — dependem de gatilho agendado, que o workflow não tem.
- **Pagamentos, sinal, campanhas, RAG, embeddings, multi-idioma, voz, fine-tuning.**
- **Métricas sofisticadas e painel de indicadores** — neste corte, medir só o que a demonstração de §8 exige.
- **Exclusão e exportação de dados do cliente (S10)** — obrigatório antes de venda aberta, não antes do piloto de uma empresa; precisa de decisão de política (D8).
- **Detector de injeção dedicado** — a proteção estrutural (a IA não escolhe tenant, filtro nem ID) já contém o dano; o detector volta com áudio e imagem.
- **Remoção de `Google Calendar` do arquivo antigo** — o arquivo antigo não é editado; os nós simplesmente não existem na v2 que vai ao ar.

---

## 10. Encerramento

### Recomendação

**Começar** — pelo caminho reduzido descrito aqui, e não pelo blueprint completo.

O corte é viável porque a parte cara já foi feita: a v2 do workflow já resolve
empresa pela instância, já eliminou `$fromAI`, já isola as chaves do Redis por
instância, já pede `Prefer: return=representation` e já tem testes que executam o
JavaScript real dos nós. O que falta é pequeno, verificável e reversível: cinco
travas no banco, um ajuste no registro do webhook e cinco cortes de escopo no fluxo.

Não começar por V5 antes de D4 e não aplicar V1 antes do backup.

### Primeiro passo exato

Rodar, **no banco de homologação**, estas cinco consultas somente de leitura e colar
o resultado em `docs/planning/HOMOLOGACAO_CORTE_VERTICAL.md`. Elas respondem D3, D4,
D5, D11 e metade de D12 sem escrever uma linha de código:

```sql
-- 1. definição da RPC de horários (D4)
select pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'fn_buscar_slots';

-- 2. estrutura da view de contexto (D5)
select column_name, data_type
from information_schema.columns
where table_name = 'v_clinica_detalhes'
order by ordinal_position;

-- 3. instância duplicada entre usuários (D12 / R2)
select instance_name, count(*)
from usuarios
where instance_name is not null
group by 1 having count(*) > 1;

-- 4. vocabulário real de status (D11 / R10)
select status, count(*) from consulta group by 1 order by 2 desc;

-- 5. estado do RLS (D3)
select relname, relrowsecurity
from pg_class
where relname in ('cliente','consulta','usuarios','info_clinica','procedimento','profissional');
```

### Bloqueadores

1. **D4 e D5** — sem a definição de `fn_buscar_slots` e da view, V4 e V5 não podem ser
   projetadas. É o bloqueador número um.
2. **D6** — sem ambiente de homologação separado, qualquer teste vira mudança em
   produção. Nada começa.
3. **D2** — se a Evolution implantada não suportar `webhook.headers`, V2 muda de
   estratégia e o risco residual do webhook aumenta; precisa de decisão consciente.
4. **Backup do banco e autorização do backfill de status (D11)** — V1 altera dado
   existente.
5. **D10** — a decisão sobre manter `service_role` no n8n define o escopo de V7 e de
   tudo que vem depois. Sem ela, o agente de automação trabalha sem saber se está
   construindo o alvo final ou um intermediário.
6. **Coordenação** — este plano precisa ser aprovado antes de qualquer agente tocar em
   arquivo, porque a v2 do workflow está fora do Git e uma edição concorrente
   perderia trabalho.

*Documento de planejamento. Nenhum arquivo do produto foi alterado para produzi-lo.*
