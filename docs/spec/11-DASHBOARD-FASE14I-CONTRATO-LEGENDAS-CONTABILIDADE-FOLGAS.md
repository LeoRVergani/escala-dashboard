# FASE 14I — Contrato: legendas SOC padronizadas e contabilidade de folgas

**Status:** aprovado para implementação (Checkpoint A)
**Escopo:** `escala-dashboard` (produtor do contrato visual) e `EscalaICI-KMP-Lab`
(consumidor, Checkpoint F)
**Referência comportamental:** `EscalaSOC` (`feature/troca-escala-microsoft-firebase`,
somente leitura, não alterado); legado de códigos do XLS SOC real (não
versionado)

## 0. Método desta spec

Toda afirmação sobre o estado atual abaixo foi confirmada por leitura direta
do código nos dois repositórios (duas investigações de reconhecimento
dedicadas, uma por repo), não por suposição. Os valores de cor apresentados
na seção 3 não existiam em nenhum arquivo antes desta spec — são a primeira
vez que este projeto formaliza uma paleta para os códigos de situação do
SOC; a seção 3.3 documenta a decisão de derivação.

## 1. Estado atual confirmado (antes desta fase)

### 1.1 Dashboard — mapeamento fragmentado, sem tokens compartilhados

- O modelo editável (`CellValue`/`ShiftId`, `src/types.ts`+`src/constants.ts`)
  só distingue **11 `ShiftId` genéricos**: `madrugada|manha|tarde|noite|
  folga|ferias|plantao|comercial|extra|afastamento|custom`. Os códigos reais
  do SOC (`DU`, `DF`, `BH`, `AN`, `X`, `#`, `HE`, `Folga` puro) são
  achatados em tempo de parse (`parser.ts`: `socSpecial`,
  `normalizeEscalistasCode`, `combineSocValue`) para um desses 11 — o texto
  bruto sobrevive só em `CellValue.text`, nunca em um campo estruturado.
  Especificamente: `DF`/`DU`/`BH`/`folga`/`AN` → todos viram
  `shift: 'folga'`; `X`/`ferias*` → `'ferias'`; `HE` → `'extra'`; `#` →
  `'afastamento'`.
- A cor/label de cada `ShiftId` está **duplicada em pelo menos 8 arquivos**
  (`constants.ts`, `styles.css`, `ScheduleGrid.tsx`, `SocPlanner.tsx`,
  `App.tsx` legenda, `exporter.ts`, mais `persistence.ts` e
  `scheduleAdapter.ts` para o caminho demo) — nenhum módulo único de tokens
  existe hoje.
- A legenda da grade SOC (`App.tsx:1641-1688`, `SHIFTS.map(...)`) mostra
  hoje: `MAD · Madrugada`, `M · Manhã`, `T · Tarde`, `N · Noite`,
  `F · Folga`, `FE · Férias`, `P · Plantão`, `HC · Horário comercial`,
  `HE · Hora extra`, `AF · Afastamento`. Não existe entrada para
  `DU`/`DF`/`BH`/`AN`/`#` — todos colapsam visualmente em `F · Folga` (ou
  `FE`/`AF` conforme o caso).
- No pacote oficial (`buildFromSchedule.ts`, `ASSIGNMENT_BY_SHIFT` +
  `offShiftName()`), **só `BH` e `AN` são hoje recuperáveis** como
  `shiftName` distinto (`"BH"`, `"Aniversário"`) dentro do `assignmentType:
  'OFF'` — `DU` e `DF` já chegam indistinguíveis nesse estágio
  (`shiftName: null` para os dois, igual a uma folga comum). O caminho
  paralelo do workspace demo (`scheduleAdapter.ts`) não recupera nem
  `BH`/`AN`.
- `DemoScheduleAssignmentDto` (`src/lib/demoWorkspace/dto.ts`) tem hoje
  `assignmentType` + `shiftName` (nullable) — **não existem** campos
  `sourceStatusCode`/`statusLabel`/`colorKey` em nenhum lugar do código
  (confirmado por busca exaustiva). `shiftName` já cumpre, na prática, o
  papel de "código de origem preservado" para os dois casos que já
  funcionam (`BH`/`Aniversário`) — esta fase estende a mesma mecânica para
  `DU`/`DF`/`Folga` puro, em vez de introduzir um campo novo.
- Cores dos turnos hoje (`styles.css:24-34`, tema claro, não sobrescritas
  no escuro): Madrugada `#ede9fe`/`#5b21b6`, Manhã `#fef3c7`/`#92510a`,
  Tarde `#cffafe`/`#0e7490`, Noite `#dbeafe`/`#1e3a8a` — **divergem** das
  cores já usadas no KMP (ver 1.2). Corrigir é requisito explícito desta
  fase (seção 3.1).
