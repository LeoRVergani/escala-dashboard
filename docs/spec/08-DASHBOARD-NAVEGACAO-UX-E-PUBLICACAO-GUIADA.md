# FASE 14E — Reorganização de navegação, UX e publicação guiada do Dashboard

## Objetivo

Transformar o Dashboard de uma única página longa (import, grade, Demo e Oficial todos
empilhados e renderizados condicionalmente no mesmo `App.tsx`) em uma aplicação organizada
por áreas, com navegação clara, fluxo guiado e rolagem funcional em desktop e notebook.
Nenhuma funcionalidade existente foi removida ou reimplementada do zero — a importação
XLS/XLSX, a grade mensal, o Planejador drag-and-drop, multiseleção, desfazer/refazer,
rascunho local, exportação XLSX, o fluxo Demo e a publicação revisionada continuam sendo
exatamente os mesmos componentes e hooks de antes; esta fase só reorganiza onde e quando
cada um aparece na tela, e corrige um bug de contaminação de dados entre Demo e Oficial.

## Por que agora

A interface acumulou, fase após fase, blocos condicionais empilhados verticalmente em
`App.tsx` (1542 linhas antes desta fase): cabeçalho, barra Firebase, banner de Test Drive,
banner+painéis do Ambiente Demo (incluindo o painel de Publicação Oficial encaixado
*dentro* do bloco condicional do Demo), barra de modo N1, legenda, grade/planejador e todos
os diálogos. Isso deixou: (1) nenhum jeito de voltar ao início sem recarregar a página; (2)
Publicação Oficial só alcançável depois de carregar o Ambiente Demo, porque estava
literalmente aninhada dentro do bloco `schedule.origin === 'demo-workspace-package'`; (3) o
pacote oficial sempre derivado do pacote Demo (`toOfficialPackage`), cujos ids sempre contêm
`"demo"` — e nenhuma validação no cliente rejeitava isso antes do COMMIT no servidor.

## Navegação principal (`AppShell`)

`src/components/AppShell.tsx` + `src/lib/navigation.ts`. Barra lateral recolhível no
desktop, menu compacto (`☰ Menu`, drawer deslizante) em telas até 900px. Oito seções, na
ordem: **Início, Importar escala, Planejador, Grade, Ambiente Demo, Publicação Oficial,
Histórico/Status, Configurações**.

Decisões deliberadas:

- **Sem React Router.** A seção ativa é só `useState<AppSection>` persistido em
  `localStorage['escala-dashboard:active-section']` — o mesmo padrão que `socView`/
  `n1Layer`/times do Demo já usavam antes desta fase, só que agora é a fonte única de
  verdade de navegação. Trocar de seção nunca desmonta `<App/>`: rascunho, seleção,
  desfazer/refazer, o rascunho do Ambiente Demo e qualquer estado em memória continuam
  intactos ao ir e voltar da Home (testado em `tests/appShellNavigation.test.tsx`).
- Itens de navegação ficam desabilitados com `title` explicando o motivo em vez de
  escondidos ou quebrados: "Grade"/"Planejador" exigem uma escala carregada; "Planejador"
  exige adicionalmente `visualGrouping === 'operational-shift'` (SOC/NOC rotativo).
- "Ambiente Demo" ganha um badge "ativo" no item de navegação quando
  `schedule.origin === 'demo-workspace-package'` — visível mesmo com o cabeçalho recolhido,
  para o usuário nunca perder de vista em qual ambiente está.
- O nome acessível de cada item de navegação é fixado via `aria-label` (só o rótulo, ex.
  "Grade"), com a descrição visível exposta por `aria-describedby` — sem isso, o número da
  etapa/descrição visual entrava na *accessible name* e quebrava qualquer seletor exato por
  papel+nome (mesmo cuidado aplicado às abas do wizard oficial).

