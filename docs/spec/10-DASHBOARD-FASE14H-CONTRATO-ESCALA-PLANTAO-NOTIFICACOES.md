# FASE 14H — Contrato: fidelidade do parser, plantões e notificações

**Status:** aprovado para implementação (Checkpoint A concluído)
**Escopo:** `escala-dashboard` (produtor do contrato) e `EscalaICI-KMP-Lab` (consumidor)
**Referência comportamental:** `EscalaSOC` (`feature/troca-escala-microsoft-firebase`, somente leitura, não alterado)

## 0. Método desta spec

Toda afirmação de comportamento atual abaixo foi confirmada por leitura direta
do código nos três repositórios (não por suposição). Onde o comportamento do
`EscalaSOC` é citado como referência, é para recuperar *intenção original*,
não para copiar defeitos conhecidos — cada defeito do legado está listado
explicitamente na seção 6 ("O que NÃO replicar") para que não seja portado
por engano.

## 1. Diagnóstico confirmado (causa raiz)

### 1.1 Folgas desaparecendo — causa raiz no Dashboard

`src/lib/parser.ts` hoje trata as abas **"Escala"** e **"Escalistas"** como
duas origens **alternativas e independentes** (`buildSocDaily` **ou**
`buildSocEscalistas`, nunca as duas juntas — `parser.ts:1271-1283`). Isso já
diverge do `EscalaSOC`, que sempre lê as duas juntas (Escalistas = status
diário por pessoa, fonte de verdade do "o que aconteceu nesse dia";
Escala = roster turno-a-turno, fonte de verdade de "quem está em qual turno").

Consequência confirmada: em `buildSocDaily`, se o login de um membro não
aparece em nenhuma das 4 colunas de turno **nem** na coluna de observação
(coluna G) para uma data, `putCell` nunca é chamado (`parser.ts:1153-1165`) —
a chave `(membro, data)` simplesmente não existe em `schedule.cells`. Rio
abaixo, `matrixAssignments` (`buildFromSchedule.ts:127-130`) tem
`if (!value) return;` — **nenhum registro é produzido**, nem
`assignmentType: 'OFF'`, nada. "Folga explícita" e "sem dado importado
para esse dia" são hoje **indistinguíveis** no pacote publicado, embora o
DTO (`DemoScheduleAssignmentDto`) já suporte `assignmentType: 'OFF'`
perfeitamente — o defeito é só no builder, não no contrato de dados.

Efeito visível: um dia de folga real (`DF`/`DU`/`FOLGA`/etc. na planilha,
mas sem o login em nenhuma coluna de turno naquele dia) não vira uma
atribuição de folga — vira **nenhuma atribuição**, e o KMP não tem como
distinguir "folga" de "sem publicação para esse dia".

### 1.2 Mistura de turnos — causa raiz no KMP

`composeApp/.../identity/OrganizationRepositories.kt`, função
`scheduleSummaryForMember` (linhas 236-259 aprox.): agrupa colegas do dia
por **data apenas** (`teamAssignmentsByDate = ...groupBy { it.date }`),
nunca preenche `ShiftDay.membersByShift`. A UI (`ui/ScheduleTab.kt:441-465`,
`TeamOnDutyCard`) prefere `membersByShift` quando não-vazio, mas cai para um
`else if` que despeja **todos os colegas do dia (qualquer turno)** na
coluna do turno do usuário logado quando `membersByShift` está vazio — que é
exatamente o caso do caminho de publicação oficial/remota hoje.

Importante: o caminho `FirebaseSources.kt:157-167` **já faz isso
corretamente** (`groupBy { it.toShiftType() }`, filtrado a
`assignmentType == "WORK_SHIFT"`) — o padrão correto já existe no próprio
repositório KMP, só não foi aplicado ao caminho
`scheduleSummaryForMember`/`DemoPublicationSnapshot` (o caminho usado pela
publicação oficial `ici-dev`). A correção é replicar esse padrão, não
inventar um novo.

### 1.3 Alertas 6x1 falsos — causa raiz no KMP