- Painel de referência "Contabilidade dos plantões" (`OnCallEditor.tsx`,
  seção `.oncall-accounting`, dados de `onCallCycleAccounting()` em
  `lib/onCall.ts`): card com cabeçalho (título + subtítulo + botão de ação
  perigosa), tabela rolável com ponto colorido por técnico, `tfoot` de
  totais, estado vazio de uma linha. Este é o template visual exato a
  reproduzir na seção 5.

### 1.2 KMP — mesma lacuna, já com metade da mecânica pronta

- `ShiftType` (`model/ScheduleModels.kt`) já tem 13 valores, incluindo
  `FOLGA`/`FERIAS`/`BH`/`ANIVERSARIO`/`HORA_EXTRA`/`AFASTAMENTO`/
  `INDEFINIDO`/`INCONSISTENCIA`, cada um já com `label`/`shortLabel`
  (`Md`/`M`/`T`/`N` já existem exatamente como pedido nesta fase, sem
  precisar de nenhuma mudança).
- `ui/theme/ShiftColors.kt` já define `shiftColor()` (cor sólida
  canônica por tipo) — **esta é a fonte de verdade oficial dos 4 turnos**
  (seção 3.1): Madrugada `#6366F1`, Manhã `#FACC15`, Tarde `#F97316`,
  Noite `#1D4ED8`.
- `ShiftDay.sourceStatus: String?` já existe, já é populado com o texto
  bruto da célula (`LabWorkbookParser.kt:168`) e já é persistido nos dois
  caches locais (Android/Web) — **já cumpre o papel de "sourceStatusCode"
  pedido nesta fase**, nenhum campo novo é necessário no KMP.
- A lacuna real: `toShiftTypeFallback()` (`LabWorkbookParser.kt`) também
  colapsa `DF`/`DU`/`FOLGA` em um único `ShiftType.FOLGA`, e a legenda
  (`ScheduleTab.kt`, `InlineLegendCard`) mostra só 9 dos 13 `ShiftType`
  (faltam `COMERCIAL`, `ANIVERSARIO`, `HORA_EXTRA`, `INDEFINIDO`) — mesma
  classe de problema do Dashboard, resolvida no Checkpoint F com a mesma
  estratégia (ler `sourceStatus` para refinar a apresentação, sem quebrar
  pacotes antigos que não o tenham).

## 2. Contrato canônico dos turnos

| Código exibido | Nome | Horário | Cor canônica (fonte: KMP `shiftColor()`) |
|---|---|---|---|
| `Md` | Madrugada | 01:00–07:00 | `#6366F1` |
| `M` | Manhã | 07:00–13:00 | `#FACC15` |
| `T` | Tarde | 13:00–19:00 | `#F97316` |
| `N` | Noite | 19:00–01:00 (atravessa meia-noite) | `#1D4ED8` |

- KMP não muda nada aqui — já é a fonte da verdade.
- Dashboard: `--sh-madrugada-bg/-fg`, `--sh-manha-bg/-fg`, `--sh-tarde-bg/-fg`,
  `--sh-noite-bg/-fg` (`src/styles.css`) passam a derivar da mesma cor de
  base acima (ver 3.1 sobre o método de derivação bg/fg).
- `ShiftId` interno do Dashboard (`madrugada`/`manha`/`tarde`/`noite`) **não
  muda** — só o código exibido (`MAD` → `Md` no `code` de `constants.ts`) e
  a cor. Nenhum id interno, chave de Firestore ou nome de função é
  renomeado.

## 3. Contrato canônico das situações (códigos do XLS SOC)

| Código | Nome exibido | Semântica | Cor canônica | Família (ref. seção 6 do prompt) |
|---|---|---|---|---|
| `DU` | DSR — Dia útil | Folga em dia útil | `#EA580C` | laranja |
| `DF` | DSR — Final de semana | Folga em sábado/domingo | `#E11D48` | rosa/vermelho |
| `BH` | Compensação BH | Compensação/banco de horas | `#D97706` | amarelo/âmbar |
| `AN` | Folga Aniversário | Folga de aniversário | `#06B6D4` | ciano |
| `X` | Férias | Férias | `#2563EB` | azul |
| `#` | Afastamento/Atestado | Afastamento ou atestado | `#374151` | cinza-escuro |
| `Folga` | Folga — Feriado | Folga associada a feriado | `#7C3AED` | roxo |
| `HE` | Hora Extra | Hora extra (`isWorkShift`/`WORK_SHIFT`) | `#16A34A` | verde |

### 3.1 Método de derivação das cores (por que estes valores exatos)