Cabeçalho (marca, título do mês, barra de ferramentas, `FirebaseDashboardBar`, banners de
ambiente Test Drive/Demo) fica num slot `topBar` recolhível — um botão "Recolher
cabeçalho"/"Mostrar cabeçalho" no topo do conteúdo alterna isso, persistido em
`localStorage['escala-dashboard:topbar-collapsed']`. Ações de edição (Desfazer, Refazer,
Limpar seleção, chip de Alertas) só aparecem quando a seção ativa é Grade ou Planejador;
Importar/Salvar rascunho/Exportar XLSX continuam sempre visíveis com uma escala carregada,
em qualquer seção.

## Tela inicial (`Home.tsx`)

Cartões (reaproveitando exatamente os mesmos rótulos/ações que já existiam na antiga tela
vazia, para não quebrar nenhum fluxo): Criar escala vazia, Importar arquivo, Test Drive
(+ Continuar Test Drive quando há sessão salva), Ambiente Demo (+ Continuar Ambiente de
Demonstração), Abrir rascunho atual (desabilitado com explicação quando não há rascunho),
Preparar publicação oficial. Um bloco de resumo mostra período, tipo de escala, pessoas,
atribuições, rascunho local, status Demo (carregado/sincronizado/alterações locais), status
Oficial (pacote carregado + quantos membros são elegíveis para `ici-dev`), backend
online/offline e Firebase Admin configurado/não configurado — sem nunca mostrar a grade ou
qualquer formulário simultaneamente.

`useDemoRemotePublication`/`useOfficialRemotePublication` passaram a ser **sempre**
habilitados (antes, dependiam de `schedule.origin === 'demo-workspace-package'`) — a Home
precisa do status do backend mesmo antes de qualquer workspace ser carregado, e a
Publicação Oficial agora é uma seção alcançável independentemente do Demo.

## Vínculo corporativo oficial — correção da contaminação Demo→Oficial

**Causa raiz confirmada**: `officialPackage` sempre vem de
`toOfficialPackage(demoWorkspaceState.draftPackage)` (arquitetura da FASE 14D, preservada
integralmente — não existe pipeline de importação XLS separado para dados organizacionais).
`toOfficialPackage` só retitula `workspaceId` para `ici-dev`; não toca nos `id`s. Todo `id`
da fixture `demo-v1` contém a substring `"demo"` (ex.: `member-demo-gestor-seguranca`,
"Gestor de Segurança Demo"). `validateCorporateLinkLocally` (já existente, inalterada nesta
fase) só valida integridade referencial — nunca rejeitou isso. Resultado: **qualquer**
vínculo corporativo possível antes desta fase apontava, na prática, para dados do Ambiente
Demo; o dry-run passava (o servidor só valida forma/referência no `DRY_RUN`), e o `COMMIT`
sempre falhava em `assertOfficialOnlyWritePlan.mjs` com `"O plano de publicação contém um
identificador incompatível com o workspace ici-dev"` — exatamente o erro relatado.

Correção (`src/lib/officialWorkspace/retarget.ts`, aditiva — `validateCorporateLinkLocally`
e `toOfficialPackage` não foram alterados, para não arriscar nenhuma regressão nos testes
que já cobriam essas duas funções):

- `isEligibleOfficialMember`/`isEligibleOfficialTeam`: `workspaceId === 'ici-dev' && !/demo/i.test(id)`.
- `eligibleOfficialMembers`/`eligibleOfficialTeams`: filtram um pacote para só os
  registros elegíveis (espelha a defesa de contaminação que `assertOfficialOnlyWritePlan.mjs`
  já fazia no servidor, agora também no cliente).
- `isOfficialLinkEligible`: usada por `OfficialPublicationPanel`/`OfficialPublicationWizard`
  para bloquear dry-run/publicação quando o vínculo, embora referencialmente válido, aponta
  para dados contaminados.

