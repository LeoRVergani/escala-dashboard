# FASE 14f — Dashboard: origem oficial `ici-dev`, perfis administrativos e leitura oficial

## Contexto e problema

A Publicação Oficial (FASE 14D, `OfficialPublicationWizard.tsx`) já está corretamente
protegida contra dados Demo: `eligibleOfficialMembers`/`eligibleOfficialTeams`
(`src/lib/officialWorkspace/retarget.ts`) filtram qualquer `id` contendo `"demo"`.
O problema é que a **única** origem de `officialPackage` hoje é
`toOfficialPackage(demoWorkspaceState.draftPackage)` — e todo `id` do fixture
`demo-v1` contém `"demo"`. `toOfficialPackage` só reescreve `workspaceId`, nunca
`id`s. Resultado: `hasEligibleData` é sempre `false`, o wizard nunca tem
membros/times elegíveis, e os passos 2/4/5/6/7 ficam inalcançáveis. Isso é
comportamento correto e documentado (spec 08) — não é bug, é ausência de uma
origem de dados genuinamente oficial.

Além disso, esta fase incorpora um requisito complementar recebido durante a
execução: perfis administrativos com verificação no backend, um modo de
bootstrap local para o primeiro administrador (Claudio) sem depender do MSAL
completo, e um gateway de leitura da publicação oficial ativa (para editar
uma escala já publicada).

**Achado de auditoria relevante**: `server/routes/officialPublish.mjs` e as
demais rotas **não verificam identidade do chamador hoje** (nenhum
`verifyIdToken`, nenhum header `Authorization` lido) — a autorização de
escrita depende só da flag `ALLOW_OFFICIAL_FIRESTORE_WRITE` + confirmação
textual, nunca de quem está chamando. Como a escrita oficial passa pelo
Firebase Admin SDK (que ignora `firestore.rules`), isso é uma lacuna real de
autorização no backend, não só um detalhe — corrigida nesta fase.

## Não fazer (preservar)

- `firestore.rules` **não é implantado** nesta fase (já não era antes). As
  regras deste arquivo continuam sendo só para o Emulator; a leitura oficial
  nova (ver seção 5) é servida por uma rota Express nova usando Admin SDK,
  não por regra de cliente direta — evita precisar de deploy de regras.
- `ALLOW_OFFICIAL_FIRESTORE_WRITE` continua `false`/ausente neste ambiente;
  nenhum COMMIT real é executado nesta fase.
- AppShell, 8 seções, temas, modo compacto, grade, planejador, undo/redo,
  Test Drive, Ambiente Demo, Histórico/Status, Error Boundary — inalterados
  estruturalmente; só o wizard oficial ganha uma nova origem de dados, e uma
  nova seção "Administração" é adicionada ao menu.

## 1. Origem oficial — importação/criação → pacote `ici-dev` elegível

Novo módulo `src/lib/officialWorkspace/buildFromImport.ts` (nome sugerido,
ajustável pela execução) com uma função central:

```ts
function buildOfficialPackageFromSchedule(
  schedule: ScheduleState,       // já existe — mesmo tipo produzido por ScheduleTemplateWizard/parser XLS
  team: { id?: string; name: string },
  members: Array<{ displayName: string; login: string; entraTenantId?: string; entraObjectId?: string }>
): DemoPublicationPackage
```

Fonte do `ScheduleState`: reaproveitar o que já existe — `ScheduleTemplateWizard`
(`mode: 'empty'`, criação manual) e o parser XLS/XLSX já usado por
`parser.test.ts`/`real-layouts.test.ts` (localizar o parser real via grep,
não recriar). Esta função NÃO lê nada do `demo-v1`.

IDs determinísticos (requisito explícito da missão):
- `teamId` = `slugify(team.name)` normalizado (minúsculas, sem acento, sem
  espaço, hífen) prefixado por área (`soc-`, `cosi-plantao-`,
  `service-desk-n1-`, conforme a hierarquia informada) — nunca contém a
  substring `demo`.
- `memberId` = `slugify(login normalizado)` (login em minúsculas, trim,
  domínio incluso ou não conforme já usado em `responsibleLogin`) — estável
  entre reimportações do mesmo membro (mesmo login → mesmo id sempre).
- Normalização de nome usa a mesma função de normalização já usada em
  `responsibleLogin`/`filterManagedTeams` (localizar e reusar — não duplicar
  lógica de trim/lowercase/acento).
