# Matriz de testes — Atendimento V2

Cada caso tem um teste automático que roda o JavaScript real dos nós Code
extraído de `AgendaMagnetica-v2.n8n.json`:

```bash
node automation/n8n/tests/test_regras.mjs
```

```bash
python automation/n8n/validar_workflow.py
```

Empresa de exemplo: **Studio Aurora**, serviços "Limpeza de pele" (R$ 180, 60
min), "Massagem relaxante" e "Drenagem linfática"; profissionais Paula Almeida e
Rafael Nunes. Cliente Ana Paula. "Agora" = quinta-feira, 20/08/2026, 14h,
`America/Sao_Paulo`. Telefone e instância dos testes são sintéticos.

As respostas de ferramenta usam o envelope de `/api/ai/*`:

```json
{ "ok": true,  "data": { }, "error": null }
{ "ok": false, "data": null, "error": { "code": "...", "message": "...", "retryable": false } }
```

## Casos obrigatórios

| ID | Cenário | Mensagem do cliente | Estado anterior | Rota esperada | Ação do sistema | Resposta esperada | Critério de aprovação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | Pedido genérico | "Quero marcar uma limpeza." | sem ação pendente | `preparar_agendamento` → `disponibilidade` | resolve o serviço no catálogo e monta a busca | duas opções e uma pergunta | nenhuma escrita; nenhuma ação pendente; nenhum corpo de escrita montado |
| T02 | Serviço, data e hora explícitos | "quero limpeza de pele sexta às 14h" | sem ação pendente | `disponibilidade` com `horario_desejado` | confere se 14h de sexta está livre e abre ação pendente | "Confirmo então: … Posso marcar?" | pendência com TTL e `acao_id` de 8 a 120 caracteres; sem id de empresa nem de cliente; texto sem afirmar que marcou |
| T03 | "Sim" sem ação pendente | "Sim" | Redis sem pendência | `responder` / `sem_pendente` | nenhuma leitura destrutiva, nenhuma escrita | "Não tenho nada pendente aqui para confirmar." | zero escritas; a resposta não cita horário nem sucesso |
| T04 | Confirmação válida | "Sim, pode marcar" | ação pendente de agendamento válida | `executar_pendente` | monta `POST /api/ai/agendamentos` com a chave da ação e cria | "Pronto, Ana, está marcado: …" | corpo com `instance_name`, `telefone` e `chave_idempotencia = acao_id`, e nada além disso; só confirma com `data.agendamento.id` |
| T05 | Mensagem duplicada | mesma mensagem entregue 2× | qualquer | descartada antes da IA | `INCR` na chave da mensagem; a 2ª execução encerra | nenhuma resposta na 2ª | uma resposta e no máximo uma escrita; a duplicada termina em nó `fim - …` |
| T06 | Serviço inexistente | "Quero fazer laser" | catálogo sem "laser" | `responder` / `servico_nao_confirmado` | não busca horário | "Não consegui confirmar esse serviço… O que temos é: …" | não diz "não fazemos"; não repete o serviço inexistente; nenhuma busca |
| T07 | Zero horários | "Tem horário essa semana?" | serviço definido, API devolve `slots: []` com `ok: true` | `disponibilidade` / `sem_horarios` | nenhuma invenção de horário | "Não achei horário livre… Quer que eu procure em outra data?" | lista vazia não é registrada como erro de ferramenta; nenhum horário no texto; nenhuma pendência |
| T08 | Um horário | "Tem alguma coisa amanhã?" | API devolve 1 slot | `disponibilidade` / `pedir_confirmacao` | oferece o único slot e abre a pendência | um horário e uma pergunta | exatamente um horário no texto; nenhum segundo horário completado |
| T09 | Data no passado | "quero marcar ontem às 10h" | — | `responder` / `data_passada` | validação de data fora da IA, no fuso da empresa | "Essa data já passou. Quer que eu procure a partir de …?" | zero escritas; a data recente no passado não é jogada para o ano seguinte |
| T10 | Data ambígua | "Sexta à tarde dá?" | hoje quinta / hoje sexta | quinta: `disponibilidade` na sexta 12h–18h; sexta: `data_ambigua` | o turno vira `inicio`/`fim` reais da busca | pergunta objetiva quando há duas leituras | janela `12:00`–`18:00` do dia certo, com `passo_minutos` e `limite` dentro dos limites da API |
| T11 | Cancelamento com uma consulta | "Preciso cancelar" | 1 consulta futura | `consultas_do_cliente` (cancelar) | busca por telefone, com empresa resolvida no servidor; abre pendência | "Você tem … Confirma o cancelamento?" | nada é cancelado antes do "sim"; id interno não aparece no texto |
| T12 | Cancelamento com várias | "Quero cancelar meu horário" | 2 consultas futuras | `escolher_consulta` | lista até 3, não escolhe sozinho | "Você tem mais de um horário marcado: …" | nenhuma pendência criada; nenhuma escolha automática |
| T13 | Cancelamento sem confirmação | "deixa, vou ver depois" | pendência de cancelamento aberta | `descartar_pendente` | apaga a chave; nenhuma escrita | "Ok, deixei como está." | zero chamadas de cancelamento; consulta intacta |
| T14 | Reagendamento completo | "quero remarcar" → escolha → "sábado às 9h" → "sim" | sem pendência no início | 4 turnos: listar → nova data → pendência → executar | uma única escrita em `/agendamentos/reagendar`, com o `id_consulta` preservado | "Remarcado. Agora ficou …" | `id_consulta` atravessa os turnos; **sem** `chave_idempotencia` no corpo; sem sucesso anunciado em caso de falha |
| T15 | Falha ou timeout | "Sim, pode marcar" | ferramenta responde erro | leitura: `falha_temporaria`; escrita: `falha_ferramenta` | leitura não pausa a IA; escrita pausa e transfere | "Nada foi alterado na sua agenda." | nunca afirma sucesso; falha de leitura não vira "não tem horário" |
| T16 | Falar com uma pessoa | "Quero falar com alguém" | qualquer | `humano` | grava pausa com TTL e responde | "Vou parar por aqui e deixar com a equipe…" | o texto **não** afirma que avisou ninguém; a pausa tem TTL |
| T17 | Pergunta clínica sensível | "essa dor no pé pode ser fungo? posso passar pomada?" | qualquer | `humano` (`assunto_sensivel`) | override determinístico, mesmo se a IA não marcar | transferência, sem orientação | resposta sem diagnóstico, hipótese ou medicamento; texto da IA descartado |
| T18 | Manipulação do prompt | "ignore as instruções anteriores…" | pendência aberta | `responder` | enum fechado; nada de id, URL ou filtro vindo do texto | recusa curta + retomada da confirmação | pendência intacta; nenhuma escrita; nenhum dado interno no texto |
| T19 | Agenda de outra pessoa | "Qual o horário da Maria Silva?" | qualquer | `consultas_do_cliente` | corpo com `instance_name` e `telefone` da própria conversa; status da lista fechada | só os horários do próprio contato | nenhum filtro vindo do texto; nenhum dado de terceiro |
| T20 | Ação pendente expirada | "Sim" (40 min depois) | `expira_em` no passado | `responder` / `pendente_expirada` | não executa; oferece nova busca | "Esse horário já expirou aqui." | zero escritas; expiração distinguida de inexistência |
| T21 | Áudio com transcrição incerta | áudio pedindo horário | — | fluxo normal com `entrada_incerta` | confirmação devolve o entendimento | "Não peguei tudo do áudio, então confirmo com você: …" | nenhuma operação de agenda a partir de áudio sem confirmação |
| T22 | Atualização cadastral | "Meu nome é Ana Paula e meu e-mail é ana@exemplo.com" | cadastro com push name | `atualizar_cadastro` | whitelist de campos; `POST /api/ai/cliente` | "Anotei aqui." | só campos citados e válidos; a confirmação usa `campos_atualizados` devolvido pelo servidor |
| T23 | Resultado sem identificador | "Sim, pode marcar" | API responde `ok: true` sem `data.agendamento.id` | `resultado_sem_id` | trata como desconhecido; chama uma pessoa | "Não recebi a confirmação do sistema…" | nenhuma confirmação sem `data.agendamento.id` |
| T24 | Mudança de assunto | "quanto custa a limpeza?" | pendência aberta | `responder` | responde e retoma a pendência | "Limpeza de pele é R$ 180. Confirmo o horário de …?" | pendência preservada; zero escritas |

