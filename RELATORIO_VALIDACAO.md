# Relatório de validação — Painel de Escalas 1.6.0

## Release 1.6.0

Cabeçalhos SOC em `DD/MM` + dia abreviado, Planejador sincronizado com a Grade, drag-and-drop entre datas/turnos, edição/remoção de cartões, modo compacto e payload normalizado futuro. Firebase permanece integralmente desativado.

Data da validação: 16/07/2026

## Escopo desta revisão

A Escala SOC foi reorganizada visualmente por turno dentro do mesmo ciclo 25–26. A grade mensal existente não foi recriada e nenhuma funcionalidade de edição foi substituída.

Ordem dos blocos:

1. Madrugada;
2. Manhã;
3. Tarde;
4. Noite;
5. Sem turno definido, somente quando necessário.

O turno de cada colaborador é definido pelo turno operacional predominante no período. Folga, férias, afastamento, hora extra e demais situações especiais são ignoradas nessa contagem. Em empate, vence o turno que aparece primeiro no ciclo.

## Arquivo SOC real

Arquivo analisado diretamente: `Escala-SOC-Controle-Julho (1)(2).xls`.

### Aba Escala

- período importado: 26/06/2026 a 25/07/2026;
- período visual: 25/06/2026 a 26/07/2026;
- técnicos: 9;
- registros importados: 232;
- agrupamento:
  - Madrugada: 2 — `aleilima`, `ivcarvalho`;
  - Manhã: 3 — `alamancio`, `altaborda`, `lvergani`;
  - Tarde: 2 — `cestradioto`, `thaisvribeiro`;
  - Noite: 2 — `dschlottag`, `luizneto`.

### Aba Escalistas

- período importado: 26/06/2026 a 25/07/2026;
- período visual: 25/06/2026 a 26/07/2026;
- técnicos: 9;
- registros importados: 270;
- agrupamento idêntico ao da aba Escala:
  - Madrugada: 2;
  - Manhã: 3;
  - Tarde: 2;
  - Noite: 2.

## Comportamento da grade

Foram preservados:

- período visual 25–26;
- grade mensal existente;
- dropdown e menu de códigos;
- seleção múltipla;
- drag-and-drop;
- copiar e colar dia ou semana;
- desfazer e refazer;
- rascunho local;
- alertas;
- exportação XLSX;
- modos Service Desk N1 e Plantão COSI.

A organização por turno é recalculada quando as células são alteradas. Uma mudança isolada não costuma mover o colaborador, pois o grupo considera o turno predominante do período completo.

## Testes adicionados

- turno predominante ignorando folgas e férias;
- desempate pelo primeiro turno cronológico;
- ordem Madrugada → Manhã → Tarde → Noite;
- grupo `Sem turno definido`;
- cabeçalhos visuais da grade sem alteração das células;
- marcação do modo de agrupamento nos dois parsers SOC.

## Validação técnica

Comandos executados:

```bash
npm run check
npm run build
npm run analyze -- '/mnt/data/Escala-SOC-Controle-Julho (1)(2).xls'
npm run analyze -- '/mnt/data/Relatorio-PlantaoCOSI(3).xls'
npm run analyze -- '/mnt/data/Escalas Equipe N1(2).xls'
```

Resultados:

- TypeScript: aprovado;
- testes automatizados: **77 de 77 aprovados**;
- build Vite: aprovado;
- parser SOC real: aprovado;
- parser Plantão COSI real: aprovado;
- parser Service Desk N1 real: aprovado;
- publicação Firebase: permanece desativada;
- arquivos reais: não incluídos no pacote final;
- URLs internas da OpenAI no `package-lock.json`: nenhuma.

O build mantém apenas o aviso não bloqueante de bundle acima de 500 kB por causa do SheetJS.
