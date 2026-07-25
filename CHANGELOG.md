# Histórico de versões

## 1.16.0 — 23/07/2026

- **Frente B1 — design system: componentes padrão** (spec
  `docs/spec/13-DASHBOARD-DESIGN-SYSTEM-COMPONENTES-PADRAO.md`). Adiciona
  `AppButton`/`AppDialog`/`AppConfirm`/`AppAlert`/`AppToast`/`AppDrawer` em
  `src/components/ui/`, empacotando exatamente as classes CSS já existentes (nenhuma
  linguagem visual nova). `AppDialog` adiciona Escape, focus trap, foco inicial, devolução de
  foco e bloqueio de scroll a todos os modais que o adotam. Migra por composição:
  `SchedulesOverview`, `TeamHomePage`, `ScheduleGrid` (só a casca), `SocPlanner`, `CellMenu`,
  `StartScheduleDialog`, `PublicationDialog`, `OfficialPublicationWizard`,
  `OfficialPublishDialog`, `SwapRequestsDialog`, `AdminUsersPanel`, `ConflictAlertsPanel` e o
  toast de `App.tsx` — zero botão/handler removido, zero redesign perceptível. 475 → 511
  testes.
- **FASE 14K — integração visual Órbita de Turnos, marca e nomenclatura**
  (spec `docs/spec/12-DASHBOARD-FASE14K-ORBITA-DE-TURNOS-INTEGRACAO-VISUAL.md`).
  Nenhuma publicação real no Firebase, nenhum deploy e nenhum XLS real versionado.
  - adiciona a base visual Órbita de Turnos ao Dashboard funcional: fontes locais
    Sora/IBM Plex Sans, tokens dark exatos do prompt, marca `Escala ICI` versionada
    em `public/brand/`, favicon e ícones Web/PWA locais;
  - adiciona `Brand`, `FlowSteps` e motivos operacionais (`ShiftRail`,
    `DestinationSeal`) sem copiar `prototype-data.ts`, servidor do protótipo,
    Manus runtime, `wouter`, Radix/shadcn ou dependências novas;
  - inicia a limpeza de nomenclatura visível: `Gestor responsável`, `Equipe`,
    `Cadastrar equipe`, `Publicar escala`, `Validar escala`, `Conferir alterações`
    e `Histórico de publicações`; SOC e NOC deixam de aparecer como um destino
    único no contexto local do gestor, preservando o template interno `SOC_NOC`;
  - corrige a versão visual do cabeçalho: remove o literal `v1.14.0`, passa a
    derivar de `package.json` e adiciona teste de regressão para impedir nova
    divergência;
  - adiciona `manifest.webmanifest`, links de favicon/apple/PWA em `index.html`
    e teste para garantir que os ícones apontam para assets locais versionados,
    sem referência a `/manus-storage/`.
  - **Checkpoint 1 — dark-only**: remove o ciclo claro/escuro/automático e o
    controle de tema da navegação, elimina `src/lib/theme.ts`, fixa fundo escuro
    antes da inicialização do React (`index.html`), centraliza tokens Órbita em
    `src/styles.css`, escurece superfícies estruturais compartilhadas (shell,
    modais, popovers, campos, barras, tabelas e overlays) e adiciona testes de
    regressão para impedir retorno do tema claro.
  - **Checkpoint 2 — entrada única, catálogo de equipes e página da equipe**:
    `EntryScreen` substitui a tela desautenticada anterior por um único ponto
    de entrada (acesso de teste local recolhido, nunca em primeiro plano);
    `SchedulesOverview` lista só as equipes autorizadas recebidas do catálogo
    real (sem período/contagem fixos); `TeamHomePage` mostra o resumo real de
    uma equipe (período atual, colaboradores, rascunho local) e informa
    honestamente "Publicação: Não carregada" em vez de simular sucesso;
    `StartScheduleDialog` só encaminha para importar ou criar, sem forjar
    resultado. `Home.tsx`/`App.tsx` simplificados para delegar ao catálogo de
    equipes. Nenhuma dependência nova, nenhuma referência a Manus/protótipo.

## 1.15.3 — 22/07/2026

