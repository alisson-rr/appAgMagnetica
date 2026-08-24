# Fase 3 — Backend do onboarding: handoff

> **Agente:** D (backend). **Data:** 2026-08-23.
> **Contrato:** `docs/planning/FASE3_ONBOARDING_CONTRATO.md`, seções 2 e 3.
> **Escopo tocado:** `services/api/**`, `scripts/**`, `docs/DATABASE_SCHEMA.md`,
> `docs/planning/BACKEND_AI_API_HANDOFF.md`. Nada de `apps/**`,
> `automation/**` ou `.github/**` foi alterado.

---

## Objetivo

Dar ao painel um onboarding que o **servidor** sabe onde parou: checklist
calculado no banco, sessão recalculada a cada carga, instância do WhatsApp
criada no passo certo e um liga/desliga do atendimento automático **por
empresa**, que a automação respeita sem nenhuma mudança em `automation/**`.

---

## Concluído

Os oito itens do contrato, todos com teste.

| # | Entrega | Onde |
|---|---|---|
| 1 | `automacao_ativa` + `CHECK` de `assistente_tom`; view expondo a flag; aplicado em homologação e reexecutado | [ajustes_onboarding.sql](scripts/ajustes_onboarding.sql), [v_clinica_detalhes.sql](scripts/v_clinica_detalhes.sql) |
| 2 | `GET /auth/me` com a lógica de trial extraída para `estado_do_trial`, usada também pelo `/auth/login` | [server.py](services/api/server.py) |
| 3 | `POST /auth/register` sem criação de instância Evolution | [server.py](services/api/server.py) |
| 4 | `GET /config/implantacao` — checklist do servidor; Evolution nunca derruba a rota | [server.py](services/api/server.py) |
| 5 | `PUT /config/info-clinica/{id}` com `assistente_nome`, `assistente_tom`, `exige_profissional` | [server.py](services/api/server.py) |
| 6 | `PUT /config/automacao` com 409 + `pendencias`, reusando a função do item 4 | [server.py](services/api/server.py) |
| 7 | `POST /whatsapp/instancia` idempotente; `qrcode` cria se faltar; `status` com `numero` | [server.py](services/api/server.py) |
| 8 | `/api/ai/contexto` → `AUTOMACAO_DESATIVADA` antes de tocar em cliente | [ai_api.py](services/api/ai_api.py) |

### O que virou função compartilhada (uma fonte de verdade)

| Função | Quem usa | Por quê |
|---|---|---|
| `estado_do_trial` | `/auth/login`, `/auth/me` | duas cópias divergem no dia em que uma for corrigida |
| `montar_implantacao` | `/config/implantacao`, `/config/automacao` | "falta configurar" precisa ser a mesma verdade nas duas rotas |
| `instancia_do_usuario` | `status`, `qrcode`, `restart`, `disconnect`, checklist | a consulta a `usuarios` estava copiada em quatro rotas |
| `garantir_instancia` | `POST /whatsapp/instancia`, `GET /whatsapp/qrcode` | criar instância em dois lugares seria criar instância duplicada |
| `estado_da_conexao` / `numero_conectado` | `status`, checklist | erro do provedor tratado num lugar só, e sempre da mesma forma |

---

## Decisões e motivos

**A view ganhou `automacao_ativa` como última coluna.** `create or replace view`
só aceita coluna nova no **fim** da lista. Colocá-la junto de
`exige_profissional`, que é onde ela se encaixaria por assunto, exigiria dropar
uma view que a automação lê em produção. A ordem de execução dos scripts passa
a ter `v_clinica_detalhes.sql` duas vezes — documentado em
`docs/DATABASE_SCHEMA.md`.

**`/api/ai/contexto` lê a view antes de criar o cliente.** O contrato exige a
recusa depois de resolver a empresa e antes de localizar/criar o cliente. Em vez
de uma consulta nova a `info_clinica`, a leitura de `v_clinica_detalhes` — que a
rota já fazia — subiu de posição. Zero consulta extra. Efeito colateral bem-vindo:
`EMPRESA_NAO_CONFIGURADA` também deixou de cadastrar cliente antes de recusar.

**`POST /whatsapp/instancia` consulta `fetchInstances` também quando
`instance_name` é nulo.** O contrato descreve três casos; um único caminho
(consultar → criar se faltar → gravar) cobre os três e ainda torna a rota segura
para repetição: se a gravação em `usuarios` falhar depois da criação, a chamada
seguinte encontra a instância já existente em vez de tentar criar de novo com o
mesmo nome e receber erro do provedor.

**O 409 de `PUT /config/automacao` lista só o que bloqueia a ativação.**
`pendencias` do checklist completo tem seis itens; ativar depende de quatro
(`horarios`, `servicos`, `equipe`, `whatsapp`). `negocio` e `atendente` não
entram: o fluxo tem padrão para nome e tom da assistente. A lista devolvida é a
do checklist filtrada, então a **ordem fixa é preservada** sem uma segunda
definição de ordem.

