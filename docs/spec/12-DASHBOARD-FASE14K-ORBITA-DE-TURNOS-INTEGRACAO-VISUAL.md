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
`1.12.0` antes desta sessão; a correção para `1.15.4` é legítima e foi preservada).

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
- Zero escrita real no Firestore; `ALLOW_OFFICIAL_FIRESTORE_WRITE` ausente/`false`.
- Validação manual real no Chromium (fora de sandbox) do fluxo Gestor → COSI → SOC →
  Importar → Revisar → Validar → Publicar (com escrita desligada), Histórico, Trocas,
  Administração, Diagnóstico técnico, 1920×1080, 1366×768, tablet, navegação por teclado,
  console sem erros.