Nenhum arquivo do repositório continha valores hexadecimais para os 8
códigos de situação antes desta spec — o prompt desta fase forneceu apenas
famílias de cor nomeadas (`azul`, `rosa/vermelho`, `laranja`, `amarelo`,
`roxo`, `ciano`, `verde`, `cinza-escuro`), pedindo para não inventar cores
por preferência visual e para reproduzir fielmente a referência. Os valores
acima foram escolhidos com estas restrições, em ordem de prioridade:

1. Pertencer à família de cor exatamente nomeada no prompt.
2. Ser visualmente distinguível dos outros 7 códigos de situação e dos 4
   turnos — em particular `DU` (laranja, `#EA580C`) é deliberadamente um
   tom mais escuro/avermelhado que `Tarde` (laranja, `#F97316`, turno) para
   reduzir ambiguidade quando os dois aparecem próximos (ex.: legenda
   completa); `HE` (`#16A34A`) já coincide quase exatamente com o verde já
   usado pelo próprio `ShiftType.HORA_EXTRA` do KMP (`#22C55E`), reforçando
   consistência sem forçar igualdade bit a bit.
3. Ter contraste suficiente (WCAG AA, texto branco ou `#0f172a` conforme o
   caso) quando usado como fundo de chip com o texto do código sobreposto.

Estes valores ficam centralizados em um único token por código (seção 4) —
qualquer ajuste fino futuro (ex.: se o XLS real, quando eventualmente
disponibilizado para leitura local, mostrar tons diferentes) é uma mudança
de uma linha no token, nunca uma busca-e-substituição em múltiplos
componentes.

### 3.2 Sobre `#` (Afastamento/Atestado)

Conferido: nem o XLS de referência, nem o parser atual (`parser.ts`), nem
nenhuma spec anterior (FASE 14H, spec 64/65) diferenciam "afastamento" de
"atestado" — os dois sempre colapsam no mesmo código `#` e no mesmo rótulo
`Afastamento`/`ABSENCE`. Não há sinal existente para separá-los. Esta fase
adota o nome canônico combinado `Afastamento/Atestado` exatamente como
especificado no prompt, sem inventar uma distinção que não existe em
nenhuma fonte real.

### 3.3 Sobre `Folga` (feriado) vs `DU`/`DF`

Os três são semanticamente "descanso" (`assignmentType`/`ShiftType`
permanecem `OFF`/`FOLGA`), mas devem ser **visualmente e textualmente
distintos** — este é o objetivo central da fase. A distinção vive no código
de origem preservado (`shiftName` no Dashboard, `sourceStatus` no KMP), não
em um novo valor de enum/`assignmentType` separado. Ver seção 4.

## 4. Modelo de dados: semântica ampla + código de origem preservado

Não se cria nenhum campo novo em nenhum dos dois repositórios — ambos já
têm o necessário; esta fase estende o que já existe para cobrir os casos
que hoje se perdem.

### 4.1 Dashboard

- `DemoScheduleAssignmentDto.assignmentType` continua a categoria ampla
  (`OFF`/`VACATION`/`ABSENCE`/etc.) — **inalterado**.
- `DemoScheduleAssignmentDto.shiftName` (já existe, já nullable, já usado
  para `"BH"`/`"Aniversário"`) passa a também preservar `"DU"`, `"DF"` e
  `"Folga"` (feriado puro, sem outro código) quando `assignmentType ===
  'OFF'`. Implementação: estender `offShiftName()`
  (`src/lib/officialWorkspace/buildFromSchedule.ts`) para reconhecer os 3
  códigos adicionais, replicando a mesma função (ou uma versão
  compartilhada) em `scheduleAdapter.ts` (caminho demo, que hoje não
  recupera nem `BH`/`AN`).
- Compatibilidade: pacotes antigos (já publicados, revisões 1/2 de
  `ici-dev`, imutáveis) têm `shiftName: null` para toda folga — o token de
  apresentação (seção 5) trata `shiftName: null` com
  `assignmentType: 'OFF'` como "Folga" genérica (cor `#7C3AED`, o mesmo
  tom usado para `Folga`/feriado, já que sem o código de origem não há
  como saber se era `DU`, `DF` ou feriado puro) — nunca erro, nunca
  "Indefinido".

### 4.2 KMP

- `ShiftDay.sourceStatus` (já existe) passa a ser lido pela camada de
  apresentação (nova, seção 5) para refinar a cor/rótulo exibidos quando
  `type == ShiftType.FOLGA` (ou `BH`/`ANIVERSARIO`, que já são tipos
  próprios). Nenhuma mudança na assinatura de `ShiftDay`/`ShiftType`.
- Compatibilidade: `sourceStatus == null` (dado antigo/cache anterior a
  esta fase) com `type == FOLGA` → apresentação cai no rótulo/cor genérico
  de "Folga" (mesmo valor `#7C3AED` do caso Dashboard sem `shiftName`, por
  consistência entre as duas plataformas).

## 5. Módulo único de tokens (sem duplicar mapas de cor)

