# SOC — Cabeçalho de datas, Planejador drag-and-drop e preparação Firebase

## Objetivo e visualizações

A versão 1.6.0 mantém a Grade mensal SOC e acrescenta o Planejador como segunda projeção do mesmo `ScheduleState.cells`. O ciclo continua sendo 25 do mês anterior a 26 do mês de referência, em uma tela horizontal única e com agrupamentos mensais.

Na Grade, cada data apresenta `DD/MM` na primeira linha e `Dom`, `Seg`, `Ter`, `Qua`, `Qui`, `Sex` ou `Sáb` na segunda. O cálculo de dia usa ano, mês e dia locais, sem conversão UTC. Os grupos permanecem Madrugada, Manhã, Tarde e Noite pelo turno predominante.

## Planejador e edição

Cada dia contém áreas de Madrugada, Manhã, Tarde e Noite. A lista lateral é organizada pelo turno predominante, mas permite arrastar qualquer pessoa para qualquer turno. Cartões existentes podem ser movidos entre datas/turnos, editados (inclusive para situações já existentes) e removidos. Uma célula representa no máximo uma alocação do colaborador naquela data, impedindo duplicação.

Grade e Planejador não possuem estados de escala independentes. As operações do Planejador produzem um novo snapshot das mesmas `cells`; por isso desfazer/refazer, salvamento/restauração do rascunho, alertas e exportação são compartilhados. Alternar visualização e ativar **Compactar** grava apenas preferências visuais em chaves próprias do `localStorage` e não altera a escala.

## Estrutura normalizada futura

`buildSchedulePersistencePayload` converte o estado sem mutá-lo em período, membros e assignments com IDs estáveis, datas ISO e `schemaVersion: 1`. Cada assignment contém período, membro, data, turno ou situação e origem. O resultado é JSON serializável, não contém `Date` e independe da visualização aberta.

Firebase ainda está desativado e nenhuma publicação é executada nesta versão. Não há SDK, credenciais, acesso de rede nem botão de publicação. A função é somente uma fronteira futura de persistência.

## Compatibilidade, testes e limitações

Importadores SOC, Service Desk N1 e Plantão COSI não foram alterados. A exportação lê o mesmo estado, preservando as fixtures sanitizadas de 232 e 270 registros e os códigos existentes. Os testes cobrem cabeçalhos/fuso, ciclo 25–26, operações do Planejador, serialização/IDs e ausência de Firebase.

Limitações: o payload registra `source: import` porque o modelo legado ainda não mantém proveniência por célula nem `updatedAt`; uma fase futura poderá adicionar esses metadados com migração compatível de rascunhos. A integração Firebase futura deve consumir exclusivamente o adaptador, adicionar autenticação/regras e manter publicação explicitamente desativada até aprovação.
