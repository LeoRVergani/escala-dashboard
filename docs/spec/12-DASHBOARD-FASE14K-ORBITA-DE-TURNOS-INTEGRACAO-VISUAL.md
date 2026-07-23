# FASE 14K — Transplante do visual "Órbita de Turnos" para o sistema funcional

## Objetivo

Aplicar a identidade visual e a arquitetura de navegação do protótipo "Órbita de Turnos"
(gerado em ferramenta externa, "Manus", `escala-ici-redesign.zip`) ao Dashboard real e
funcional, sem reescrever nem duplicar nenhuma regra de negócio já existente. O resultado
não pode ser uma segunda aplicação de demonstração ao lado da real — é o mesmo `App.tsx`,
os mesmos hooks, o mesmo backend Express, só com casca visual e navegação novas.

Baseline confirmado antes de qualquer alteração: branch `feature/fase-14i-dashboard-legends-rest-accounting`
no commit `e67f9e0`, `npx tsc --noEmit` limpo, `npx vitest run` verde (460 testes; 2 timeouts
identificados como falha por contenção de CPU sob suíte completa, confirmados não-determinísticos
ao rodar isoladamente — não são regressão desta fase), `npm run build` verde. Versão em
`package.json`/`package-lock.json`: `1.15.4` (o `package-lock.json` já estava desatualizado em
`1.12.0` antes desta sessão; a correção para `1.15.4` foi legítima e preservada no primeiro
checkpoint). A entrega 14K consolida a versão `1.16.0` via
`npm version 1.16.0 --no-git-tag-version`, sem tag Git.

## Fontes visuais e resolução de divergência

Duas referências visuais foram fornecidas:

1. `escala-ici-redesign.zip` (`/home/lvergani/Downloads/escala-ici-redesign.zip`) — protótipo
   completo gerado via Manus (Vite + React + wouter + Tailwind v4 + shadcn/Radix), com
   `ideas.md` documentando a direção escolhida "Órbita de Turnos" (Swiss International Style
   aplicado a um centro de operações). Contém páginas completas (`Teams`, `TeamPage`,
   `ImportPage`, `ReviewPage`, `PublishPage`, `SuccessPage`, `HistoryPage`, `SwapsPage`,
   `AdminPage`, `ScalesPage`) e um `AppShell` com sidebar fixa (desktop) + barra inferior
   (mobile).
2. O protótipo publicado pelo Claude nesta mesma conta, em turno anterior desta sessão —
   um único artefato HTML autocontido demonstrando o mesmo tipo de fluxo, com paleta
   próxima (mas não idêntica) e tipografia diferente (Bricolage Grotesque + IBM Plex
   Sans/Mono, ambas auto-hospedadas).

**Divergência registrada**: o ZIP especifica `Sora` (500/600/700) para títulos e `IBM Plex
Sans` (400/500/600) para o corpo, carregadas via CDN do Google Fonts. O protótipo do Claude
usava `Bricolage Grotesque` para títulos. **Decisão: usar Sora**, por ser a escolha
explícita e documentada da direção nomeada "Órbita de Turnos" (`ideas.md`), a referência
mais completa e específica das duas, e por já vir validada em todas as 10 páginas do
protótipo Manus. `IBM Plex Sans` é mantida (as duas referências concordam nela). Diferença
técnica: em vez de CDN, as fontes são **auto-hospedadas** em `public/fonts/*.woff2`
(`Sora-500/600/700`, `IBM Plex Sans-400/500/600`) e carregadas via `@font-face` em
`src/styles.css` — sem chamada de rede externa, consistente com o restante do app (que já
não depende de nenhuma CDN) e sem risco de bloqueio por CSP/rede.

