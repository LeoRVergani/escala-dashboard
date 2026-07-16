# Painel de Escalas 1.8.0

## Novidades da 1.8.0

O Planejador SOC usa uma matriz CSS Grid: datas são colunas e Madrugada, Manhã, Tarde, Noite e Situações especiais são cinco linhas compartilhadas. Faixas vazias mantêm espaço, nomes de período ficam fixos à esquerda e qualquer crescimento ocorre na linha completa, preservando o alinhamento horizontal.

O contador consecutivo agora é somente um número discreto no canto inferior direito, sem círculo, fundo, borda ou sombra. Dias 1–6 usam cinza secundário; 7+ mudam apenas cor e peso. O cálculo e os dados operacionais não foram alterados.

## Novidades da 1.7.0

O Planejador SOC separa os quatro turnos da área **Situações especiais**. Férias, Folga, Afastamento e os demais códigos não operacionais deixam de ocupar uma faixa de turno. Cartões e faixas usam as mesmas famílias de cores da Grade, conforme o assignment real do dia.

A Grade e o Planejador exibem um badge derivado com a posição do dia na sequência trabalhada. Mudanças de turno não reiniciam a sequência; Folga, Férias, Afastamento e dias vazios reiniciam. Valores 7 ou maiores recebem destaque e continuam alimentando o alerta existente. O badge não altera rascunho, exportação ou payload.

## Escala SOC — Grade e Planejador

O SOC agora alterna entre **Grade** e **Planejador**, ambos sobre as mesmas células, histórico, rascunho, alertas e exportação. O cabeçalho diário usa duas linhas (`25/06` e `Qui`) com cálculo local seguro. No Planejador, cartões podem ser arrastados entre datas e turnos, removidos ou editados; a opção **Compactar** altera somente a apresentação.

Foi adicionada uma transformação pura para um payload normalizado e serializável, preparado para uma persistência futura. **Firebase continua desativado: não há SDK, conexão, credenciais ou publicação nesta versão.**

Dashboard React + TypeScript para importar, revisar, editar e exportar escalas `.xls`/`.xlsx`. A grade, seleção múltipla, drag-and-drop, desfazer/refazer, rascunho local e exportação originais foram preservados.

## Execução

```bash
npm config set registry https://registry.npmjs.org/
npm install
npm run dev -- --host 0.0.0.0
```

| Comando | Finalidade |
| --- | --- |
| `npm run check` | TypeScript e testes automatizados |
| `npm run build` | Build de produção |
| `npm run fixtures` | Regenera as fixtures fictícias sanitizadas |
| `npm run analyze -- <arquivo>` | Executa o parser da aplicação diretamente em um arquivo real |

Validação desta entrega: **88 testes aprovados**, TypeScript aprovado e build Vite concluído.

## Plantão COSI — ciclo operacional 25–26

O calendário do Plantão COSI não usa mais o mês civil como limite visual. O ciclo selecionado mostra, em uma única tela:

- dia **25 do mês anterior**;
- todos os dias intermediários;
- dia **26 do mês em que o ciclo termina**.

Exemplo: ao selecionar julho de 2026, a tela mostra **25/06/2026 a 26/07/2026**. Os inícios são programados de 25/06 a 25/07; o dia 26/07 permanece visível para mostrar a saída do último plantão.

### Regra operacional

- Domingo a quinta: `19:00 → 07:00` do dia seguinte, total de 12h.
- Sexta-feira: `19:00 → 19:00` de sábado, total de 24h.
- Sábado: `19:00 → 19:00` de domingo, total de 24h.
- Segunda a sexta, das `07:00 às 19:00`: existe equipe presencial; esse intervalo não é criado nem contabilizado como plantão.

A regra é aplicada ao criar, autocompletar, mover e importar registros do layout COSI. Horários manuais continuam editáveis.

### Visual e edição

- `Card único`: um cartão no dia da entrada com início, fim e duração completos.
- `Entrada e saída`: marca a entrada no primeiro dia e a saída no último.
- `Dividido por dia`: apresenta os segmentos que caem em cada data.
- Modo compacto ou normal.
- Fins de semana destacados.
- Cor automática por colaborador e seletor de cor manual.
- Lista lateral com drag-and-drop.
- Criação de escala vazia, cópia de nomes do ciclo anterior e criação do próximo ciclo.
- Autocompletar somente os dias sem início, de 25 a 25.
- Contabilidade por colaborador e total do ciclo.

No arquivo real COSI, dois horários de borda incompatíveis com a regra foram normalizados:

