# Automação Agenda Magnética — homologação

O arquivo `AgendaMagnetica.n8n.json` é um modelo inativo para homologação. Ele não deve ser
ativado imediatamente após a importação.

## Variáveis necessárias no n8n

- `EVOLUTION_BASE_URL`
- `EVOLUTION_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Os valores reais devem ficar no gerenciador de segredos/ambiente do n8n. Nunca
cole chaves em nós, notas ou prompts.

## Antes de ativar

1. Revogue as credenciais que existiam nas versões antigas do JSON.
2. Configure credenciais novas no ambiente.
3. Valide o vínculo `instância WhatsApp → id_info_clinica`.
4. Autentique ou valide a assinatura do webhook.
5. Confirme que toda busca filtra empresa e cliente.
6. Teste criar, consultar, remarcar e cancelar em duas empresas de homologação.
7. Garanta confirmação explícita antes de alterar ou cancelar.
8. Teste pedido de atendimento humano e pausa da automação.
9. Crie gatilhos próprios para lembrete/follow-up; eles não estão completos neste
   workflow.
10. Ative primeiro com revisão humana e logs de auditoria.

## Limite conhecido

O modelo ainda usa algumas operações diretas no Supabase. Antes de produção,
migre ações de escrita para endpoints internos do backend com validação de
empresa, idempotência e auditoria.
