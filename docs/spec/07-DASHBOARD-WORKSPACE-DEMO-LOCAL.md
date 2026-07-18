# Workspace Demo local (`demo-v1`) importado do EscalaICI-KMP-Lab

## Fonte canônica e espelho gerado

O cenário organizacional `demo-v1` (times, membros, vínculos de gestão, escala e solicitações) não é gerado neste repositório. A fonte de verdade é o repositório irmão `EscalaICI-KMP-Lab`, FASE 14c-2 (`fixtures/demo/demo-v1-seed.json` + `scripts/generate_demo_v1.py`). Este Dashboard mantém apenas um espelho estático desses artefatos:

```text
fixtures/demo/demo-v1-publication-package.json   pacote completo (times, membros, escala, solicitações)
fixtures/demo/demo-v1-manifest.json              contagens + SHA-256 do pacote
contracts/organization-approval-v1.schema.json   contrato JSON (mesmo do KMP)
```

`fixtures/demo/README.md` marca o diretório como espelho gerado, nunca editável à mão. `scripts/sync-demo-v1.mjs` (`npm run demo:sync`) refaz esse espelho lendo a raiz do repositório KMP informada via `--source-root=/caminho` ou a variável `ESCALAICI_KMP_ROOT` — nenhum caminho absoluto pessoal fica hardcoded no script. Antes de copiar, o script valida (funções exportadas `validateSyncPayload`/`validateRequiredSourceFiles`, testadas em `tests/sync-demo-v1.test.ts`): os 3 arquivos de origem existem; pacote/manifesto/contrato são JSON válido; `workspaceId` é `demo-v1` em todo o pacote, inclusive item a item de cada array; o SHA-256 do pacote confere com o manifesto; a revisão do manifesto confere com a do pacote; as contagens do manifesto batem com o tamanho real de cada array; destino nunca é igual à origem. Qualquer falha aborta sem copiar nada.

Este repositório não tem — e não deve ganhar — um segundo gerador de dados de escala. Alterar o cenário Demo significa editar o seed no repositório KMP e rodar `npm run demo:sync` novamente aqui.

## DTOs, validação e adapters

`src/lib/demoWorkspace/dto.ts` espelha a forma exata do pacote (times, membros, `memberTeamMemberships`, `teamManagerAssignments` com as 6 permissões sempre explícitas e os 6 papéis do contrato, `scheduleChangeRequests`, `schedulePeriods`, `scheduleAssignments`, `publicationRecords`).

`src/lib/demoWorkspace/validation.ts` expõe `validateDemoPublicationPackage(packageRaw, manifestRaw)`, assíncrona (usa `crypto.subtle` do navegador para o SHA-256), retornando um resultado tipado: `VALID`, `INVALID_JSON`, `UNSUPPORTED_SCHEMA`, `WORKSPACE_MISMATCH`, `CHECKSUM_MISMATCH`, `BROKEN_REFERENCE` ou `INVALID_COUNTS`, sempre com mensagem amigável (nunca stack trace). Verifica schema/versão, workspace (inclusive mistura por item de array), checksum, todas as referências entre entidades (membership→membro/time, vínculo de gestão→membro/time, período→time, atribuição→período/time/membro, solicitação→membro/time/período/atribuição) e as contagens do manifesto.

`src/lib/demoWorkspace/scheduleAdapter.ts` faz a ponte com a grade já existente (`ScheduleGrid`/`SocPlanner`), sem duplicá-la:

