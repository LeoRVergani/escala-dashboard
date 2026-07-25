# FASE 14K Dashboard — Design system: componentes padrão (Frente B1)

## Objetivo

Antes de continuar a FASE 14K (Checkpoints 3+), formalizar um pequeno conjunto de componentes
reutilizáveis para que todo botão/modal/alerta/toast/painel lateral novo **componha** a partir
deles, em vez de cada tela montar `<button className="btn ...">` ou
`<div className="modal-backdrop">` na mão. Nenhum CSS novo de linguagem visual foi introduzido —
os componentes só empacotam exatamente as classes já existentes em `src/styles.css`
(`.btn`/`.btn-primary`/`.btn-ghost`/`.btn-danger`/`.icon-btn`/`.modal-backdrop`/`.toast` etc.).

## Componentes (`src/components/ui/`)

- **`AppButton.tsx`** — variantes `default | primary | ghost | danger`; `iconOnly` (usa
  `.icon-btn`/`.icon-btn.danger`); `loading` (desabilita, `aria-busy="true"`, spinner CSS
  `.app-btn__spinner`, texto do botão preservado — não é substituído, continua acessível);
  `type="button"` por padrão, com override explícito permitido (`type="submit"`, usado no
  formulário de `AdminUsersPanel`); preserva `title`/qualquer prop nativa de `<button>`.
- **`AppDialog.tsx`** — base de qualquer modal: backdrop, painel, título (`h2` com
  `aria-labelledby`), descrição opcional, botão fechar (ocultável via `hideCloseButton`),
  **Escape fecha**, **focus trap** (Tab/Shift+Tab não escapa do painel), **foco inicial** no
  primeiro elemento focável, **devolução de foco** ao elemento que abriu o modal ao fechar,
  **bloqueio de scroll do `body`** enquanto aberto (restaurado ao fechar), fechamento por clique
  no backdrop (`closeOnBackdropClick`, default `true`).
- **`AppConfirm.tsx`** — especialização de `AppDialog` para confirmar uma ação: título,
  mensagem, resumo opcional (`summary`, vira `<dl>`), aviso/erro opcionais (`warning`/`error`,
  recebem `ReactNode` já composto com `AppAlert` — permite 0, 1 ou N alertas, ex.: lista de
  `criticalErrors`), Cancelar/Confirmar, `busy` (loading no botão de confirmar), variante de
  perigo (`danger`), ação secundária opcional (`secondaryAction`, usada por `PublicationDialog`
  para o par assimétrico "Atualizar período existente"/"Substituir escala existente").
- **`AppAlert.tsx`** — variantes `info | success | warning | error`; `error`/`warning` usam
  `role="alert"`, `info`/`success` usam `role="status"`. Consolida `.publication-error`,
  `.demo-publication-error`, `.admin-users-error`, `.official-publication-error`,
  `.official-wizard-warning`, `.official-publication-disabled` (todas já usavam exatamente os
  mesmos valores de cor/peso) sob `.app-alert--error`/`.app-alert--warning` (mais
  `.app-alert--info`/`.app-alert--success`, novos, para uso futuro).
- **`AppToast.tsx`** — só a apresentação do `notify(...)` já existente em `App.tsx`; o estado
  (`toast`/`setToast`/timer de 2.6s) **não foi recriado**, continua exatamente onde estava.
- **`AppDrawer.tsx`** — painel lateral com `forwardRef` (necessário para o scroll/foco
  programático que `ConflictAlertsPanel` já fazia), lado configurável (`side="left"|"right"`),
  dois modos: `inline` (padrão — faz parte do fluxo da página, sem backdrop/focus trap; é o que
  `ConflictAlertsPanel` usa hoje) e `overlay` (flutua com backdrop + Escape, para uso futuro).
  Nunca renderizado dentro de linhas/células da Grade — `ConflictAlertsPanel` já era externo à
  tabela (`.conflict-panel-wrap`, fora do `<table>`), isso não mudou.

## Migração B1 (composição, sem redesign perceptível)