- Reimportar a mesma pessoa/time deve **atualizar** o registro existente
  (mesmo id), não duplicar por causa de maiúscula/espaço/acento diferente.
- Preservar a separação de hierarquias já existente no domínio (SOC/NOC,
  Plantão COSI, Service Desk N1) — M1/M2/M3/M4 só podem ser atribuídos a
  membros de Técnico de TI N1/Service Desk; não misturar prefixos de time
  entre hierarquias diferentes na geração do `teamId`.

Wizard (`OfficialPublicationWizard.tsx`, passo 1 "Origem da escala"): hoje só
mostra o pacote derivado do Demo. Adicionar duas novas origens selecionáveis
antes do passo 1 (ou como parte dele):
- **"Escala importada"** (XLS/XLSX) → `buildOfficialPackageFromSchedule` com
  o schedule vindo do parser.
- **"Escala criada no Dashboard"** → mesmo builder, schedule vindo de
  `ScheduleTemplateWizard(mode: 'empty')`.
- **"Pacote Demo (bloqueado)"** → mantém o comportamento atual
  (`toOfficialPackage(draftPackage)`), permanece inelegível — não remover
  essa opção, só deixar claro visualmente que ela é bloqueada por design
  (rótulo/badge, não um erro).

O restante do wizard (revisão, vínculo corporativo, dry-run, plano, COMMIT)
não muda de comportamento — só passa a receber um `officialPackage` que pode
realmente ter `eligibleMembers`/`eligibleTeams` não-vazios.

## 2. Perfis administrativos

Estende o modelo já existente (`UserLink`/`system_admins`), não recria:

```ts
// src/types.ts — estende UserLink existente
interface UserLink {
  firebaseUid: string
  login: string
  active: boolean
  role: 'USER' | 'SCHEDULE_ADMIN'   // NOVO campo; ausente/'USER' = comportamento atual preservado
  teamIds?: string[]                 // já existe — times que um SCHEDULE_ADMIN administra
  primaryTeamId?: string
  updatedAt?: string
  grantedBy?: string                  // NOVO — login de quem concedeu, para auditoria
  grantedAt?: string                  // NOVO
}
```

`SYSTEM_ADMIN` continua sendo `system_admins/{uid}` (documento separado,
já existente) — não fundir com `role` do `UserLink`, para não regredir a
checagem já testada de `isSystemAdmin`.

Hierarquia de permissão:
- `USER` (ou `role` ausente): só visualização e solicitação de troca — 
  comportamento idêntico ao atual para quem não é admin.
- `SCHEDULE_ADMIN`: edita/publica apenas os times em `teamIds`.
- `SYSTEM_ADMIN` (`system_admins` ativo): todas as ações de `SCHEDULE_ADMIN`
  em todos os times, mais: cadastrar administrador, alterar papel, atribuir
  times, ativar/desativar acesso, promover outro usuário a `SYSTEM_ADMIN`.

Regra dura: nunca permitir que a última conta em `system_admins` com
`active: true` seja removida ou desativada (nem pela própria conta, nem por
outra) — validar tanto no backend quanto na regra do Firestore.

**Verificação no backend (a lacuna encontrada na auditoria)**: toda rota
Express que hoje só verifica a flag `ALLOW_OFFICIAL_FIRESTORE_WRITE` passa a
também verificar identidade e papel do chamador:
- Middleware novo (`server/infra/verifyCaller.mjs` ou similar) lendo
  `Authorization: Bearer <idToken>` e validando via
  `admin.auth().verifyIdToken(idToken)` (Firebase Admin SDK, já inicializado
  em `firebaseAdmin.mjs` — reusar a mesma instância, não criar uma segunda).
- Resolve o `role`/`teamIds`/`isSystemAdmin` lendo `user_links/{uid}` e
  `system_admins/{uid}` via Admin SDK (que ignora `firestore.rules`, então
  funciona independente de regra deployada).
- Rotas de publicação oficial (`officialPublish.mjs`) e a nova rota de
  leitura (seção 5) exigem `isSystemAdmin || (role==='SCHEDULE_ADMIN' &&
  teamId in teamIds)` para o `teamId` do pacote sendo publicado/lido; se
  falhar, HTTP 403 com erro tipado (`FORBIDDEN_TEAM`/`FORBIDDEN_ROLE`), nunca
  stack trace.
