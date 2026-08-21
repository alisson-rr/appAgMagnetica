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

1. Consulte o Graphify primeiro quando `graphify-out/graph.json` existir.
2. Confirme no código-fonte antes de editar.
3. Preserve mudanças existentes e corrija a causa raiz com o menor diff seguro.
4. Não crie dependências, camadas ou agentes para necessidades hipotéticas.
5. Rode a menor validação relevante e amplie conforme o risco.
6. Responda em português brasileiro, começando pelo resultado.

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