`OfficialCorporateLinkForm.tsx` só lista membros/equipes elegíveis nos `<select>` — nunca
mais oferece "Gestor de Segurança Demo" ou qualquer outro registro Demo — e mostra
"Nenhum membro oficial disponível ainda" quando a lista fica vazia (o caso comum hoje,
porque a única fonte de dados organizacionais é o Ambiente Demo). Isso **não é um bug**:
enquanto não existir um pacote genuinamente `ici-dev` (importado fora do Ambiente Demo),
os selects devem ficar vazios — publicar dados fictícios seria pior do que não publicar
nada.

## Wizard de Publicação Oficial (`OfficialPublicationWizard.tsx`)

Substitui o painel único (que antes ficava aninhado dentro do bloco condicional do Demo)
por oito passos, cada um desabilitado com explicação (`title`) até o anterior ser válido:

1. **Origem da escala** — mostra a origem atual (equipes/membros totais no pacote) e quantos
   são elegíveis para `ici-dev`; se zero, aponta o motivo e linka para a seção Ambiente Demo.
2. **Revisão dos dados** — contagens de equipes/membros elegíveis, períodos e atribuições.
3. **Diagnósticos** — status do backend, Firebase Admin, flag de escrita, revisão ativa, e
   `DiagnosticsPanel` com cada erro/aviso/informação relevante (contaminação Demo, backend
   offline, Admin ausente, flag desligada, vínculo inválido, último erro remoto).
4. **Vínculo corporativo** — `OfficialCorporateLinkForm` (já filtrado).
5. **Dry-run** — botão "Executar dry-run", sempre disponível independente da flag.
6. **Revisão do plano** — contagens + próxima revisão + checksum + vínculo escolhido.
7. **Confirmação** — botão "Publicar oficialmente"; com
   `ALLOW_OFFICIAL_FIRESTORE_WRITE` ausente/`false`, fica desabilitado e mostra
   "Publicação oficial desabilitada neste ambiente." (dry-run nas etapas 1–6 continua
   funcionando normalmente).
8. **Resultado** — revisão publicada em caso de sucesso, ou o último erro.

As etapas **Diagnósticos** e **Resultado** ficam sempre alcançáveis, mesmo com etapas
anteriores inválidas — são exatamente onde o usuário vai para entender um bloqueio ou
conferir uma tentativa passada, não fazem parte da cadeia estrita 1→2→4→5→6→7.

Demo e Oficial nunca aparecem na mesma tela: a seção "Ambiente Demo" mostra
`DemoScenarioSummary`/`DemoPublicationPanel`/controles de time; a seção "Publicação
Oficial" mostra só o wizard. O único elemento compartilhado visível em qualquer seção é o
banner de ambiente (`DemoWorkspaceBanner`, no cabeçalho recolhível) — um indicador global de
"em qual ambiente você está", não um painel de gestão.

`OfficialPublicationPanel.tsx`/`OfficialPublishDialog.tsx` continuam existindo e testados
como antes (o painel deixou de ser renderizado direto pelo `App.tsx`, mas seu contrato não
mudou); o wizard reaproveita `OfficialCorporateLinkForm` e os mesmos hooks/callbacks já
existentes (`useOfficialRemotePublication`, `validateOfficialPublication`,
`openOfficialPublishDialog`, `confirmOfficialPublication`) — nenhuma lógica de rede nova.

## Rolagem e responsividade

Auditoria (seção 8 do pedido original): `html, body, #root { height: 100% }` e
`.app { height: 100%; flex column }` já estavam corretos antes desta fase. O problema real
era a ausência de qualquer estrutura de shell — tudo cabia (ou não) na altura da janela
porque era uma sequência linear de blocos, sem um container de rolagem próprio.