- `demoPackageToScheduleState(pkg, teamId)` converte o pacote + um time num `ScheduleState` comum: técnicos são só os membros com pelo menos uma `scheduleAssignment` naquele time (o gestor, que não tem nenhuma, nunca aparece como técnico), ordenados por id para estabilidade; `dates` recebe o intervalo real do período (26/07 a 25/08/2026, atravessando dois meses, do mesmo jeito que o ciclo 25–26 do Plantão COSI já faz via `state.dates`); turnos mapeiam para os `ShiftId` já existentes (`manha`/`tarde`/`comercial`/`folga`/`ferias`/`afastamento`, com `custom` como reserva); `origin: 'demo-workspace-package'` (um valor novo, irmão de `demo-template`/`empty-template`/`import`/`manual`, nunca confundido com o Test Drive) e `demoTeamId` guardam qual time está projetado. SOC recebe `visualGrouping: 'operational-shift'` automaticamente quando o time tem mais de um turno de trabalho distinto (rotativo); Segurança, com um único turno comercial, não recebe.
- `applyScheduleStateToPackage(pkg, state, teamId)` faz o caminho inverso: turno editado na grade vira `assignmentType`/`shiftName`/`startTime`/`endTime` na `scheduleAssignment` correspondente (mesmo id, localizada por membro+data), preservando por referência tudo o que não foi tocado (outros times, membros, vínculos de gestão, períodos, solicitações). Não lida com adicionar/remover técnico — só com o valor do turno.

## Estado do workspace Demo e persistência

`src/hooks/useDemoWorkspace.ts` guarda `baselinePackage` (nunca mutado, sempre recarregado do espelho bundlado) e `draftPackage` (mutável), mais `dirty`, `sourcePublicationRevision` (fixa, vinda do pacote) e `localDraftRevision` (contador local, começa em 1). Persiste só o rascunho em `localStorage`, chave própria `escala-dashboard:demo-workspace:v1` — isolada da chave do Test Drive (`escala-dashboard:test-drive:v1`) e da chave de rascunho real (`escala-dashboard:rascunho:v1...`). `load({ resumePersisted: true })` retoma o rascunho salvo só se a revisão de origem do pacote bater com a do rascunho persistido; caso a fixture tenha mudado de revisão, o rascunho antigo é descartado e o carregamento recomeça do zero. `restore()` volta `draftPackage` a uma cópia profunda do baseline, zera a revisão local para 1, limpa `dirty` e remove o rascunho persistido — idempotente. `exit()` só limpa o estado em memória do hook, sem apagar o rascunho local (uma nova entrada no workspace Demo pode continuar de onde parou).

Em `App.tsx`, o terceiro botão da tela inicial ("Ambiente de Demonstração") chama `load` e projeta o primeiro time (ordem alfabética de id) na grade via `history.reset`. Um botão condicional "Continuar Ambiente de Demonstração" aparece quando há rascunho persistido, no mesmo padrão já usado por "Continuar Test Drive"/"Continuar rascunho salvo". Os quatro pontos que já verificavam `schedule.origin === 'demo-template'` (autosave, salvar rascunho manual, `FirebaseDashboardBar`, apagar rascunho) ganharam um ramo irmão para `'demo-workspace-package'` — o autosave genérico não faz nada para esse origin (a persistência é do hook), e o botão de apagar rascunho fica oculto (a ação equivalente é "Restaurar cenário de demonstração").

## Interface

`DemoWorkspaceBanner` mostra, sempre que `schedule.origin === 'demo-workspace-package'`, o aviso permanente "AMBIENTE DE DEMONSTRAÇÃO", workspace e revisão da fixture, e, quando `dirty`, "Alterações locais não publicadas" (nunca "Publicado" — não há Firebase nesta fase). `DemoScenarioSummary` mostra contagens compactas (times, membros, responsáveis, períodos, atribuições, solicitações, revisão de origem/local, "Alterações locais: SIM/NÃO") e, quando `dirty`, a prévia do diff.

Um seletor de abas troca entre os dois times (`history.reset` com o pacote atual, o que reinicia desfazer/refazer daquele time — mesmo comportamento já existente ao trocar de escala carregada). `DemoManagerAssignmentsDialog` edita localmente os vínculos de gestão: seleção de time e responsável sempre a partir de listas já cadastradas no pacote (nunca texto livre de login), os 6 papéis e as 6 permissões do contrato, vigência e status; rejeita duplicar o mesmo vínculo ativo (time+responsável+papel) mas permite o mesmo responsável em times diferentes — o cenário real desta fixture, em que o mesmo gestor administra as duas equipes. `DemoChangeRequestsDialog` lista as 3 solicitações (contagem por status, solicitante, equipe, tipo, motivo, responsável designado, resolução quando houver) com os botões Aprovar/Recusar sempre desabilitados e a nota "Aprovação será habilitada na FASE 14c-7" — nenhuma aprovação real nesta fase.

