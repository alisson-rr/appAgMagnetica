# Agenda Magnética

Monorepo da recepção inteligente no WhatsApp para autônomos e pequenos negócios
que trabalham com hora marcada.

## Estrutura

```text
apps/
  dashboard/        aplicativo de gestão (React + Vite)
  site/             site comercial (React + Vite)
services/
  api/              API FastAPI e integrações
automation/
  n8n/              workflow de atendimento em homologação
docs/
  brand/            identidade visual
  product/          estratégia e direção do produto
  research-private/ referências locais não publicadas
.claude/            agentes, regras e skills do Claude Code
graphify-out/       grafo local do código
```

## Requisitos

- Node.js 20 ou superior;
- npm 10 ou superior;
- Python 3.12;
- Graphify para consultar o grafo do projeto.

## Aplicações web

```bash
npm install
npm run dev:dashboard
npm run dev:site
```

O dashboard usa `http://localhost:3000` e o site usa `http://localhost:8080`.

Para validar os dois projetos:

```bash
npm run build
npm run lint
```

## API

Crie um ambiente virtual dentro de `services/api`, instale
`services/api/requirements.txt` e copie `.env.example` para `.env`. Nunca
versione o arquivo `.env`.

```bash
python -m venv services/api/.venv
services/api/.venv/Scripts/python -m pip install -r services/api/requirements.txt
services/api/.venv/Scripts/python -m pytest services/api/tests
```

## Claude Code e Graphify

As instruções compartilhadas ficam em `CLAUDE.md` e `.claude/`. O MCP local do
Graphify está declarado em `.mcp.json`.

```bash
graphify query "como funciona o isolamento por empresa?"
graphify update .
```

O diretório `docs/research-private/` guarda referências de terceiros apenas na
máquina local e é ignorado pelo Git e pelo Graphify.

## Homologação

O workflow n8n permanece inativo. Leia `automation/n8n/README.md` antes de
importar ou configurar credenciais.