### 5.1 Dashboard — novo módulo `src/lib/scheduleTokens.ts`

Único lugar que define, para os 4 turnos e para os 8 códigos de situação:
`code` (exibido), `label`, `colorHex`, `countsAsOff` (boolean, seção 6 do
Checkpoint C), `order` (para ordenação estável na legenda/painel).
`ScheduleGrid.tsx`, `SocPlanner.tsx`, `App.tsx` (legenda), `exporter.ts` e o
novo painel de folgas (Checkpoint C) devem **ler deste módulo**, nunca
reimplementar o mapa. A tabela `SHIFTS`/`SHIFT_BY_ID` (`constants.ts`)
permanece para os `ShiftId` estruturais (compatibilidade com todo o resto
do código que já depende dela) — o módulo novo referencia os mesmos 4
turnos por cor, mas adiciona a camada de situação que `ShiftId` não cobre.

Função central exportada: `situationForAssignment(shift: ShiftId, text:
string | undefined): SituationToken` — resolve o par (`ShiftId` genérico +
texto bruto da célula) para o token de situação canônico (código exibido,
nome, cor), com fallback determinístico para o `ShiftId` genérico quando o
texto bruto não bate com nenhum código conhecido (nunca lança erro, nunca
"undefined" na tela).

### 5.2 KMP — novo arquivo `commonMain/.../model/ScheduleSituationTokens.kt`

Espelha a mesma ideia: função `situationFor(type: ShiftType, sourceStatus:
String?): SituationPresentation` (código exibido, rótulo, `Color`),
consumida por `InlineLegendCard`/`ShiftLegendItem`
(`ui/ScheduleTab.kt`), pelo marcador de dia (`ShiftMarker`), pelo painel
"Quem trabalha nesse dia" e pelo Perfil — nenhum desses lugares volta a
hardcodar um `when (type) { ... }` de cor própria; todos chamam a mesma
função. `ui/theme/ShiftColors.kt` (`shiftColor()`/`shiftContainerColor()`/
`shiftOnColor()`) permanece como está para os 4 turnos (já correto,
inalterado) — o arquivo novo cobre só a camada de situação.

## 6. Painel "Contabilidade das folgas" (Checkpoint C) — regras formalizadas aqui

- **Estados contáveis no total principal** (Domingo/Sábado/Semana):
  `DU`, `DF`, `Folga` (feriado) — os três representam descanso operacional
  puro. `countsAsOff = true` no token (seção 5.1).
- **Estados especiais, fora do total principal**: `AN`, `BH`, `X`, `#` —
  aparecem em coluna/detalhe separado (nunca contaminam Domingo/Sábado/
  Semana/Total principal), `countsAsOff = false`. Justificativa: `AN`/`BH`
  são compensações do próprio colaborador (não "descanso concedido" no
  sentido operacional); `X` é férias (regime totalmente diferente); `#` é
  afastamento/atestado (ausência não planejada). Esta distinção replica a
  semântica já usada pela aba `Escalistas` e pelo parser (nenhum desses
  quatro nunca foi tratado como "folga comum" em nenhuma fonte existente).
- **Classificação temporal**: pela data real do registro (`domingo`/
  `sábado`/`segunda a sexta`), nunca pelo código isoladamente — um mesmo
  código (`DU`, por definição, só cai em dia útil; `DF` só em fim de
  semana, mas a implementação deve calcular pela data, não assumir isso
  pelo nome do código, para tolerar dado real divergente sem quebrar).
- Detalhamento completo de colunas, fonte de dados reativa, ação "Limpar
  folgas do ciclo" e visual: seção 10 do prompt original desta fase (já
  suficientemente detalhada ali, não repetida aqui para evitar
  divergência entre dois textos).

## 7. Compatibilidade — resumo

| Cenário | Comportamento esperado |
|---|---|
| Pacote FASE 14H (sem `shiftName` de `DU`/`DF`/`Folga`) | Apresentação cai no token genérico de "Folga" (`#7C3AED`), nunca erro |
| Pacote FASE 14I (com `shiftName` completo) | Apresentação usa o token específico (`DU`/`DF`/`Folga`/`BH`/`AN`) |
| Cache local KMP anterior (`sourceStatus == null`) | Mesma regra — fallback para "Folga" genérica |
| Cache local KMP novo (`sourceStatus` preenchido) | Token específico |
| `assignmentType` desconhecido/código não reconhecido | Fallback pelo `assignmentType`/`ShiftType` amplo, nunca "Indefinido" quando o tipo amplo é conhecido |

## 8. Critérios de aceite desta spec

Ver seção 18 do prompt original (FASE 14I) — este documento fixa os valores
exatos (hex de cor, nomes canônicos, regra de contagem) que os testes das
seções 14/15 do prompt devem verificar literalmente.
