# Histórico de versões

## 1.11.0 — 16/07/2026

- adiciona assistente inicial compartilhado para escala vazia e Test Drive;
- centraliza os tipos Plantão COSI, SOC/NOC 6x1 e Service Desk N1 6x1 em catálogo;
- cria demos fictícias locais para COSI, SOC/NOC e Service Desk N1;
- isola Test Drive em `localStorage` próprio, sem tocar o rascunho real;
- adiciona banner e ação para encerrar Test Drive apagando só dados fictícios;
- bloqueia publicação de Test Drive no preview e na camada de escrita;
- inclui aviso de dados fictícios apenas na exportação de Test Drive;
- pede confirmação antes de sobrescrever rascunho ou Test Drive salvo;
- preserva editores existentes e fluxo Firebase/Auth/times da 1.10.0.

## 1.10.0 — 16/07/2026

- integra Firebase Auth com Microsoft e vínculo por `user_links`;
- autoriza times por `teams.responsibleLogin`, sem nomes pessoais fixos;
- permite um responsável administrar vários times pelo mesmo login;
- publica membros, escalas regulares e plantões em documentos estruturados compatíveis com o KMP;
- adiciona preview, atualização e substituição controlada de período;
- separa rascunhos locais por time e período;
- adiciona solicitações de troca direcionadas por `teamId`;
- adiciona cadastro simples de times para `system_admin`;
- adiciona regras e testes isolados no Firebase Emulator;
- não executa deploy nem publicação automática.

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