**`null` limpa só `assistente_nome` e `assistente_tom`.** A rota usava
`exclude_none`, que torna impossível apagar um campo. Trocar tudo para
`exclude_unset` faria `{"nome": null}` gravar nulo numa coluna `NOT NULL` — 500
no meio do onboarding. Então `exclude_none` continua sendo a base, e as duas
colunas nulas do contrato são reinseridas explicitamente quando vêm no corpo.

**`equipe` é calculada com três consultas simples, não com join embutido do
PostgREST.** `profissional?select=id,profissional_procedimento(id),...` seria uma
ida só, mas depende do nome que o PostgREST dá à relação e não é exercitável com
o `BancoFake` da suíte. Três consultas por `in_` são exatas, testáveis e rodam
uma vez por carga de tela.

**`GET /config/implantacao` devolve 404 sem empresa, não o 403 de
`get_user_clinica_id`.** É o que o contrato especifica: para o painel, "ainda não
tem empresa" é um estado do onboarding, não uma falta de permissão.

**O `login` deixou de usar `select('*')` em `usuarios`.** A linha tem
`senha_hash`, e o objeto de sessão é montado a partir dela. As colunas agora são
explícitas (`CAMPOS_SESSAO`), e `senha_hash` só é pedido na única rota que
confere senha.

**`estado_do_trial` manteve o efeito colateral de gravar `expirado`.** Era o
comportamento do `/auth/login` e é o que faz o estado não depender de alguém
chamar a rota certa. O `except:` nu virou `except Exception` com log sem dado
pessoal.

**Erro da Evolution nunca atravessa.** As três funções que falam com o provedor
logam só `type(erro).__name__`: a mensagem carrega URL e, em alguns caminhos, a
chave. O painel recebe `503 "Não foi possível preparar o WhatsApp agora."` ou o
estado `disconnected` — nunca o texto do provedor.

**A fixture de integração passou a criar empresa com `automacao_ativa = true`.**
O cenário representa empresa em operação; sem isso todo o módulo de integração
receberia `AUTOMACAO_DESATIVADA`. Um teste novo desliga a flag, confere a recusa
contra o banco real e religa no `finally` — é o que prova que a view está
realmente expondo a coluna.

---

## Pendente ou bloqueado

Nada do contrato ficou de fora. Riscos e observações que o próximo agente
precisa conhecer:

1. **O `.env` da raiz não define `JWT_SECRET`.** Descoberto ao conferir uma
   consulta contra o PostgREST real: `settings.require_env("JWT_SECRET")` falha
   e o servidor não sobe com esse `.env`. A suíte não percebe porque o
   `conftest.py` injeta um valor de teste. Quem for subir a API em homologação
   precisa definir a variável. Não li nem alterei o arquivo.
2. **`GET /config/info-clinica` continua com `select('*')`.** É aceitável —
   `info_clinica` não tem segredo — e é o que faz os três campos novos e
   `automacao_ativa` aparecerem sem mudança. Se algum dia entrar coluna sensível
   nessa tabela, esta rota precisa de lista explícita.
3. **`PUT /config/info-clinica` com um corpo só de campos desconhecidos envia um
   `update` vazio.** Comportamento anterior, não introduzido aqui. O frontend
   manda campos editáveis (contrato §4.5), então não aparece na prática.
4. **`GET /whatsapp/qrcode` ainda responde `500 "Erro interno"` quando o
   `connect` da Evolution falha** — o contrato só mudou o caso "sem instância".
   Se o passo 6 do onboarding precisar distinguir "provedor fora do ar", vale
   alinhar com o 503 de `/whatsapp/instancia` numa próxima passada.
5. **`dias_restantes` trunca** (`timedelta.days`): faltando 6 dias e 20 horas, o
   painel mostra 6. Comportamento anterior, preservado de propósito.
6. **`psql` não está instalado nesta máquina.** Os scripts continuam no padrão
   psql (`\set ON_ERROR_STOP on`); a aplicação em homologação foi feita com
   `psycopg2`, que já é dependência dos testes. Detalhe no fim deste documento.
7. **O painel não pode exibir `instance`** — o valor contém o id do usuário.
   `GET /whatsapp/status` continua devolvendo o campo porque o contrato o
   manteve; quem consome é que decide não mostrar (contrato §4.3).

---

## Próximo passo exato

1. **Coordenador:** rodar o aceite de integração do contrato §6.3 — conta nova →
   onboarding completo → WhatsApp conectado → "oi" de outro telefone → ativar,
   em até 10 minutos. Antes disso, garantir `JWT_SECRET` no ambiente da API
   (item 1 acima).
2. **Agente de frontend:** as rotas do contrato §3 estão no ar exatamente como
   descritas. Os dois pontos que mais mudam a tela: `GET /config/implantacao`
   devolve `404` (não 403) enquanto não houver empresa, e o `409` de
   `PUT /config/automacao` traz `pendencias` já filtrada para os quatro itens
   que bloqueiam a ativação.