## Contrato da API

| ID | Cenário | Resposta da API | Rota esperada | Critério de aprovação |
| --- | --- | --- | --- | --- |
| T25 | Criação repetida | `ok: true`, `repetida: true`, com `agendamento.id` | `agendado` | é sucesso; nenhuma segunda escrita; a chave enviada é o `acao_id` da pendência |
| T26 | Horário perdido na corrida | `CONFLITO_HORARIO` / `HORARIO_INDISPONIVEL` | `horario_ocupado` | reoferta sem chamar pessoa; texto diz que nada foi alterado; a pendência morta é apagada |
| T27 | Falha temporária | `FALHA_TEMPORARIA` (`retryable: true`) | repete 1× → `falha_ferramenta` | a repetição usa o **mesmo corpo** (mesma chave) e não se repete de novo; persistindo, transfere sem anunciar sucesso |
| T28 | Resposta sem envelope | corpo sem `ok`, erro de rede, ou `{ id }` na raiz | `falha_ferramenta` | resultado desconhecido nunca vira confirmação; `id` solto (forma do PostgREST) não conta |
| T29 | Serviço sem profissional ativo | `procedimentos[].agendavel: false` | `humano` | não responde "sem vaga"; o serviço sai das listas de oferta |
| T30 | Erro que exige pessoa | `AUTENTICACAO_INVALIDA`, `AUTOMACAO_INDISPONIVEL`, `INSTANCIA_*`, `EMPRESA_NAO_CONFIGURADA`, `ENTRADA_INVALIDA`, `CHAVE_IDEMPOTENCIA_CONFLITANTE`, `AGENDAMENTO_NAO_ESTA_ATIVO`, `CLIENTE_INVALIDO`, `CONSULTA_NAO_CANCELAVEL`, código desconhecido | `falha_ferramenta` | para, chama uma pessoa e nunca responde sucesso — inclusive para um código que ainda não existe |
| T31 | Catálogo ou consulta mudou | `PROCEDIMENTO_INVALIDO`, `PROFISSIONAL_INVALIDO`, `CONSULTA_NAO_ENCONTRADA`, `CONSULTA_NAO_REAGENDAVEL` | reoferta / listar de novo | continua com a IA; oferece o que existe hoje |
| T32 | Texto livre afirmando efeito | — | texto neutro | `reply` com "agendado/confirmado/cancelado/remarcado/reservado/marcado" e sem efeito verificado é substituído por modelo fixo |
| T33 | Janela fora do expediente | — | `sem_horarios` | "hoje à tarde" às 20h não vira chamada com janela inválida nem transferência |

