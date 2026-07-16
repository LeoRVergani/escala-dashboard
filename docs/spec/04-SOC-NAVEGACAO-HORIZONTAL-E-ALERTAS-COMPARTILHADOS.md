# SOC — Navegação horizontal e alertas compartilhados no Planejador

## Problema e fonte de rolagem

Antes da 1.9.0, o Planejador combinava um pai com `overflow: hidden` e um conteúdo com `overflow: auto`. Como a barra nativa ficava depois de todas as faixas, ela podia terminar abaixo da área visível, principalmente com mais cartões ou menor altura de viewport.

Na 1.9.0, `.soc-planner-main` é o único container principal e a única fonte de verdade de `scrollLeft`. Ele usa a largura real disponível, `min-width: 0`, `max-width: 100%`, `overflow-x: auto`, altura máxima relativa à viewport e `scrollbar-gutter: stable`. O pai não esconde mais overflow horizontal. Isso mantém a área dentro do espaço deixado pela interface, tanto com painel externo aberto quanto compacto, sem cálculo frágil baseado em `100vw`.

## Barra sempre acessível

Uma barra horizontal nativa sincronizada fica sticky no limite inferior do Planejador, antes do painel de alertas. A barra nativa interna da matriz é ocultada para não criar duas barras concorrentes. Rolagem da matriz atualiza a barra e rolagem da barra atualiza a matriz, com comparação prévia de `scrollLeft` para evitar ciclos.

Um `ResizeObserver` mede o container e a matriz. A medição também é refeita ao alternar Compactar, mudar o número de datas, alterar a largura calculada dos colaboradores e redimensionar a janela. Alternar Grade/Planejador remonta e mede o Planejador. A barra usa `role="scrollbar"`, nome acessível, foco por teclado e estilo compatível com Firefox e Chromium.

## Pan com o botão do meio

`useMiddleMouseHorizontalPan` trata `pointerdown`, `pointermove`, `pointerup`, `pointercancel` e `lostpointercapture`. Somente `button === 1` inicia o pan; a posição inicial e o `scrollLeft` são registrados e `setPointerCapture` mantém o fluxo até o encerramento. `preventDefault` e o tratamento de `auxclick` impedem o autoscroll nativo. Durante o gesto, `cursor: grabbing` e `user-select: none` deixam o estado explícito.

A validação centralizada rejeita `input`, `textarea`, `select`, `button`, link, menu, diálogo e conteúdo editável. O botão esquerdo permanece exclusivo do drag-and-drop e o direito não inicia ação. O pan não chama callbacks de edição, não cria snapshot e não altera assignment. Roda vertical, Shift + roda, touchpad horizontal, scrollbar e comportamento touch existente não são interceptados, pois nenhum handler de `wheel` foi adicionado.

## Alertas compartilhados

`detectConflicts` continua sendo a única função de cálculo. `ConflictAlertsPanel` é usado tanto pela Grade quanto pelo Planejador, garantindo título, borda, mensagem informativa, textos, ordem, severidade e quantidade idênticos. O painel do Planejador fica fora do container horizontal e ocupa a largura disponível da página.

O botão Alertas não troca a visualização: ele abre o painel atual e usa `scrollIntoView`. Na Grade, clicar em um item mantém a seleção da célula. No Planejador, quando o alerta possui `techId` e `day`, o cartão correspondente é centralizado e recebe foco temporário. Alertas sem metadados suficientes continuam visíveis, sem correspondência inventada por texto.

## Estado, Firebase e compatibilidade

`scrollLeft`, estado de pan, largura medida e foco de alerta existem somente durante a montagem. Eles não entram em assignment, rascunho, exportação XLSX, payload futuro ou desfazer/refazer. A preferência Compactar continua isolada no `localStorage`.

Firebase permanece completamente desativado: nenhum SDK, configuração, credencial, acesso de rede ou publicação foi adicionado. Parsers, códigos, período 25–26, Service Desk N1 e Plantão COSI não foram alterados. A coluna unificada e colorida de colaboradores/períodos, largura pelo maior login/nome, células compactas, cinco faixas fixas, Situações especiais e contador consecutivo foram preservados.

## Testes, validação manual e limitações

Os testes automatizados verificam container único, CSS de overflow, barra nos modos normal/compacto, sincronização bidirecional, recálculo em resize, pan em ambas as direções, encerramento por três eventos, cursor, seleção, botões incorretos, controles interativos, imutabilidade dos assignments, ausência de callback de movimento e igualdade dos alertas. A suíte existente cobre drag-and-drop, histórico, rascunho, exportação, período 25–26, contador, faixas, N1, COSI e ausência de Firebase.

Validação manual prevista: menu externo aberto/compacto, Compactar ligado/desligado, pan nas duas direções, drag-and-drop esquerdo, roda/touchpad, alertas nas duas visões, resize e zoom em 100%/125%. Limitação restante: a visibilidade e o desenho exato da scrollbar nativa dependem do sistema operacional; a faixa sticky continua reservando uma área identificável e acessível. Alertas sem `day` não navegam para um cartão específico.
