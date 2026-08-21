# Graph Report - .  (2026-08-20)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 727 nodes · 947 edges · 113 communities (54 shown, 59 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `04c1cd29`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Community 0
- Community 1
- Community 2
- Community 3
- Community 4
- Community 5
- Community 6
- Community 7
- Community 8
- Community 9
- Community 10
- Community 11
- Community 12
- Community 13
- Community 14
- Community 15
- Community 16
- Community 17
- Community 18
- Community 19
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 40
- Community 41
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 70
- Community 71
- Community 72
- Community 73
- Community 74
- Community 75
- Community 76
- Community 77
- Community 78
- Community 79
- Community 80
- Community 81
- Community 82
- Community 83
- Community 84
- Community 85
- Community 86
- Community 87
- Community 88
- Community 89
- Community 90
- Community 91
- Community 92
- Community 93
- Community 94
- Community 96
- Community 98
- Community 100
- Community 101

## God Nodes (most connected - your core abstractions)
1. `get_user_clinica_id()` - 34 edges
2. `compilerOptions` - 19 edges
3. `compilerOptions` - 14 edges
4. `Card` - 12 edges
5. `api` - 12 edges
6. `Button` - 11 edges
7. `Input` - 11 edges
8. `Label` - 11 edges
9. `useAuth()` - 10 edges
10. `compilerOptions` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Layout()` --indirect_call--> `Calendar()`  [INFERRED]
  apps/dashboard/src/components/Layout.jsx → apps/dashboard/src/components/ui/calendar.jsx
- `PrivateRoute()` --calls--> `useAuth()`  [EXTRACTED]
  apps/dashboard/src/App.jsx → apps/dashboard/src/context/AuthContext.jsx
- `AppContent()` --calls--> `useAuth()`  [EXTRACTED]
  apps/dashboard/src/App.jsx → apps/dashboard/src/context/AuthContext.jsx
- `Login()` --calls--> `useAuth()`  [EXTRACTED]
  apps/dashboard/src/pages/Login.jsx → apps/dashboard/src/context/AuthContext.jsx
- `Onboarding()` --calls--> `useAuth()`  [EXTRACTED]
  apps/dashboard/src/pages/Onboarding.jsx → apps/dashboard/src/context/AuthContext.jsx

## Import Cycles
- None detected.

## Communities (113 total, 59 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (72): BaseModel, HTTPAuthorizationCredentials, add_procedimentos_profissional(), AreaAtuacaoCreate, assert_owned_record(), BloqueioCreate, ClienteCreate, ClienteUpdate (+64 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (43): Button, buttonVariants, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle (+35 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (25): Agenda, App(), AppContent(), Cadastro, Clientes, Comissoes, Configuracoes, Dashboard (+17 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (31): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, postcss (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (24): compilerOptions, allowImportingTsExtensions, baseUrl, isolatedModules, jsx, lib, module, moduleDetection (+16 more)

### Community 5 - "Community 5"
Cohesion: 0.10
Nodes (19): devDependencies, autoprefixer, postcss, tailwindcss, vite, @vitejs/plugin-react, autoprefixer, postcss (+11 more)

### Community 6 - "Community 6"
Cohesion: 0.11
Nodes (17): aliases, components, hooks, lib, ui, utils, iconLibrary, rsc (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+9 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (10): Menubar, MenubarCheckboxItem, MenubarContent, MenubarItem, MenubarLabel, MenubarRadioItem, MenubarSeparator, MenubarSubContent (+2 more)

### Community 9 - "Community 9"
Cohesion: 0.12
Nodes (16): dependencies, lucide-react, react, react-dom, lucide-react, react, react-dom, name (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.16
Nodes (10): formatPhone(), initialForm, LeadForm(), Lead, submitLead(), audiences, faqs, Index() (+2 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (14): name, private, scripts, build, build:dashboard, build:site, dev:dashboard, dev:site (+6 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (13): dependencies, clsx, @radix-ui/react-checkbox, @radix-ui/react-collapsible, @radix-ui/react-slot, @radix-ui/react-toggle, react-hook-form, clsx (+5 more)

### Community 13 - "Community 13"
Cohesion: 0.17
Nodes (11): compilerOptions, allowJs, baseUrl, noImplicitAny, noUnusedLocals, noUnusedParameters, paths, skipLibCheck (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.17
Nodes (11): public.agenda_bloqueio, public.area_atuacao, public.cliente, public.consulta, public.disponibilidade_profissional, public.horario_clinica, public.info_clinica, public.procedimento (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.31
Nodes (10): actionTypes, addToRemoveQueue(), dispatch(), genId(), listeners, memoryState, reducer(), toast() (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.36
Nodes (10): _config(), connect_instance(), create_instance(), fetch_instances(), get_connection_state(), logout_instance(), Integração do backend com a Evolution API., _request() (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.20
Nodes (7): Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator

### Community 18 - "Community 18"
Cohesion: 0.20
Nodes (8): ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuSubContent, ContextMenuSubTrigger

### Community 19 - "Community 19"
Cohesion: 0.20
Nodes (8): DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSubContent, DropdownMenuSubTrigger

### Community 20 - "Community 20"
Cohesion: 0.20
Nodes (7): FormControl, FormDescription, FormFieldContext, FormItem, FormItemContext, FormLabel, FormMessage

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (6): AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogOverlay, AlertDialogTitle

### Community 22 - "Community 22"
Cohesion: 0.22
Nodes (8): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow

### Community 23 - "Community 23"
Cohesion: 0.25
Nodes (5): Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (6): Carousel, CarouselContent, CarouselContext, CarouselItem, CarouselNext, CarouselPrevious

### Community 25 - "Community 25"
Cohesion: 0.25
Nodes (4): DrawerContent, DrawerDescription, DrawerOverlay, DrawerTitle

### Community 26 - "Community 26"
Cohesion: 0.25
Nodes (7): NavigationMenu, NavigationMenuContent, NavigationMenuIndicator, NavigationMenuList, NavigationMenuTrigger, navigationMenuTriggerStyle, NavigationMenuViewport

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (5): SheetContent, SheetDescription, SheetOverlay, SheetTitle, sheetVariants

### Community 29 - "Community 29"
Cohesion: 0.25
Nodes (7): Toast, ToastAction, ToastClose, ToastDescription, ToastTitle, toastVariants, ToastViewport

### Community 30 - "Community 30"
Cohesion: 0.32
Nodes (5): appointmentTime(), Dashboard(), money, statusLabel(), todayLabel

### Community 31 - "Community 31"
Cohesion: 0.33
Nodes (5): compilerOptions, baseUrl, paths, include, src

### Community 32 - "Community 32"
Cohesion: 0.40
Nodes (4): Alert, AlertDescription, AlertTitle, alertVariants

### Community 33 - "Community 33"
Cohesion: 0.40
Nodes (4): InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot

### Community 34 - "Community 34"
Cohesion: 0.40
Nodes (4): buildCommand, framework, outputDirectory, rewrites

### Community 35 - "Community 35"
Cohesion: 0.50
Nodes (3): AccordionContent, AccordionItem, AccordionTrigger

### Community 36 - "Community 36"
Cohesion: 0.50
Nodes (3): Avatar, AvatarFallback, AvatarImage

### Community 37 - "Community 37"
Cohesion: 0.50
Nodes (3): TabsContent, TabsList, TabsTrigger

### Community 38 - "Community 38"
Cohesion: 0.50
Nodes (3): ToggleGroup, ToggleGroupContext, ToggleGroupItem

## Knowledge Gaps
- **349 isolated node(s):** `python`, `$schema`, `style`, `rsc`, `tsx` (+344 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **59 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `Community 12` to `Community 5`, `Community 46`, `Community 47`, `Community 48`, `Community 49`, `Community 50`, `Community 51`, `Community 52`, `Community 53`, `Community 54`, `Community 55`, `Community 56`, `Community 57`, `Community 58`, `Community 59`, `Community 60`, `Community 61`, `Community 62`, `Community 63`, `Community 64`, `Community 65`, `Community 66`, `Community 67`, `Community 68`, `Community 69`, `Community 70`, `Community 71`, `Community 72`, `Community 73`, `Community 74`, `Community 75`, `Community 76`, `Community 77`, `Community 78`, `Community 79`, `Community 80`, `Community 81`, `Community 82`, `Community 83`, `Community 84`, `Community 85`, `Community 86`, `Community 87`, `Community 88`, `Community 89`, `Community 90`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Community 3` to `Community 9`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **What connects `python`, `$schema`, `style` to the rest of the system?**
  _349 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05194805194805195 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08140350877192983 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.08333333333333333 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._