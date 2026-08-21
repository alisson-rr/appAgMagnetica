# Automação de atendimento — homologação

Dois arquivos convivem nesta pasta:

| Arquivo | Papel |
| --- | --- |
| `AgendaMagnetica-v2.n8n.json` | **versão canônica** (Atendimento V2). Importe esta. |
| `AgendaMagnetica.n8n.json` | versão anterior, mantida só como referência e rollback. |

Os dois estão **inativos** (`active: false`) e continuam assim até a homologação
terminar. Nenhum deles deve ser ativado sem autorização explícita.

## O que a V2 faz

A automação é a recepção do negócio no WhatsApp: entende o que o cliente quer,
responde dúvidas com o cadastro da empresa, mostra horários reais, e só marca,
remarca ou cancela depois de uma confirmação explícita.

Fluxo principal, sempre nesta ordem:

1. `Webhook` autenticado por header recebe o evento da Evolution API.
2. `normalizar entrada` separa mensagem do cliente, mensagem do próprio negócio
   e evento a descartar.
3. `Redis - marcar mensagem` faz idempotência por id da mensagem (`INCR` + TTL de
   24 h): a mesma mensagem nunca gera duas operações.
4. `Redis - atendimento humano ativo?` interrompe a IA quando uma pessoa assumiu.
5. Buffer de 8 segundos agrupa mensagens seguidas do mesmo contato.
6. Áudio vira texto e imagem vira descrição administrativa, quando houver.
7. Empresa vem da **instância** (`usuarios.instance_name`), cliente vem de
   telefone **e** empresa, catálogo vem da empresa. Nada disso passa pela IA.
8. `IA interpretadora` é a **única** chamada de IA de conversa e devolve saída
   estruturada.
9. `validar interpretação` valida fora da IA: enum fechado, tipos coeridos,
   `next_action` recalculado pelo sistema.
10. `resolver e decidir` aplica as regras: serviço, profissional, data, fuso,
    limiar de confiança, ação pendente.
11. Ferramentas determinísticas executam a operação com filtros do sistema.
12. `montar resposta` escreve a mensagem por modelo fixo e `registrar decisão`
    guarda o motivo da rota.

Contagem de IA: **1 chamada** no atendimento normal. Áudio ou imagem somam 1
chamada de transcrição/descrição. Saída estruturada inválida gasta 1 correção; se
falhar de novo, a conversa vai para uma pessoa.

## Confirmação antes de qualquer escrita

Agendar, reagendar e cancelar passam por uma **ação pendente** guardada pelo
sistema no Redis:

```
am:pendente:{instancia}:{telefone}   TTL 20 min (a ação expira em 10 min)
```

A ação guarda tipo, empresa, cliente, consulta, horário e validade. O cliente
confirma; o sistema executa exatamente aquela ação; a chave é apagada. Um "sim"
sem ação pendente válida não cria, não altera e não cancela nada.

Antes de gravar, `revalidar horário` confere se o horário continua livre —
entre a oferta e o "sim" a agenda pode ter mudado. `Redis - trava da ação`
garante execução única por ação. `verificar resultado` só anuncia sucesso quando
a resposta traz um `id`; sem isso a conversa vai para uma pessoa e nada é
afirmado ao cliente.

## Chaves do Redis

| Chave | Uso | TTL |
| --- | --- | --- |
| `am:dedup:{instancia}:{msg_id}` | idempotência da mensagem | 24 h |
| `am:handoff:{instancia}:{telefone}` | IA pausada (pessoa atendendo) | 30 min (negócio respondeu) ou 1 h (transferência) |
| `am:buffer:{instancia}:{telefone}` | agrupamento de mensagens | apagada ao processar |
| `am:pendente:{instancia}:{telefone}` | ação aguardando confirmação | 20 min |
| `am:estado:{instancia}:{telefone}` | últimas 6 mensagens, horários oferecidos | 6 h |
| `am:trava:{instancia}:{acao_id}` | execução única da ação | 5 min |

Toda chave inclui a instância: o mesmo telefone falando com duas empresas nunca
compartilha buffer, estado nem pausa.

## Configuração

### Variáveis de ambiente do n8n

