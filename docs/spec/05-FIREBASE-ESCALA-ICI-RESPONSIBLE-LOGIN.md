# Firebase Escala ICI — times por `responsibleLogin` e publicação estruturada

## Contrato e decisão de autorização

A versão 1.10.0 usa as coleções globais confirmadas no EscalaICI-KMP-Lab: `teams`, `members`, `schedule_periods`, `schedule_assignments`, `oncall_periods`, `oncall_assignments`, `shift_swap_requests`, `user_links` e `system_admins`. Não existe coleção paralela `escalas` para o novo fluxo.

O campo administrativo adotado é `teams.responsibleLogin`. Ele contém apenas o login corporativo normalizado com `trim` e letras minúsculas. Nomes de pessoas e logins reais não aparecem no código: são documentos do Firestore. Um login pode ser responsável por qualquer quantidade de times, independentemente de cargo.

Após o login Microsoft, Firebase Auth fornece o UID. O dashboard lê `user_links/{firebaseUid}`, valida `active` e obtém `login`. Usuários normais consultam times ativos com `responsibleLogin == login`; um documento ativo em `system_admins/{firebaseUid}` libera todos os times e o cadastro simples. Ausência de vínculo mostra “Seu login ainda não está vinculado ao dashboard.” E-mail e token Microsoft não são usados como identidade de autorização.

## Documentos publicados

Escalas regulares escrevem `members`, `schedule_periods` e `schedule_assignments`. Plantão COSI preserva intervalos completos em `oncall_periods` e `oncall_assignments`. Documentos novos usam `schemaVersion: 2` e também mantêm os nomes legados confirmados pelo leitor KMP: `periodId`, `assignmentId`, `onCallId`, `scaleName`, `startDateTime`, `endDateTime`, `sourceType` e `active`.

IDs de período, membro e assignment são determinísticos. Membros aceitam login, nome ou ambos; o ID usa time e identidade normalizada. A publicação usa lotes de no máximo 400 operações. Atualizar faz upsert e preserva assignments não presentes; substituir consulta e remove somente assignments com o mesmo `teamId` e `periodId`. Nenhuma ação é automática.

O preview mostra time, responsável, período, arquivo, técnicos, registros, alertas e existência anterior. DEMO, falta de autenticação, time não autorizado, período vazio, técnicos vazios e ausência de registros bloqueiam. Layout incompatível gera aviso explícito. Rascunhos locais usam chave composta por time e datas.

## Trocas e segurança

Solicitações são consultadas em `shift_swap_requests` pelos IDs dos times que o usuário administra. A troca de responsável no documento do time transfere imediatamente a visibilidade das pendências. Aprovar ou rejeitar registra decisão; assignments não são trocados automaticamente enquanto ambos os IDs não estiverem inequivocamente disponíveis para uma transação segura.

`firestore.rules` exige autenticação, resolve o login no próprio `user_links`, impede mudança de `teamId`, bloqueia DEMO, limita decisões de troca ao responsável/system admin e nega coleções desconhecidas. Os testes usam somente o projeto reservado `demo-escala-dashboard` no Emulator. As regras não foram implantadas: o KMP de referência ainda possui uma ponte de leitura anônima, então o deploy exige primeiro autenticação compatível ou uma migração coordenada.

## Configuração humana pendente

É necessário criar o app Web no Firebase, habilitar Microsoft no Firebase Authentication, cadastrar tenant/client/redirect URI, preencher localmente as variáveis de `.env.example`, criar `user_links`, `system_admins` e times com `responsibleLogin`, configurar índices compostos sugeridos pelo Firestore e validar tudo em um projeto de homologação. Nenhuma credencial, senha ou token deve ser versionado. Deploy de regras e aplicação fica fora desta entrega.
