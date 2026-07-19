# FASE 14c-4 — Publicação segura do workspace Demo (demo-v1) via Express e Firebase Admin

## Objetivo

Publicar o pacote do workspace Demo (`demo-v1`) local (editado no Dashboard, FASE 14c-3) no
Firestore real, através de um backend Express local que usa Firebase Admin. Esta fase
publica **exclusivamente** `demo-v1` — nenhum caminho de código aceita ou escreve dados de
produção (`ici`).

## Arquitetura

```
Dashboard (React/Vite, porta 5173)
  → fetch()
Express local (server/, porta 3001, escuta só em 127.0.0.1)
  → Firebase Admin (server/infra/firebaseAdmin.mjs)
  → Firestore real
```

Camadas do backend:

```
server/routes/{publish,demoStatus,demoReset,health}.mjs   - HTTP
server/domain/demoPackageValidator.mjs                     - validação de pacote/manifesto
server/domain/demoPublicationPlanner.mjs                   - plano imutável de escrita
server/domain/assertDemoOnlyWritePlan.mjs                  - guarda demo-only
server/domain/executeAtomicPublication.mjs                 - reserva→escreve→ativa (COMMIT/reset)
server/domain/publicationStore.mjs                          - fake em memória (testes)
server/infra/firestorePublicationStore.mjs                  - implementação Firestore real
server/infra/resolvePublicationStore.mjs                    - escolhe fake vs. Firestore real
server/infra/firebaseAdmin.mjs                              - inicialização do Admin SDK
server/errors.mjs                                           - PublicationError + mapa de HTTP status
server/app.mjs                                              - CORS, limite de body, handler de erro
```

Nenhuma lógica de Firestore vive nas rotas; nenhum código React roda no servidor; o Firebase
Admin nunca é importado no frontend.

## Segurança

- `workspaceId` é validado em três camadas independentes: na rota (`publish.mjs`,
  `demoReset.mjs`), no validador de pacote (`demoPackageValidator.mjs`) e no guard de plano de
  escrita (`assertDemoOnlyWritePlan.mjs`, que também rejeita qualquer caminho contendo `ici`
  no ID). Só `demo-v1` passa em todas as três.
- Não existe variável `ALLOW_PRODUCTION_FIRESTORE_WRITE` nem qualquer flag que libere
  produção — produção está estruturalmente bloqueada, não apenas por configuração.
- A escrita real só ocorre com `ALLOW_DEMO_FIRESTORE_WRITE=true` **e** confirmação explícita
  no corpo da requisição (`PUBLISH DEMO demo-v1` / `RESET DEMO demo-v1`).

## Credenciais

- Firebase Admin usa `GOOGLE_APPLICATION_CREDENTIALS` (arquivo de service account **fora do
  repositório**) ou Application Default Credentials já configuradas na máquina.
- Nenhuma credencial é lida no frontend, nenhuma é copiada para o repositório, nenhuma é
  criada automaticamente.
- Ausência de credenciais produz `FIREBASE_ADMIN_NOT_CONFIGURED` (HTTP 503) sem crash e sem
  expor caminho ou conteúdo da credencial — nem na resposta HTTP, nem nos logs
  (`server/infra/firebaseAdmin.mjs` loga só `err?.message`, nunca a configuração completa).

## Loopback e restrições do servidor

- Host padrão: `127.0.0.1` (`server/config.mjs`); mudar exige `DASHBOARD_API_HOST` explícito.
- CORS restrito a uma lista explícita de origens (`DASHBOARD_ALLOWED_ORIGINS`, padrão
  `http://127.0.0.1:5173,http://localhost:5173`), sem wildcard.
- Métodos HTTP limitados a `GET, POST, OPTIONS`.
- Corpo JSON limitado a 5 MB por padrão (`DASHBOARD_MAX_JSON_BODY_BYTES`), com erro tratado
  (`entity.too.large` → `API_UNAVAILABLE`, 413) em vez de crash.
- Cada requisição recebe um `X-Request-Id`, propagado aos logs e ao corpo de erro.

## Endpoints

