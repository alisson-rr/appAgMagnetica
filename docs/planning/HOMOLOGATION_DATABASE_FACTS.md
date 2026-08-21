# Base oficial construída — Agenda Magnética

> **Status: BASE CRIADA, APLICADA E VERIFICADA.**
> O projeto Supabase configurado no `.env` é a fonte oficial. Estava vazio; agora tem
> 13 tabelas, 1 view, 1 função, 6 travas, RLS em tudo e **zero linhas de dado**.
> **Data:** 2026-08-21. **Servidor:** PostgreSQL 17.6. **Fuso:** `America/Sao_Paulo`.
> O banco antigo **não** foi procurado nem importado, conforme decisão do proprietário.

---

## 0. Resultado

A base foi construída a partir do **comportamento atual do código**, não da
documentação antiga — que se provou errada em quatro pontos. Tudo foi aplicado ao
banco, os scripts rodaram duas vezes sem efeito colateral, 21 verificações
transacionais passaram e a suíte da API subiu de 3 para **41 testes**, todos verdes.

Um bug do próprio bootstrap foi encontrado por revisão adversarial (reproduzido em
container limpo) e corrigido: faltava `btree_gist` antes do primeiro índice GiST.

**Um bloqueador permanece, e não é meu:** a automação chama `fn_buscar_slots` sem
`p_id_info_clinica` e grava `status: 'cancelada'`. Os dois quebram contra esta base.
Detalhes em §11.

---

## 1. Variáveis normalizadas

O `.env` da raiz tinha as credenciais em **linhas comentadas** (`# Password`, `# ID`,
`# AnonKey`, `# Secret`) — formato que `python-dotenv` ignora por completo. Foram
convertidas em variáveis reais. **Somente nomes**, nunca valores:

| Variável | Origem | Estado |
|---|---|---|
| `SUPABASE_URL` | derivada do `ID` | preenchida |
| `SUPABASE_ANON_KEY` | `AnonKey` | preenchida |
| `SUPABASE_SERVICE_ROLE_KEY` | `Secret` | preenchida |
| `DATABASE_URL` | `ID` + `Password` + host do pooler que conectou | preenchida |
| `JWT_ALGORITHM`, `JWT_EXPIRATION_HOURS`, `CORS_ORIGINS` | padrões do código | preenchidas |
| `EVOLUTION_WEBHOOK_HEADER_NAME` | padrão do backend | preenchida |
| `JWT_SECRET` | — | **vazia** |
| `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_URL`, `EVOLUTION_WEBHOOK_SECRET` | — | **vazias** |

As cinco vazias não foram inventadas. O arquivo traz o comando de geração para as duas
que são segredo local (`JWT_SECRET`, `EVOLUTION_WEBHOOK_SECRET`); as outras três
dependem da instância da Evolution. `require_env` falha alto com variável vazia, que é
o comportamento correto.

**Correção necessária no backend:** `server.py` lia `.env` apenas de `services/api/`,
então o arquivo da raiz nunca seria carregado. Passou a procurar nos dois lugares, com
precedência para o local do backend. O `.env` continua ignorado pelo Git (`.gitignore:89`).

---

## 2. Arquivos criados e alterados

### Criados

| Arquivo | Papel |
|---|---|
| `scripts/bootstrap_schema.sql` | 13 tabelas, FKs, CHECKs, índices de FK, RLS e grants |
| `scripts/v_clinica_detalhes.sql` | view de contexto de atendimento |
| `scripts/fn_buscar_slots.sql` | RPC de disponibilidade |
| `scripts/teste_transacional.sql` | 21 verificações, termina em `ROLLBACK` |
| `services/api/tests/conftest.py` | ambiente de teste isolado do `.env` da máquina |
| `services/api/tests/test_schema_compatibilidade.py` | 24 testes contra o banco real |
| `services/api/tests/test_erros_api.py` | 4 testes da tradução de erro de FK |

### Alterados

