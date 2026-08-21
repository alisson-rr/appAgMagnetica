# Claude Code

Configuração compartilhada do projeto:

- `agents/`: especialistas delegáveis;
- `commands/`: atalhos de validação e revisão;
- `rules/`: regras carregadas conforme o caminho alterado;
- `skills/`: Graphify, handoff e revisão de segurança;
- `settings.json`: bloqueio de segredos e hooks do Graphify.

O contexto principal fica em `../CLAUDE.md`. Configurações pessoais devem ir em
`settings.local.json`, que não é versionado.

Para confirmar a instalação:

```bash
graphify --version
graphify query "quais são os módulos principais?"
```