| Método | Caminho              | Descrição |
|--------|----------------------|-----------|
| GET    | `/api/health`        | Liveness simples (`{ status: 'ok' }`). |
| GET    | `/api/demo/status`   | Metadados sanitizados: configurado, revisão ativa, status. |
| POST   | `/api/publish`       | `mode: 'DRY_RUN' \| 'COMMIT'` — valida e, em `COMMIT`, publica. |
| POST   | `/api/demo/reset`    | Restaura a fixture oficial como nova revisão. |

`/api/publish` é genericamente nomeado mas só aceita `workspaceId: 'demo-v1'` — qualquer
outro valor recebe `403 WORKSPACE_NOT_ALLOWED` antes de qualquer outra validação.

## Dry-run

Valida pacote, workspace, checksum, referências internas e contagens; compara com a revisão
ativa atual (lida do Firestore real — por isso um dry-run completo também exige Firebase
Admin configurado, ver "Limitações" abaixo); calcula a próxima revisão e as contagens; **não
escreve nada** (`writesPerformed: 0`).

## Commit e modelo de publicação atômica

`server/domain/executeAtomicPublication.mjs` implementa, para `COMMIT` e para o reset:

1. `reserveRevision` — **uma única transação Firestore** (`firestorePublicationStore.mjs`):
   lê a revisão ativa do workspace e busca um `publication_record` existente com a mesma
   `idempotencyKey`, tudo dentro da mesma transação; se a revisão ativa não bater com
   `expectedActiveRevision`, ou se já existir uma reserva para a próxima revisão (colisão de
   concorrência), a transação falha com `PUBLICATION_REVISION_CONFLICT` (409) — nunca
   sobrescreve silenciosamente.
2. `writeRevisionDocuments` — grava as entidades em batches (até 400 operações por batch,
   com margem abaixo do limite do Firestore).
3. `activateRevision` — transação que **revalida** a revisão anterior antes de escrever, e só
   então ativa `workspaces/demo-v1` e marca o `publication_record` como `ACTIVE`. Só depois de
   todas as escritas de dados terem terminado.
4. Falha em qualquer passo → `markPublicationFailed` (status `FAILED`, motivo sanitizado) e a
   revisão anterior **continua ativa**. O ponteiro nunca é atualizado antes das escritas
   terminarem, e a revisão anterior nunca é apagada.

## Idempotência e concorrência

- Cliente envia `idempotencyKey` (o Dashboard gera
  `demo-v1:${sha256(pacote)}:${localDraftRevision}` para publish, e
  `reset-demo-v1:${revisãoAtiva}` para reset).
- Uma chave já `ACTIVE` retorna o mesmo resultado sem nova escrita; uma chave ainda
  `PREPARING` (publicação em andamento) retorna `409 IDEMPOTENCY_CONFLICT` em vez de
  disparar uma segunda escrita real; uma chave `FAILED` pode ser retentada.
- Todo esse controle acontece **dentro de uma única transação** de `reserveRevision` — não há
  janela entre "ler a revisão atual" e "reservar a próxima" onde duas requisições concorrentes
  possam colidir silenciosamente (ver histórico de revisão de código abaixo).

## Reset remoto

`POST /api/demo/reset` carrega `fixtures/demo/demo-v1-publication-package.json` e
`demo-v1-manifest.json` **do disco do servidor** (`server/routes/demoReset.mjs`,
`loadCanonicalDemoFixture`) — qualquer `packageRaw`/`manifestRaw` enviado pelo navegador é
ignorado (a rota nem lê esses campos do corpo). Usa o mesmo `executeAtomicPublication`, então
herda toda a atomicidade/idempotência/concorrência do publish. A revisão só avança (nunca
volta), o histórico de revisões anteriores é preservado, e o workspace de produção nunca é
tocado (o loader só conhece o caminho fixo de `fixtures/demo/`).

## Coleções e documentos

