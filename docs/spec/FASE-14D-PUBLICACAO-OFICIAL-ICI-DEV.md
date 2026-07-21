# FASE 14D — Publicação oficial revisionada `ici-dev`

## Objetivo

Preparar o Dashboard para publicar a primeira escala oficial do workspace `ici-dev`,
consumida pelo botão "MINHA ESCALA" do Escala ICI (KMP). Esta fase entrega o código,
os testes e o runbook — **nenhuma publicação real foi feita**. A rota oficial grava no
Firestore real somente quando alguém, amanhã, ligar `ALLOW_OFFICIAL_FIRESTORE_WRITE=true`
propositalmente.

## Por que agora

O checkpoint FASE 14c-5B do Escala ICI KMP (repositório `EscalaICI-KMP-Lab`) já lê
`workspaces/ici-dev` e diferencia corretamente "Firestore desativado" de "cadastro não
localizado" de "publicação nunca feita neste ambiente" — mas a leitura real está bloqueada
porque `workspaces/ici-dev` nunca foi publicado (e o próprio banco Firestore do projeto
`escala-ici-dev` ainda precisa ser ativado, ação humana fora do escopo de código). Esta
fase do Dashboard resolve o lado da publicação: assim que o banco existir e alguém rodar o
runbook abaixo, o KMP terá o que ler.

## Arquitetura — reaproveitamento da publicação Demo

Reaproveita integralmente a arquitetura já validada em `demo-v1` (FASE 14c-4):
reserva atômica de revisão → escrita em snapshot isolado → ativação do ponteiro →
idempotência por chave → nenhuma promoção do ponteiro em caso de falha intermediária.

```
server/routes/{publish,officialPublish,demoStatus,officialStatus,demoReset,health}.mjs
server/domain/demoPackageValidator.mjs            - validação demo-v1 (inalterado)
server/domain/officialPackageValidator.mjs        - validação ici-dev + vínculo corporativo (novo)
server/domain/demoPublicationPlanner.mjs          - plano imutável demo-v1 (inalterado)
server/domain/officialPublicationPlanner.mjs      - plano imutável ici-dev (novo, workspace fixo no servidor)
server/domain/assertDemoOnlyWritePlan.mjs         - guarda demo-v1 (inalterado)
server/domain/assertOfficialOnlyWritePlan.mjs     - guarda ici-dev (nova, simétrica, não reaproveita a do Demo)
server/domain/executeAtomicPublication.mjs        - reserva→escreve→ativa (generalizado: recebe buildPlan/assertPlan)
server/domain/publicationStore.mjs                - fake em memória (testes, já era workspace-agnóstico)
server/infra/firestorePublicationStore.mjs        - Firestore real (já era workspace-agnóstico, reaproveitado sem mudanças)
```

`executeAtomicPublication` era a única peça acoplada ao Demo: importava
`buildPublicationPlan`/`assertDemoOnlyWritePlan` diretamente. Foi generalizada para
receber `buildPlan`/`assertPlan` como parâmetros — a rota Demo (`publish.mjs`) e a rota de
reset (`demoReset.mjs`) agora passam essas funções explicitamente, e a rota oficial passa
as suas. O `publicationStore` (fake e Firestore real) já recebia `workspaceId` como
parâmetro em todos os métodos e não precisou de nenhuma mudança.

**A guarda `assertDemoOnlyWritePlan` não foi enfraquecida.** `assertOfficialOnlyWritePlan`
é um arquivo simétrico e independente, com `EXPECTED_WORKSPACE_ID = 'ici-dev'` fixo — as
duas guardas continuam rejeitando qualquer plano que não seja exatamente do seu próprio
workspace.

## Contrato oficial

- Ponteiro: `workspaces/ici-dev`.
- Snapshot: `workspaces/ici-dev/revisions/{revision}/{collection}/{documentId}`.
- Coleções: `teams`, `members`, `member_team_memberships`, `team_manager_assignments`,
  `schedule_periods`, `schedule_assignments`, `schedule_change_requests`.
- O workspace efetivo é **sempre** `ici-dev`, decidido inteiramente no servidor
  (`OFFICIAL_WORKSPACE_ID` constante em `officialPublish.mjs`/`officialPublicationPlanner.mjs`).
  Se o corpo da requisição informar outro `workspaceId`, a rota rejeita com
  `WORKSPACE_NOT_ALLOWED` — o cliente nunca escolhe o workspace.
- Nenhuma entidade oficial é gravada em coleção raiz — sempre sob a revisão candidata.

## Endpoints

Um único endpoint com `mode`, no mesmo padrão já usado por `/api/publish` (Demo) — não
três rotas separadas, para seguir exatamente o padrão de rotas existente neste repositório:

- `POST /api/publish/official` com `mode: "DRY_RUN"` — valida pacote, vínculo corporativo e
  revisão esperada; nunca escreve; retorna `VALIDATED` com o plano (contagens, próxima
  revisão). Cobre "preview" e "dry-run" do adendo: a única diferença entre os dois é que o
  preview acontece antes mesmo de chamar o servidor (ver seção Frontend).