- Rotas administrativas novas (seção 3) exigem `isSystemAdmin` sempre.

`firestore.rules` (Emulator apenas, não deployado): atualizar `canManage`
para considerar `role=='SCHEDULE_ADMIN' && teamId in teamIds` além do já
existente `responsibleLogin` (mantém compatibilidade retroativa, não remove
o mecanismo antigo, só adiciona a via nova).

## 3. Bootstrap local de desenvolvimento (Claudio)

Objetivo: permitir testar o fluxo administrativo completo sem depender do
cadastro MSAL/Entra + `user_links` real ainda não provisionado.

- Nova rota `server/routes/devLogin.mjs`, montada **somente quando**
  `config.devLocalAuthEnabled === true` E `config.nodeEnv !== 'production'`
  (dupla trava — variável local explícita E ambiente não-produtivo; falha
  de qualquer uma desativa a rota inteira, não só o botão).
- Lista de logins administrativos permitidos para bootstrap vem de uma
  variável de ambiente do servidor (`DEV_LOCAL_ADMIN_LOGINS`, CSV), nunca
  hardcoded no código nem versionada com valor real (só em `.env.example`
  com placeholder).
- `POST /api/dev/login { login }`: se `login` (normalizado) está na lista
  permitida, gera uma sessão de teste assinada pelo servidor (ex.:
  `jsonwebtoken` já pode ser dependência, ou um HMAC simples com segredo de
  servidor lido de env — decisão de implementação, mas a validação é sempre
  no servidor, nunca confiando em o cliente apenas "digitar um login") e
  devolve via cookie `httpOnly`, `sameSite=strict`, `secure` (quando HTTPS).
  Fora dessas condições (login não listado, flag desligada, produção),
  retorna 403/404 e não cria sessão.
- Frontend: quando uma sessão de teste está ativa, todo componente que hoje
  mostra a identidade do responsável exibe também um selo visível
  **"MODO DE TESTE"** (cor de alerta, não a mesma cor de sessão real) — nunca
  omitir essa indicação.
- Vínculo posterior à identidade MSAL real: a sessão de teste grava
  `user_links/{devSessionId}` com um campo `pendingRealLink: true`; quando o
  mesmo login autenticar de verdade via `signInWithMicrosoft`, o backend
  (rota de vínculo, a criar) localiza esse registro por `login` normalizado
  e o funde (`tenantId`/`objectId`/`firebaseUid` reais substituem os
  provisórios), preservando `role`/`teamIds` já concedidos.

## 4. Seção administrativa no Dashboard

Nova seção `Administração` no `AppShell` (9ª seção — adicionar ao array de
`navigation.ts`, preservando as 8 atuais). Acesso: só renderiza o conteúdo
para `isSystemAdmin`; qualquer outro papel vê uma mensagem de acesso restrito
(nunca um formulário funcional escondido por CSS — o backend já bloqueia
mesmo que o frontend falhe em esconder).

Conteúdo:
- Lista de administradores (`user_links` com `role==='SCHEDULE_ADMIN'` +
  `system_admins`) — login, papel, times, ativo/inativo, quem concedeu
  (`grantedBy`), quando (`grantedAt`).
- Formulário: cadastrar login, escolher papel (`SCHEDULE_ADMIN`/
  `SYSTEM_ADMIN`), escolher times (multiseleção, só relevante para
  `SCHEDULE_ADMIN`), ativar/desativar.
- Todas as mutações chamam rotas Express novas (`server/routes/admin.mjs`)
  que exigem `isSystemAdmin` (seção 2) — o Firestore não é escrito
  diretamente pelo cliente aqui (mesmo padrão do resto do projeto: Admin SDK
  só no servidor).

## 5. Gateway de leitura oficial + concorrência

Novo módulo `src/lib/officialWorkspace/officialScheduleGateway.ts` (client)
+ rota Express nova `server/routes/officialSchedule.mjs` (server, usa Admin
SDK, exige auth da seção 2):

`GET /api/official/schedule?teamId=<id>`:
1. Verifica chamador (seção 2) autorizado para `teamId`.
2. Lê `workspaces/ici-dev` (pointer) → `activePublicationRevision`.
3. Se não houver revisão ativa ainda, devolve `{ status: 'EMPTY' }` (banco
   vazio/revisão ausente — tratado explicitamente, não como erro).
