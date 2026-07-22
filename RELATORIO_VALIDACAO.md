# Relatório de validação — Painel de Escalas 1.15.0

## Release 1.15.0 — FASE 14f (origem oficial `ici-dev`, perfis administrativos, leitura oficial)

Quatro rodadas, cada uma revisada e validada de forma independente antes da
seguinte:

1. **Origem oficial**: `buildOfficialPackageFromSchedule` gera um pacote
   `ici-dev` real (importação XLS/XLSX ou criação no Dashboard), com IDs
   determinísticos nunca contaminados pela substring `demo` — resolve o
   bloqueio onde a única origem do wizard era o pacote Demo (sempre
   inelegível por design). 7 testes novos (351→358).
2. **Perfis administrativos**: estende `UserLink` com `role`
   (`USER`/`SCHEDULE_ADMIN`), preservando `system_admins`/`responsibleLogin`
   existentes. Fecha uma lacuna real de segurança encontrada em auditoria:
   as rotas Express de publicação oficial não verificavam identidade do
   chamador (só a flag de escrita + confirmação textual). Novo middleware
   `verifyCaller` valida `Authorization: Bearer <idToken>` via Firebase
   Admin (`auth.verifyIdToken`) e resolve papel/times antes de qualquer
   dry-run/commit; nova rota `/api/admin/users` (`SYSTEM_ADMIN` apenas), com
   bloqueio contra remover o último administrador ativo; nova seção
   "Administração" no Dashboard. 14 testes novos (358→372).
3. **Bootstrap local de dev**: permite testar o fluxo administrativo sem
   depender do cadastro MSAL/Entra completo ainda, com dupla trava
   (`DASHBOARD_DEV_LOCAL_AUTH=true` E `NODE_ENV!=production`, checada a cada
   requisição, não só na montagem da rota), sessão HMAC-SHA256 assinada,
   cookie `httpOnly`/`sameSite=strict`, selo "MODO DE TESTE" sempre visível.
   9 testes novos (372→381).
4. **Leitura oficial + concorrência**: `GET /api/official/schedule`
   (autenticado/autorizado por time) lê a revisão ativa (ou uma anterior via
   `?revision=N`) e filtra estritamente por `teamId` — confirmado que a
   proteção de concorrência (`PUBLICATION_REVISION_CONFLICT`) já existia no
   backend (`reserveRevision`); o que faltava era o frontend rastrear a
   revisão-base e reenviá-la, agora feito, com UX de "recarregar" no
   conflito. 15 testes novos (381→396).

Nenhuma escrita real foi feita (`ALLOW_OFFICIAL_FIRESTORE_WRITE` permanece
desligada), nenhuma credencial foi versionada, `firestore.rules` não foi
implantado (mudanças só valem para o Emulator).

Validado: `npx tsc --noEmit` (limpo em todas as 4 rodadas), `npx vitest run`
(53 arquivos, 396 testes, 0 falhas, verificado de forma independente após
cada rodada — não apenas o relato do executor), `npm run build` (produção,
sem erros), servidor Express + Vite dev rodando localmente com validação
visual via Chromium real em 3 resoluções (1366×768, 1920×1080, 412×915
mobile) sem erros de console, incluindo navegação até o wizard de
Publicação Oficial confirmando as 4 origens de dados visíveis (oficial
ativa, importada, criada no Dashboard, Demo bloqueado). Detalhe completo em
`docs/spec/09-DASHBOARD-ORIGEM-OFICIAL-ICI-DEV.md`.

## Release 1.13.0 — FASE 14D (Publicação Oficial `ici-dev`)

Adiciona a rota `POST /api/publish/official` (DRY_RUN/COMMIT) e `GET /api/official/status`,
reaproveitando a arquitetura de publicação atômica do Demo (`executeAtomicPublication.mjs`,
generalizado para receber plano/guarda por parâmetro) com uma guarda simétrica e
independente (`assertOfficialOnlyWritePlan.mjs`, workspace `ici-dev` fixo no servidor).
Exige vínculo corporativo validado (membro + equipe existentes, com vínculo ativo) antes de
dry-run ou commit, e a variável `ALLOW_OFFICIAL_FIRESTORE_WRITE` (ausente por padrão) antes
de qualquer escrita real. Nenhuma publicação real foi feita.

Validado nesta rodada: `npx tsc --noEmit` (limpo), `npx vitest run` (38 arquivos, 323
testes, 0 falhas — inclui os testes pré-existentes de `demo-v1`, confirmando ausência de
regressão), `npm run build` (produção), `node server/index.mjs` local com chamadas `curl`
reais contra `/api/health`, `/api/demo/status`, `/api/official/status` e
`/api/publish/official`, e `npm run preview` com captura de tela via Chromium headless
confirmando a build de produção carregando sem erros de console. Detalhe completo em
`docs/spec/FASE-14D-PUBLICACAO-OFICIAL-ICI-DEV.md`, incluindo o runbook da primeira
publicação real (ação humana, não executada nesta sessão).

## Release 1.10.0

Firebase Auth/Microsoft, seleção de times por `responsibleLogin`, publicação estruturada e trocas por `teamId` foram integrados sem alterar os editores. Regras locais são validadas exclusivamente no Emulator e não foram implantadas. Nomes pessoais e logins de responsáveis não estão fixos no código.

## Release 1.9.0

O Planejador usa `.soc-planner-main` como fonte única de `scrollLeft`, uma barra inferior sticky sincronizada e pan horizontal pelo botão do meio. Grade e Planejador reutilizam o mesmo painel de conflitos e a mesma lista calculada. Scroll e foco são apenas visuais; assignments, histórico, rascunho, exportação e payload não mudaram. Firebase permanece desativado.

## Release 1.8.0

O Planejador foi reorganizado em cinco linhas compartilhadas e alinhadas entre todas as datas. O contador visual perdeu o formato circular e mantém somente número discreto, com atenção por cor/peso em 7+. Firebase permanece desativado.

## Release 1.7.0

Situações especiais foram retiradas das faixas de turno do Planejador. Cartões usam a cor do assignment diário e Grade/Planejador compartilham contadores derivados de dias consecutivos, com alerta visual a partir do sétimo dia. Firebase permanece desativado.

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
- testes automatizados: **88 de 88 aprovados**;
- build Vite: aprovado;
- parser SOC real: aprovado;
- parser Plantão COSI real: aprovado;
- parser Service Desk N1 real: aprovado;
- publicação Firebase: permanece desativada;
- arquivos reais: não incluídos no pacote final;
- URLs internas da OpenAI no `package-lock.json`: nenhuma.

O build mantém apenas o aviso não bloqueante de bundle acima de 500 kB por causa do SheetJS.