- `POST /api/publish/official` com `mode: "COMMIT"` — exige `ALLOW_OFFICIAL_FIRESTORE_WRITE=true`,
  frase de confirmação exata `"PUBLISH OFFICIAL ici-dev"` e `idempotencyKey`. Publica de
  fato (reserva → escreve → ativa), reaproveitando o mesmo mecanismo atômico do Demo.
- `GET /api/official/status` — configuração do Firebase Admin, revisão ativa, e
  **`allowOfficialFirestoreWrite`** (campo novo, exclusivo desta rota — `GET /api/demo/status`
  não foi tocado) para a UI desabilitar o botão de publicar sem precisar tentar e falhar
  primeiro.

Nenhuma rota de reset/exclusão oficial foi criada nesta fase (fora de escopo, adendo
explícito).

## Vínculo da conta corporativa (`lvergani`)

`validateOfficialCorporateLink` (`officialPackageValidator.mjs`) exige, tanto no DRY_RUN
quanto no COMMIT, um `corporateLink: { memberId, teamId, entraTenantId?, entraObjectId?,
email?, login? }` no corpo da requisição, e valida:

- o `memberId` existe no pacote e está `active`;
- o `teamId` existe no pacote;
- existe um `memberTeamMemberships` ativo ligando os dois.

O KMP (`OrganizationRepositories.kt`, `findActiveMemberIds`) resolve `entraTenantId`/
`entraObjectId`/e-mail normalizado **diretamente nos campos do membro revisionado** — não
existe uma coleção `user_links` separada no contrato atual. Esta fase preserva esse
contrato: os campos adicionais do vínculo (quando fornecidos) devem ser gravados nos
próprios campos do documento `members` publicado, não em uma entidade nova. Migrar para
`user_links` fica registrado como dívida técnica futura, não implementada aqui.

Nenhum `entraTenantId`/`entraObjectId`/e-mail real está hardcoded em fixture ou teste
versionado — o formulário do Dashboard (`OfficialCorporateLinkForm.tsx`) deixa esses campos
em branco por padrão, para preenchimento manual amanhã.

## Feature flag

`ALLOW_OFFICIAL_FIRESTORE_WRITE` (padrão: ausente/`false`):

- ausente ou `false`: preview, dry-run, testes e build funcionam normalmente; `GET
  /api/official/status` retorna `allowOfficialFirestoreWrite: false`; a UI mostra
  "Publicação oficial desabilitada neste ambiente." e desabilita o botão "Publicar
  oficialmente"; `mode: "COMMIT"` no servidor retorna `403 OFFICIAL_WRITE_DISABLED` mesmo
  que alguém tente contornar a UI chamando a API diretamente;
- `true`: ainda exige Firebase Admin configurado, frase de confirmação exata e
  `idempotencyKey` — a flag por si só não publica nada.

Não foi habilitada nesta fase.

## Frontend

Área "PUBLICAÇÃO OFICIAL" (`OfficialPublicationPanel.tsx`), visualmente separada do painel
Demo, mostrada sempre que um workspace estiver carregado (mesmo parser/estado de importação
já usado pelo Demo — `demoWorkspaceState.draftPackage`). `toOfficialPackage`
(`src/lib/officialWorkspace/retarget.ts`) clona esse pacote e retitula `workspaceId` para
`ici-dev` em todas as coleções — não existe um pipeline de importação XLS duplicado; a
publicação oficial reaproveita o mesmo pacote já normalizado, só muda o destino.

Fluxo: escolher membro/equipe no `OfficialCorporateLinkForm` → "Executar dry-run" → conferir
contagens → "Publicar oficialmente" abre `OfficialPublishDialog` com um resumo congelado
(snapshot, mesmo padrão do `DemoPublishDialog`) → confirmar. Com a flag desligada, o botão
final fica desabilitado e a mensagem de bloqueio aparece antes de qualquer tentativa.

Erros e avisos nunca são escondidos — `lastError` do hook `useOfficialRemotePublication`
aparece no painel e no modal exatamente como no fluxo Demo.

## O que esta fase não faz

- Não publica nada real (flag desligada, nenhuma escrita foi feita).
- Não implementa reset/exclusão da publicação oficial.
- Não altera `firebase/firestore.rules` nem faz deploy de regras.
- Não cria service account nem copia credenciais para o repositório.
- Não migra o vínculo corporativo para uma coleção `user_links` dedicada.
- Não altera o Dashboard Demo (`demo-v1`) nem o EscalaSOC.

## Testes

Backend (todos com fakes/pacotes literais, nenhum acessa Firestore ou rede real):

- `server-officialPublicationPlanner.test.ts` — workspace sempre `ici-dev` mesmo que o
  pacote informe outro, revisão monotônica, `source: DASHBOARD_OFFICIAL_PUBLISH`.