`src/lib/demoWorkspace/diff.ts` (`diffDemoPackages`) compara `baselinePackage`/`draftPackage` por id determinístico (nunca por índice de array), reportando incluídos/alterados por coleção e uma contagem agregada de exclusões — usado pela prévia do resumo.

## Salvar, exportar e restaurar

"Salvar rascunho" (o mesmo botão já existente) chama `saveLocalRevision()` quando o workspace Demo está ativo, incrementando a revisão local sem tocar a revisão de origem e sem qualquer chamada a Firebase ou Express. "Exportar pacote Demo" (`src/lib/demoWorkspace/export.ts`) baixa um JSON `demo-v1-local-revision-NNN.json` contendo um envelope `{ exportMode: 'LOCAL_DRAFT', localDraftRevision, exportedAt, package }` — um envelope separado, não um campo novo dentro do próprio pacote, porque o contrato tem `additionalProperties: false` na raiz. "Restaurar cenário de demonstração" pede confirmação nativa do navegador, depois chama `restore()` e recarrega a grade do time atualmente aberto a partir do baseline, limpando desfazer/refazer; nunca toca no rascunho real nem no Test Drive.

## Isolamento e segurança

Nenhuma chamada a Firebase, Firestore ou a um backend Express nesta fase — tudo roda em memória e `localStorage`. Nenhuma credencial nova, nenhum MSAL no Dashboard. Os dados do pacote já são fictícios desde a origem (KMP, `example.invalid`); este repositório não adiciona nem precisa de nenhum dado real para funcionar.

## Achado de validação: StrictMode e desfazer/refazer

Durante a validação manual em `npm run dev`, desfazer uma edição de célula (em qualquer fluxo — Test Drive, importação normal ou o workspace Demo desta fase) não revertia visualmente a célula, embora os botões Desfazer/Refazer trocassem de estado corretamente. A causa é `src/lib/history.ts`: as funções `undo`/`redo`/`set` mutam `past.current`/`future.current` (refs) dentro do próprio *updater* passado a `setState`, e o React 18 `StrictMode` (ativo em `src/main.tsx`) invoca esse *updater* duas vezes em desenvolvimento para detectar efeitos colaterais — a segunda chamada encontra a pilha já drenada pela primeira e descarta o valor esperado. **Confirmado que o problema é exclusivo do modo desenvolvimento**: refeito o mesmo teste contra o build de produção (`npm run build` + `npm run preview`), desfazer/refazer funcionam corretamente. Também não afeta a suíte automatizada, que renderiza `<App />` sem `StrictMode`. Esse comportamento é anterior a esta fase (afeta igualmente o Test Drive) e não foi alterado aqui — registrado apenas como achado de validação.

## Testes

`tests/sync-demo-v1.test.ts`, `tests/demoWorkspace.test.ts` (validação, adapter de leitura, adapter reverso), `tests/useDemoWorkspace.test.ts`, `tests/DemoManagerAssignmentsDialog.test.tsx`, `tests/demoWorkspaceDiff.test.ts`, `tests/demoWorkspaceExport.test.ts` — cobrindo payload válido/inválido em cada categoria de erro, contagens e referências reais do pacote espelhado, conversão pacote↔grade nos dois sentidos preservando IDs e referências por igualdade estrutural/de referência, isolamento de chave do `localStorage`, edição/duplicação/permissão de responsáveis, e o envelope de exportação. `npm run check` (typecheck + suíte completa) e `npm run build` permanecem verdes.

## Limitações conhecidas e próxima fase

Não há aprovação/recusa funcional de solicitações (fica para uma fase futura, já sinalizada na interface). Não há publicação real (Firebase/Express) desta fase — o pacote exportado é só um artefato local. O adapter reverso não cobre adicionar/remover técnico da grade enquanto o workspace Demo está ativo (fora do escopo desta fase; a edição de turno já cobre o caso de uso pedido). O bug de desfazer/refazer sob `StrictMode` em desenvolvimento (seção acima) é pré-existente e não foi corrigido aqui, por afetar `src/lib/history.ts` de forma transversal a todos os fluxos de edição do Dashboard.