3. **Depois do merge:** rodar `graphify update .` (não foi executado aqui, por
   instrução do escopo).

---

## Arquivos e comandos

### Arquivos

| Arquivo | O que mudou |
|---|---|
| `scripts/ajustes_onboarding.sql` | **novo** — O1 `automacao_ativa`, O2 `CHECK` de `assistente_tom` |
| `scripts/v_clinica_detalhes.sql` | v2: expõe `automacao_ativa` (última coluna) |
| `services/api/server.py` | `/auth/me`, `/config/implantacao`, `/config/automacao`, `/whatsapp/instancia`; `register` sem Evolution; helpers compartilhados |
| `services/api/ai_api.py` | `AUTOMACAO_DESATIVADA` em `/api/ai/contexto`, antes do cliente |
| `services/api/tests/test_onboarding.py` | **novo** — 41 testes das rotas do onboarding |
| `services/api/tests/test_ai_api.py` | atendimento desligado/ligado; fixture da view com `automacao_ativa` |
| `services/api/tests/test_ai_api_integracao.py` | cenário com automação ligada + teste da trava contra o banco real |
| `docs/DATABASE_SCHEMA.md` | ordem de execução (7 e 8), coluna, `CHECK`, view, histórico |
| `docs/planning/BACKEND_AI_API_HANDOFF.md` | §4.1, §5 e §9 com `AUTOMACAO_DESATIVADA` |

### Suíte sem opt-in (integração ignorada)

```
$ services/api/.venv/Scripts/python -m pytest services/api/tests
........................................................................ [ 33%]
.................................sssssssssssssssssssssssss.............. [ 66%]
........................................................................ [ 99%]
.                                                                        [100%]
192 passed, 25 skipped, 47 warnings in 9.08s
```

### Suíte com banco autorizado

```
$ PERMITIR_TESTES_DE_BANCO=1 services/api/.venv/Scripts/python -m pytest services/api/tests
217 passed, 47 warnings in 40.28s
```

Os 25 ignorados da primeira execução são exatamente os 25 de integração que
rodam na segunda (192 + 25 = 217).

### Banco: aplicação e idempotência

`psql` não existe nesta máquina, então a aplicação usou `psycopg2` (dependência
já presente em `services/api/.venv`), lendo `DATABASE_URL` do `.env` sem
imprimi-lo e pulando os meta-comandos de psql (`\set`). O equivalente com psql,
para quem tiver o cliente instalado:

```bash
psql "$DATABASE_URL" -f scripts/ajustes_onboarding.sql && psql "$DATABASE_URL" -f scripts/v_clinica_detalhes.sql
```

Saída das duas passadas seguidas:

```
== antes ==
  info_clinica: 12 colunas, 1 constraints
  v_clinica_detalhes: 11 colunas
== passada 1 ==
  aplicado: scripts/ajustes_onboarding.sql
  aplicado: scripts/v_clinica_detalhes.sql
== passada 2 ==
  aplicado: scripts/ajustes_onboarding.sql
  aplicado: scripts/v_clinica_detalhes.sql
== resultado ==
  automacao_ativa: [('automacao_ativa', 'boolean', 'NO', 'false')]
  CHECK do tom: [('info_clinica_assistente_tom_valido', "CHECK (((assistente_tom IS NULL) OR (assistente_tom = ANY (ARRAY['acolhedor'::text, 'objetivo'::text, 'descontraido'::text]))))")]
  view expoe automacao_ativa: True
  view (12 colunas): ['id_info_clinica', 'clinica_nome', 'clinica_telefone', 'clinica_email', 'clinica_endereco', 'assistente_nome', 'assistente_tom', 'exige_profissional', 'procedimentos', 'profissionais', 'horarios', 'automacao_ativa']
  IDEMPOTENTE (passada 2 == passada 1): True
== CHECK recusa tom fora do vocabulario (rollback) ==
  recusado por: info_clinica_assistente_tom_valido
  linhas em info_clinica apos o rollback: 0
```

A segunda passada não criou nenhum objeto novo: o inventário de colunas,
constraints e colunas da view é idêntico ao da primeira. A última verificação
tentou gravar `assistente_tom = 'sarcastico'`, foi recusada pelo `CHECK` e o
`rollback` deixou a tabela como estava (0 linhas — o banco de homologação está
vazio).

### Escopo do `git status`

```
 M docs/DATABASE_SCHEMA.md
 M docs/planning/BACKEND_AI_API_HANDOFF.md
 M scripts/v_clinica_detalhes.sql
 M services/api/ai_api.py
 M services/api/server.py
 M services/api/tests/test_ai_api.py
 M services/api/tests/test_ai_api_integracao.py
?? docs/planning/FASE3_ONBOARDING_CONTRATO.md
?? scripts/ajustes_onboarding.sql
?? services/api/tests/test_onboarding.py
```

`FASE3_ONBOARDING_CONTRATO.md` já estava sem versionar antes desta tarefa e não
foi tocado. Sem commit e sem push, como pedido.