`.shell` é `display:flex` (`.shell-nav` + `.shell-main`), toda a cadeia usa `min-height:0`
e **nenhum nível usa `overflow:hidden` nem altura fixa em `vh`/`dvh`**; `.shell-content` é a
**única** fonte de rolagem vertical de toda a aplicação — o mesmo princípio que o Planejador
SOC já validara horizontalmente (docs/spec/04, "único container principal e única fonte da
verdade"), agora aplicado verticalmente no nível do shell inteiro. Como consequência direta,
`.soc-planner-main` perdeu o `max-height: calc(100dvh - 245px)` que carregava desde antes
desta fase — aquele valor foi calibrado para uma pilha de cabeçalhos que não existe mais
(o cabeçalho agora é recolhível e o Planejador vive dentro de `.shell-content`); mantê-lo
teria recriado exatamente o problema de duas rolagens verticais concorrentes que a 1.9.0já
havia corrigido no eixo horizontal.

Menu compacto (`≤900px`): `.shell-nav` passa a `position:fixed`, fora da tela por padrão
(`transform:translateX(-100%)`), e um botão `☰ Menu` no topo do conteúdo abre/fecha o
drawer — nenhuma funcionalidade fica inacessível, só a apresentação muda.

Modo compacto: o botão/preferência já existente do Planejador SOC (`socCompact`,
inalterado) continua funcionando exatamente como antes; esta fase adiciona um modo compacto
**global** (`uiCompact`, checkbox no rodapé da navegação, persistido em
`localStorage['escala-dashboard:ui-compact']`) que reduz padding em cards/painéis em toda a
aplicação — são preferências independentes.

Botão "voltar ao topo": aparece em `.shell-content` só depois de ~240px de rolagem, dentro
de `.shell-main` (nunca sobre a barra lateral), pequeno o suficiente para não cobrir
conteúdo continuamente — diferente da antiga nota fixa "rascunho salvo automaticamente"
(`position:fixed` no canto inferior direito da tela inteira), que foi movida para o rodapé
da barra lateral (sempre visível, nunca sobrepondo a grade).

## Diagnósticos

`DiagnosticsPanel.tsx`: lista compacta de erros/avisos/informações, cada um com contagem
por severidade no topo e um botão "Detalhes técnicos" que expande o código/mensagem crua
sob demanda — nunca escondendo a mensagem principal, só adiando o detalhe técnico. Usado no
passo "Diagnósticos" do wizard oficial e na seção Histórico/Status.

## O que esta fase não faz

- Não cria um pipeline de importação XLS para dados organizacionais (times/membros) —
  continua sendo exclusivamente o pacote do Ambiente Demo retitulado, exatamente como a
  FASE 14D documentou. Corrigir a contaminação não significa inventar uma segunda origem.
- Não habilita `ALLOW_OFFICIAL_FIRESTORE_WRITE` nem publica nada real.
- Não altera nenhum contrato de servidor (`server/**`), regras do Firestore, nem os hooks
  `useDemoRemotePublication`/`useOfficialRemotePublication` além de ficarem sempre
  habilitados em vez de condicionados a `schedule.origin`.
- Não introduz React Router nem qualquer biblioteca de roteamento.
- Não altera `validateCorporateLinkLocally` nem `toOfficialPackage` (só adiciona funções
  novas ao lado, para não arriscar os testes que já cobriam essas duas).

## Testes

Além dos 328 testes preexistentes (nenhum removido — 2 arquivos atualizados só para incluir
o clique de navegação necessário, ver abaixo), 23 testes novos:

- `tests/AppShell.test.tsx` — indicação de seção ativa, item desabilitado com `title`,
  badge, menu móvel, modo compacto, botão "voltar ao topo" após rolagem.
- `tests/Home.test.tsx` — cartões sem grade/formulário simultâneo, navegação por cartão,
  "Continuar X" condicional, resumo com status Demo/Oficial/backend/Firebase Admin.
- `tests/OfficialPublicationWizard.test.tsx` — etapas bloqueadas com pacote contaminado
  (exceto Diagnósticos/Resultado), filtro de membros Demo no vínculo, dry-run disponível
  com a flag desligada, confirmação bloqueada com mensagem exata, resultado exibido,
  diagnóstico de contaminação com detalhe técnico expansível.
- `tests/appShellNavigation.test.tsx` (via `<App/>` real) — ida e volta Início↔Grade
  preserva edição/desfazer-refazer; Demo e Oficial nunca empilhados na mesma tela; modo
  compacto persiste em `localStorage`.
- `tests/OfficialPublicationPanel.test.tsx` (+1) e `tests/officialWorkspaceRetarget.test.ts`
  (+4) — filtro anti-contaminação (novo pacote de teste limpo em
  `tests/fixtures/officialPackage.ts`, sem nenhum dado real).
- `tests/demoWorkspace-ui.test.tsx` — atualizado com um clique extra na aba "Grade" (a
  grade virou uma seção própria; o teste ganhou o passo de navegação, sem perder nenhuma
  asserção original sobre bloqueio de adicionar/remover técnico no Ambiente Demo).

Validação independente desta sessão: `npx tsc --noEmit` limpo, `npx vitest run` (42
arquivos, 351 testes, 0 falhas), `npm run build` e captura de tela via Chromium real (ver
runbook de validação manual) — descritas com resultado exato no relatório final desta fase.

## Adendo — correção de bug crítico e polimento visual (mesma sessão)

Após a primeira leva de mudanças, uma validação manual real (`npm run dev` + `npm run
server:dev`, Firebase Admin já configurado neste ambiente) encontrou um bug crítico e
várias lacunas visuais. Registradas aqui porque fazem parte do mesmo esforço de UX/
navegação, não de uma fase nova.

### Bug crítico: seção Histórico/Status em branco

**Causa raiz**: `server/routes/{demoStatus,officialStatus}.mjs` devolve `lastPublishedAt`
direto de um campo do Firestore. O tipo declarado no cliente é `string | null`
(`useDemoRemotePublication.ts`/`useOfficialRemotePublication.ts`), mas quando o valor real é
um `Timestamp` do Admin SDK, o `res.json()` do Express serializa como
`{ _seconds, _nanoseconds }` — um objeto, não uma string. A nova seção Histórico/Status
(única coisa nesta fase a renderizar `lastPublishedAt` diretamente em JSX) tentava
renderizar esse objeto como filho do React, que lança `"Objects are not valid as a React
child"`. Sem nenhum Error Boundary no `main.tsx` anterior, isso derrubava a árvore inteira,
deixando `#root` vazio — exatamente o "fica em branco carregando eternamente" relatado.

Correção: `formatRemoteTimestamp` (`App.tsx`) reconhece string, número e o formato
`{ _seconds }` do Firestore, nunca deixando um valor bruto não reconhecido chegar ao JSX.
Adicionalmente, `src/components/ErrorBoundary.tsx` foi acoplado no `main.tsx` como rede de
segurança de última linha — não corrige a causa raiz de nenhum bug futuro, mas garante que
o próximo erro de render mostre uma mensagem legível ("Algo quebrou nesta tela" + botão
"Tentar novamente") em vez de uma tela branca sem nenhuma pista.

### Ícones e sobreposição no menu recolhido

A navegação recolhida (`.shell.nav-collapsed`) tentava encolher rótulo+descrição dentro de
56px de largura sem esconder o texto — o texto quebrava linha, e o badge "ATIVO"
(`position:absolute`) ficava por cima. `src/components/icons.tsx` adiciona um conjunto de
ícones SVG (stroke, `currentColor`, sem nenhuma biblioteca nova) para Início, Importar,
Planejador, Grade, Ambiente Demo, Publicação Oficial, Histórico/Status e Configurações,
mais ícones de menu/tema/colapsar. Recolhido, o item de navegação mostra só o ícone (rótulo
e descrição saem do fluxo com `display:none`, não apenas encolhem) e o badge vira um ponto
verde de 8px — sem nenhuma sobreposição. O nome completo da seção continua acessível via
`title` e `aria-label` (que também passou a ignorar o número/ícone decorativo do item, do
mesmo jeito que as abas do wizard oficial já faziam).

### Tema claro/escuro (paleta do app KMP)

`src/lib/theme.ts` + botão de tema no rodapé da navegação (ciclo claro → escuro →
automático, ícone sol/lua/monitor). O tema escuro reaproveita 1:1 os tokens de
`EscalaICI-KMP-Lab` (`composeApp/.../ui/theme/LabColors.kt`, app Android real,
"dark-only"): fundo `#070B12`, superfície `#0B1827`, texto `#F3F4F6`, ação `#18A874`
(idêntico ao verde já usado neste Dashboard), foco `#3B82F6`. Cobre integralmente a casca de
navegação, Home, wizard oficial, diagnósticos, status/configurações e identidade local.
Componentes herdados de fases anteriores (grade, Planejador, editor de plantão, modo N1,
diálogos) continuam com a aparência clara original — recolori-los por completo ficaria fora
do escopo de uma reorganização de navegação e arriscaria regressão em áreas já validadas a
fundo; alguns fundos claramente "crus" em qualquer tema (diálogos brancos fixos, barras com
cor de fundo hardcoded como `.firebase-bar`, `.n1-modebar`, `.demo-workspace-banner`,
`.demo-scenario-summary`) foram trocados por `var(--surface)`/`var(--paper)`/
`var(--warn-soft)` para não ficarem ilegíveis (texto claro sobre fundo claro fixo) quando o
escuro está ativo — isso incluiu duas variáveis novas, `--toast-bg`/`--toast-fg`, porque o
toast usava `var(--ink)` como fundo (um truque que só funciona quando `--ink` é escuro).
Preferência persistida em `localStorage['escala-dashboard:theme']`; com `system`, escuta
`prefers-color-scheme` em tempo real.

### Identidade local — "quem está operando" (chefe do setor → time)

Não existe login MSAL no Dashboard ainda (fase futura documentada em
docs/spec/05-FIREBASE-ESCALA-ICI-RESPONSIBLE-LOGIN.md). Peça explícita: mostrar quem está
operando agora, mesmo sem autenticação real. `src/lib/localIdentity.ts` +
`useLocalIdentity.ts` + `LocalIdentityBar.tsx`: um chefe do setor (nome livre) cria e escolhe
"times" locais (nome + tipo — SOC/NOC, Service Desk N1, Plantão COSI ou Outro), tudo
persistido em `localStorage['escala-dashboard:local-identity:v1']`, **sem nenhuma
integração com o Firestore**. Deliberadamente separado de `firebaseDashboard.teams` (o
seletor real, autenticado, usado na publicação estruturada) — os dois convivem na mesma
barra superior sem se misturar; quando o login Microsoft existir, este bloco pode ser
removido sem afetar nenhum outro fluxo. Sempre visível (não faz parte do cabeçalho
recolhível), com nota explícita "sessão local deste navegador · sem login Microsoft ainda".
O time ativo aparece no resumo da Home ("Time: {nome} · {tipo}"), mas esta fase não
rewireia a criação de escala em torno dele — a fábrica de escalas (`ScheduleTemplateWizard`)
continua exatamente como antes; ligar os dois é dívida técnica registrada para uma fase
futura, não implementada aqui.

### Testes e validação adicionais deste adendo

Nenhum teste foi removido. `tests/setup.ts` ganhou um stub de `window.matchMedia` (jsdom não
implementa) para não quebrar todos os testes que renderizam `<App/>` — o tema por padrão é
`system`, que consulta `matchMedia` no mount. Validação manual real via Chromium
(Playwright, `--no-sandbox`, backend Express + Firebase Admin já configurados neste
ambiente): Início, Ambiente Demo, Grade, Publicação Oficial, Histórico/Status (confirmado
carregando corretamente com dados reais de status, não mais em branco), menu recolhido,
ciclo de tema claro/escuro, formulário de identidade local, em 1366×768 e 1920×1080 — zero
erros de console em todas as capturas. `npx tsc --noEmit`, `npx vitest run` (351 testes) e
`npm run build` permanecem verdes após todas as correções.