Duas implementações duplicadas (`model/LabAlerts.kt:84-104` e
`model/ScheduleRules.kt:82-105`) calculam a sequência de dias trabalhados
iterando a lista de registros **existentes** por posição, sem checar se a
data do item atual é exatamente um dia civil após a anterior. Como
`scheduleSummaryForMember` só produz `ShiftDay` para datas com registro
(seção 1.2), um buraco de dados no meio de uma sequência de trabalho **não
é visto** pelo contador — a sequência continua silenciosamente através do
buraco em vez de resetar. Uma folga com o defeito da seção 1.1 (folga real
que virou "sem registro") portanto não só desaparece visualmente como
também **não reseta a contagem 6x1**, disparando um alerta falso.

## 2. Escala comum

### 2.1 Cruzamento Escala + Escalistas (Dashboard)

Quando o workbook tiver as duas abas reconhecíveis, o parser deve produzir
**um único estado diário por membro por data**, cruzando:

- **Escalistas** (quando presente): fonte primária de status diário
  explícito por membro (código `1`-`6` = trabalho no turno do bloco em que
  a linha do membro está; `DF`/`DU`/`FOLGA` = folga; `X` = férias; `BH` =
  banco de horas; `AN` = folga de aniversário; `HE` = hora extra
  (`isWorkShift = true`); `#` = afastamento).
- **Escala**: fonte de verdade de **qual turno** (Madrugada/Manhã/Tarde/
  Noite) cada pessoa ocupa em cada data — resolução sempre **estrutural**
  (qual das 4 colunas contém o login/nome), nunca pelo valor de um código
  numérico. Prioridade de coluna quando aplicável:
  Madrugada → Manhã → Tarde → Noite (primeira que casar).
- **Precedência quando ambas as fontes existem para o mesmo membro+data**:
  se a Escala tem o login da pessoa em uma coluna de turno, o turno vem de
  lá; a Escalistas fornece o status/rótulo bruto quando presente. Se a
  Escalistas diz "trabalhou" (`1`-`6`) mas a Escala não tem o login em
  nenhuma das 4 colunas de turno naquele dia: **inconsistência explícita**
  (`assignmentType` reservado para isso, ver seção 2.3), nunca silêncio.
- Se só uma das duas abas existir no workbook (caso comum hoje, incluindo
  o XLS real já publicado em `ici-dev` revisão 1/2), o comportamento atual
  de importar por uma única aba **continua funcionando** — o cruzamento é
  um reforço quando ambas existem, nunca um requisito bloqueante de tudo
  ou nada.

### 2.2 Todo membro conhecido tem um estado para cada dia do período

Diferente do `EscalaSOC` (que silenciosamente omite um dia sem registro —
achado confirmado na pesquisa desta fase, não é comportamento a copiar),
o contrato do Dashboard exige: para cada membro elegível e cada data do
período being importado, existe **exatamente uma** entrada de
`scheduleAssignments` (nunca zero, nunca duas). Uma data sem código
reconhecido em nenhuma das fontes produz uma entrada explícita com
`assignmentType` apropriado (ver 2.3) — nunca a ausência de qualquer
registro.

### 2.3 Tipos de atribuição e códigos

Estender `DemoScheduleAssignmentType` (`src/lib/demoWorkspace/dto.ts`) — hoje
`'WORK_SHIFT' | 'OFF' | 'VACATION' | 'ABSENCE' | 'TRAINING' | 'OTHER'` — para
preservar a granularidade que o parser atual perde (todas colapsam hoje em
`OFF`):

| Código na planilha | `assignmentType` | `shiftName`/observação |
|---|---|---|
| `1`-`6` com turno localizado na Escala | `WORK_SHIFT` | nome do turno resolvido |
| `1`-`6` **sem** turno localizado | `OTHER` (ou tipo novo `INCONSISTENT`, decisão da implementação) | rótulo explícito "Trabalho sem turno localizado" + preserva o código bruto — nunca vira turno nem folga silenciosamente |
| `DF`/`DU`/`FOLGA` | `OFF` | — |
| `X`/`FÉRIAS` (com ou sem prefixo) | `VACATION` | — |
| `BH` | `OFF` (com `shiftName`/campo auxiliar preservando "BH", nunca indistinguível de uma folga comum na exibição) | |
| `AN` | `OFF` (idem, preservando "Aniversário") | |
| `HE` | `WORK_SHIFT` | `shiftName` livre, `isWorkShift` verdadeiro |
| `#` | `ABSENCE` | já correto hoje, preservar |
| Nenhum código em nenhuma fonte | tipo explícito para "sem publicação"/inconsistência — nunca ausência de registro | aviso no dry-run |

