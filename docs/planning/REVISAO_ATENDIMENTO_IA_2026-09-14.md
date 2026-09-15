# Revisão do atendimento com IA

Data: 14/09/2026. Requisitos de Alisson e implementação após aprovação da proposta.

**Prioridade:** concluir os agendamentos e atender com clareza, acolhimento e
continuidade entre visitas. Modelos econômicos podem interpretar e extrair dados;
a qualidade da mensagem final deve ter um modelo próprio.

**Estado:** implementação local concluída, com regressões de conversa, testes da
API e execução da migração num PostgreSQL local descartável. Nenhuma alteração
foi aplicada no banco de produção ou no n8n instalado. Os JSONs continuam inativos.
Não há chave OpenAI nos ambientes locais do projeto: qualidade e latência com
modelos reais ainda precisam ser avaliadas na homologação.

## Requisitos registrados

1. Só anunciar uma operação concluída após gravação e releitura pela API.
   Repetir a confirmação não pode duplicar o agendamento.
2. Separar interpretação econômica e redação de qualidade em português brasileiro.
3. Escrever com tom acolhedor, simpático e direto; parágrafos curtos, sem
   travessões, burocracia, apresentações repetidas ou perguntas desnecessárias.
   Explicar limitações quando o motivo for conhecido e ajudar a pessoa.
4. Lembrar preferências e atendimentos entre conversas, além do histórico de seis
   horas. Distinguir pedido atual, preferência declarada, hábito e última visita.
5. Guardar profissional por serviço, preferências declaradas de dia/período e
   comunicação. Uma visita com Gustavo não significa que o cliente sempre corta
   com ele; uma escolha excepcional não apaga sua preferência habitual.
6. Tratar memória como contexto. Validar o catálogo atual e dar prioridade à nova
   escolha. Preferência nunca autoriza uma reserva.
7. Consolidar um resumo ao encerrar o assunto ou após inatividade, com proteção
   contra mensagens atrasadas, concorrência e reaprendizado após limpeza.

## Defeitos de agendamento corrigidos

**Pendência perdida entre GETs do Redis.** A sequência era `Redis - ler ação
pendente → Redis - ler estado → montar contexto`. O segundo GET retorna apenas
`estado`; ler `pendente` dele perdia a confirmação esperada. Agora a pendência é
obtida explicitamente do primeiro nó. O comportamento foi conferido no
[código oficial do nó Redis](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Redis/Redis.node.ts).
T147 reproduz saídas separadas, incluindo pendência ausente ou corrompida.

**Confirmação de presença sem destino.** O decisor produzia a operação, mas o
switch não tinha saída `confirmar`. Adicionado o nó HTTP `confirmar consulta`
para `/api/ai/agendamentos/confirmar`, com verificação como as demais escritas.
T148 verifica os quatro caminhos HTTP e seus corpos.

Esses defeitos foram comprovados no JSON do repositório. Para atribuir o incidente
da instalação a eles, ainda é preciso comparar a versão publicada e suas execuções.

## Redação implementada

`Mensagem → contexto e memória → interpretação econômica → decisão validada →
API quando necessária → resposta base → redator → revisão semântica → envio`

O n8n mantém um interpretador econômico. O novo `/api/ai/redigir` deriva a empresa
da instância e verifica o cliente. Para respostas de operação concluída, relê a
consulta do titular e confere seu estado. O redator recebe texto base, fatos da
operação, catálogo, tom da empresa, memória e conversa recente, sem ferramentas
para alterar agenda nem credenciais.

Padrões configuráveis no backend:

| Função | Configuração | Padrão |
| --- | --- | --- |
| Redação | `AI_WRITER_MODEL` | `gpt-5.4` |
| Extração de memória | `AI_MEMORY_MODEL` | `gpt-5-mini-2025-08-07` |
| Revisão semântica | `AI_REVIEW_MODEL` | modelo de memória |

