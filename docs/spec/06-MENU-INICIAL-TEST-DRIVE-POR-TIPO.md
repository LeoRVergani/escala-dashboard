# Menu inicial, catálogo de tipos e Test Drive local

## Catálogo central de tipos

A versão 1.11.0 introduz `SCHEDULE_TEMPLATES` como fonte única de verdade para os tipos criados pela tela inicial. O catálogo fica em `src/lib/scheduleCatalog.ts` e descreve, para cada tipo, o identificador estável, rótulos, estratégia de período, tipo de editor, agrupamento visual quando existe, sinalização de Service Desk N1 e códigos de turno permitidos.

Hoje existem três tipos catalogados: Plantão COSI, SOC/NOC — Escala 6x1 e Service Desk N1 — Escala 6x1. Plantão COSI e SOC/NOC usam o ciclo operacional 25–26; Service Desk N1 usa mês civil. A existência do catálogo evita que a tela inicial, os builders de escala vazia e os builders de demonstração mantenham listas divergentes de tipos, períodos ou turnos aceitos.

O catálogo não cria uma camada de plugin. Para adicionar um novo tipo é necessário editar `SCHEDULE_TEMPLATES` e implementar a factory correspondente quando houver comportamento específico.

## Factories e determinismo

As funções de criação ficam em `src/lib/scheduleFactories.ts`. `createEmptyScheduleFromCatalog` monta uma escala vazia normalizada para o tipo escolhido, `withManualTechnicians` adiciona nomes informados pelo usuário e `createDemoScheduleFromCatalog` cria os dados fictícios do Test Drive.

As factories são puras em relação ao relógio e a números aleatórios: não usam `Math.random` nem `Date.now`. O período vem da data de referência recebida como argumento, os IDs fictícios são derivados de índices e os registros COSI usam uma sequência determinística local. Com isso, a mesma entrada gera o mesmo modelo de escala.

O modelo resultante é o mesmo `ScheduleState` usado pelos fluxos existentes de importação, criação vazia e demonstração. Escalas vazias recebem `origin: 'empty-template'`; demonstrações recebem `origin: 'demo-template'` e `isDemo: true`. Plantão COSI usa `onCallRecords`, SOC/NOC usa `cells` por colaborador e dia, e Service Desk N1 usa as linhas normalizadas de principal e e-mail/garantia sincronizadas com o agregado exibido pela grade.

## Assistente compartilhado

`src/components/ScheduleTemplateWizard.tsx` atende os dois modos da tela inicial: `empty` e `demo`. Nos dois casos o usuário escolhe o tipo de escala e o período. No modo `empty`, há uma etapa adicional para informar colaboradores opcionais, um nome por linha. No modo `demo`, a confirmação chama diretamente a factory de dados fictícios.

O assistente não duplica os editores. Depois da criação, o app abre os mesmos fluxos já existentes: Grade e Planejador SOC para escalas regulares, Service Desk N1 para o modelo N1 e Plantão COSI para plantões. O objetivo é escolher o modelo inicial e preparar o `ScheduleState`; a edição continua pertencendo aos componentes já consolidados.

Antes de criar uma nova escala vazia, o app verifica se existe rascunho salvo e usa `window.confirm` para avisar que a nova escala pode sobrescrevê-lo. Antes de iniciar um novo Test Drive, verifica se já existe sessão de Test Drive salva e usa a mesma confirmação nativa do navegador.

## Isolamento e publicação

O Test Drive é salvo por `src/lib/testDrive.ts` em uma chave própria de `localStorage`, `escala-dashboard:test-drive:v1`. Essa sessão não usa a chave de rascunho real e não grava em Firebase. Encerrar o Test Drive remove apenas essa chave local. Por ser `localStorage`, a sessão é local ao navegador e ao dispositivo.

A interface exibe um banner quando a escala atual tem `origin: 'demo-template'`, deixando claro que os dados são fictícios. A ação de encerrar apaga a sessão de Test Drive e limpa a escala atual quando ela também veio dessa origem.

A publicação é bloqueada em duas camadas. `src/lib/publicationPreview.ts` adiciona erros críticos quando `state.isDemo` ou `state.origin === 'demo-template'`, impedindo o fluxo normal de publicar. `src/lib/schedulePublishRepository.ts` repete a verificação antes de gravar e lança erro se a origem for Test Drive, mesmo que a interface seja contornada.

Na exportação, `src/lib/exporter.ts` adiciona uma aba de aviso apenas quando `origin === 'demo-template'`. Escalas importadas e escalas vazias não recebem esse aviso automaticamente.

## Limitações conhecidas

Só há três tipos catalogados hoje. Não existe mecanismo de plugin ou cadastro externo para adicionar novos tipos sem alterar o catálogo e, quando necessário, as factories.

O Test Drive é por navegador e dispositivo. Ele não sincroniza entre máquinas, não é compartilhado com outros usuários e não some automaticamente ao trocar de time no Firebase, porque não está associado a time nem a autenticação.

A confirmação de sobrescrita usa `window.confirm` nativo do navegador. Não há diálogo customizado com layout próprio, estados adicionais ou recuperação guiada.

O campo `origin` foi adicionado ao modelo usado pela criação vazia e pelo Test Drive, mas os builders de importação em `src/lib/parser.ts` ainda não definem `origin: 'import'` explicitamente. Essa marcação não foi exigida nesta fase.

Esta fase não alterou o fluxo de autenticação, times, Firebase ou `responsibleLogin` da versão 1.10.0. As decisões do spec anterior continuam válidas: autorização por `user_links` e `teams.responsibleLogin`, publicação estruturada, regras testadas em Emulator e ausência de deploy automático.