- `25/06 00:00 → 26/06 07:00` passou para `25/06 19:00 → 26/06 07:00`;
- `25/07 19:00 → 26/07 00:00` passou para `25/07 19:00 → 26/07 19:00`.

O resultado é um ciclo completo com **31 inícios e 492 horas**.

## Escala SOC — período visual 25–26

As abas `Escala` e `Escalistas` continuam importando o período real de `26/06/2026 a 25/07/2026`, mas a grade agora é apresentada em uma única tela de **25/06/2026 a 26/07/2026**.

- 25/06 e 26/07 aparecem como limites do ciclo quando não existem registros na fonte.
- O topo da grade identifica os dois meses.
- Cada cabeçalho diário mostra dia e mês.
- Os dados reais permanecem nas datas corretas; nenhum registro é deslocado.
- A aba `Escala` mantém vários logins separados por `/` e situações especiais da coluna G.
- A aba `Escalistas` mantém herança de turno e os códigos `DF`, `DU`, `X`, `BH`, `Folga`, `AN`, `HE` e `#`.

Resultados reais preservados:

| Layout | Técnicos | Registros |
| --- | ---: | ---: |
| SOC — `Escala` | 9 | 232 |
| SOC — `Escalistas` | 9 | 270 |

### Organização dos colaboradores por turno

Nas duas opções do SOC, a grade continua sendo uma única grade editável do ciclo 25–26, mas as linhas agora aparecem em blocos visuais nesta ordem:

1. Madrugada;
2. Manhã;
3. Tarde;
4. Noite;
5. Sem turno definido, somente quando não houver nenhum dia trabalhado em um dos quatro turnos.

O bloco de cada colaborador é calculado pelo **turno predominante no período**. Folgas, férias, afastamentos e horas extras não alteram o grupo. Em caso de empate, prevalece o turno que aparece primeiro cronologicamente no ciclo.

A organização é somente visual: seleção múltipla, drag-and-drop, edição, desfazer/refazer, alertas e exportação continuam usando os mesmos registros e datas.

No arquivo real, as duas abas ficaram organizadas da mesma forma:

| Turno | Colaboradores |
| --- | ---: |
| Madrugada | 2 |
| Manhã | 3 |
| Tarde | 2 |
| Noite | 2 |

## Service Desk N1

O modo específico da Equipe Técnicos de TI N1 permanece ativo:

- grupos identificados por posição e linhas vazias na ordem Madrugada → Manhã → Tarde → Noite;
- checagem de linha vazia limitada até a última coluna de data;
- caixas decorativas à direita não interferem;
- detecção de `Legenda` célula por célula;
- pausa recebida como `Date` do Excel convertida somente para hora e minuto UTC;
- legendas principal e de e-mail/garantia lidas diretamente da planilha;
- nome abreviado, nome completo, matrícula, pausa e turno preservados;
- escalas principal e e-mail/garantia abertas como visões vinculadas.

Na aba real `Novembro_25`: 2 técnicos de Madrugada, 9 de Manhã, 8 de Tarde e 2 de Noite.

## Alertas

- Alerta ao atingir **7 dias consecutivos**.
- Descanso inferior a **11 horas** calculado com datas e horários reais.
- Férias isoladas e duplicidades continuam como alertas informativos.

## Firebase

A publicação Firebase permanece temporariamente desativada. Importação, edição, rascunho local e exportação funcionam sem Firebase.

## Fixtures sanitizadas

Os arquivos reais não são incluídos no projeto. As estruturas são reproduzidas em:

```text
tests/fixtures/equipe-n1-ficticio.xls
tests/fixtures/soc-controle-julho-ficticio.xlsx
tests/fixtures/relatorio-plantao-ficticio.xlsx
```

## Estrutura relevante

```text
src/lib/parser.ts                 parsers específicos e compatibilidade
src/lib/dates.ts                  datas e ciclo operacional 25–26
src/lib/onCall.ts                 regra COSI, contabilidade e autocompletar
src/lib/conflicts.ts              alertas de sequência e descanso
src/lib/exporter.ts               exportações
src/components/OnCallEditor.tsx   calendário e editor de plantões
src/components/ScheduleGrid.tsx   grade SOC/N1 e cabeçalhos entre meses
src/lib/serviceDeskN1.ts          vínculo das duas visões N1
src/lib/assignments.ts            classificação e sequência de trabalho derivada
src/components/SocPlanner.tsx     Planejador SOC e situações especiais
tests/                            testes automatizados
scripts/analyze-file.mjs          análise direta dos arquivos
```

Os resultados completos estão em [`RELATORIO_VALIDACAO.md`](RELATORIO_VALIDACAO.md).
