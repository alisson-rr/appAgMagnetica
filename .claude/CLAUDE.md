# Ferramentas do projeto

- **graphify** (`.claude/skills/graphify/SKILL.md`): transforme e consulte o
  grafo do repositório. Use quando o usuário chamar `/graphify`.
- **handoff** (`.claude/skills/handoff/SKILL.md`): gere um resumo retomável.
- **security-review** (`.claude/skills/security-review/SKILL.md`): revise
  autenticação, webhooks, dados sensíveis, pagamentos e permissões.

Agentes disponíveis:

- `code-reviewer`: revisão read-only de defeitos e regressões.
- `debugger`: diagnóstico e correção de causa raiz.
- `automation-reviewer`: revisão read-only do workflow n8n e seus prompts.

Quando `graphify-out/graph.json` existir, consulte o grafo antes de percorrer o
repositório. O código-fonte continua sendo a confirmação final.