| Arquivo | O quê |
|---|---|
| `.env` | normalizado (só nomes acima) |
| `scripts/travas_corte_vertical.sql` | `btree_gist` vai para `extensions`; `agenda_bloqueio` entra em T6 |
| `services/api/server.py` | carrega `.env` da raiz; valida disponibilidade antes de apagar; `raise_if_in_use` |
| `docs/DATABASE_SCHEMA.md` | reescrito a partir do catálogo real |
| `docs/planning/HOMOLOGATION_DATABASE_FACTS.md` | este arquivo |
| 4 scripts antigos | marcados como **aposentados** (ver §3) |

Nada em `apps/**`, `automation/**` ou `graphify-out/**`. Nenhum commit, nenhum push.

---

## 3. Scripts aposentados

Marcados com aviso no topo porque agora quebram ou enganam:

| Script | Por quê |
|---|---|
| `create_usuarios_table.sql` | cria `usuarios` sem `id_info_clinica`, `role`, `instance_name` nem `trial_*` — a tabela resultante quebra registro e login |
| `add_telefone_cliente.sql` | não reexecutável; a coluna já nasce no bootstrap |
| `enable_rls.sql` | substituído pelo bloco de RLS do bootstrap, que cobre 13 tabelas (inclui `planos` e `assinaturas`) e concede o que a `service_role` precisa |
| `insert_disponibilidade_profissional.sql` | dados de exemplo com ids fixos que não correspondem a profissional algum |

---

## 4. Objetos criados no Supabase

**13 tabelas:** `info_clinica`, `area_atuacao`, `usuarios`, `cliente`, `profissional`,
`procedimento`, `profissional_procedimento`, `horario_clinica`,
`disponibilidade_profissional`, `agenda_bloqueio`, `consulta`, `planos`, `assinaturas`.

**1 view:** `v_clinica_detalhes` (`security_invoker = true`).

**1 função:** `fn_buscar_slots` — e é a **única** função em `public`, confirmado no
catálogo. `btree_gist` foi movida para o schema `extensions`: instalada em `public` ela
despejava ~140 funções `gbt_*` que o PostgREST passaria a expor como API.

**Constraints:** 17 FKs, 11 CHECKs, 1 EXCLUDE, uniques em `usuarios.email`,
`planos.codigo` e `(id_profissional, id_procedimento)`.

**Travas T1–T6** todas aplicadas: unicidade de `instance_name`, cliente único por
empresa e WhatsApp normalizado, exclusão de sobreposição, `chave_idempotencia` com
índice único, `CHECK` dos cinco status, e índices por empresa em 8 tabelas.

**RLS:** habilitado nas 13 tabelas, **zero políticas** — decisão explicada em §8.

**Dados:** zero linhas em todas as tabelas. Nenhum plano, preço, cliente ou empresa
fictícia foi inserido.

---

## 5. O que a documentação antiga errava

Quatro divergências reais, encontradas confrontando o código:

| Item | Documentação antiga | Realidade |
|---|---|---|
| `info_clinica.onboarding_completo` | ausente | a API grava `false` na criação e o Onboarding grava `true` |
| `info_clinica.assistente_*`, `exige_profissional` | ausentes | a automação lê pela view |
| `agenda_bloqueio.id_info_clinica` | ausente | a API sempre gravou |
| Vocabulário de status | quatro valores | **cinco** — `confirmado` faltava, e é usado por `server.py:379` e pelo Dashboard |

Colunas documentadas que **não** foram criadas, por não ter consumidor:
`profissional.id_especialidade`, `consulta.motivo`. E `usuarios.trial_expirado` /
`dias_restantes` não são colunas: são calculados na resposta do login.

---

## 6. Contrato congelado — `fn_buscar_slots`

`SECURITY INVOKER`, `STABLE`, `search_path = public, pg_temp`. Nenhum `SECURITY DEFINER`
em `public`.

```
fn_buscar_slots(
  p_id_info_clinica int8,          -- OBRIGATÓRIO, sem default
  p_procedimento_id int8,          -- OBRIGATÓRIO, sem default
  p_inicio          timestamptz,
  p_fim             timestamptz,
  p_profissional_id int8 default null,
  p_step_minutos    int  default 30,
  p_duracao_minutos int  default null
) returns table (
  id_info_clinica   int8,
  id_profissional   int8,   -- NUNCA nulo
  id_procedimento   int8,
  inicio            timestamptz,
  fim               timestamptz,
  profissional_nome text
)
```