Bloquear publicação (dry-run e commit) quando houver **qualquer** dia de
trabalho (`1`-`6`) sem turno localizado — erro tipado, nunca aviso
silencioso, nunca vira turno/folga por padrão.

### 2.4 Separadores de nomes em célula

Padronizar para aceitar `/`, quebra de linha, vírgula e ponto e vírgula em
**toda** célula multi-nome (hoje só `/` nas colunas de turno e `\` na coluna
de observação) — consistente, sem a divergência entre funções que o
`EscalaSOC` tem (ver seção 6).

### 2.5 Datas

Numéricas Excel (via `cellDates: true`, já correto) e textuais
`dd/MM/yyyy`/`d/M/yyyy`/`dd/MM`/`d/M` (ano ausente cai no ano-base do
workbook, já detectado por `workbookBaseYear` — **nunca hardcoded**, ao
contrário do `YearFallback = 2026` do `EscalaSOC`).

### 2.6 IDs e idempotência

Preservar o mecanismo já existente e testado
(`memberIdFromLogin`/`teamId()`, `officialWorkspaceBuildFromSchedule.test.ts`)
— mesma entrada normalizada → mesmo id, sempre. Reimportar o mesmo membro
não duplica.

### 2.7 Revisões oficiais anteriores são imutáveis

Nenhuma mudança nesta fase toca `workspaces/ici-dev/revisions/1` ou `/2`
(já publicadas, FASE 14G). Uma futura revisão 3 só existe como
rascunho/dry-run local nesta fase — nenhum COMMIT real autorizado.

## 3. Plantões

### 3.1 Separação de domínio (preservar, já correto)

O domínio de plantão já é estruturalmente separado da escala 6x1 no
Dashboard (`analyzeOnCall`/`buildOnCall`, `onCallAssignments`, hierarquia
`PLANTAO_COSI` com prefixo `cosi-plantao-`) e no KMP
(`OnCallPeriod`/`OnCallAssignment`, `PlantaoWorkbookParser.kt`,
`PlantaoScreen.kt`, todos já existentes e testados). **Não fundir os dois
parsers/pipelines** — só estender o que já existe.

### 3.2 Grupos de plantão — conceito novo, não uma migração do legado

Confirmado pela auditoria: **nem o `EscalaSOC` nem o Dashboard nem o KMP
atuais têm qualquer conceito de "grupo de plantão"** hoje — em todos os
três, on-call é uma lista plana de intervalos por pessoa, sem agrupamento.
"COSI" no legado é o nome do relatório, não uma entidade de grupo. Isto é
**trabalho novo**, não um port.

Entidades novas (Dashboard: `server/domain/` + `src/lib/officialWorkspace/`;
KMP: `commonMain/model/`):

- **Grupo de plantão** (`OnCallGroup`): `id`, `teamId`, `name`, `active`.
- **Período de plantão** (`OnCallPeriod`, já existe no KMP — adicionar
  `groupId`; já existe como conceito no Dashboard via `schedulePeriods`/
  on-call próprio — adicionar campo equivalente).
- **Atribuição de plantão** (`OnCallAssignment`, já existe nos dois lados)
  — adicionar `groupId` a ambos.
- Associação equipe↔grupo: uma equipe tem 1 ou N grupos (`teamId` → lista
  de `OnCallGroup`).
- Contatos/responsáveis pelo acionamento: campo novo, opcional
  (lista de nomes/e-mails/telefones — nenhum dos três repositórios tem
  isso hoje; adicionar como estrutura mínima, sem UI de gestão completa
  nesta fase se não for essencial ao critério de aceite).

Campo por atribuição (conforme o contrato atual permitir, sem quebrar o
que já existe): `teamId`, `groupId` (novo), `periodId`, `memberId`/login,
nome de escala, início, fim, duração (`durationMinutes()`/
`durationHours()` já existem, preservar), rótulo, origem, `active`,
observações.

### 3.3 Comportamento SOC (grupo único) vs NOC (múltiplos grupos)

- SOC tem inicialmente **um único grupo** (COSI) — a UI do KMP abre COSI
  diretamente, sem tela de seleção (branch explícita: `groups.size == 1`
  → pula seleção).
- NOC pode ter vários grupos — a UI mostra seleção de grupo
  (`groups.size > 1`).
- Nunca inferir o grupo pelo nome da planilha silenciosamente — a
  importação exige equipe e grupo escolhidos explicitamente **antes** de
  preparar o pacote de publicação (Dashboard: novo passo/campo na tela de
  plantão, análogo ao já existente para a escala 6x1).
- Leitura remota é sempre principal; cache é sempre fallback (já é a
  política vigente para a escala 6x1 — plantão adota a mesma).
- Dados ilustrativos (mock) só no Ambiente Demo, sempre identificados
  visualmente (mesma política de badge/selo já usada em outros lugares do
  Dashboard e do KMP).

## 4. Notificações

### 4.1 Tipos (contrato final)

Distinguir claramente quatro categorias (nomenclatura obrigatória — nunca
chamar lembrete de turno de "Plantão amanhã", já que "Plantão" agora
significa especificamente o domínio COSI/NOC):

1. **Alertas** — problemas/inconsistências da escala (6x1 excedido,
   descanso insuficiente, turno sem localização) — já existem como
   conceito (`ScheduleAlert`/`LabAlert`), não são "notificações" no sentido
   de push/alarme, continuam sendo exibidos na tela de Alertas.
2. **Lembretes pessoais** — evento de trabalho/folga do próprio usuário:
   - Aviso "véspera" (dia anterior, horário configurável, padrão 18:00 —
     diferente do legado, que tem o horário fixo em código; aqui é
     persistido como preferência do usuário desde o início).
   - Aviso de entrada do turno (offsets 0/5/10/15/30/60 min antes).
   - Aviso de início de pausa, aviso de fim de pausa.
   - Aviso de término do turno.
3. **Notificações de publicação** — nova escala publicada / meu dia foi
   alterado especificamente (individual). Diferenciar as duas quando o
   backend tiver informação suficiente para isso (ver 4.4 sobre a
   limitação herdada do legado: hoje nem o legado nem o Dashboard têm
   diffing por assignment — republicar sempre é "o período mudou"; a
   distinção fina "só o meu dia mudou" é best-effort nesta fase, não uma
   garantia).
4. **Notificações de plantão** — pertencem ao domínio de plantão (seção 3),
   agendadas conforme o grupo do usuário; independentes das notificações
   de escala 6x1.

### 4.2 Janela de pausa (valores exatos, já confirmados e já portados)

Reaproveitar a fórmula já existente e correta em
`model/TemporalRules.kt` (`pauseFor()`, offsets 120-285min do início do
turno, já testada) — **não recriar**, só construir o agendamento real em
cima dela:

| Turno | Janela do turno | Janela de pausa permitida |
|---|---|---|
| Madrugada | 01:00–07:00 | 03:00–05:45 |
| Manhã | 07:00–13:00 | 09:00–11:45 |
| Tarde | 13:00–19:00 | 15:00–17:45 |
| Noite | 19:00–01:00 (dia seguinte) | 21:00–23:45 |

Duração padrão: 15 minutos, fixa (não configurável pelo usuário, mesma
regra do legado — evita erro operacional).

### 4.3 Bugs conhecidos do legado — decisão explícita de não repetir

- **Divergência `notifyPauses`/`pauseReminder.enabled`**: o legado tem
  duas flags persistidas independentes controlando o mesmo recurso, e a
  UI só nunca escreve na primeira — resultado: o lembrete de pausa nunca
  dispara de fato, mesmo com o toggle visível ligado. **Usar uma única
  flag efetiva** no KMP novo.
- **Sem `BOOT_COMPLETED`**: alarmes não sobrevivem a reboot no legado.
  Implementar o receiver (permissão `RECEIVE_BOOT_COMPLETED`) —
  requisito explícito desta fase.
- **`AlarmManager.set()` inexato**: aceitável para os tipos de lembrete
  aqui (não são pausas/tráfego aéreo) — mas preferir
  `setAndAllowWhileIdle`/equivalente que respeite Doze sem exigir a
  permissão de alarme exato (`SCHEDULE_EXACT_ALARM`), já que o legado
  nunca precisou dela e funcionou. Só pedir alarme exato se um teste real
  mostrar que a imprecisão quebra um critério de aceite.
- **Hash de request-code com colisão possível** (`epochDay*10+tipo mod
  512` no legado): usar um esquema com faixa maior para eliminar a
  colisão na prática (ex.: `epochDay*100+tipoOrdinal` como `Long`, sem
  módulo pequeno).
- **Sem teste de notificação, sem deep-link**: ambos ausentes no legado;
  esta fase adiciona os dois (ver seção 8.4/8.6 do prompt original).

### 4.4 Limitações reais de Web/PWA (comunicar, nunca esconder)

Sem um backend de Web Push (VAPID/FCM) implantado, notificações Web só
disparam com a aba/service worker ativo — **não há garantia de entrega
com o navegador totalmente fechado**. Esta fase prepara e testa o
contrato do lado cliente e o lado servidor (registro/revogação de
assinatura, seleção de destinatário, preparação de evento — nunca envio
real), mas classifica a validação de entrega real com PWA fechada como
**"implementado, validação pendente de deploy"**, nunca como concluída.

## 5. Contrato de dados — mapa preliminar (insumo para o gate da seção 7 do prompt)

Resumo do que já é sólido (não mudar mecanismo, só estender campos):

- **Revisão/pacote**: `officialPublicationPlanner.mjs` +
  `executeAtomicPublication.mjs` já fazem snapshot completo + flip
  atômico de ponteiro, com `reserveRevision` otimista por
  `(workspaceId, idempotencyKey)` e comparação de `expectedActiveRevision`
  contra o valor real do servidor — **preservar integralmente**.
- **`workspaceId`**: já triplamente verificado no servidor (rota,
  validador, `assertOfficialOnlyWritePlan`) — nunca confiado do cliente.
  Preservar.
- **`teamId` — lacuna real encontrada**: `requireTeamAuthorization` hoje
  autoriza só o `corporateLink.teamId` único da requisição; **não**
  verifica que todo `teamId` referenciado dentro de `teams[]`/
  `schedulePeriods[]`/`scheduleAssignments[]` do pacote (montado
  inteiramente no cliente) pertence aos `teamIds` autorizados do
  chamador. Corrigir nesta fase: validar todos os teams referenciados no
  pacote contra `caller.teamIds`, não só o do vínculo corporativo.
- **Validador de pacote não verifica**: consistência turno/status,
  duplicidade de `(memberId, date)`, data dentro do período referenciado
  — adicionar todos os três nesta fase.

O gate formal (tabela campo a campo produtor/consumidor) é responsabilidade
do Codex na seção 7 do prompt original, a partir deste documento.

## 6. O que NÃO replicar do `EscalaSOC` (lacunas/bugs conhecidos do legado)

- 30 linhas/colunas fixas na leitura da Escala/Escalistas (cap artificial
  de dia 31) — não introduzir cap fixo.
- Ano hardcoded (`YearFallback = 2026`) — usar sempre o ano derivado do
  conteúdo do workbook.
- Separadores inconsistentes entre funções (`containsCollaborator` usa 4
  separadores, `teamMembersExcluding` usa 3) — padronizar em um único
  conjunto de separadores em todo o código novo.
- Dia sem registro sendo silenciosamente omitido (o legado tem esse
  defeito também, mesmo lendo as duas abas) — o contrato novo exige
  estado explícito por dia (seção 2.2), mais rigoroso que o legado.
- `notifyPauses`/`pauseReminder.enabled` divergentes (seção 4.3).
- `AlarmManager.set()` sem `BOOT_COMPLETED`/`ACTION_TIMEZONE_CHANGED` —
  corrigir ambos.
- Hash de request-code com colisão (seção 4.3).
- Nenhum "grupo" de plantão — não é bug, é ausência; não inventar uma
  falsa equivalência com "COSI = grupo único do legado", já que o legado
  nunca teve mais de uma equipe para testar essa hipótese.

## 7. Critérios de aceite desta spec

Ver seção 13 do prompt original (FASE 14H) — este documento é a base para
avaliar cada item ali. Em particular, esta spec fixa os valores exatos
(janelas de pausa, contagens do cenário de regressão, precedência
Escala×Escalistas) que os testes das seções 6.6 e 10 (Dashboard/KMP) devem
verificar literalmente.