`workspaces`, `members`, `teams`, `member_team_memberships`, `team_manager_assignments`,
`schedule_periods`, `schedule_assignments`, `schedule_change_requests`, `publication_records`
(Spec 57 do KMP). Cada entidade escrita carrega `workspaceId: 'demo-v1'`,
`publicationRevision` atribuída pelo servidor, e `schemaVersion`. IDs determinísticos da
fixture/rascunho são preservados (nunca regenerados).

## Timestamps

`publishedAt`/`activatedAt` usam `FieldValue.serverTimestamp()` do Firestore — nunca o
horário do navegador. Timestamps fictícios já presentes na fixture (cenário) permanecem como
dado de cenário, sem confusão com o timestamp real da publicação.

## Erros

Códigos tipados (`server/errors.mjs`) com mapeamento fixo para HTTP status — ver tabela na
spec original da fase. Nenhuma resposta HTTP inclui stack trace; erros inesperados viram
`Erro interno.` genérico.

## Logs

Logs estruturados por evento (`demo_publish_commit_failed`, `demo_reset_failed`,
`demo_reset_fixture_load_failed`) contêm só `requestId`, `workspaceId`, `revision`,
`errorMessage`/`errorCode` (nunca o `Error` bruto, nunca o pacote, nunca nomes/logins/e-mails,
nunca caminho de arquivo — corrigido durante a revisão do checkpoint 5 depois que uma
revisão independente apontou que `err.message` de falhas de `fs.readFile` podia vazar o
caminho absoluto da fixture no servidor).

## Interface do Dashboard

Dentro do modo "Ambiente de Demonstração" (só ali — fora dele, nenhuma chamada ao backend
Express acontece):

- **Painel "Publicação do Ambiente de Demonstração"** (`DemoPublicationPanel.tsx`): revisão
  local, revisão ativa no Firebase, alterações, status do backend, status Firebase Admin, e
  os três botões (Validar publicação / Publicar no Firebase / Restaurar Demo publicado).
- **Modal de publicação** (`DemoPublishDialog.tsx`): mostra workspace, revisão ativa, próxima
  revisão, contagens e "Dados de produção afetados: 0" — nunca o texto "Publicar produção".
- **Modal de reset remoto** (`DemoRemoteResetDialog.tsx`): componente **separado** do restore
  local (que continua usando `window.confirm`, sem tocar o Firebase) — frase clara
  diferenciando as duas ações.
- Cliente HTTP novo: `src/hooks/useDemoRemotePublication.ts`, calcula checksum
  (`crypto.subtle`, reaproveitando `sha256Hex` de `validation.ts`) e `idempotencyKey` no
  navegador; nunca importa `firebase-admin`.
- **Snapshot congelado**: ao abrir o modal de publicação, o Dashboard revalida o rascunho
  atual e congela `{ draftPackage, localDraftRevision, validation, diff }` num único estado;
  o modal e o `COMMIT` de fato enviado usam sempre esse mesmo snapshot, nunca o estado "vivo"
  do rascunho — evita que uma edição feita entre "Validar" e "Publicar" deixe o modal
  mostrando números diferentes do que será realmente publicado (achado de uma revisão
  independente, corrigido antes do commit do checkpoint 6).

## Revisão independente (codex review)

Cada checkpoint passou por pelo menos uma rodada de revisão independente antes do commit.
Achados reais encontrados e corrigidos:

- **Checkpoint 4** (3 CRÍTICOS): condição de corrida entre ler a revisão ativa e reservar a
  próxima (duas requisições `COMMIT` concorrentes podiam sobrescrever uma à outra
  silenciosamente); `reserveRevision` sem transação/precondição de existência; idempotência
  que só reconhecia registros `ACTIVE`, ignorando `PREPARING` (permitindo dupla escrita em
  duplo clique). Mais 3 IMPORTANTES: `activateRevision` sem revalidar a revisão anterior;
  `console.error(err)` logando o erro bruto; suíte sem teste de concorrência real. Todos
  corrigidos antes do commit, com dois testes novos de concorrência (`Promise.all` + hooks de
  atraso determinísticos, sem `setTimeout` solto).
- **Checkpoint 5**: 1 MENOR (mensagem de erro do `readFile` podia vazar caminho absoluto no
  log) — corrigido.
