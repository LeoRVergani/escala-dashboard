# Histórico de versões

## 1.13.0 — 21/07/2026

- adiciona área "PUBLICAÇÃO OFICIAL" separada do painel Demo, publicando um snapshot
  revisionado do workspace `ici-dev` (mesmo contrato consumido pelo botão "MINHA ESCALA"
  do Escala ICI KMP), reaproveitando a arquitetura de publicação atômica já validada em
  `demo-v1` (reserva de revisão → escrita isolada → ativação do ponteiro → idempotência);
- adiciona `server/domain/officialPublicationPlanner.mjs` e
  `assertOfficialOnlyWritePlan.mjs`, guardas simétricas e independentes das do Demo — o
  workspace `ici-dev` é sempre decidido pelo servidor, nunca pelo cliente;
- adiciona endpoint `POST /api/publish/official` (DRY_RUN/COMMIT) e `GET
  /api/official/status`, exigindo a variável `ALLOW_OFFICIAL_FIRESTORE_WRITE=true`
  (ausente por padrão) e confirmação explícita para qualquer escrita real;
- exige vínculo corporativo (`memberId`/`teamId`, com `entraTenantId`/`entraObjectId`/
  e-mail opcionais) validado tanto no cliente quanto no servidor antes de dry-run ou commit;
- generaliza `executeAtomicPublication.mjs` para receber o plano/guarda como parâmetro,
  sem duplicar a lógica de reserva/escrita/ativação entre Demo e oficial;
- nenhuma publicação real foi feita nesta versão — a flag continua desligada até a
  primeira publicação oficial ser conduzida manualmente pelo runbook da FASE 14D.

## 1.12.0 — 18/07/2026

- espelha o workspace `demo-v1` (times, membros, vínculos de gestão, escala, solicitações) gerado pela FASE 14c-2 do EscalaICI-KMP-Lab, sincronizado por `npm run demo:sync`, nunca gerado neste repositório;
- adiciona entrada "Ambiente de Demonstração" na tela inicial, reaproveitando a Grade/Planejador existentes para editar a escala dos dois times reais da fixture;
- isola o rascunho do workspace Demo em `localStorage` próprio (`escala-dashboard:demo-workspace:v1`), com baseline imutável, rascunho editável, revisão local e retomada entre sessões;
- adiciona edição local de responsáveis e aprovações (papel, permissões, vigência, status), sempre por seleção de time/membro já cadastrado, nunca texto livre;
- adiciona visualização somente leitura das 3 solicitações de exemplo (pendente/aprovada/recusada), com aprovação/recusa desabilitadas até a FASE 14c-7;
- adiciona resumo compacto do cenário e prévia de diferenças (por id determinístico) entre o pacote original e o rascunho local;
- adiciona restaurar cenário (com confirmação) e exportar pacote Demo (envelope local, separado do contrato canônico);
- corrige o cabeçalho da tela inicial (mostrava `v1.10.0`, desatualizado desde a 1.11.0);
- não adiciona Firebase, Express, MSAL nem nenhuma publicação real nesta fase; preserva a interface, o Test Drive e os fluxos de import/Firebase existentes sem alterações de comportamento.

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