**Validações, todas provadas em teste:** o procedimento tem de ser da empresa (senão
levanta exceção), o profissional tem de ser da empresa, o profissional tem de executar
aquele procedimento, respeita `horario_clinica`, respeita
`disponibilidade_profissional`, exclui `agenda_bloqueio`, exclui consulta viva
(`pendente`, `agendado`, `confirmado` — o **mesmo** conjunto da constraint T3, para
função e banco não discordarem), nunca oferta passado, e `DISTINCT` impede slot
duplicado quando a empresa cadastra faixas de horário sobrepostas.

`p_id_info_clinica` **não recebe default de propósito**. Com default, a empresa
passaria a ser dedutível e o isolamento cairia.

---

## 7. Contrato congelado — `v_clinica_detalhes`

Uma linha por empresa. Arrays nunca vêm `null`.

| Campo | Tipo |
|---|---|
| `id_info_clinica` | int8 — filtro obrigatório |
| `clinica_nome`, `clinica_telefone`, `clinica_email`, `clinica_endereco` | text |
| `assistente_nome`, `assistente_tom` | text (nulo usa o padrão do fluxo) |
| `exige_profissional` | bool |
| `procedimentos` | jsonb `[{id, nome, valor, duracao_minutos, agendavel}]` |
| `profissionais` | jsonb `[{id, nome, area}]` — **somente ativos** |
| `horarios` | jsonb `[{dia_semana, hora_inicio, hora_fim}]` — hora em `HH:MM` |

`agendavel` é `true` só quando existe profissional **ativo** habilitado no serviço. Foi
acrescentado depois da revisão: sem ele, um serviço que ninguém executa recebia zero
horários para sempre e o fluxo tratava isso como "sem vaga hoje", reoferecendo o mesmo
serviço no turno seguinte em vez de transferir para uma pessoa. É campo **adicional** —
não quebra quem já lê a view.

Não expõe nada de `usuarios`, `cliente` ou `consulta`, e nenhuma credencial.

---

## 8. RLS — situação real

RLS **habilitado nas 13 tabelas, com zero políticas**. Não é omissão, é a leitura dos
fatos do catálogo:

- `service_role` tem `rolbypassrls = true` — **verificado**. É o papel do backend e da
  automação, então ligar RLS não afeta nenhum dos dois.
- `anon` e `authenticated` **não** têm bypass. Com RLS ligado e nenhuma política ficam
  sem acesso, reforçado por `REVOKE ALL` explícito. Provado no teste 11.
- O frontend não consulta o Supabase: usa a API.
- Política com `auth.uid()` exigiria autenticação de usuário final no Supabase, que o
  produto não usa. Escrever política agora seria regra para um modelo de sessão
  inexistente — e arriscaria quebrar o acesso atual.

**O isolamento principal entre empresas é validado pela API**, em
`get_user_clinica_id()` (`server.py:203`) e `assert_owned_record()` (`server.py:214`).
O RLS é a segunda barreira. Isto está documentado também em `DATABASE_SCHEMA.md`.

O que o RLS de hoje **não** impede: vazamento por erro de filtro no código do backend
ou da automação, porque as duas usam `service_role`. Essa é a razão pela qual as travas
de banco (T1–T6) importam — elas valem mesmo quando o filtro do código falha.

---

## 9. Testes executados

| Teste | Resultado |
|---|---|
| `pytest services/api/tests` | **41 passaram** (eram 3 no início da sessão) |
| Scripts aplicados duas vezes | 4/4 OK nas duas passadas, zero objetos novos na segunda |
| `scripts/teste_transacional.sql` | **21 verificações OK**, 0 falhas, 0 linhas persistidas |
| Inspeção do catálogo | 13 tabelas, 1 view, 1 função em `public`, RLS em tudo |
| Formatos de `tstzrange` | 4 literais do backend e da automação, todos aceitos |
| `git diff --check` | limpo nos arquivos alterados |

Os 41 testes incluem 24 que rodam **contra o banco real** e falham se qualquer campo de
modelo Pydantic perder a coluna, se uma FK de join embutido do PostgREST desaparecer,
se o CHECK de status recusar um valor que a API escreve, ou se a view e a RPC saírem do
contrato. Sem `DATABASE_URL`, esses 24 são ignorados em vez de falharem.