- `EVOLUTION_BASE_URL`
- `EVOLUTION_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Os valores ficam no gerenciador de segredos do n8n. Nunca cole chave em nó, nota
ou prompt.

### Credenciais a religar após importar

- **Webhook** → credencial `Header Auth` (o JSON traz apenas a referência
  `CONFIGURAR_NO_N8N`). Configure o mesmo header na Evolution API.
- **Supabase** → nós `empresa pela instancia`, `buscar cliente`, `criar cliente`,
  `catalogo da empresa`, `consultas do cliente`.
- **Redis** → todos os nós `Redis - ...`.
- **OpenAI** → `modelo interpretador`, `transcrever áudio`, `analisar imagem`.

### Webhook

Path: `agenda-magnetica-v2`. Aponte `EVOLUTION_WEBHOOK_URL` para ele durante a
homologação (o `.env.example` do backend ainda cita o path antigo).

### Colunas opcionais

A identidade da assistente vem do cadastro da empresa. Enquanto as colunas não
existirem, o padrão é "assistente virtual" com tom cordial e o profissional não
é obrigatório. Para personalizar (opcional, **não execute sem autorização**):

```sql
ALTER TABLE info_clinica ADD COLUMN assistente_nome TEXT;
ALTER TABLE info_clinica ADD COLUMN assistente_tom TEXT;
ALTER TABLE info_clinica ADD COLUMN exige_profissional BOOLEAN DEFAULT false;
```

Depois exponha esses campos na view `v_clinica_detalhes`.

## Ajustes rápidos

Constantes no topo dos nós Code, sem mexer no resto do fluxo:

| Onde | Constante | Padrão |
| --- | --- | --- |
| `resolver e decidir` | `LIMIAR_PADRAO` | `0.75` |
| `resolver e decidir` | `LIMIAR_DESTRUTIVO` (cancelar, remarcar, confirmar) | `0.85` |
| `resolver e decidir` | `LIMIAR_HUMANO` | `0.45` |
| `resolver e decidir` | `JANELA_PADRAO_DIAS` | `14` |
| `avaliar horários` | `PENDENTE_MINUTOS` | `10` |
| `montar contexto` | `HISTORICO_MAX` | `6` |
| `dividir resposta` | `MAX_PARTES` | `3` |
| `aguardar agrupamento` | espera do buffer | `8s` |

O texto que o cliente recebe nas operações está inteiro em `montar resposta`.

## Validação

```bash
python automation/n8n/validar_workflow.py
```

```bash
node automation/n8n/tests/test_regras.mjs
```

O validador confere JSON válido, workflow inativo, nós obrigatórios, rotas sem
destino, referências quebradas, ausência de segredos e de dados pessoais,
autenticação do webhook e as guardas de empresa e cliente nas escritas.

Os testes executam o **JavaScript real dos nós Code extraído do JSON** contra os
24 casos de `TESTES_AUTOMACAO_V2.md`. Mudou o workflow, o teste acusa.

## Antes de ativar

1. Revogue as credenciais que existiam nas versões antigas do JSON.
2. Configure credenciais novas e o header do webhook.
3. Valide o vínculo `instância WhatsApp → usuarios.instance_name → id_info_clinica`.
4. Confirme que `v_clinica_detalhes` expõe **id** de procedimento e de
   profissional (sem id, o fluxo transfere para uma pessoa em vez de adivinhar).
5. Confirme que `fn_buscar_slots` filtra pela empresa dona do procedimento.
   O fluxo já descarta slot de profissional que não é da empresa, mas a RPC
   precisa fazer a sua parte.
6. Teste criar, consultar, remarcar e cancelar em **duas** empresas de
   homologação, com o mesmo telefone nas duas.
7. Teste pedido de atendimento humano e a pausa da IA.
8. Rode a matriz de testes conversacionais com a instância de homologação.
9. Ative primeiro com revisão humana e auditoria ligada.

## Limitações conhecidas

- **Escrita direta no Supabase.** As operações de agenda usam PostgREST com
  `SUPABASE_SERVICE_ROLE_KEY`, que ignora RLS. O backend não expõe endpoint para
  automação: todas as rotas de `services/api/server.py` exigem JWT de usuário do
  painel. Enquanto isso não existir, os filtros de empresa e cliente são impostos
  pelo próprio fluxo (URL e corpo montados por nó Code, nunca pela IA).
  **Próximo passo recomendado:** criar rotas de automação no backend com token de
  serviço, idempotência e auditoria, e apontar as quatro chamadas HTTP para lá.
- **`fn_buscar_slots` não está documentada** em `docs/DATABASE_SCHEMA.md`. O
  contrato usado aqui (`p_inicio`, `p_fim`, `p_procedimento_id`,
  `p_profissional_id`, `p_step_minutos`, `p_duracao_minutos`) veio da versão
  anterior e precisa ser confirmado na homologação.
- **Reagendamento é um PATCH**, não uma transação de cancelar e criar. Se a
  chamada falhar, o horário antigo permanece e nada é anunciado ao cliente.
- **Janela de 24 h do WhatsApp** não é verificada: uma confirmação pode ser
  gerada e não ser entregue. O agendamento existe mesmo assim.
- **Lembretes e follow-up não estão neste workflow.** Precisam de gatilho próprio.
- **Buffer órfão**: se a execução morrer entre o `push` e o `delete`, a chave de
  buffer fica sem TTL até a próxima mensagem do contato.
- **`AgendaMagnetica.n8n.json` (V1) contém um e-mail pessoal** nos quatro nós
  órfãos do Google Calendar. O arquivo foi preservado como rollback; remova esse
  dado antes de qualquer publicação do repositório.
- **Fuso fixo em `-03:00`.** Vale para `America/Sao_Paulo` desde o fim do horário
  de verão em 2019. Se o horário de verão voltar, revise os nós Code.

## O que mudou da V1 para a V2

| Tema | V1 | V2 |
| --- | --- | --- |
| Chamadas de IA por mensagem | 3 ou mais | 1 |
| Agentes / modelos / memórias | 7 / 7 / 7 | 1 / 1 / 0 |
| Saída do classificador | texto livre + `JSON.parse` | saída estruturada validada fora da IA |
| Empresa | derivada do telefone do cliente | derivada da instância do WhatsApp |
| Escritas | id escolhido pelo modelo | id e filtros impostos pelo sistema |
| Confirmação | frase no prompt | ação pendente com TTL e trava |
| Sucesso | anunciado pelo modelo | só com `id` retornado |
| Reagendamento | rota morta | funcional de ponta a ponta |
| Zero/um horário | prompt exigia sempre dois | tratados como casos distintos |
| Transferência humana | sem resposta, pausa eterna | responde ao cliente e pausa com TTL |
| Nome da assistente | "Andressa" fixo | vem do cadastro da empresa |
| Execuções salvas | `all` (dados pessoais) | só erro |
