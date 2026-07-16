# SOC — Faixas fixas no Planejador e contador visual simplificado

## Estrutura e alinhamento

O layout anterior empilhava cinco áreas dentro de cada coluna diária, permitindo alturas independentes. Na 1.8.0, uma única matriz CSS Grid usa cabeçalhos de datas como colunas e cinco linhas compartilhadas, nesta ordem: Madrugada, Manhã, Tarde, Noite e Situações especiais. Cada data possui exatamente uma célula em cada linha.

Áreas vazias permanecem renderizadas e conservam a altura mínima. No modo normal, linhas têm no mínimo 96 px, padding de 7 px e gap de 7 px, comportando cartões sem contato. Se uma célula exigir mais altura, a linha inteira do CSS Grid cresce para todas as datas. Não há masonry nem altura independente por coluna.

Os nomes das faixas formam uma coluna de 112 px sticky durante a rolagem horizontal. Datas continuam legíveis em colunas mínimas de 145 px. As famílias de cor existentes identificam cada linha; Situações especiais usa cinza neutro. A identificação textual e `aria-label` por data/período evitam dependência exclusiva de cor.

## Modo compacto e drag-and-drop

Compactar reduz a altura mínima para 66 px, gap para 4 px e padding para 4 px, sem mudar ordem, matriz ou assignments. Cada combinação data/período continua uma zona explícita de drop. Somente a célula sob o arraste recebe contorno discreto. Movimentos entre datas/turnos e preservação de situações especiais continuam usando o mesmo estado e histórico.

## Contador simples

Grade e Planejador continuam usando `calculateConsecutiveWorkdayCounters`. O contador agora é texto absoluto no canto inferior direito, sem fundo, borda, border-radius, cápsula ou sombra. Valores 1–6 usam cinza e opacidade secundária. Valores 7+ mantêm o valor real e tooltip, alterando somente cor de atenção, peso e opacidade. A cor do assignment não muda.

O contador é derivado: não integra assignment, rascunho, exportação XLSX ou payload futuro. Altura, posição, cor, modo compacto e visualização também não são persistidos como dados operacionais. Firebase permanece desativado na versão 1.8.0.

## Compatibilidade, testes e limitações

Parsers SOC, Service Desk N1 e Plantão COSI não foram alterados. Permanecem compatíveis ciclo 25–26, Grade, Situações especiais, alertas, desfazer/refazer, rascunho e exportação. Os testes verificam ordem das cinco faixas, matriz completa, áreas vazias, modo compacto, cores, status, sequência e CSS sem badge.

Limitação restante: o modelo legado continua representando uma célula por colaborador/data; múltiplos assignments simultâneos exigem evolução compatível futura.