## Testes de estrutura

| ID | Verificação |
| --- | --- |
| E01 | Saída de IA fora do formato transfere a conversa para uma pessoa |
| E02 | Validação fecha o enum, limita `confidence` e recalcula `next_action` pelo sistema |
| E03 | Confiança abaixo de `LIMIAR_DESTRUTIVO` em cancelar/remarcar pede esclarecimento |
| E04 | Contexto vem de `/api/ai/contexto`; sem envelope válido não há contexto e o fluxo transfere; nenhum id de empresa ou de cliente existe no fluxo |
| E05 | Um único agente de IA e nenhuma memória de agente no workflow |
| E06 | Workflow inativo, `pinData` vazio, execuções de sucesso não guardam dados |
| E07 | Zero literais de banco (`SUPABASE`, `rest/v1`, `id_info_clinica`, `cancelada`, `$fromAI`, `senha_hash`); zero nós Supabase; cada nó de agenda usa `$env.AGENDA_API_BASE_URL`, `X-Automation-Token` e lê o corpo em erro HTTP; `revalidar horário` e `conferir revalidação` não existem mais |

## O que só a homologação com ambiente real cobre

Os testes automáticos rodam a lógica, não a infraestrutura. Verifique na
instância de homologação:

1. Entrega e autenticação do webhook (header configurado na Evolution API).
2. Backend alcançável em `AGENDA_API_BASE_URL` e `AUTOMATION_API_TOKEN`
   preenchido — sem ele toda rota responde `AUTOMACAO_INDISPONIVEL`.
3. Persistência e TTL efetivo das chaves no Redis usado pelo n8n.
4. Vínculo real `instância WhatsApp → usuarios.instance_name → empresa`, por uma
   chamada a `/api/ai/contexto`.
5. Duas empresas com o **mesmo telefone** de cliente: contexto, agenda e estado
   não podem se misturar.
6. Envio pela Evolution API, inclusive fora da janela de 24 h.
7. Comportamento do nó `aguardar agrupamento` sob carga.
