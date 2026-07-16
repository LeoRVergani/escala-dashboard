# SOC — Situações especiais no Planejador e contador de dias consecutivos

## Problema corrigido e classificação

Na 1.6.0, situações como Férias eram desenhadas na faixa Manhã. A 1.7.0 centraliza a classificação em `assignments.ts`: somente Madrugada, Manhã, Tarde e Noite são turnos operacionais. Folga, Férias, Afastamento, Hora extra, Horário comercial, Plantão e códigos personalizados são situações especiais. A regra usa o tipo canônico, nunca o texto do cartão ou o turno predominante.

Cada dia mantém as quatro faixas de trabalho e, abaixo delas, **Situações especiais**. Férias, Folga e Afastamento aparecem somente nessa área, com a mesma cor utilizada pela Grade. A lista lateral continua agrupada pelo turno predominante, que não determina posição nem cor diária.

## Cores, edição e drag-and-drop

As faixas e cartões usam as variáveis `--sh-*` existentes. Assim, um colaborador predominantemente da Manhã escalado à Noite recebe a cor de Noite. Arrastar da lista cria o turno de destino; mover entre turnos/datas atualiza a mesma célula compartilhada. Ao mover uma situação entre datas, seu código é preservado. Editar turno para status, ou status para turno, reposiciona o cartão automaticamente. Alertas são informativos e não bloqueiam correções.

O modelo legado possui uma célula por colaborador/data. Portanto não cria simultaneamente turno e Férias pela interface; dados conflitantes que venham a ser suportados por uma evolução multivalorada deverão ser preservados e gerar alerta, sem substituição silenciosa.

## Sequência de dias trabalhados

`calculateConsecutiveWorkdayCounters` usa `isWorkAssignment`, a mesma definição canônica consumida pelos alertas. A sequência atravessa mudanças de turno e a fronteira entre meses do ciclo 25–26. Folga, Férias, Afastamento e dias vazios reiniciam a contagem. No primeiro dia disponível, o cálculo começa em 1 porque não há contexto anterior ao período carregado.

Grade e Planejador exibem o mesmo valor calculado. O badge fica no canto inferior direito, separado do código; 1–6 são discretos e 7+ recebem destaque e tooltip. Situações não trabalhadas não mostram badge. Desfazer, refazer e restaurar rascunho recalculam automaticamente porque o valor não é armazenado.

## Persistência, compatibilidade e testes

O contador, posição visual, cor derivada e modo de visualização não entram no assignment, exportação XLSX ou payload futuro. `shiftCode` e `statusCode` permanecem separados. Importadores SOC, Service Desk N1 e Plantão COSI não foram alterados. O período 25–26, seleção, rascunho, exportação, alertas e histórico continuam compatíveis.

Os testes cobrem classificação, Férias/Folga/Afastamento na área especial, cores pelo turno real, movimentação preservando status, sequência 1–8, reinícios, mudança de turno/mês, badges e ausência no payload. Limitação restante: representação simultânea de múltiplos assignments na mesma célula ainda requer evolução compatível do modelo.

**Firebase permanece desativado nesta versão.** Nenhum SDK, conexão ou publicação foi adicionado.