Cobertura do teste transacional: mesmo telefone em empresas diferentes (permitido),
duplicata na mesma empresa (recusada), `instance_name` duplicado (recusado), nulos e
vazios convivendo, sobreposição de horário (recusada), mesmo horário para outro
profissional (permitido), idempotência (recusada), status inválido incluindo
`cancelada` (recusado), isolamento da RPC nos dois sentidos, procedimento de outra
empresa (recusado), bloqueio respeitado, consulta existente respeitada, fechamento
respeitado, view filtrada por empresa com ids, `agendavel` nos três estados,
profissional inativo fora da view, exclusão com histórico recusada, todo slot completo,
e `anon` barrado.

---

## 10. Achados da revisão adversarial

19 agentes revisaram o que foi criado sob quatro lentes (RPC, view, schema, segurança),
e cada achado grave passou por um agente encarregado de **refutá-lo**. 15 achados, 11
sobreviveram. Os quatro que eram meus foram corrigidos:

| # | Achado | Ação |
|---|---|---|
| 1 | **`btree_gist` faltando no bootstrap.** `ix_agenda_bloqueio_profissional` é GiST sobre `(int8, tstzrange)`; GiST sobre int8 exige a extensão, que só era instalada no script seguinte. Rodar o bootstrap num banco limpo — a ordem documentada — abortava a transação inteira. **Reproduzido em container `postgres:17`** pelo agente refutador; não pegou aqui porque a extensão já existia da sessão anterior | **corrigido**: bloco de extensão passou a ser o passo 0 do bootstrap |
| 2 | **Serviço sem profissional habilitado** produzia zero horários para sempre, e o fluxo reoferecia o mesmo serviço em vez de transferir | **corrigido**: campo `agendavel` na view |
| 3 | **Perda de dados na disponibilidade.** `POST /profissionais/{id}/disponibilidade` apaga e depois insere, sem transação. Meu `CHECK hora_fim > hora_inicio` fazia o insert falhar **depois** do delete, apagando a agenda do profissional | **corrigido**: validação antes do delete, com 400 explicativo |
| 4 | **Exclusão com histórico devolvia 500.** As FKs de `consulta` são RESTRICT, então os três botões de excluir do painel passariam a falhar com "Erro interno" | **corrigido**: `raise_if_in_use` traduz em 409 com explicação, sem vazar detalhe do banco |

Refutados, sem ação: os *default privileges* do Supabase reconcedendo `anon` em tabelas
futuras (rebaixado a baixo — nenhuma tabela fica fora do loop hoje); o filtro
`status=neq.cancelada` do nó de reagendar (há whitelist a montante); e os slots
duplicados por faixas sobrepostas (o `DISTINCT` já estava lá).

---

## 11. Para o Agente 1 (automação) — dois bloqueadores

**Não editei `automation/**`.** Estes dois itens quebram contra a base nova e precisam
de mudança no workflow:

1. **`fn_buscar_slots` é chamada sem `p_id_info_clinica`.** `montarBusca()` e
   `busca_revalidacao`, no nó `resolver e decidir`, montam corpos com seis chaves;
   `p_id_info_clinica` aparece **zero vez** no JSON do workflow. O PostgREST resolve RPC
   pelo conjunto de argumentos nomeados, e o parâmetro não tem default: os nós
   `buscar horários` e `revalidar horário` recebem **404 PGRST202**, e o fluxo cai em
   `falha_ferramenta`. Nenhum cliente recebe horário, nunca.
   **Correção:** acrescentar `p_id_info_clinica: ctx.empresa.id` nos dois objetos.
   `ctx.empresa.id` já é garantido não-nulo pelo guard anterior, e o nó de escrita
   `criar consulta` já usa exatamente esse padrão. **Não** peça default no SQL: default
   tornaria a empresa dedutível e derrubaria o isolamento.
   Os testes atuais não pegam isso: `teste_transacional.sql` chama a função com
   argumentos **posicionais** e `test_regras.mjs` afirma só as seis chaves antigas.

2. **`status: 'cancelada'` é recusado pelo banco.** O nó `cancelar consulta` faz PATCH
   com o feminino; o `CHECK` aceita só `pendente`, `agendado`, `confirmado`,
   `cancelado`, `concluido`. O filtro `status=neq.cancelada` também virou no-op.
   **Correção:** usar `cancelado` na escrita e nos filtros. `agendada` idem.

