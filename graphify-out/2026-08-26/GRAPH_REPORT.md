# Graph Report - appAgMagnetica  (2026-08-26)

## Corpus Check
- 184 files · ~256,769 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1792 nodes · 2712 edges · 194 communities (113 shown, 81 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 12 edges (avg confidence: 0.75)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `d7a3a631`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- server.py
- Profissionais.jsx
- App.jsx
- devDependencies
- compilerOptions
- dashboard/package.json
- components.json
- compilerOptions
- menubar.jsx
- site/package.json
- Index.tsx
- scripts
- clsx
- compilerOptions
- enable_rls.sql
- use-toast.js
- evolution_api.py
- command.jsx
- context-menu.jsx
- dropdown-menu.jsx
- form.jsx
- alert-dialog.jsx
- table.jsx
- breadcrumb.jsx
- carousel.jsx
- drawer.jsx
- navigation-menu.jsx
- pagination.jsx
- sheet.jsx
- toast.jsx
- Agenda Magnética — direção de produto 2026
- compilerOptions
- alert.jsx
- input-otp.jsx
- vercel.json
- accordion.jsx
- avatar.jsx
- tabs.jsx
- toggle-group.jsx
- Tabelas
- badge.jsx
- radio-group.jsx
- scroll-area.jsx
- toggle.jsx
- graphify
- dependencies
- dependencies
- cmdk
- date-fns
- date-fns-tz
- @dnd-kit/core
- @dnd-kit/sortable
- embla-carousel-react
- @hookform/resolvers
- input-otp
- lucide-react
- next-themes
- server.py
- @radix-ui/react-alert-dialog
- @radix-ui/react-aspect-ratio
- What You Must Do When Invoked
- @radix-ui/react-context-menu
- @radix-ui/react-dialog
- @radix-ui/react-dropdown-menu
- @radix-ui/react-hover-card
- @radix-ui/react-label
- @radix-ui/react-menubar
- @radix-ui/react-navigation-menu
- @radix-ui/react-popover
- components.json
- @radix-ui/react-radio-group
- @radix-ui/react-scroll-area
- @radix-ui/react-separator
- @radix-ui/react-slider
- @radix-ui/react-switch
- @radix-ui/react-tabs
- @radix-ui/react-toast
- @radix-ui/react-toggle-group
- @radix-ui/react-tooltip
- get_user_clinica_id
- react-day-picker
- react-dom
- react-resizable-panels
- react-router-dom
- sonner
- tailwind-merge
- tailwindcss-animate
- vaul
- zod
- hover-card.jsx
- popover.jsx
- progress.jsx
- separator.jsx
- slider.jsx
- tooltip.jsx
- add_telefone_cliente.sql
- create_usuarios_table.sql
- Automação de atendimento — homologação
- test_regras.mjs
- 3. Arquitetura proposta
- 6. Contratos das ferramentas
- compilerOptions
- enable_rls.sql
- evolution_api.py
- 5. Arquitetura de prompts
- graphify reference: extra exports and benchmark
- Agenda Magnética
- 7. Matriz de testes e avaliação
- Agenda Magnética
- handoff/SKILL.md
- 2. Registro de problemas classificados
- 9. Roadmap e divisão de trabalho
- graphify reference: query, path, explain
- Blueprint da recepção inteligente de IA — Agenda Magnética
- 1. Como o fluxo funciona hoje
- Matriz de testes — Atendimento V2
- vercel.json
- validar_workflow.py
- test_tenant_guards.py
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- @radix-ui/react-checkbox
- @radix-ui/react-slot
- @radix-ui/react-toggle
- react-hook-form
- test_ai_api.py
- test_ai_api_integracao.py
- settings.py
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- dashboard/README.md
- site/README.md
- API da automação — contrato fechado
- BancoFake
- get_user_clinica_id
- amanha_as
- 2. Concluído
- dominio.py
- com_fuso_de_negocio
- assert_owned_record
- ErroDeBanco
- .claude/CLAUDE.md
- .claude/README.md
- api-conventions.md
- automation.md
- code-style.md
- database.md
- security.md
- testing.md
- typescript.md
- extraction-spec.md
- BancoIndisponivel
- ajustes_ai_api.sql
- date-fns
- integridade_tenant.sql
- test_corrida_na_criacao_de_cliente_rele_o_cadastro_existente
- instancia_do_usuario
- vercel.json
- montar_implantacao
- garantir_instancia
- raise_if_in_use
- estado_do_trial
- @radix-ui/react-avatar
- @radix-ui/react-select
- @radix-ui/react-toast
- react-day-picker
- escaparHtml
- ajustes_onboarding.sql

## God Nodes (most connected - your core abstractions)
1. `banco_com()` - 37 edges
2. `banco_com()` - 36 edges
3. `get_user_clinica_id()` - 35 edges
4. `http_com()` - 35 edges
5. `amanha_as()` - 34 edges
6. `http_com()` - 30 edges
7. `chamar()` - 25 edges
8. `AiError` - 24 edges
9. `criar_agendamento()` - 22 edges
10. `compilerOptions` - 19 edges

## Surprising Connections (you probably didn't know these)
- `Onboarding()` --indirect_call--> `checklist()`  [INFERRED]
  apps/dashboard/src/pages/Onboarding.jsx → apps/dashboard/tests/onboarding.test.mjs
- `Cenario` --indirect_call--> `cur()`  [INFERRED]
  services/api/tests/test_ai_api_integracao.py → services/api/tests/test_schema_compatibilidade.py
- `PrivateRoute()` --calls--> `useAuth()`  [EXTRACTED]
  apps/dashboard/src/App.jsx → apps/dashboard/src/context/AuthContext.jsx
- `AppContent()` --calls--> `useAuth()`  [EXTRACTED]
  apps/dashboard/src/App.jsx → apps/dashboard/src/context/AuthContext.jsx
- `Configuracoes()` --calls--> `descricaoDoCampo()`  [EXTRACTED]
  apps/dashboard/src/pages/Configuracoes.jsx → apps/dashboard/src/components/CampoErro.jsx

## Import Cycles
- None detected.

## Communities (194 total, 81 thin omitted)

### Community 0 - "server.py"
Cohesion: 0.10
Nodes (30): Ponte entre as funções serverless do Vercel e o backend em `services/api`.  O Ve, HTTPAuthorizationCredentials, ClienteCreate, ClienteUpdate, create_access_token(), create_cliente(), create_horario_clinica(), create_info_clinica() (+22 more)

### Community 1 - "Profissionais.jsx"
Cohesion: 0.14
Nodes (24): EmptyState(), Loading(), PageHeader(), Card, DialogContent, DialogDescription, DialogHeader(), DialogOverlay (+16 more)

### Community 2 - "App.jsx"
Cohesion: 0.08
Nodes (28): Agenda, App(), AppContent(), Cadastro, Clientes, Comissoes, Configuracoes, Dashboard (+20 more)

### Community 3 - "devDependencies"
Cohesion: 0.04
Nodes (47): autoprefixer, lucide-react, postcss, react, react-dom, tailwindcss, vite, dependencies (+39 more)

### Community 4 - "compilerOptions"
Cohesion: 0.08
Nodes (24): src, compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module (+16 more)

### Community 5 - "dashboard/package.json"
Cohesion: 0.09
Nodes (21): devDependencies, autoprefixer, postcss, tailwindcss, vite, @vitejs/plugin-react, autoprefixer, postcss (+13 more)

### Community 6 - "components.json"
Cohesion: 0.07
Nodes (26): 0. Resultado, 10. Encerramento, 1. Estado real verificado, 2. Errata do blueprint, 3. Riscos validados, 4. O corte vertical, 5. Decisões que precisam do proprietário, 6. Coordenação entre agentes (+18 more)

### Community 7 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 8 - "menubar.jsx"
Cohesion: 0.12
Nodes (10): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarSubContent (+2 more)

### Community 9 - "site/package.json"
Cohesion: 0.11
Nodes (17): 0. Resultado, 10. Achados da revisão adversarial, 11. Para o Agente 1 (automação) — dois bloqueadores, 12. Pendências reais, 13. Próximo passo, 1. Variáveis normalizadas, 2. Arquivos criados e alterados, 3. Scripts aposentados (+9 more)

### Community 10 - "Index.tsx"
Cohesion: 0.07
Nodes (21): formatPhone(), initialForm, LeadForm(), Props, planos, horarios, Props, links (+13 more)

### Community 11 - "scripts"
Cohesion: 0.13
Nodes (14): name, private, scripts, build, build:dashboard, build:site, dev:dashboard, dev:site (+6 more)

### Community 12 - "clsx"
Cohesion: 0.15
Nodes (13): dependencies, clsx, @radix-ui/react-checkbox, @radix-ui/react-collapsible, @radix-ui/react-slot, @radix-ui/react-toggle, react-hook-form, clsx (+5 more)

### Community 13 - "compilerOptions"
Cohesion: 0.33
Nodes (13): public.agenda_bloqueio, public.area_atuacao, public.assinaturas, public.cliente, public.consulta, public.disponibilidade_profissional, public.horario_clinica, public.info_clinica (+5 more)

### Community 14 - "enable_rls.sql"
Cohesion: 0.17
Nodes (11): public.agenda_bloqueio, public.area_atuacao, public.cliente, public.consulta, public.disponibilidade_profissional, public.horario_clinica, public.info_clinica, public.procedimento (+3 more)

### Community 15 - "use-toast.js"
Cohesion: 0.31
Nodes (10): actionTypes, addToRemoveQueue(), dispatch(), genId(), listeners, memoryState, reducer(), toast() (+2 more)

### Community 16 - "evolution_api.py"
Cohesion: 0.07
Nodes (24): build_webhook_payload(), _config(), connect_instance(), create_instance(), fetch_instances(), get_connection_state(), logout_instance(), Integração do backend com a Evolution API. (+16 more)

### Community 17 - "command.jsx"
Cohesion: 0.20
Nodes (7): Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator

### Community 18 - "context-menu.jsx"
Cohesion: 0.20
Nodes (8): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSubContent, ContextMenuSubTrigger

### Community 19 - "dropdown-menu.jsx"
Cohesion: 0.20
Nodes (8): DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSubContent, DropdownMenuSubTrigger

### Community 20 - "form.jsx"
Cohesion: 0.20
Nodes (7): FormControl, FormDescription, FormFieldContext, FormItem, FormItemContext, FormLabel, FormMessage

### Community 21 - "alert-dialog.jsx"
Cohesion: 0.22
Nodes (6): AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogOverlay, AlertDialogTitle

### Community 22 - "table.jsx"
Cohesion: 0.22
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 23 - "breadcrumb.jsx"
Cohesion: 0.25
Nodes (5): Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage

### Community 24 - "carousel.jsx"
Cohesion: 0.25
Nodes (6): Carousel, CarouselContent, CarouselContext, CarouselItem, CarouselNext, CarouselPrevious

### Community 25 - "drawer.jsx"
Cohesion: 0.25
Nodes (4): DrawerContent, DrawerDescription, DrawerOverlay, DrawerTitle

### Community 26 - "navigation-menu.jsx"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 28 - "sheet.jsx"
Cohesion: 0.25
Nodes (5): SheetContent, SheetDescription, SheetOverlay, SheetTitle, sheetVariants

### Community 29 - "toast.jsx"
Cohesion: 0.25
Nodes (7): Toast, ToastAction, ToastClose, ToastDescription, ToastTitle, toastVariants, ToastViewport

### Community 30 - "Agenda Magnética — direção de produto 2026"
Cohesion: 0.04
Nodes (45): 1. A promessa era ampla demais, 2. O diferencial estava escondido, 3. O público parecia menor do que realmente é, 4. A comunicação criava desconfiança, 5. A base técnica não estava pronta para produção, Agenda Magnética — direção de produto 2026, Automação: direção técnica, Ações externas obrigatórias antes de qualquer publicação (+37 more)

### Community 31 - "compilerOptions"
Cohesion: 0.33
Nodes (5): src, compilerOptions, baseUrl, paths, include

### Community 32 - "alert.jsx"
Cohesion: 0.40
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

### Community 33 - "input-otp.jsx"
Cohesion: 0.40
Nodes (4): InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot

### Community 34 - "vercel.json"
Cohesion: 0.11
Nodes (15): colunas(), Detecta divergência entre o schema do banco e o que o backend espera.  Roda so, Os literais que a API e o dashboard gravam têm de caber no CHECK., `date` descartaria a hora e duas ações do mesmo dia ficariam iguais., Sem preço congelado, reajustar o serviço reescreve o histórico emitido., A API filtra por esta coluna: expressão indexada não é consultável., Duas sobrecargas deixariam a chamada nomeada do PostgREST ambígua., test_campos_do_modelo_existem_na_tabela() (+7 more)

### Community 35 - "accordion.jsx"
Cohesion: 0.50
Nodes (3): AccordionContent, AccordionItem, AccordionTrigger

### Community 36 - "avatar.jsx"
Cohesion: 0.50
Nodes (3): Avatar, AvatarFallback, AvatarImage

### Community 37 - "tabs.jsx"
Cohesion: 0.50
Nodes (3): TabsContent, TabsList, TabsTrigger

### Community 38 - "toggle-group.jsx"
Cohesion: 0.50
Nodes (3): ToggleGroup, ToggleGroupContext, ToggleGroupItem

### Community 39 - "Tabelas"
Cohesion: 0.08
Nodes (25): 10. `agenda_bloqueio`, 11. `consulta` — o agendamento, 12. `planos` — catálogo comercial (vazio), 13. `assinaturas`, 1. `info_clinica` — raiz do tenant, 2. `usuarios` — login do painel e vínculo com a instância do WhatsApp, 3. `cliente`, 4. `profissional` (+17 more)

### Community 46 - "dependencies"
Cohesion: 0.06
Nodes (86): Any, AiError, atualizar_cliente(), AtualizarClienteRequest, autenticar_automacao(), BaseAutomacao, buscar_agendamentos(), buscar_cliente() (+78 more)

### Community 49 - "date-fns"
Cohesion: 0.29
Nodes (3): Tradução de erro do banco em resposta HTTP útil., Só a FK vira 409. O resto continua caindo no tratamento genérico., test_erro_alheio_passa_direto()

### Community 61 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 70 - "components.json"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 113 - "Automação de atendimento — homologação"
Cohesion: 0.07
Nodes (25): A automação não fala com o banco, Ajustes rápidos, Antes de ativar, Automação de atendimento — homologação, Chaves do Redis, Configuração, Confirmação antes de qualquer escrita, Credenciais a religar após importar (+17 more)

### Community 114 - "test_regras.mjs"
Cohesion: 0.13
Nodes (14): AQUI, codigo(), decidir(), executar(), NOS, ok(), PROFISSIONAIS, responder() (+6 more)

### Community 115 - "3. Arquitetura proposta"
Cohesion: 0.14
Nodes (14): 3.10 Proteção contra prompt injection e vazamento entre empresas, 3.11 Limites para conteúdo clínico, financeiro, jurídico e sensível, 3.12 Logs seguros, métricas e rastreabilidade, 3.13 Estratégia de custo e tempo de resposta, 3.1 Princípio central, 3.2 Máquina de estados da conversa, 3.3 Dados mínimos de contexto por atendimento, 3.4 Fonte oficial de cada informação (+6 more)

### Community 117 - "6. Contratos das ferramentas"
Cohesion: 0.15
Nodes (13): 6.10 `registrar_cliente`, 6.11 `transferir_para_humano`, 6.12 Ferramentas expostas por estado, 6.1 Regras válidas para todas, 6.2 `buscar_empresa`, 6.3 `listar_servicos`, 6.4 `listar_profissionais`, 6.5 `consultar_disponibilidade` (+5 more)

### Community 118 - "compilerOptions"
Cohesion: 0.17
Nodes (11): compilerOptions, allowJs, baseUrl, noImplicitAny, noUnusedLocals, noUnusedParameters, paths, skipLibCheck (+3 more)

### Community 121 - "5. Arquitetura de prompts"
Cohesion: 0.18
Nodes (11): 5.10 Bloco 10 — formato final da mensagem ao cliente, 5.1 Bloco 1 — prompt de sistema imutável, 5.2 Bloco 2 — contexto dinâmico da empresa, 5.3 Bloco 3 — contexto do cliente e da conversa, 5.4 Bloco 4 — política de uso de ferramentas, 5.5 Bloco 5 — regras de confirmação de ação, 5.6 Bloco 6 — regras contra invenção e extrapolação, 5.7 Bloco 7 — privacidade e isolamento por empresa (+3 more)

### Community 122 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 123 - "Agenda Magnética"
Cohesion: 0.25
Nodes (7): Agenda Magnética, Arquitetura, Comandos, Definição de pronto, Forma de trabalhar, Produto, Regras críticas

### Community 124 - "7. Matriz de testes e avaliação"
Cohesion: 0.25
Nodes (8): 7.1 Conversas normais, 7.2 Informação incompleta e coleta, 7.3 Agenda, concorrência e conflito, 7.4 Falha, timeout e duplicidade, 7.5 Segurança, isolamento e injeção, 7.6 Conteúdo sensível e experiência, 7.7 Datas relativas e fuso (transversal aos casos 9–24), 7. Matriz de testes e avaliação

### Community 125 - "Agenda Magnética"
Cohesion: 0.25
Nodes (7): Agenda Magnética, API, Aplicações web, Claude Code e Graphify, Estrutura, Homologação, Requisitos

### Community 126 - "handoff/SKILL.md"
Cohesion: 0.29
Nodes (6): Arquivos e comandos relevantes, Concluído, Decisões e motivos, Objetivo, Pendente ou bloqueado, Próximo passo exato

### Community 127 - "2. Registro de problemas classificados"
Cohesion: 0.29
Nodes (7): 2.1 Segurança, isolamento e LGPD, 2.2 Confirmação de ações que podem não ter acontecido, 2.3 Fluxo quebrado e lacunas funcionais, 2.4 Prompts, conteúdo e comportamento, 2.5 Memória, concorrência e contexto, 2.6 Custo e latência, 2. Registro de problemas classificados

### Community 128 - "9. Roadmap e divisão de trabalho"
Cohesion: 0.29
Nodes (7): 9.1 Fase 0 — bloqueios que precedem qualquer código (externos), 9.2 MVP seguro — ordem exata de implementação, 9.3 Segunda fase (após validar o núcleo), 9.4 Futuro (não antes de 10 clientes pagantes), 9.5 Divisão entre agentes sem sobreposição de arquivos, 9.6 O que **não** construir agora, 9. Roadmap e divisão de trabalho

### Community 129 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 130 - "Blueprint da recepção inteligente de IA — Agenda Magnética"
Cohesion: 0.33
Nodes (5): 10. Hipóteses e informações ausentes, 4. Capacidades recomendadas e priorização, 8. Indicadores mensuráveis, Blueprint da recepção inteligente de IA — Agenda Magnética, Sumário

### Community 131 - "1. Como o fluxo funciona hoje"
Cohesion: 0.33
Nodes (6): 1.1 Caminho completo da mensagem, 1.2 Prompts enviados ao modelo hoje, 1.3 Memória e contexto, 1.4 Ferramentas e integrações acionadas, 1.5 Como agendar, reagendar e cancelar funcionam hoje, 1. Como o fluxo funciona hoje

### Community 132 - "Matriz de testes — Atendimento V2"
Cohesion: 0.33
Nodes (5): Casos obrigatórios, Contrato da API, Matriz de testes — Atendimento V2, O que só a homologação com ambiente real cobre, Testes de estrutura

### Community 133 - "vercel.json"
Cohesion: 0.40
Nodes (4): buildCommand, framework, outputDirectory, rewrites

### Community 134 - "validar_workflow.py"
Cohesion: 0.67
Nodes (3): falhas_do_workflow(), main(), Validador do workflow de atendimento (biblioteca padrão apenas).  Uso:     py

### Community 136 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 137 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 138 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 139 - "@radix-ui/react-checkbox"
Cohesion: 0.09
Nodes (57): banco_com(), conectada(), dubles_da_evolution(), em(), empresa(), evolution_muda(), http_com(), pronto_para_ativar() (+49 more)

### Community 141 - "@radix-ui/react-slot"
Cohesion: 0.12
Nodes (33): ConexaoWhatsApp(), ROTULOS_ESTADO, agruparHorarios(), atendenteSchema, disponibilidadeDosHorarios(), emailOpcional, formatarNumeroWa(), fraseDeExemplo() (+25 more)

### Community 142 - "@radix-ui/react-toggle"
Cohesion: 0.07
Nodes (27): 1. Sessão (§4.1), 2. Rotas e gate (§4.2), 3. Onboarding em 6 passos (§4.3), 4. Um único componente de conexão do WhatsApp (§4.3), 5. Dashboard (§4.4), 6. Correções da §4.5, 7. Verificação executável (§4.6), A API vai junto, como função do mesmo projeto (+19 more)

### Community 143 - "react-hook-form"
Cohesion: 0.16
Nodes (18): CampoErro(), descricaoDoCampo(), HorariosEditor(), ProfissionalForm(), vazio, ServicoForm(), vazio, Switch (+10 more)

### Community 144 - "test_ai_api.py"
Cohesion: 0.04
Nodes (21): Regras e contrato das rotas `/api/ai/*`, sem rede.  O comportamento contra o b, `status=neq.cancelada` é filtro de URL, não valor do vocabulário., `agendavel: false` é transferência para pessoa, não 'sem vaga hoje'., O painel não pode passar a receber o envelope da automação., O JWT do dashboard não pode virar credencial de máquina., O índice único é global: sem prefixo, duas empresas colidiriam., Uma requisição aceita não é prova de gravação., O feminino `cancelada` é recusado pelo CHECK `consulta_status_valido`. (+13 more)

### Community 145 - "test_ai_api_integracao.py"
Cohesion: 0.07
Nodes (51): Decimal, as_horas(), Cenario, chamar(), dia_alvo(), _do_env(), _executar(), http() (+43 more)

### Community 146 - "settings.py"
Cohesion: 0.08
Nodes (50): banco_com(), cliente_http(), consulta_em(), http_com(), Estado desejado já no banco: repetir não pode virar HORARIO_INDISPONIVEL., `1994-13-45` casa com o padrão AAAA-MM-DD mas não é uma data.      Como texto,, Pelo menos um dos quatro campos permitidos é obrigatório., `push_name` do WhatsApp não vale mais que o cadastro do painel. (+42 more)

### Community 151 - "API da automação — contrato fechado"
Cohesion: 0.06
Nodes (35): 10. Comandos de teste, 11. Riscos e pendências reais, 12. Checklist para o agente da automação, 1. O que mudou e por quê, 2. Autenticação, 3. Como o tenant é derivado, 4.1 `POST /api/ai/contexto`, 4.2 `POST /api/ai/disponibilidade` (+27 more)

### Community 152 - "BancoFake"
Cohesion: 0.08
Nodes (13): BancoFake, ConsultaFake, ErroDeBanco, Exception, Os joins embutidos que o PostgREST devolve no select da consulta., Erro do PostgREST com SQLSTATE, na forma que `codigo_postgres` lê., `corridas`: fila por tabela de `(sqlstate, linha_concorrente)`.          Cada, RespostaFake (+5 more)

### Community 153 - "get_user_clinica_id"
Cohesion: 0.11
Nodes (22): add_procedimentos_profissional(), assert_owned_record(), BloqueioCreate, create_bloqueio(), delete_bloqueio(), delete_consulta(), delete_disponibilidade(), delete_horario_clinica() (+14 more)

### Community 154 - "amanha_as"
Cohesion: 0.11
Nodes (19): amanha_as(), A chave da criação não pode ser sobrescrita pela remarcação., `extra=forbid` impede a automação de tentar escolher a empresa., Desativar o profissional depois não apaga o agendamento já gravado., Idempotência só vale para o MESMO pedido., test_ausencia_de_horario_nao_e_erro(), test_chave_reaproveitada_com_outro_pedido_e_conflito(), test_corpo_com_id_info_clinica_e_recusado() (+11 more)

### Community 155 - "2. Concluído"
Cohesion: 0.12
Nodes (16): 1. Objetivo, 2.1 Contexto em uma chamada, 2.2 Disponibilidade, 2.3 Escritas, 2.4 Leitura do resultado, 2.5 O que saiu do JSON, 2.6 Variáveis novas, 2.7 Texto honesto na transferência (+8 more)

### Community 156 - "dominio.py"
Cohesion: 0.14
Nodes (15): dinheiro(), dinheiro_para_banco(), Texto para o corpo JSON do PostgREST.      `Decimal` não é serializável em JSO, Normaliza qualquer entrada monetária em `Decimal` com dois dígitos.      `floa, ConsultaCreate, ConsultaUpdate, create_consulta(), create_procedimento() (+7 more)

### Community 157 - "com_fuso_de_negocio"
Cohesion: 0.09
Nodes (22): 1. Objetivo e decisões de produto, 2. Banco (agente backend), 3.1 `GET /auth/me` — novo, 3.2 `POST /auth/register` — alterado, 3.3 `GET /config/implantacao` — novo, 3.4 `PUT /config/info-clinica/{id}` — alterado, 3.5 `PUT /config/automacao` — novo, 3.6 `POST /whatsapp/instancia` — novo, idempotente (+14 more)

### Community 158 - "assert_owned_record"
Cohesion: 0.13
Nodes (14): ErrorState(), CardContent, CardDescription, CardFooter, CardHeader, CardTitle, resumoImplantacao(), appointmentTime() (+6 more)

### Community 159 - "ErroDeBanco"
Cohesion: 0.18
Nodes (11): Button, buttonVariants, Checkbox, politicaPrivacidade, termosDeUso, encontrarPlano(), PLANOS, Cadastro() (+3 more)

### Community 181 - "test_corrida_na_criacao_de_cliente_rele_o_cadastro_existente"
Cohesion: 0.14
Nodes (13): Arquivos, Arquivos e comandos, Banco: aplicação e idempotência, Concluído, Decisões e motivos, Escopo do `git status`, Fase 3 — Backend do onboarding: handoff, O que virou função compartilhada (uma fonte de verdade) (+5 more)

### Community 182 - "instancia_do_usuario"
Cohesion: 0.15
Nodes (14): disconnect_whatsapp(), estado_da_conexao(), get_whatsapp_status(), instancia_do_usuario(), numero_conectado(), Instância da Evolution deste usuário, ou None se ainda não existe., Estado da instância na Evolution. Nunca levanta.      O painel precisa respond, Número conectado, só dígitos, sem o sufixo `@s.whatsapp.net`.      É o que o p (+6 more)

### Community 183 - "vercel.json"
Cohesion: 0.20
Nodes (9): includeFiles, buildCommand, framework, functions, api/index.py, installCommand, outputDirectory, rewrites (+1 more)

### Community 184 - "montar_implantacao"
Cohesion: 0.25
Nodes (8): AutomacaoUpdate, equipe_agendavel(), get_implantacao(), montar_implantacao(), Existe profissional que a automação consiga oferecer de verdade.      Ativo, c, Checklist de implantação calculado no servidor.      Única fonte de verdade de, Liga e desliga o atendimento automático desta empresa.      Desligar é sempre, update_automacao()

### Community 185 - "garantir_instancia"
Cohesion: 0.25
Nodes (8): criar_instancia_whatsapp(), garantir_instancia(), get_whatsapp_qrcode(), montar_nome_instancia(), `agm_{id}_{nome sanitizado}` — mesma regra que o cadastro usava.      O id na, Instância existente na Evolution, com webhook registrado. Idempotente.      De, Prepara a instância do WhatsApp do usuário. Pode ser chamada de novo., Gera QR Code para conectar WhatsApp

### Community 186 - "raise_if_in_use"
Cohesion: 0.33
Nodes (6): delete_cliente(), delete_procedimento(), delete_profissional(), Exception, raise_if_in_use(), Traduz violação de chave estrangeira em 409 explicativo.      As FKs de `consu

### Community 187 - "estado_do_trial"
Cohesion: 0.33
Nodes (6): estado_do_trial(), get_me(), onboarding_da_empresa(), Situação da assinatura recalculada no servidor.      Única fonte de verdade de, Onboarding concluído, ou `None` enquanto o usuário não tem empresa.      `None, Sessão recalculada no servidor, com trial e onboarding do banco.      O painel

## Knowledge Gaps
- **733 isolated node(s):** `python`, `$schema`, `style`, `rsc`, `tsx` (+728 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **81 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `clsx` to `dashboard/package.json`, `server.py`, `@radix-ui/react-toast`, `dependencies`, `cmdk`, `date-fns-tz`, `date-fns`, `@dnd-kit/core`, `@dnd-kit/sortable`, `embla-carousel-react`, `@hookform/resolvers`, `input-otp`, `next-themes`, `lucide-react`, `@radix-ui/react-alert-dialog`, `@radix-ui/react-avatar`, `@radix-ui/react-aspect-ratio`, `@radix-ui/react-context-menu`, `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-hover-card`, `@radix-ui/react-label`, `@radix-ui/react-menubar`, `@radix-ui/react-navigation-menu`, `@radix-ui/react-popover`, `@radix-ui/react-select`, `@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`, `react-day-picker`, `@radix-ui/react-separator`, `@radix-ui/react-slider`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`, `@radix-ui/react-toast`, `@radix-ui/react-toggle-group`, `@radix-ui/react-tooltip`, `get_user_clinica_id`, `react-day-picker`, `react-dom`, `react-resizable-panels`, `react-router-dom`, `sonner`, `tailwind-merge`, `tailwindcss-animate`, `vaul`, `zod`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `BancoIndisponivel` connect `BancoIndisponivel` to `test_ai_api.py`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `python`, `$schema`, `style` to the rest of the system?**
  _733 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `server.py` be split into smaller, more focused modules?**
  _Cohesion score 0.09915966386554621 - nodes in this community are weakly interconnected._
- **Should `Profissionais.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1416490486257928 - nodes in this community are weakly interconnected._
- **Should `App.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.07507507507507508 - nodes in this community are weakly interconnected._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.041666666666666664 - nodes in this community are weakly interconnected._