Os modelos foram conferidos na documentação oficial de
[GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4) e
[GPT-5 mini](https://developers.openai.com/api/docs/models/gpt-5-mini).
A integração usa Responses, `store: false`, saída JSON estrita e raciocínio baixo,
conforme o guia de [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
A escolha é um ponto de partida; não houve comparação de qualidade ou custo real.

A resposta candidata tem limite de 850 caracteres. Números devem permanecer
iguais; o revisor confere nomes, fatos, opções, estado e o significado da pergunta
final. Isso combina verificações determinísticas com revisão por modelo; a parte
semântica é probabilística e requer avaliação com conversas reais de homologação.

Redação e revisão compartilham 24 segundos. Sem chave, em falha, timeout ou
reprovação, usa-se o texto base. A redação não repete a escrita de agendamento.
Crise e pedido do titular preservam suas respostas protegidas. Travessões são
removidos na saída e as quebras de linha são mantidas. O histórico curto guarda
até seis mensagens de 1200 caracteres e só é salvo após concluir os envios.
A auditoria registra `redacao` e `motivo_redacao` para identificar uso da reserva.

## Memória implementada

`cliente_memoria` guarda um perfil por empresa e cliente: resumo de até 800
caracteres, preferências com evidência literal e mensagem de origem, versão e
corte de histórico para limpeza. Não duplica o histórico de conversas.

- **Declarada:** profissional por serviço, dia/período ou comunicação. A fonte
  precisa ser uma fala do cliente, com trecho literal, relação válida no catálogo
  e interpretação aprovada pelo revisor. Uma marcação avulsa não é preferência.
- **Última visita:** vem de consultas concluídas e passadas, separada por serviço.
- **Hábito observado:** ao menos duas consultas, com 60% de participação, nos
  últimos 12 meses. A leitura considera até 100 consultas concluídas recentes.
- **Resumo:** fatos úteis para retomar a conversa. Os prompts de extração e
  revisão recusam comandos, informações sensíveis de saúde e deduções de
  personalidade. A revisão não é garantia matemática de classificação.

Precedência: **pedido atual → escolha da conversa → preferência declarada →
hábito observado → última visita → pergunta ao cliente**. Somente profissionais
ativos e habilitados para o serviço entram nas preferências utilizáveis.

No exemplo do salão, a última visita ou hábito gera a pergunta sobre Gustavo.
O “sim” escolhe o profissional e leva à consulta de horários; a reserva continua
exigindo confirmação própria. A pessoa pode pedir Helena, recusar a sugestão ou
dizer “tanto faz”. Uma preferência declarada já conhecida pode orientar a busca.
Dia e período preferidos só são aplicados se não houver escolha atual/conversacional.

## Consolidação e correção

O trigger de `mensagem` cria/atualiza `cliente_memoria_fila` na mesma transação.
A resposta da recepção não adia uma preferência já priorizada. O workflow
`AgendaMagnetica-memoria.n8n.json` consulta a fila a cada cinco minutos, até três
clientes por execução, em paralelo no backend. Não envia mensagens a clientes.

Encerramento de agendamento, reagendamento, cancelamento ou confirmação e sinais
de preferência explícita antecipam o processamento para a próxima rodada. A
expressão de detecção só antecipa a fila; não escreve preferências. Os demais
casos aguardam 30 minutos sem mensagens. Não foi adicionada rotina diária, pois
a fila pendente já é recuperada pelo mesmo relógio.

A consolidação lê até 60 mensagens recentes e o perfil anterior, com extração e
revisão econômicas num orçamento conjunto de 24 segundos. O banco usa lease de
cinco minutos, revisão e comparação antes de gravar. Mensagem nova ou limpeza
invalida um resumo em andamento. Falhas liberam o job para nova tentativa após
pelo menos cinco minutos. Preferências são ordenadas pelo instante UTC da fonte;
remoções deixam um marcador para lotes antigos não recuperarem o valor.

A escrita duradoura é assíncrona, normalmente até a rodada seguinte depois de
priorizada; não é garantida dentro do mesmo turno. A escolha atual continua no
estado da conversa. O limite de três clientes por rodada pode acumular fila em
volume maior; revisar a frequência/lote com dados de uso (API permite até cinco).

`POST /api/ai/memoria/apagar`, autenticado por token, recebe instância e telefone.
Apaga resumo/preferências, invalida jobs e marca o corte do histórico. Não apaga
chat nem consultas, que continuam sendo fatos operacionais. Pedidos do titular
no WhatsApp mantêm encaminhamento humano; não foi criada tela de gestão de memória.

## Instalação e homologação pendentes

1. Aplicar `scripts/memoria_atendimento.sql` após chat e ajustes de onboarding.
2. Publicar o backend e configurar `OPENAI_API_KEY` em seu ambiente. A credencial
   OpenAI existente no n8n atende o interpretador e não substitui essa configuração.
3. Importar a V2 atualizada e o workflow de memória; vincular token da automação
   e workflow de erro. Conferir a URL da API. Os arquivos saem inativos.
4. Em instância de homologação, verificar resposta natural e latência, retomada
   depois de seis horas, preferência corrigida, troca de serviço/profissional e
   reserva visível no painel. Repetir confirmação, forçar falha de redação e
   conferir um único registro. Verificar confirmação de lembrete separadamente.
5. Ativar após homologação e autorização de publicação. Procedimento detalhado e
   rollback em `automation/n8n/README.md`.

## Evidência local

- Workflow: **177/177** testes, executando os nós Code reais e verificando ligações.
- API: **224 aprovados, 25 ignorados** (integração com banco do projeto desabilitada;
  teste de compatibilidade com banco externo excluído).
- PostgreSQL 18 local descartável: migração reaplicável e testes de fila atômica,
  prioridade, duplicidade, lease, revisão concorrente, isolamento, limpeza e grants.
- Validador estrutural e verificação do diff executados.

São testes locais com dados sintéticos. Não comprovam ainda o comportamento do
n8n instalado, a entrega real no WhatsApp ou a qualidade do redator com o provedor.