Mais itens, sem bloquear:

3. **`empresa pela instancia` lê `usuarios` inteira**, incluindo `senha_hash`, que entra
   nos dados de execução do n8n a cada mensagem. Selecionar apenas
   `id_info_clinica, instance_name` resolve.
4. **Slot sem `id_profissional`** não pode passar na validação de tenant. A função agora
   sempre devolve o id, mas a condição `s.profissional_id === null || ...` do nó
   `avaliar horários` continua aceitando o caso — vale fechar.
5. **`agendavel`** está disponível em cada item de `procedimentos`. Serviço com
   `agendavel: false` deve virar transferência, não nova oferta.
6. **`chave_idempotencia`** existe e tem índice único, mas ninguém a envia. O valor
   natural (`pendente.acao_id`) já existe no fluxo. Sem isso a trava T4 é proteção
   aparente.
7. **`headerAuth`**: o backend envia o header `x-agenda-magnetica-token` (nome em
   `EVOLUTION_WEBHOOK_HEADER_NAME`, valor em `EVOLUTION_WEBHOOK_SECRET`). O credential
   do n8n precisa do mesmo nome e valor. `base64` agora é `false`.
8. **12 referências a `SUPABASE_SERVICE_ROLE_KEY`** permanecem. Risco aceito no corte;
   o alvo continua trocar PostgREST direto por rotas seguras do backend.
9. **A V2 deve continuar inativa** até 1 e 2 estarem corrigidos.

---

## 12. Pendências reais

| # | Pendência | Natureza |
|---|---|---|
| P1 | `JWT_SECRET` e as quatro variáveis da Evolution estão vazias | operacional — gerar/preencher |
| P2 | Os dois bloqueadores de §11 | automação (Agente 1) |
| P3 | `area_atuacao` é catálogo global e `POST /areas-atuacao` não verifica empresa nem papel: qualquer usuário autenticado escreve numa lista compartilhada por todos os clientes | produto + backend; corrigir exige mudar API e dashboard |
| P4 | `consulta.confirmado_em` e `cancelado_em` são `date`, mas semanticamente são instantes. Melhor migrar **agora**, antes de existir dado | decisão |
| P5 | Não existe valor cobrado por consulta: `Pagamentos.jsx` soma `procedimento.valor`, então editar um preço reescreve o histórico financeiro já emitido | decisão de produto; `consulta.valor_cobrado` resolveria |
| P6 | `server.py:772` — quando `data_inicio` chega **sem** timezone, o intervalo é interpretado em UTC, deslocando 3 horas. O dashboard sempre envia offset, então é armadilha latente, não bug ativo | backend |
| P7 | `procedimento.valor` trafega como `float` no Pydantic e é somado como float; a coluna é `numeric(10,2)`. Converter para `Decimal` na API evita erro de arredondamento em dinheiro | backend |
| P8 | `time` não modela expediente que cruza a meia-noite (fechar às 00:00 é recusado pelo `CHECK`). A UI oferece 00:00 nos dois campos | limitação conhecida |
| P9 | `planos` e `assinaturas` nascem vazias, e `EscolherPlano.jsx` lê preço de uma constante estática — duas fontes de verdade desde o dia zero | resolver junto com o Stripe |
| P10 | Nada impede faixas de `horario_clinica` sobrepostas no mesmo dia. A RPC usa `DISTINCT`, então não gera dano; é sujeira de configuração | baixo |

Nenhuma pendência foi resolvida por adivinhação, e nenhuma tabela especulativa foi
criada: `whatsapp_instancia`, `conversa`, `conversa_evento` e `acao_idempotente`
continuam fora — T1 e T4 resolvem com índice e coluna.

---

## 13. Próximo passo

As rotas `/api/ai/*` — deliberadamente **não** implementadas nesta etapa. A base que
elas precisam está pronta: contrato da RPC congelado, view com `agendavel`,
idempotência disponível e travas ativas.

*Base construída em 2026-08-21. Nenhum dado apagado ou mesclado. Nenhum commit, nenhum push.*