- **Checkpoint 6**: 1 IMPORTANTE (staleness do modal de confirmação em relação ao rascunho
  atual) — corrigido com o snapshot congelado descrito acima; 1 MENOR (teste que não montava
  o `App` real) — substituído por um teste de integração real
  (`tests/demoPublicationRemoteDialogs.test.tsx`).

Nenhum achado crítico ou importante ficou pendente no momento do commit de cada checkpoint.

## Teste real no Firebase

**Não executado nesta sessão.** Este ambiente não tem `GOOGLE_APPLICATION_CREDENTIALS`,
Application Default Credentials do gcloud, nem um `.env` real configurado — confirmado por
inspeção direta do ambiente antes de escrever esta seção. O backend, a suíte de testes
(fake store + testes de concorrência), o `typecheck`, o `build` e a validação manual no
navegador (contra o backend real, sem Firebase configurado) foram executados e confirmam:

- `GET /api/health` responde `{ status: 'ok' }`.
- `GET /api/demo/status` responde `FIREBASE_ADMIN_NOT_CONFIGURED` de forma sanitizada.
- O Dashboard mostra "Status Firebase Admin: Não configurado" e desabilita corretamente
  "Publicar no Firebase" e "Restaurar Demo publicado".
- O restore local (`window.confirm`) nunca abre o modal de reset remoto.

**Código e testes concluídos. Publicação real bloqueada por
`FIREBASE_ADMIN_NOT_CONFIGURED`.** Esta fase não pode ser declarada totalmente concluída sem
uma publicação real bem-sucedida contra um projeto Firebase de fato — isso fica para quando
credenciais de um projeto de desenvolvimento/teste estiverem disponíveis.

## Limitações conhecidas

- Um dry-run (`GET` conceitual via `POST mode=DRY_RUN`) hoje também exige Firebase Admin
  configurado, porque precisa ler a revisão ativa real do Firestore para calcular a próxima
  revisão e comparar com `expectedActiveRevision` — não há um modo de "validação pura" (só
  schema/checksum/referências) que dispense o Admin. Confirmado na validação manual: com
  Admin não configurado, "Validar publicação" retorna `503 FIREBASE_ADMIN_NOT_CONFIGURED` em
  vez de validar parcialmente. Isso é uma limitação de design, não um bug — considerar em
  fase futura se vale a pena separar "validação de schema" (sem Admin) de "comparação de
  revisão" (com Admin).
- Não existe Firestore Emulator configurado neste repositório; a suíte automatizada usa o
  fake em memória para toda a lógica de domínio/concorrência, e a implementação Firestore
  real (transações, `tx.create`, catch-all de erro) só foi validada por leitura/revisão de
  código e pela validação manual do caminho "Admin não configurado" — não por execução real
  contra Firestore (real ou emulado). A primeira publicação real servirá também como a
  primeira validação de fato do código Firestore.
- Não há teste automatizado de rebalanceamento de chunking real (a fixture atual tem menos
  de 400 operações); o código de chunking existe (`MAX_BATCH_WRITES = 400`) mas nunca foi
  exercitado com mais de um batch.

## Produção permanece bloqueada

- Nenhuma variável `ALLOW_PRODUCTION_FIRESTORE_WRITE` existe no código.
- Todo plano de escrita passa por `assertDemoOnlyWritePlan`, que rejeita qualquer
  `workspaceId` diferente de `demo-v1`, qualquer coleção fora da lista permitida, e qualquer
  ID contendo `ici`.
- `productionWritesPlanned = 0` e `productionWritesPerformed = 0` por construção: não existe
  nenhum caminho de código nesta fase capaz de gerar um plano com um workspace de produção
  (a prova vem da própria estrutura do plano de escrita, não de uma listagem de dados reais).

## Próxima fase (14c-5)

Consumir a revisão ativa do workspace `demo-v1` a partir do app real (KMP), lendo somente a
revisão marcada como ativa em `workspaces/demo-v1`, nunca revisões `PREPARING`/`FAILED`.
