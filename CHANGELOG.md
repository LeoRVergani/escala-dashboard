# Histórico de versões

## 1.9.0 — 16/07/2026

- restaura a navegação horizontal sempre acessível no Planejador SOC;
- adiciona barra inferior sticky sincronizada com a matriz por `ResizeObserver`;
- permite pan horizontal com o botão do meio usando Pointer Events;
- compartilha o mesmo componente e a mesma fonte de alertas entre Grade e Planejador;
- faz o botão Alertas navegar ao painel da visualização atual;
- preserva coluna unificada, compactação, drag-and-drop, assignments e histórico;
- mantém Firebase desativado e sem dependências adicionais.

## 1.8.0 — 16/07/2026

- organiza o Planejador SOC em cinco faixas horizontais fixas com CSS Grid;
- mantém células vazias e alinhamento entre todas as datas;
- fixa identificadores de período durante a rolagem horizontal;
- preserva zonas de drop por data/período e modo compacto;
- simplifica o contador para número sem fundo, borda ou cápsula;
- mantém assignments, exportação, payload e Firebase inalterados.

## 1.7.0 — 16/07/2026

- separa situações especiais dos quatro turnos no Planejador SOC;
- aplica cores da Grade ao turno ou situação real do dia;
- adiciona contadores derivados de dias consecutivos na Grade e no Planejador;
- destaca o sétimo dia e posteriores sem bloquear edição;
- preserva período 25–26, rascunho, exportação, payload e histórico compartilhado;
- mantém Firebase desativado.

## 1.6.0

- adiciona Planejador SOC sincronizado com a Grade;
- corrige cabeçalhos em `DD/MM` e dia da semana;
- prepara payload normalizado para persistência futura.
