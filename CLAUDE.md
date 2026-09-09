# Agenda Magnética

@.claude/CLAUDE.md

## Produto

- Objetivo: ser a recepção inteligente no WhatsApp para autônomos e pequenos
  negócios com hora marcada.
- Mercado inicial: Rio Grande do Sul, com português brasileiro, moeda BRL,
  telefone brasileiro e fuso `America/Sao_Paulo`.
- Promessa: o profissional atende enquanto a Agenda Magnética responde,
  organiza horários e chama uma pessoa quando necessário.
- Direção de produto: `docs/product/DIRECAO_PRODUTO.md`.

## Arquitetura

- `apps/dashboard`: aplicativo React 18 + Vite.
- `apps/site`: site React 18 + Vite.
- `services/api`: FastAPI, Supabase, JWT e Evolution API.
- `automation/n8n`: workflow do WhatsApp, mantido inativo até homologação.
- `docs/INFRA-VPS.md`: **onde este projeto roda.** Leia antes de mexer em
  Redis, Evolution API, n8n ou hospedagem — a VPS já existe, o n8n roda em
  queue mode e o banco Redis dos fluxos é o `db1`, não o `db0`.
- `docs/brand`: identidade visual oficial.
- `docs/research-private`: pesquisa local; nunca publicar nem usar como código.

## Comandos

- Instalar web: `npm install`
- Dashboard: `npm run dev:dashboard`
- Site: `npm run dev:site`
- Builds: `npm run build`
- Lint disponível: `npm run lint`
- Testes da API: `services/api/.venv/Scripts/python -m pytest services/api/tests`
- Atualizar grafo: `graphify update .`

## Forma de trabalhar

1. Consulte o Graphify sempre que ele ajudar — entender arquitetura, achar
   onde algo mora, ver o que se conecta a quê — e antes de vasculhar o
   repositório na mão. O código-fonte continua sendo a confirmação final.
2. Confirme no código-fonte antes de editar.
3. Preserve mudanças existentes e corrija a causa raiz com o menor diff seguro.
4. Não crie dependências, camadas ou agentes para necessidades hipotéticas.
5. Rode a menor validação relevante e amplie conforme o risco.
6. Responda em português brasileiro, começando pelo resultado.

## Como responder (regra dura)

O retorno é o produto. Um diagnóstico certo explicado de forma confusa é um
retorno ruim.

- **Objetivo e curto.** Comece pela resposta. Se der para dizer em 5 linhas,
  são 5 linhas. Não repita o que já foi dito.
- **Linguagem simples.** Escreva para o dono do produto, não para outro
  programador. Nada de nome de erro, biblioteca, função ou arquivo quando a
  frase funciona sem isso.
- **Sem código, salvo quando pedido** ou quando for a única forma de entregar
  o que foi pedido. Comando para copiar e colar pode; despejo de código, não.
- **Nada de despejo de investigação.** O usuário quer a conclusão e o próximo
  passo. O que foi descartado no caminho só entra se mudar a decisão dele — e
  em uma linha.
- **Sem tabela, sem seção e sem lista longa** só para parecer completo. Uma
  ideia por parágrafo.
- Separe sempre duas coisas: **o que eu já sei** e **o que depende de você**.

## Regras críticas

- Nunca leia, revele ou versione segredos. Somente `.env.example` pode entrar no Git.
- Toda operação de dados deve validar usuário, empresa e recurso.
- Webhooks exigem autenticação, idempotência e limites de entrada.
- A IA não escolhe URLs, credenciais, tenant ou filtros internos.
- Agendar, reagendar e cancelar exigem confirmação e retorno real de sucesso.
- Não dê diagnóstico ou orientação clínica criada pela IA.
- Não ative workflow, publique ou altere produção sem autorização explícita.
- Preserve acessibilidade básica e validação nas fronteiras.

## Definição de pronto

O comportamento solicitado funciona, testes e builds relevantes passaram, o
Graphify foi atualizado após mudança estrutural e riscos restantes foram
documentados.