- **FASE 14I — padronização visual da escala SOC e contabilidade de folgas**
  (spec `docs/spec/11-DASHBOARD-FASE14I-CONTRATO-LEGENDAS-CONTABILIDADE-FOLGAS.md`).
  Nenhuma publicação real, nenhum deploy, nenhum XLS real versionado.
  - novo módulo único `src/lib/scheduleTokens.ts`: 4 turnos (`Md`/`M`/`T`/`N`,
    cores exatas do KMP `shiftColor()`) + 8 situações do XLS SOC
    (`DU`/`DF`/`BH`/`AN`/`X`/`#`/`Folga`/`HE`, cores derivadas da referência
    nomeada do prompt, método de derivação documentado na spec) — cada
    token carrega código, nome, cor e `countsAsOff`;
  - cores dos 4 turnos da grade SOC (`styles.css`) alinhadas às do KMP
    (Madrugada/Manhã/Tarde já usavam tons divergentes; Noite já estava
    correta); legenda da escala SOC substituída pela lista canônica de 12
    códigos (turnos + situações), com os códigos genéricos antigos
    (`MAD`/`F`/`FE`/`AF`) removidos **só dessa legenda** — continuam
    valendo para COSI/Service Desk N1, que não mudam nesta fase. Clicar
    num código de situação na legenda já aplica o texto específico à
    célula (preenchimento em lote preserva o código desde já);
  - novo painel **"Contabilidade das folgas"**, abaixo da grade SOC,
    visualmente equivalente ao painel "Contabilidade dos plantões" do
    COSI (mesmas classes CSS, cabeçalho, tabela rolável, ponto colorido
    por colaborador, linha de totais, indicador de equidade não
    bloqueante). Fonte reativa (`visibleSchedule`, o mesmo estado
    memoizado que já alimenta a grade) — atualiza sozinho após
    edição/undo/redo/importação/restauração, sem estado duplicado.
    Conta só `DU`/`DF`/`Folga` (descanso operacional) no total
    Domingo/Sábado/Semana; `AN`/`BH`/`X`/`#` ficam fora, conforme a spec.
    Classificação sempre pela data real da coluna, nunca pelo código
    isoladamente (testado com fixture adversarial: `DF` numa segunda-feira,
    `DU` numa sexta-feira, ambos classificados corretamente pela data);
  - 13 testes novos (12 tokens com valores exatos, `countsAsOff` correto,
    normalização de texto, legenda SOC canônica, painel de folgas
    reativo, ausência em escalas não-SOC). 447 → 460 testes;
  - validação manual real no Chromium (Test Drive → SOC/NOC): legenda,
    cores e painel confirmados visualmente; edição de célula atualiza o
    painel imediatamente (Fictício 05: total 5→6 ao aplicar `DU`); testado
    também contra build de produção (`vite build` + `preview`) para
    descartar o bug pré-existente e já documentado do `useHistory` em
    StrictMode (dev-only) — undo/redo reverte corretamente cela e painel
    fora do modo dev, confirmando que não é regressão desta fase.

## 1.15.2 — 22/07/2026