- `server-assertOfficialOnlyWritePlan.test.ts` — espelha os 9 casos da guarda Demo,
  trocando o marcador de contaminação de `ici` para `demo`.
- `server-officialPackageValidator.test.ts` — validação de pacote (schema, workspace,
  checksum, referência quebrada, contagem) + `validateOfficialCorporateLink` (vínculo
  ausente/inválido/membro inexistente/inativo/equipe inexistente/sem membership ativo/válido).
- `server-publish-official-dryrun.test.ts` — workspace do cliente ignorado/rejeitado,
  vínculo corporativo obrigatório, DRY_RUN não escreve, COMMIT bloqueado sem a flag,
  `demo-v1` continua funcionando no mesmo store usado pelo `ici-dev`.
- `server-publish-official-commit.test.ts` — flag desligada bloqueia e não escreve,
  confirmação errada bloqueia, idempotência (repetição não cria revisão nova), revisão
  monotônica, conflito de revisão, corrida concorrente, **falha em lote intermediário não
  promove o ponteiro** (revisão anterior continua ativa), retry com a mesma
  `idempotencyKey` reutiliza a revisão candidata.
- `server-app.test.ts` — `GET /api/official/status` reflete `allowOfficialFirestoreWrite`.

Frontend:

- `officialWorkspaceRetarget.test.ts` — `toOfficialPackage` retitula sem mutar o original
  nem alterar contagens; `validateCorporateLinkLocally` cobre os mesmos casos do servidor.
- `OfficialPublicationPanel.test.tsx` — botão desabilitado com a flag desligada e mensagem
  visível; habilitado com flag ligada + vínculo válido; desabilitado com vínculo inválido
  mesmo com a flag ligada; modal de confirmação mostra `ici-dev` e o vínculo escolhido.

Validação independente rodada nesta sessão: `npx tsc --noEmit` limpo, `npx vitest run`
(38 arquivos, 323 testes, 0 falhas), `npm run build` (produção) e `node server/index.mjs`
localmente com `curl` real contra `/api/health`, `/api/demo/status`, `/api/official/status`
e `/api/publish/official` — comportamento confirmado fora do harness de teste. `npm run
preview` + captura de tela via Chromium headless confirmou a build de produção carregando
sem erros de console.

## Runbook — primeira publicação oficial (ação humana, não execute hoje)

1. Abrir o Dashboard (`npm run dev` ou o build de produção).
2. Conferir o projeto Firebase configurado (deve ser `escala-ici-dev`).
3. Configurar `GOOGLE_APPLICATION_CREDENTIALS` localmente (fora do Git) apontando para uma
   service account com permissão de escrita no Firestore desse projeto.
4. Manter `ALLOW_OFFICIAL_FIRESTORE_WRITE` ausente/`false` até o passo 10.
5. Importar a planilha XLS oficial (mesmo fluxo de importação já existente).
6. Revisar warnings/erros do preview — não prosseguir com erros pendentes.
7. No painel "PUBLICAÇÃO OFICIAL", selecionar o membro `lvergani` e a equipe correta no
   vínculo corporativo.
8. Clicar "Executar dry-run" e conferir: contagens, próxima revisão candidata, checksum.
9. Registrar a revisão ativa atual antes de publicar (para rollback, ver abaixo).
10. Ligar `ALLOW_OFFICIAL_FIRESTORE_WRITE=true` (só no processo do servidor local, nunca
    versionado).
11. Clicar "Publicar oficialmente" e confirmar no modal.
12. Desligar `ALLOW_OFFICIAL_FIRESTORE_WRITE` de novo imediatamente após a publicação.
13. Verificar `workspaces/ici-dev` no Console Firebase — `publicationRevision` deve ter
    avançado exatamente 1.
14. Abrir o Escala ICI (KMP), tocar "MINHA ESCALA".
15. Confirmar que o membro e a escala corretos aparecem.
16. Testar uma atualização (reabrir o app) para confirmar leitura consistente.
17. Registrar o resultado (revisão publicada, hora, quem confirmou).

### Rollback

Não apague a revisão publicada. Se a publicação nova estiver incorreta, restaure **apenas
o ponteiro** `workspaces/ici-dev.publicationRevision` para o valor anterior anotado no
passo 9, usando uma ferramenta administrativa controlada (Console Firebase ou script
pontual do Admin SDK) — nunca pelo Dashboard, que não implementa rollback automático nesta
fase.

## Dívida técnica registrada

- Vínculo corporativo hoje é gravado diretamente no documento `members`; migração futura
  para `user_links` (se o KMP adotar esse contrato) não foi feita.
- `entraTenantId`/`entraObjectId` reais precisam ser preenchidos manualmente amanhã — não
  há automação de descoberta do objectId nesta fase.
- Sem rota de reset/exclusão oficial — qualquer correção pós-publicação usa o rollback de
  ponteiro descrito acima.