Cores: o pedido do usuário já fornece os valores hexadecimais definitivos ("Visual
obrigatório"), que coincidem com `client/src/index.css` do ZIP — usados como estão, sem
ambiguidade. O app já era dark-only desde a FASE 14E (paleta KMP); esta fase substitui os
valores exatos dos tokens dark por estes novos, mantendo a mesma arquitetura de variáveis
CSS (`:root[data-theme="dark"]`) e o mesmo mecanismo de tema (`src/lib/theme.ts`,
inalterado). Os tokens de turno (`scheduleTokens.ts`, FASE 14I) já usam exatamente os hexs
Md/M/T/N/Folga pedidos — **não precisam mudar**, só ganham representação visual mais rica
(trilho de turno) nos lugares novos.

## Mapeamento protótipo → sistema real

| Página do protótipo (mock) | Seção/estado real conectado |
|---|---|
| `Teams.tsx` | Seção `home` (`Home.tsx`) — cards de equipes vêm de `firebaseDashboard.teams` (autorizadas), não de `prototype-data.ts` |
| `TeamPage.tsx` | Estado combinado de `schedule`/`demoWorkspaceState`/status de publicação para a equipe selecionada — não existe hoje como seção própria; vira uma composição dentro de `home`/`grid` usando dados já carregados, não uma rota nova |
| `ImportPage.tsx` | Seção `import` já existente — parser real (`parser.ts`, `analyzeWorkbook`/`buildSchedule`), nunca `simulateRead()` |
| `ReviewPage.tsx` | Seções `grid` + `planner` já existentes — `ScheduleGrid.tsx`/`SocPlanner.tsx` reais, mesmíssimos props |
| `PublishPage.tsx` + `SuccessPage.tsx` | Seção `official` (`OfficialPublicationWizard.tsx`, já com 8 passos reais) — visual comprimido para 3 blocos (Importar/Criar, Revisar, Publicar) sem remover os passos internos de diagnóstico/validação já existentes |
| `HistoryPage.tsx` | Seção `status`, ligada a dados reais de revisão (não lista fixa) |
| `SwapsPage.tsx` | Contrato real `scheduleChangeRequests`/`shift_swap_requests` (já parcialmente exposto via `SwapRequestsDialog.tsx`) |
| `AdminPage.tsx` | Seção `admin` já existente (gestores, equipes, permissões, diagnóstico técnico) |
| `AppShell.tsx` (sidebar + bottom bar) | `src/components/AppShell.tsx` real — mantém arquitetura de seções por estado local (`src/lib/navigation.ts`), **sem** adotar `wouter` ou rotas de URL |
| `Brand.tsx` | Novo `src/components/Brand.tsx` real, usando `public/brand/escala-ici-mark.webp` versionado (nunca `/manus-storage/...`) |
| `FlowSteps.tsx` ("linha de pulso") | Novo componente real reaproveitado no wizard oficial e na importação |
| `OperationalMotifs.tsx` (`ShiftRail`, `DestinationSeal`) | Novos componentes reais; `ShiftRail` lê de `scheduleTokens.ts`, nunca cores fixas duplicadas |

**Não adotado**: `wouter` (o app não ganha roteamento por URL — `AppSection` continua sendo
estado local, decisão já registrada e testada na FASE 14E/08); Radix/shadcn completos (só
onde já exista necessidade real de Dialog/Dropdown, avaliado caso a caso nos checkpoints
seguintes); `Map.tsx` (scaffold do Google Maps, não usado por nenhuma página, descartado);
`ManusDialog.tsx` (órfão no próprio protótipo); `prototype-data.ts` (dados fictícios do
protótipo); `vite-plugin-manus-runtime`, `__manus__`, proxy `/manus-storage`.

## Funções simuladas proibidas (removidas ou nunca introduzidas)

- Nenhum `setTimeout` simulando leitura de arquivo — o parser real já é síncrono/rápido o
  suficiente; qualquer indicador de "lendo…" deve refletir uma Promise real.
- Nenhum toast de sucesso para uma ação que não mudou nenhum estado real.
- Nenhuma lista de histórico/trocas com contagem fixa (`"3"`, `"4"`) — sempre derivada de
  dados carregados, com estado de carregando/vazio/erro explícito.
- Nenhuma publicação real habilitada nesta fase (`ALLOW_OFFICIAL_FIRESTORE_WRITE`
  permanece ausente/`false`; nenhum COMMIT executado fora de teste).

## Nomenclatura final

Ver PROMPT do usuário para a lista completa de termos proibidos/obrigatórios. Aplicação:

- `src/components/LocalIdentityBar.tsx`/`src/lib/localIdentity.ts`/`src/hooks/useLocalIdentity.ts`:
  "Chefe do Setor" → **"Gestor responsável"**; "Time"/"time" (conceito local) →
  **"Equipe"**; "Criar time"/"+ novo time" → **"Cadastrar equipe"**. Tipo `LocalTeamType`
  permanece (nomes internos, não visíveis).
- `OfficialPublicationWizard.tsx`: título "Publicação Oficial — workspace ici-dev" →
  **"Publicar escala"** (o texto "ici-dev"/"workspace" só volta a aparecer dentro do
  Diagnóstico técnico); rótulo do passo "Dry-run" → **"Validar escala"**; "Revisão do
  plano" → **"Conferir alterações"**; "Resultado" → **"Publicação concluída"**.
- Navegação (`src/lib/navigation.ts`): rótulo da seção `status` → **"Histórico de
  publicações"**.
- `src/lib/navigation.ts`/`scheduleCatalog.ts`/`scheduleFactories.ts`: qualquer rótulo
  visível combinando `SOC/NOC` em um único item de interface deixa de existir — SOC e NOC
  continuam sendo o mesmo template internamente (`scheduleCatalog.ts` inalterado), mas
  nunca aparecem como um destino único ao gestor.
- Termos `workspace`, `dry-run`, `flag`, `Firebase Admin`, `ALLOW_OFFICIAL_FIRESTORE_WRITE`
  saem de qualquer texto visível ao gestor comum e passam a existir **apenas** dentro da
  seção `admin` → Diagnóstico técnico (já existe como conceito na FASE 14E/08; esta fase
  garante que nenhum resíduo desses termos apareça fora dali).

## Navegação final

Menu principal (gestor comum): Minhas equipes, Escalas, Solicitações de troca, Histórico.
Administração: só quando `showAdminSection` (já implementado em `AppShell.tsx`, calculado
a partir de `isSystemAdmin || role === 'SCHEDULE_ADMIN' || devLocalSession.active`).
Diagnóstico técnico, Ambiente Demo e Ferramentas de desenvolvimento continuam dentro da
seção Administração/Configurações, nunca no menu principal — mecanismo de permissão já
existe (`sectionState`, `showAdminSection`), esta fase só garante que a apresentação nova
não vaze esses itens para fora do controle de permissão já testado.

## Estados obrigatórios

Toda tela conectada a dado real (Importação, Histórico, Trocas, Administração) trata
explicitamente: carregando, vazio, sucesso, erro, offline (backend Express indisponível) e
sem autorização — reaproveitando os padrões já testados em `useDemoRemotePublication`/
`useOfficialRemotePublication`/`useFirebaseDashboard` (nunca duplicar um novo hook de
estado para a mesma fonte de dado).

## Responsividade

Preservar a auditoria de rolagem da FASE 14E (`shell-content` como única fonte de rolagem
vertical). O `AppShell` ganha layout de sidebar fixa em desktop (≥ 1024px) e navegação
inferior compacta em telas estreitas, inspirado no protótipo, mas construído sobre a mesma
estrutura de `AppSection` já testada — não introduz `wouter` nem media queries que
dupliquem lógica de estado.

## Rollback

Cada checkpoint é um commit isolado que mantém a suíte verde e o build íntegro. Reverter
esta fase é `git checkout feature/fase-14i-dashboard-legends-rest-accounting` — nenhuma
migração de dado, nenhuma alteração de contrato de backend ou Firestore é feita nesta fase,
então não há rollback de dado a considerar, só de código.

## Critérios de aceite

- `npx tsc --noEmit`, `npx vitest run` (nenhum teste removido) e `npm run build` verdes a
  cada checkpoint.
- Nenhuma função real (parser, Grade, Planejador, publicação, autorização, histórico,
  trocas) reescrita ou simulada.
- SOC e NOC nunca aparecem como um único destino de publicação.
- Nenhum termo técnico proibido fora do Diagnóstico técnico.
- Versão exibida na interface deriva de `package.json` (nunca mais um literal
  `vX.Y.Z` hardcoded) — com teste que falha se isso regredir.
- Ícone/marca reais versionados em `public/brand/`, sem referência a `/manus-storage/...`.
- `index.html` referencia `favicon.ico`, `apple-touch-icon.png`, ícone PNG 192 e
  `manifest.webmanifest`; o manifesto referencia ícones 192/512 e maskable 192/512.
- Zero escrita real no Firestore; `ALLOW_OFFICIAL_FIRESTORE_WRITE` ausente/`false`.
- Validação manual real no Chromium (fora de sandbox) do fluxo Gestor → COSI → SOC →
  Importar → Revisar → Validar → Publicar (com escrita desligada), Histórico, Trocas,
  Administração, Diagnóstico técnico, 1920×1080, 1366×768, tablet, navegação por teclado,
  console sem erros.

## Continuação registrada em 23/07/2026

Após interrupção do trabalho inicial, o checkpoint pendente foi revisado e fechado com:

- versão visual derivada de `package.json` (`APP_VERSION = packageJson.version`) no
  cabeçalho principal;
- teste `tests/version.test.ts`, que falha se a versão voltar a ser literal no `App.tsx`;
- manifesto Web/PWA local e teste `tests/pwaManifest.test.ts`;
- atualização do `CHANGELOG.md` para `1.16.0`;
- correção do teste de diagnóstico para a nomenclatura final "Ambiente de Demonstração".

## Continuação registrada em 23/07/2026 — Checkpoint 0

Baseline da continuação confirmado antes de qualquer nova alteração funcional:

- raiz Git: `/home/lvergani/Documentos/Projetos/escala-dashboard`;
- branch: `feature/fase-14k-dashboard-orbit-ui-integration`;
- upstream: `origin/feature/fase-14k-dashboard-orbit-ui-integration`;
- HEAD inicial: `98468da742813e9abc4b74cadcf7aa9839c5d94a`;
- divergência com upstream: `0 0`;
- árvore limpa antes da edição desta spec;
- versão: `1.16.0`;
- commits 14K presentes: `3421b68`, `aec27fe`, `98468da`;
- protótipo localizado em `/home/lvergani/Downloads/escala-ici-redesign`;
- ZIP original localizado em `/home/lvergani/Downloads/escala-ici-redesign.zip`;
- símbolo obrigatório localizado em `/home/lvergani/Downloads/escala-ici-mark_f99b5596.webp`;
- scripts confirmados em `package.json`: `dev`, `build`, `preview`, `test`,
  `test:watch`, `server:dev`, `server:start`, `typecheck`, `check`,
  `test:rules`, `fixtures`, `analyze`, `demo:sync`.

Baseline executado nesta continuação:

- `npm run typecheck`: aprovado;
- `npm run test`: aprovado, 64 arquivos / 468 testes;
- `npm run build`: aprovado, com aviso conhecido de chunk Vite > 500 kB;
- `git diff --check`: aprovado.

### Matriz de implantação visual

| Tela do protótipo | Componente real alvo | Fonte de dados real | Ações reais conectadas | Estados obrigatórios | Teste associado | Status |
|---|---|---|---|---|---|---|
| `Home.tsx` — entrada "Gestão de escalas, sem desvios" | `App.tsx` antes de autenticação, `FirebaseDashboardBar`, `LocalIdentityBar`, futuro `LoginView` extraído | `useFirebaseDashboard`, `signInWithMicrosoft`, `useDevLocalSession`, `useLocalIdentity` | Entrar com Microsoft, sessão local de desenvolvimento autorizada, sair, restauração de sessão | carregando, erro auth, sem Firebase configurado, sessão expirada, teste recolhido | `Home.test.tsx`, `LocalIdentityBar-devSession.test.tsx`, `server-devLogin.test.ts`, novo teste dark-only | Parcial: marca/shell existem; visual de entrada ainda não transplantado |
| `Teams.tsx` — Minhas equipes | `Home.tsx`, `App.tsx`, futuro `TeamsPage`/`TeamCard` | `firebaseDashboard.teams`, `firebaseDashboard.selectedTeam`, `officialRemotePublication`, rascunho local | selecionar equipe, abrir escala, salvar rascunho, publicar quando autorizado, abrir trocas | carregando, vazio, erro, offline, sem autorização, rascunho presente | `Home.test.tsx`, `AppShell.test.tsx`, novos testes SOC/NOC separados | Parcial: nomenclatura ajustada; cards do protótipo ainda não conectados |
| `ScalesPage.tsx` — visão geral de escalas | nova seção real `scales` ou composição em `Home.tsx`/`AppShell` | equipes autorizadas, `schedule`, `loadOfficialSchedule`, rascunhos locais, publicação ativa | buscar, filtrar, abrir equipe, continuar rascunho, criar/importar | carregando, vazio, erro, offline, sem autorização | novo teste de navegação/lista de escalas | Pendente |
| `TeamPage.tsx` — página da equipe | futuro `TeamOverviewPage`, `HomeSummary`, `FirebaseDashboardBar`, `ScheduleTemplateWizard` | equipe selecionada, rascunho (`storage.ts`), publicação ativa, período (`dates.ts`), contagens de `ScheduleState` | abrir escala atual, preparar próximo período, continuar/descartar rascunho, abrir modal de início | rascunho, publicada, a preparar, erro, sem autorização | `officialScheduleReloadDraft.test.tsx`, novo teste de modal de início | Pendente |
| Modal "Como você deseja começar?" | novo `StartScheduleDialog` ou adaptação de `ScheduleTemplateWizard`/`ImportWizard` | equipe atual, templates (`scheduleCatalog.ts`), permissões | importar XLS/XLSX, criar no Dashboard, cancelar, devolver foco | aberto/fechado, foco inicial, escape, erro de permissão | novo teste de foco/teclado do diálogo | Pendente |
| `ImportPage.tsx` — importação | `ImportWizard.tsx`, `App.openFile`, `parser.ts`, `analyzeWorkbook`, `buildSchedule` | arquivo real XLS/XLSX, `WorkbookAnalysis`, equipe selecionada, `onCallGroups` | selecionar/arrastar arquivo, analisar, bloquear erro impeditivo, avançar para revisão | pronto, lendo real, carregado, aviso, erro impeditivo, divergência de equipe | `parser.test.ts`, `real-layouts.test.ts`, novos testes de UI de importação | Pendente; protótipo contém `simulateRead()` e não deve ser copiado |
| `ReviewPage.tsx` — revisar escala | `ScheduleGrid.tsx`, `SocPlanner.tsx`, `ConflictAlertsPanel.tsx`, `FolgaAccountingPanel.tsx`, `OnCallEditor.tsx` | `history.state` (`ScheduleState`), `detectConflicts`, `folgaAccounting`, `onCall` | editar célula, multiseleção, edição em lote, undo/redo, salvar, exportar, alternar Grade/Planejador | rascunho, salvo, erro, alertas, seleção ativa, sem escala | `grid.test.tsx`, `soc-planner.test.ts`, `soc-planner-navigation.test.tsx`, `folgaAccounting.test.ts`, `oncall-ui.test.tsx` | Parcial funcional; visual completo pendente |
| Grade do protótipo | `ScheduleGrid.tsx`, `CellMenu.tsx` | `ScheduleState.cells`, `serviceDeskN1`, tokens de `scheduleTokens.ts` | teclado, menu de célula, copy/paste dia/semana, add/remover técnico, exportar | seleção, menu, fim de semana, situações, erro, vazio | `grid.test.tsx`, `soc-status-ui.test.tsx`, `scheduleTokens.test.ts` | Pendente visual; função preservada |
| Planejador do protótipo | `SocPlanner.tsx`, `useMiddleMouseHorizontalPan` | mesma `ScheduleState` da Grade, `socPlanner.ts` | drag-and-drop, mover/remover atribuição, rolagem sincronizada, modo compacto | seleção, arraste, alerta, vazio, somente SOC/NOC | `soc-planner.test.ts`, `soc-planner-navigation.test.tsx`, `appShellNavigation.test.tsx` | Pendente visual; função preservada |
| Modelos SOC/NOC/Plantão/Service Desk | `ScheduleTemplateWizard`, `scheduleFactories.ts`, `scheduleCatalog.ts`, `OnCallEditor`, `ScheduleGrid` N1 | templates reais, fixtures sintéticas, parser real, grupos de plantão | criar modelo, importar, editar, contabilizar, exportar | tipo incompatível, vazio, alertas por regra, grupo ausente | `scheduleFactories.test.ts`, `oncall.test.ts`, `n1-ui.test.tsx`, `real-layouts.test.ts` | Parcial: SOC/NOC nomenclatura local iniciada; visual pendente |
| Painel lateral de alertas | `ConflictAlertsPanel.tsx`, parser warnings, validação oficial | `detectConflicts`, `WorkbookAnalysis`, validação servidor | ir para membro/data quando possível, fechar/abrir painel | erro, aviso, informação, vazio | `grid.test.tsx`, `soc-status-ui.test.tsx`, novos testes de alerta navegável | Pendente visual |
| `PublishPage.tsx` — conferir publicação | substituir apresentação visual de `OfficialPublicationWizard.tsx` preservando hooks | `officialPackage`, `useOfficialRemotePublication`, `buildOfficialPackageFromSchedule`, `eligibleOfficialMembers`, `firebaseDashboard.user` | validar escala, conferir alterações, publicar apenas quando autorizado, recarregar revisão | validação ok, erro impeditivo, offline, sem autorização, conflito de revisão, escrita desligada | `OfficialPublicationWizard.test.tsx`, `OfficialPublicationPanel.test.tsx`, `server-publish-official-dryrun.test.ts`, `server-officialPublish-auth.test.ts` | Pendente: textos iniciados; wizard visual ainda tem 8 etapas técnicas |
| Modal de confirmação | `OfficialPublishDialog.tsx`, `PublicationDialog.tsx`, futuro `ConfirmationDialog` comum | preview/publication package real, confirmação textual, permissões | cancelar, confirmar, bloquear escrita desligada, manter histórico | aberto/fechado, busy, erro, bloqueado | `demoPublicationRemoteDialogs.test.tsx`, `OfficialPublicationPanel.test.tsx` | Pendente visual |
| `SuccessPage.tsx` — publicação concluída | etapa final de `OfficialPublicationWizard`, resultado de `publishStructuredSchedule`/backend | `publishResult`, revisão, período, equipe, pacote publicado | abrir escala, baixar XLS, voltar para equipes, detalhes técnicos recolhidos | sucesso real, falha, conflito, técnico recolhido | `OfficialPublicationWizard.test.tsx`, novos testes de sucesso sem falso positivo | Pendente |
| `SwapsPage.tsx` — solicitações de troca | `SwapRequestsDialog.tsx`, `swapRequestsRepository.ts`, seção dedicada futura | `loadSwapRequests`, `decideSwapRequest`, usuário/equipe autorizada | aprovar/recusar conforme papel, retry, fechar | pendente, aguardando técnico, aguardando gestor, aprovada, recusada, concluída, erro, offline, vazio | novos testes UI; cobertura de repositório existente a ampliar | Pendente visual e seção dedicada |
| `HistoryPage.tsx` — histórico | seção `status`, `useDemoRemotePublication`, `useOfficialRemotePublication`, `schedulePublishRepository`/backend | status oficial/demo, revisão ativa, publication records disponíveis | baixar XLS real quando disponível, abrir detalhes, recarregar | carregando, vazio, erro, offline, sem autorização | `useOfficialRemotePublication.test.ts`, `server-officialSchedule.test.ts`, novos testes de timeline | Pendente visual; status atual ainda técnico |
| Perfil/preferências | `AppShell.tsx`, `FirebaseDashboardBar`, `LocalIdentityBar` | usuário Firebase/dev session, papel, preferências locais sem tema | Meu perfil, Preferências sem tema, sair | menu aberto, sem sessão, sessão expirada | `AppShell.test.tsx`, novos testes dark-only e logout | Pendente; tema ainda alternável |
| `AdminPage.tsx` — administração | `AdminUsersPanel.tsx`, `OnCallGroupsAdminPanel.tsx`, `TeamDialog`, `DiagnosticsPanel` | `firebaseDashboard.user`, admin routes, teams, onCallGroups | cadastrar gestores/equipes/grupos, recarregar, restringir por papel | sem autorização, carregando, erro, vazio, sucesso | `AdminUsersPanel.test.tsx`, `server-admin-routes.test.ts`, `server-verifyCaller.test.ts` | Pendente visual; autorização real preservada |
| Diagnóstico técnico e Ambiente Demo | `DiagnosticsPanel.tsx`, `DemoPublicationPanel`, `DemoWorkspaceBanner`, `Demo*Dialog` | hooks demo/oficial, backend status, flags, workspace IDs, fixture demo | reset demo, validar/publicar demo em teste, mostrar flags só restrito | restrito, offline, erro, busy, vazio | `DemoPublicationPanel.test.tsx`, `demoWorkspace-ui.test.tsx`, `server-demo-reset.test.ts` | Pendente visual e restrição de navegação cotidiana |
| Estados transversais | novos componentes `EmptyState`, `LoadingState`, `ErrorState`, `OfflineState`, `StatusBadge` | estado dos hooks reais e exceptions | retry, cancelar, confirmar, ocultar ação indisponível | carregando, vazio, sucesso, erro, offline, sem autorização, sessão expirada | novos testes de componentes e fluxos | Pendente |

Observações do mapeamento:

- `prototype-data.ts` contém equipes, histórico, trocas e contagens fixas; é proibido
  migrar esses dados para o Dashboard real.
- `ImportPage.tsx` do protótipo usa `simulateRead()`; só a composição visual é válida.
- `ReviewPage.tsx`, `PublishPage.tsx`, `SuccessPage.tsx`, `HistoryPage.tsx` e
  `SwapsPage.tsx` usam `toast`/estado local para ações que no Dashboard precisam chamar
  handlers reais ou ficar ocultas quando indisponíveis.
- O protótipo usa `wouter`, Tailwind, Radix/shadcn e `lucide-react`; a continuação deve
  adaptar o visual à stack atual e só adicionar dependência se houver justificativa
  técnica explícita.
- O Checkpoint 1 deve iniciar pela remoção segura da arquitetura de tema alternável
  (`theme.ts`, `AppShell` e testes), mantendo tokens escuros como fonte única e evitando
  flash claro.