4. Lê `workspaces/ici-dev/revisions/{revision}/{members,memberships,
   schedule_periods,schedule_assignments}`, filtra só o `teamId` pedido.
5. Converte para `ScheduleState` (reusar o adapter já existente em
   `src/lib/demoWorkspace/scheduleAdapter.ts` como referência de forma, não
   necessariamente o mesmo código — o formato de origem é o oficial
   revisionado, não o pacote Demo).
6. Devolve `{ status: 'OK', schedule, revision, teamId }` — a origem deve
   ficar marcada claramente como `origin: 'official-firebase'` (distinto de
   `demo-workspace-package`/`schedule-template`), preservando o rascunho
   local separado (o Dashboard não sobrescreve o draft local ao carregar;
   carregar é uma ação explícita do usuário).
7. Também aceita `?revision=<n>` para consultar uma revisão anterior
   (somente leitura, nunca ativa por engano uma revisão antiga).
8. Erros tratados explicitamente: revisão ausente, pacote inválido
   (documento corrompido/campo faltando), permissão negada (403 da seção
   2), falha de rede (Admin SDK indisponível) — cada um com mensagem
   distinta, nenhum stack trace ao cliente.

Concorrência: ao carregar uma escala oficial para edição, o Dashboard grava
localmente a `revision` lida (`baseRevision`). Antes de publicar
(dry-run já existente ou um novo COMMIT), a rota de publicação
(`officialPublish.mjs`) recebe esse `baseRevision` no corpo da requisição e:
- Relê a `activePublicationRevision` atual do pointer;
- Se diferente do `baseRevision` enviado, bloqueia com erro tipado
  (`REVISION_CONFLICT`, mensagem "Existe uma versão mais recente publicada
  desde que você carregou esta escala.") — não sobrescreve silenciosamente;
- Frontend oferece "Recarregar" (chama o gateway de novo) diante desse erro.

## Testes obrigatórios (adiciona ao baseline de 351, não remove nenhum)

- Origem oficial: importação → pacote elegível; criação vazia → pacote
  elegível; IDs determinísticos (mesma entrada → mesmo id, duas vezes);
  normalização de membros (maiúscula/espaço/acento não duplica); separação
  SOC/NOC vs Plantão COSI vs Service Desk N1; M1-M4 só em Service Desk N1;
  pacote Demo continua bloqueado (regressão do filtro existente).
- RBAC: `USER` não edita/publica; `SCHEDULE_ADMIN` edita só time autorizado,
  não acessa outro time; `SYSTEM_ADMIN` cadastra administrador;
  `SCHEDULE_ADMIN` não promove ninguém; último `SYSTEM_ADMIN` não pode ser
  removido/desativado; verificação de papel acontece no backend (teste de
  rota Express simulando token de usuário sem permissão → 403), não só no
  frontend.
- Bootstrap local: login não listado não recebe sessão; flag desligada
  recusa; ambiente de produção recusa mesmo com flag ligada; sessão de teste
  mostra "MODO DE TESTE"; vínculo posterior à conta MSAL real preserva
  papel/times.
- Leitura oficial: revisão ativa carrega corretamente; revisão anterior
  pode ser consultada; banco vazio/sem revisão tratado sem erro; dados de
  outro time nunca aparecem; falha de rede não apaga rascunho local.
- Concorrência: revisão-base preservada ao carregar; publicação com
  `baseRevision` desatualizado é bloqueada com `REVISION_CONFLICT`;
  recarregar funciona.
- Regressão: todos os 351 testes existentes continuam passando; nenhuma das
  8 seções/fluxos existentes (grade, planejador, Test Drive, Ambiente Demo,
  Histórico/Status, temas, menu compacto, Error Boundary) perde
  funcionalidade.

## Fora do escopo desta fase

- Deploy de `firestore.rules`.
- Habilitar `ALLOW_OFFICIAL_FIRESTORE_WRITE` ou executar um COMMIT real.
- Notificações (FCM, push, alertas de troca) — próximo marco, não aqui.
- Migração completa de `responsibleLogin` para o modelo de `role`/`teamIds`
  (o mecanismo antigo continua funcionando em paralelo, sem remoção).
- Hospedagem definitiva do backend Express / domínio HTTPS de produção.