- **FASE 14H — fidelidade do parser oficial, grupos de plantão e contratos de
  notificação Push** (spec `docs/spec/10-DASHBOARD-FASE14H-CONTRATO-ESCALA-PLANTAO-NOTIFICACOES.md`).
  Nenhuma publicação real, nenhuma escrita real no Firestore, nenhum deploy —
  revisões 1 e 2 (`ici-dev`) permanecem intactas.
  - corrige a causa raiz de folgas desaparecendo na importação: o parser
    tratava as abas "Escala" e "Escalistas" como origens alternativas, nunca
    cruzadas, e um dia sem login em nenhuma coluna de turno nem na coluna de
    observação nunca produzia registro algum (`matrixAssignments` tinha
    `if (!value) return`). Nova opção de importação "SOC cruzado" (layout
    `soc-combined`) cruza as duas abas por (membro, data); `matrixAssignments`
    agora sempre produz uma atribuição por dia, nunca ausência de registro,
    em qualquer layout de aba única também;
  - trabalho declarado (`1`-`6`) sem turno localizado na aba Escala vira
    inconsistência explícita, bloqueada no dry-run e no commit
    (`SCHEDULE_WORK_SHIFT_NOT_LOCATED`); `BH`/`Aniversário` deixam de
    colapsar em folga genérica; separadores de nomes em célula padronizados
    (`/`, quebra de linha, `,`, `;`) em qualquer coluna;
  - endurece a autorização por time da publicação oficial: a rota só
    autorizava o `teamId` único do vínculo corporativo — agora
    `requirePackageTeamAuthorization` valida **todo** `teamId` referenciado
    dentro do pacote construído no cliente contra os times autorizados do
    chamador (`FORBIDDEN_TEAM_IN_PACKAGE`); validador oficial ganha checagem
    de atribuição duplicada (`DUPLICATE_ASSIGNMENT`) e atribuição fora do
    período referenciado (`ASSIGNMENT_DATE_OUT_OF_PERIOD`); dry-run passa a
    devolver período, contagens por tipo/turno, folgas por membro e avisos;
  - **grupos de plantão** (conceito novo — nem o legado `EscalaSOC` nem este
    código tinham "grupo" até aqui, "COSI" era só o nome do relatório):
    `OnCallGroup` novo, `groupId` em período/atribuições de plantão;
    `buildOfficialPackageFromSchedule` recusa preparar pacote de plantão sem
    grupo explicitamente escolhido, nunca infere pelo nome da planilha;
    validador oficial ganha checagem simétrica (`ON_CALL_GROUP_REQUIRED`).
    Wizard oficial: equipe com grupo único (SOC/COSI) pula seleção; múltiplos
    grupos (NOC) exigem escolha explícita — sem nunca bloquear a importação
    comum de escala 6x1 (achado e corrigido em revisão: a validação de
    plantão não pode desabilitar o botão de importação geral). Gestão mínima
    de grupos na seção Administração;
  - **infraestrutura de assinatura/notificação Push** — contrato e testes
    apenas, nenhum envio real, nenhuma credencial VAPID/FCM criada ou
    versionada: `POST`/`DELETE /api/push/subscriptions` sempre associados ao
    caller verificado (nunca a um `memberId` do corpo), revogação só pelo
    dono ou `SYSTEM_ADMIN`, token/endpoint nunca expostos além de um
    fingerprint SHA-256 curto, idempotência por `(memberId, platform, token)`;
    seleção de destinatário por membro (só o próprio) ou equipe (autorização
    reaproveitada); construtores de evento determinísticos ("nova escala
    publicada", "seu dia mudou"); planejador de despacho sempre dry-run —
    nenhuma chamada de rede/SDK de envio existe neste código;
  - 447 testes (423 → 447 nesta fase, partindo de 399 na FASE 14G), 4 rodadas
    Claude↔Codex com revisão de diff e testes fora do sandbox em cada uma;
    typecheck e build limpos; validação visual manual no Chromium (login,
    Administração, wizard oficial, importação sintética "SOC cruzado",
    dry-run) sem regressão de navegação.

## 1.15.1 — 22/07/2026

- **FASE 14G — primeira publicação oficial controlada (workspace `ici-dev`, time SOC,
  período 26/06/2026–25/07/2026)**: duas publicações reais autorizadas, executadas via
  `POST /api/publish/official` (nunca escrita direta no Firestore), a partir de um XLS
  real de escala (9 técnicos, 232 registros — 210 turnos + 22 anotações de férias/DU).
  - Revisão 1: importação fiel do XLS (dry-run `VALIDATED`, checksum `MATCH`), publicada
    e validada no Android (emulador com sessão MSAL real já autenticada) — expôs, pela
    primeira vez testando com login corporativo real, que `corporateLogin`/
    `emailNormalized` eram gravados como o login nu do XLS (ex.: `"lvergani"`), sem
    domínio, impedindo `findActiveMemberIds` (KMP) de resolver a identidade MSAL real
    (`lvergani@ici.tec.br`) contra o cadastro publicado ("Cadastro corporativo não
    localizado na publicação oficial.");
  - corrige `buildOfficialPackageFromSchedule` (`officialWorkspace/buildFromSchedule.ts`)
    para derivar `corporateLogin`/`emailNormalized` como `login@ici.tec.br` quando o XLS
    só traz o login nu (preserva o valor se já vier com `@`), alinhando com o contrato já
    coberto no KMP (`RemoteFirstDemoMemberDirectoryRepositoryTest`); 2 testes novos
    (399 no total, nenhum removido);
  - Revisão 2: reimportação do mesmo XLS validado (agora com `corporateLogin` correto
    para os 9 membros) mais uma correção pontual — turno de manhã de `lvergani` em
    25/07/2026 alterado para folga (`assignmentType: 'OFF'`), motivo documentado em
    `scheduleChangeRequests` ("Correção após teste controlado de sincronização"), sem
    tocar nenhum outro registro. Total de atribuições mantido em 232 (o registro do dia
    passa a existir como folga, não é removido); contagem de turnos de trabalho migra de
    210 para 209. Dry-run `VALIDATED`/`MATCH` antes do commit;
  - revisão 1 permanece imutável no Firestore (conferido após a revisão 2 publicar);
    ponteiro ativo avançou 0 → 1 → 2 nas duas publicações, cada uma com sua própria
    `idempotencyKey`;
  - validado no Android (relançamento do app, sem reinstalar/limpar dados): "Minha
    Escala" passou a resolver o cadastro real e exibir a semana corrigida (19–24/07
    "Manhã", 25/07 "Folga"), confirmando sincronização por ponteiro de revisão;
  - validação no Web/PWA não pôde ser concluída de forma autônoma: o navegador exigiu
    login MSAL real (redirecionamento a `login.microsoftonline.com`), que depende de
    credenciais/MFA do usuário e não deve ser simulado — recomenda-se conferência manual
    em `http://localhost:8080/` com a sessão já autenticada do usuário.

## 1.15.0 — 22/07/2026

- resolve o bloqueio estrutural da Publicação Oficial: até aqui a única origem
  possível do pacote oficial era o Ambiente Demo retitulado (`toOfficialPackage`),
  e como todo `id` do fixture `demo-v1` contém `"demo"`, `eligibleOfficialMembers`/
  `eligibleOfficialTeams` sempre voltavam vazios — o wizard nunca tinha dados
  elegíveis para publicar de verdade. Novo `buildOfficialPackageFromSchedule`
  (`src/lib/officialWorkspace/buildFromSchedule.ts`) gera um pacote `ici-dev`
  genuíno a partir de uma escala importada (XLS/XLSX, parser existente) ou
  criada no Dashboard, com IDs determinísticos (slug de nome/login normalizado)
  nunca contaminados pela substring `demo`; o wizard agora oferece "Publicação
  oficial ativa", "Escala importada", "Escala criada no Dashboard" e "Pacote
  Demo" (este último mantido claramente rotulado como bloqueado por design);
- adiciona perfis administrativos (`USER`/`SCHEDULE_ADMIN`/`SYSTEM_ADMIN`),
  fechando uma lacuna real encontrada em auditoria: as rotas Express de
  publicação oficial não verificavam identidade do chamador (só a flag
  `ALLOW_OFFICIAL_FIRESTORE_WRITE` + confirmação textual). Novo middleware
  `verifyCaller` (`server/infra/verifyCaller.mjs`) valida o ID token real do
  Firebase Auth (`Authorization: Bearer`) e resolve papel/times antes de
  qualquer dry-run/commit; nova seção "Administração" no Dashboard (9ª,
  visível só para `SYSTEM_ADMIN`) lista/cadastra administradores, com
  bloqueio contra remover o último administrador do sistema;
- adiciona bootstrap local de autenticação para desenvolvimento (dupla trava:
  `DASHBOARD_DEV_LOCAL_AUTH=true` **e** `NODE_ENV!=production`, checada a cada
  requisição), permitindo testar o fluxo administrativo sem depender do
  cadastro MSAL/Entra completo ainda — sessão assinada com HMAC-SHA256
  nativo, cookie `httpOnly`/`sameSite=strict`, sempre identificada por um
  selo visível "MODO DE TESTE";
- adiciona gateway de leitura da publicação oficial ativa (`GET
  /api/official/schedule`), autenticado/autorizado por time, lendo a
  revisão ativa (ou uma revisão anterior específica) e filtrando
  estritamente por `teamId` — nenhum dado de outro time é incluído. O
  frontend passa a rastrear a revisão-base carregada e reenviá-la em
  dry-run/commit; a proteção de concorrência (`PUBLICATION_REVISION_CONFLICT`)
  já existia no backend (`reserveRevision`) e agora tem uma UX clara de
  "recarregar" quando outra pessoa já publicou uma revisão mais nova;
- 396 testes (351 → 396: origem oficial +7, RBAC +14, bootstrap local +9,
  leitura oficial +15), todos verdes; nenhum dos testes/fluxos anteriores
  foi removido ou perdeu cobertura.

## 1.14.0 — 21/07/2026

- reorganiza o Dashboard, antes uma única página longa, em uma casca de navegação
  (`AppShell`) com barra lateral recolhível (desktop) e menu compacto (telas pequenas):
  Início, Importar escala, Planejador, Grade, Ambiente Demo, Publicação Oficial,
  Histórico/Status e Configurações — navegação por estado local (`src/lib/navigation.ts`),
  sem React Router, preservando rascunho/seleção/desfazer-refazer ao trocar de seção;
- adiciona a tela `Início` (`Home.tsx`) com cartões de entrada (criar escala vazia,
  importar, rascunho local, Test Drive, Ambiente Demo, publicação oficial) e um resumo
  compacto (período, tipo, pessoas, atribuições, status Demo/Oficial, backend, Firebase
  Admin) — sem mostrar grade nem formulários simultaneamente;
- corrige a contaminação Demo→Oficial relatada (`O plano de publicação contém um
  identificador incompatível com o workspace ici-dev`): o pacote oficial de hoje só existe
  a partir do pacote do Ambiente Demo retitulado, e **todo** id da fixture `demo-v1` contém
  `"demo"` — antes disso, o vínculo corporativo aceitava qualquer membro/equipe, deixando o
  dry-run passar e o COMMIT sempre falhar na guarda do servidor. `eligibleOfficialMembers`/
  `eligibleOfficialTeams`/`isOfficialLinkEligible` (`officialWorkspace/retarget.ts`) agora
  filtram qualquer registro com `id` contendo `"demo"` ou `workspaceId` diferente de
  `ici-dev` antes de preencher os selects, e o Dashboard mostra mensagem orientativa
  ("nenhum membro oficial disponível") em vez de deixar selecionar dados fictícios;
- substitui o painel único de Publicação Oficial por um wizard de 8 passos
  (`OfficialPublicationWizard.tsx`): Origem da escala → Revisão dos dados → Diagnósticos →
  Vínculo corporativo → Dry-run → Revisão do plano → Confirmação → Resultado, com cada
  etapa desabilitada e explicada até a anterior ser válida (exceto Diagnósticos e
  Resultado, sempre acessíveis para investigar bloqueios ou conferir tentativas passadas);
  Demo e Oficial nunca mais aparecem empilhados na mesma tela;
- padroniza visualmente o formulário de vínculo corporativo e o painel oficial (cards,
  badges, mensagens de erro/aviso/info) em vez de `fieldset`/`dl` sem estilo; adiciona
  `DiagnosticsPanel.tsx`, uma área compacta de erros/avisos/informações com detalhe técnico
  expansível sob demanda, reaproveitada no wizard e na seção Histórico/Status;
- corrige rolagem: remove o `max-height: calc(100dvh - 245px)` do Planejador SOC (calibrado
  para a pilha de cabeçalhos antiga, que não existe mais) e estabelece `.shell-content` como
  única fonte de rolagem vertical de toda a aplicação, com cabeçalho recolhível e botão
  "voltar ao topo"; preserva o modo compacto do Planejador já existente e adiciona um modo
  compacto global (`uiCompact`) separado;
- 23 testes novos (`AppShell`, `Home`, `OfficialPublicationWizard`, navegação integrada via
  `App`, filtro anti-contaminação em `officialWorkspaceRetarget`/`OfficialPublicationPanel`)
  e 2 testes existentes atualizados com um clique extra de navegação (`demoWorkspace-ui`),
  sem remover nenhuma asserção; nenhuma publicação real foi feita, `ALLOW_OFFICIAL_
  FIRESTORE_WRITE` continua ausente/`false`;
- **corrige bug crítico encontrado em validação manual real**: a seção Histórico/Status
  ficava em branco (crash sem Error Boundary) porque `lastPublishedAt` pode chegar do
  Firestore como `{ _seconds, _nanoseconds }` em vez de string — `formatRemoteTimestamp`
  trata os dois formatos, e `src/components/ErrorBoundary.tsx` (novo, acoplado no
  `main.tsx`) garante que um erro de render futuro mostre uma mensagem legível em vez de
  tela branca;
- adiciona conjunto de ícones SVG (`src/components/icons.tsx`, sem biblioteca nova) e
  corrige a navegação recolhida, que quebrava texto e sobrepunha o badge "ativo" dentro de
  56px — recolhida, cada item mostra só o ícone (nome completo continua em `title`);
- adiciona tema claro/escuro (`src/lib/theme.ts`, ciclo automático/claro/escuro persistido)
  reaproveitando a paleta real do app Android/KMP (`EscalaICI-KMP-Lab`, dark-only) na casca
  de navegação, Home, wizard oficial, diagnósticos e configurações; corrige fundos com cor
  fixa (`.firebase-bar`, `.n1-modebar`, `.demo-workspace-banner`, `.demo-scenario-summary`,
  toast) que ficavam ilegíveis no escuro;
- adiciona identidade local "chefe do setor → time" sem MSAL (`LocalIdentityBar.tsx`,
  `useLocalIdentity.ts`), sempre visível no cabeçalho, isolada de `firebaseDashboard.teams`
  (o seletor real, autenticado) — só um rótulo de contexto até o login Microsoft existir;
- `tests/setup.ts` ganha stub de `window.matchMedia` (ausente no jsdom); zero testes
  removidos, `npx vitest run` continua em 351 testes, 0 falhas.

## 1.13.0 — 21/07/2026

- adiciona área "PUBLICAÇÃO OFICIAL" separada do painel Demo, publicando um snapshot
  revisionado do workspace `ici-dev` (mesmo contrato consumido pelo botão "MINHA ESCALA"
  do Escala ICI KMP), reaproveitando a arquitetura de publicação atômica já validada em
  `demo-v1` (reserva de revisão → escrita isolada → ativação do ponteiro → idempotência);
- adiciona `server/domain/officialPublicationPlanner.mjs` e
  `assertOfficialOnlyWritePlan.mjs`, guardas simétricas e independentes das do Demo — o
  workspace `ici-dev` é sempre decidido pelo servidor, nunca pelo cliente;
- adiciona endpoint `POST /api/publish/official` (DRY_RUN/COMMIT) e `GET
  /api/official/status`, exigindo a variável `ALLOW_OFFICIAL_FIRESTORE_WRITE=true`
  (ausente por padrão) e confirmação explícita para qualquer escrita real;
- exige vínculo corporativo (`memberId`/`teamId`, com `entraTenantId`/`entraObjectId`/
  e-mail opcionais) validado tanto no cliente quanto no servidor antes de dry-run ou commit;
- generaliza `executeAtomicPublication.mjs` para receber o plano/guarda como parâmetro,
  sem duplicar a lógica de reserva/escrita/ativação entre Demo e oficial;
- nenhuma publicação real foi feita nesta versão — a flag continua desligada até a
  primeira publicação oficial ser conduzida manualmente pelo runbook da FASE 14D.

## 1.12.0 — 18/07/2026

- espelha o workspace `demo-v1` (times, membros, vínculos de gestão, escala, solicitações) gerado pela FASE 14c-2 do EscalaICI-KMP-Lab, sincronizado por `npm run demo:sync`, nunca gerado neste repositório;
- adiciona entrada "Ambiente de Demonstração" na tela inicial, reaproveitando a Grade/Planejador existentes para editar a escala dos dois times reais da fixture;
- isola o rascunho do workspace Demo em `localStorage` próprio (`escala-dashboard:demo-workspace:v1`), com baseline imutável, rascunho editável, revisão local e retomada entre sessões;
- adiciona edição local de responsáveis e aprovações (papel, permissões, vigência, status), sempre por seleção de time/membro já cadastrado, nunca texto livre;
- adiciona visualização somente leitura das 3 solicitações de exemplo (pendente/aprovada/recusada), com aprovação/recusa desabilitadas até a FASE 14c-7;
- adiciona resumo compacto do cenário e prévia de diferenças (por id determinístico) entre o pacote original e o rascunho local;
- adiciona restaurar cenário (com confirmação) e exportar pacote Demo (envelope local, separado do contrato canônico);
- corrige o cabeçalho da tela inicial (mostrava `v1.10.0`, desatualizado desde a 1.11.0);
- não adiciona Firebase, Express, MSAL nem nenhuma publicação real nesta fase; preserva a interface, o Test Drive e os fluxos de import/Firebase existentes sem alterações de comportamento.

## 1.11.0 — 16/07/2026

- adiciona assistente inicial compartilhado para escala vazia e Test Drive;
- centraliza os tipos Plantão COSI, SOC/NOC 6x1 e Service Desk N1 6x1 em catálogo;
- cria demos fictícias locais para COSI, SOC/NOC e Service Desk N1;
- isola Test Drive em `localStorage` próprio, sem tocar o rascunho real;
- adiciona banner e ação para encerrar Test Drive apagando só dados fictícios;
- bloqueia publicação de Test Drive no preview e na camada de escrita;
- inclui aviso de dados fictícios apenas na exportação de Test Drive;
- pede confirmação antes de sobrescrever rascunho ou Test Drive salvo;
- preserva editores existentes e fluxo Firebase/Auth/times da 1.10.0.

## 1.10.0 — 16/07/2026

- integra Firebase Auth com Microsoft e vínculo por `user_links`;
- autoriza times por `teams.responsibleLogin`, sem nomes pessoais fixos;
- permite um responsável administrar vários times pelo mesmo login;
- publica membros, escalas regulares e plantões em documentos estruturados compatíveis com o KMP;
- adiciona preview, atualização e substituição controlada de período;
- separa rascunhos locais por time e período;
- adiciona solicitações de troca direcionadas por `teamId`;
- adiciona cadastro simples de times para `system_admin`;
- adiciona regras e testes isolados no Firebase Emulator;
- não executa deploy nem publicação automática.

## 1.9.0 — 16/07/2026

- restaura a navegação horizontal sempre acessível no Planejador SOC;
- adiciona barra inferior sticky sincronizada com a matriz por `ResizeObserver`;
- permite pan horizontal com o botão do meio usando Pointer Events;
- compartilha o mesmo componente e a mesma fonte de alertas entre Grade e Planejador;
- faz o botão Alertas navegar ao painel da visualização atual;
- preserva coluna unificada, compactação, drag-and-drop, assignments e histórico;
- mantém Firebase desativado e sem dependências adicionais.

## 1.8.0 — 16/07/2026

- organiza o Planejador SOC em cinco faixas horizontais fixas com CSS Grid;
- mantém células vazias e alinhamento entre todas as datas;
- fixa identificadores de período durante a rolagem horizontal;
- preserva zonas de drop por data/período e modo compacto;
- simplifica o contador para número sem fundo, borda ou cápsula;
- mantém assignments, exportação, payload e Firebase inalterados.

## 1.7.0 — 16/07/2026

- separa situações especiais dos quatro turnos no Planejador SOC;
- aplica cores da Grade ao turno ou situação real do dia;
- adiciona contadores derivados de dias consecutivos na Grade e no Planejador;
- destaca o sétimo dia e posteriores sem bloquear edição;
- preserva período 25–26, rascunho, exportação, payload e histórico compartilhado;
- mantém Firebase desativado.

## 1.6.0

- adiciona Planejador SOC sincronizado com a Grade;
- corrige cabeçalhos em `DD/MM` e dia da semana;
- prepara payload normalizado para persistência futura.