Migrados nesta frente: `SchedulesOverview`, `TeamHomePage`, `ScheduleGrid` (só a casca — semana/
dia/técnico/adicionar; células, drag-and-drop, menu de célula e agrupamento N1/SOC preservados
100% intocados), `SocPlanner` (só o botão "Cancelar" do editor inline — os chips de arraste e os
botões ✎/× do card continuam `<button>` nativos, sem classe, pois nunca pertenceram à família
`.btn`), `CellMenu` (botões OK/Limpar/Fechar), `StartScheduleDialog`, `PublicationDialog`,
`OfficialPublicationWizard`, `OfficialPublishDialog`, `SwapRequestsDialog`, `AdminUsersPanel`,
`ConflictAlertsPanel`, `App.tsx` (toast).

Não migrados nesta frente (ficam para o Checkpoint 3/4, por serem justamente o que essas etapas
tratam): o `topBar`/`FirebaseDashboardBar`/`identityBar` legados, as abas de Solicitações de troca,
a paleta clara N1/SOC. Também não migrados por serem padrões bespoke fora da família `.btn`
(abas do wizard `.official-wizard-step-tab`, cartões de origem `.official-source-option`,
`.start-option`, `.link-btn`, itens de `.menu-grid` do `CellMenu`) — mudar esses exigiria decisão
de design própria, não uma composição mecânica.

**Duas mudanças de comportamento conscientes** (não são regressão, são o valor do design system):
1. `StartScheduleDialog`, `PublicationDialog`, `SwapRequestsDialog` e `OfficialPublishDialog` não
   tinham Escape/focus-trap/devolução de foco antes — agora têm, via `AppDialog`. `PublicationDialog`
   e `SwapRequestsDialog` também não fechavam ao clicar no backdrop antes — agora fecham
   (`closeOnBackdropClick` default `true`), consistente com o resto do app.
2. `OfficialPublishDialog` tinha uma inconsistência pré-existente entre o texto visível
   (`<h2>Confirmar publicação oficial — ici-dev</h2>`) e o nome acessível
   (`aria-label="Publicar workspace oficial ici-dev"`, texto diferente). `AppDialog` deriva o
   nome acessível do título visível (`aria-labelledby`), corrigindo a divergência — o teste
   `OfficialPublicationPanel.test.tsx` foi atualizado para refletir o nome correto.

## Testes novos

`AppButton.test.tsx` (11), `AppDialog.test.tsx` (9 — variantes, type padrão/override, Escape,
focus trap, foco inicial, devolução de foco, bloqueio de scroll, backdrop com/sem
`closeOnBackdropClick`, `open=false`), `AppConfirm.test.tsx` (4), `AppAlert.test.tsx` (5),
`AppToast.test.tsx` (2), `AppDrawer.test.tsx` (5) — 36 testes novos. Nenhum teste existente foi
removido; `OfficialPublicationPanel.test.tsx` teve uma asserção de nome acessível corrigida
(ver acima).

## Validação

- `npm run typecheck`, `npm run test` (475 → 511 testes, incluindo os 36 novos) e `npm run build`
  verdes. `git diff --check` limpo.
- Um timeout isolado em `grid.test.tsx` sob suíte completa em paralelo foi confirmado
  não-determinístico (mesmo padrão já documentado no Checkpoint 1 da spec 12): o teste passa
  isoladamente e sob `--fileParallelism=false` (511/511) — não é regressão desta frente.
- Validação visual real em Chromium headless (mesmo servidor `npm run dev` + `npm run
  server:dev`, sessão de teste local `claudio` já habilitada nesta sessão): telas "Minhas
  equipes", "Escalas" e "Administração" — pixel a pixel idênticas ao estado anterior (mesmas
  classes CSS, mesmo layout), console sem erros/avisos.

## Critérios de aceite

1. Nenhum botão/handler/texto catalogado nas telas migradas foi removido ou alterado.
2. Nenhuma classe CSS de linguagem visual nova — só consolidação de classes já existentes sob
   nomes únicos (`.app-dialog`, `.app-confirm__summary`, `.app-alert--*`, `.app-btn__spinner`,
   `.app-drawer--*`), documentada na seção "Spec 13" de `src/styles.css`.
3. `AppDialog`/`AppConfirm` cobrem Escape, focus trap, foco inicial, devolução de foco e bloqueio
   de scroll — verificado por teste, não por inspeção visual.
4. 511 testes verdes, build verde, nenhuma dependência nova (`package.json` inalterado).
